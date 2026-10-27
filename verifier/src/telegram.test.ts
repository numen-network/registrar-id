import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Refusal } from './refusal.js'
import { SpentLogins, telegramLogin } from './telegram.js'

const TOKEN = '123456:TEST-TOKEN'
const NOW = 1_700_000_000_000

/** Signs the way telegram.org does, so the check has something real to agree with. */
const signed = (over: Record<string, unknown> = {}) => {
  const fields: Record<string, unknown> = {
    id: 42,
    first_name: 'Alice',
    username: 'alice',
    auth_date: NOW / 1000,
    ...over,
  }
  for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key]
  const lines = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${String(fields[key])}`)
    .join('\n')
  const secret = createHash('sha256').update(TOKEN).digest()
  return { ...fields, hash: createHmac('sha256', secret).update(lines).digest('hex') }
}

describe('telegramLogin', () => {
  it('hands back the bare username of a valid login', () => {
    expect(telegramLogin(signed(), TOKEN, NOW).handle).toBe('alice')
  })

  it('refuses a payload doctored after signing', () => {
    const auth = { ...signed(), username: 'somebody_else' }
    expect(() => telegramLogin(auth, TOKEN, NOW)).toThrow(Refusal)
  })

  it('refuses a signature from some other bot', () => {
    expect(() => telegramLogin(signed(), 'other:TOKEN', NOW)).toThrow('does not check out')
  })

  it('refuses a login with no signature at all', () => {
    const { hash: _, ...bare } = signed()
    expect(() => telegramLogin(bare, TOKEN, NOW)).toThrow('no signature')
  })

  it('refuses a login older than ten minutes', () => {
    expect(() => telegramLogin(signed(), TOKEN, NOW + 11 * 60 * 1000)).toThrow('too old')
  })

  it('refuses an account that never set a username', () => {
    expect(() => telegramLogin(signed({ username: undefined }), TOKEN, NOW)).toThrow('no username')
  })
})

describe('SpentLogins', () => {
  const login = () => telegramLogin(signed(), TOKEN, NOW)
  const issuer = () => {
    let issued = 0
    return { issue: () => NOW + ++issued, count: () => issued }
  }

  it('answers a login sent twice for one address with the first issuance', () => {
    const logins = new SpentLogins()
    const { issue, count } = issuer()

    const first = logins.spend(login(), 'nuAlice', issue, NOW)
    expect(logins.spend(login(), 'nuAlice', issue, NOW)).toBe(first)
    expect(count()).toBe(1)
  })

  it('refuses a login replayed onto another address', () => {
    const logins = new SpentLogins()
    const { issue, count } = issuer()

    logins.spend(login(), 'nuAlice', issue, NOW)
    expect(() => logins.spend(login(), 'nuMallory', issue, NOW)).toThrow('another address')
    expect(count()).toBe(1)
  })

  it('remembers a login for as long as it passes as fresh', () => {
    const logins = new SpentLogins()
    const { issue } = issuer()
    const { until } = login()

    logins.spend(login(), 'nuAlice', issue, NOW)
    expect(() => logins.spend(login(), 'nuMallory', issue, until)).toThrow('another address')
  })
})
