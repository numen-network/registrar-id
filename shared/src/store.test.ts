import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { ISSUANCE_TTL_MS } from './config.js'
import { Store } from './store.js'

const NOW = 1_700_000_000_000
const ADDR = 'nuTestAddress'

describe('issuance', () => {
  it('opens for an hour from issue', () => {
    const store = new Store(':memory:')
    const expiresAt = store.issue(ADDR, 'telegram', '@alice', NOW)

    expect(expiresAt).toBe(NOW + ISSUANCE_TTL_MS)
    expect(store.openFor(ADDR, NOW)).toMatchObject([
      { address: ADDR, channel: 'telegram', handle: '@alice', expiresAt },
    ])
  })

  it('is gone once expired', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)

    expect(store.openFor(ADDR, NOW + ISSUANCE_TTL_MS)).toEqual([])
  })

  it('is gone once consumed', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)
    const [open] = store.openFor(ADDR, NOW)

    store.consume([open!.id], 42, NOW)

    expect(store.openFor(ADDR, NOW)).toEqual([])
  })

  it('keeps every login per channel', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)
    store.issue(ADDR, 'telegram', '@renamed', NOW + 1)
    store.issue(ADDR, 'discord', 'alice', NOW + 2)

    const open = store.openFor(ADDR, NOW + 2)
    expect(open.map((entry) => [entry.channel, entry.handle])).toEqual([
      ['telegram', '@alice'],
      ['telegram', '@renamed'],
      ['discord', 'alice'],
    ])
  })

  it('is not open before it was issued', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)

    expect(store.openFor(ADDR, NOW - 1)).toEqual([])
  })

  it('keeps issuances apart per address', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)
    store.issue('nuOther', 'telegram', '@bob', NOW)

    expect(store.openFor(ADDR, NOW)).toMatchObject([{ handle: '@alice' }])
  })

  it('prunes expired open rows and keeps spent ones', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'numen-id-')), 'store.db')
    const store = new Store(path)
    store.issue(ADDR, 'telegram', '@alice', NOW)
    store.issue(ADDR, 'discord', 'alice', NOW)
    const [spent] = store.openFor(ADDR, NOW)
    store.consume([spent!.id], 42, NOW)

    store.prune(NOW + ISSUANCE_TTL_MS)

    const rows = new Database(path).prepare('SELECT COUNT(*) AS n FROM issuance').get()
    expect(rows).toEqual({ n: 1 })
  })

  it('keeps rows still live at prune time', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)

    store.prune(NOW + ISSUANCE_TTL_MS - 1)

    expect(store.openFor(ADDR, NOW)).toMatchObject([{ handle: '@alice' }])
  })
})

describe('cursor', () => {
  it('starts empty and holds the last height', () => {
    const store = new Store(':memory:')
    expect(store.cursor()).toBeNull()

    store.advance(7)
    store.advance(8)
    expect(store.cursor()).toBe(8)
  })
})
