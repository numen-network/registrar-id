import { describe, expect, it } from 'vitest'
import { ISSUANCE_TTL_MS } from './config.js'
import { Store } from './store.js'

const NOW = 1_700_000_000_000
const BLOCK = 42
const ADDR = 'nuTestAddress'

describe('issuance', () => {
  it('opens for an hour from issue', () => {
    const store = new Store(':memory:')
    const expiresAt = store.issue(ADDR, 'telegram', '@alice', NOW)

    expect(expiresAt).toBe(NOW + ISSUANCE_TTL_MS)
    expect(store.openFor(ADDR, BLOCK, NOW)).toMatchObject([
      { address: ADDR, channel: 'telegram', handle: '@alice', expiresAt },
    ])
  })

  it('is gone once expired', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)

    expect(store.openFor(ADDR, BLOCK, NOW + ISSUANCE_TTL_MS)).toEqual([])
  })

  it('is gone for later blocks once consumed', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)
    const [open] = store.openFor(ADDR, BLOCK, NOW)

    store.consume([open!.id], BLOCK, NOW)

    expect(store.openFor(ADDR, BLOCK + 1, NOW)).toEqual([])
  })

  it('stays open to the block that consumed it', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)
    const [open] = store.openFor(ADDR, BLOCK, NOW)

    store.consume([open!.id], BLOCK, NOW)

    expect(store.openFor(ADDR, BLOCK, NOW)).toMatchObject([{ handle: '@alice' }])
  })

  it('keeps every login per channel', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)
    store.issue(ADDR, 'telegram', '@renamed', NOW + 1)
    store.issue(ADDR, 'discord', 'alice', NOW + 2)

    const open = store.openFor(ADDR, BLOCK, NOW + 2)
    expect(open.map((entry) => [entry.channel, entry.handle])).toEqual([
      ['telegram', '@alice'],
      ['telegram', '@renamed'],
      ['discord', 'alice'],
    ])
  })

  it('is not open before it was issued', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)

    expect(store.openFor(ADDR, BLOCK, NOW - 1)).toEqual([])
  })

  it('keeps issuances apart per address', () => {
    const store = new Store(':memory:')
    store.issue(ADDR, 'telegram', '@alice', NOW)
    store.issue('nuOther', 'telegram', '@bob', NOW)

    expect(store.openFor(ADDR, BLOCK, NOW)).toMatchObject([{ handle: '@alice' }])
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
