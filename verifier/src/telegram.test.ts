import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Refusal } from './refusal.js'
import { telegramHandle } from './telegram.js'

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

describe('telegramHandle', () => {
  it('hands back the bare username of a valid login', () => {
    expect(telegramHandle(signed(), TOKEN, NOW)).toBe('alice')
  })

  it('refuses a payload doctored after signing', () => {
    const auth = { ...signed(), username: 'somebody_else' }
    expect(() => telegramHandle(auth, TOKEN, NOW)).toThrow(Refusal)
  })

  it('refuses a signature from some other bot', () => {
    expect(() => telegramHandle(signed(), 'other:TOKEN', NOW)).toThrow('does not check out')
  })

  it('refuses a login with no signature at all', () => {
    const { hash: _, ...bare } = signed()
    expect(() => telegramHandle(bare, TOKEN, NOW)).toThrow('no signature')
  })

  it('refuses a login older than ten minutes', () => {
    expect(() => telegramHandle(signed(), TOKEN, NOW + 11 * 60 * 1000)).toThrow('too old')
  })

  it('refuses an account that never set a username', () => {
    expect(() => telegramHandle(signed({ username: undefined }), TOKEN, NOW)).toThrow('no username')
  })
})
