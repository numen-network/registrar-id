import { afterEach, describe, expect, it, vi } from 'vitest'
import { ISSUANCE_TTL_MS, Store, UNIT } from '@numen-id/shared'
import type { Stamp } from './decide.js'
import { judgeBlock } from './judge.js'

const ALICE = 'nuAlice'
const PRICE = 10n * UNIT
const SIGNED_IN = 1_700_000_000_000
const HOUR = 60 * 60 * 1000

/** A block made at `time` in which Alice sets a paid record and asks this registrar to judge it. */
function blockAt(time: number) {
  const stamps: Stamp[] = []
  const chain = {
    index: 0,
    requestsIn: async () => ({ blockHash: '0xb', parentHash: '0xa', time, requests: [{ who: ALICE, paid: PRICE }] }),
    identityAt: async (blockHash: string) =>
      blockHash === '0xb'
        ? { fields: { display: 'Alice', telegram: 'alice' }, hash: '0x1d', checkedBy: [], askedBy: [0] }
        : null,
    provideJudgement: async (_who: string, _infoHash: string, stamp: Stamp) => {
      stamps.push(stamp)
      return null
    },
  }
  return { chain, stamps }
}

describe('judgeBlock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts a sign in that stood when the block was made, however late the block is read', async () => {
    const store = new Store(':memory:')
    store.issue(ALICE, 'telegram', 'alice', SIGNED_IN)
    const { chain, stamps } = blockAt(SIGNED_IN + HOUR / 6)
    // The judge comes back two hours after the sign in, long after it ran out
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(SIGNED_IN + 2 * HOUR)

    expect(await judgeBlock(chain, store, PRICE, 100)).toBe(SIGNED_IN + HOUR / 6)
    expect(stamps).toEqual(['Reasonable'])
  })

  it('marks a record Erroneous when its sign in ran out before the block was made', async () => {
    const store = new Store(':memory:')
    store.issue(ALICE, 'telegram', 'alice', SIGNED_IN)
    const { chain, stamps } = blockAt(SIGNED_IN + ISSUANCE_TTL_MS)

    await judgeBlock(chain, store, PRICE, 100)

    expect(stamps).toEqual(['Erroneous'])
  })

  it('marks a record Erroneous when its sign in came after the block was made', async () => {
    const store = new Store(':memory:')
    store.issue(ALICE, 'telegram', 'alice', SIGNED_IN)
    const { chain, stamps } = blockAt(SIGNED_IN - 1)

    await judgeBlock(chain, store, PRICE, 100)

    expect(stamps).toEqual(['Erroneous'])
  })
})
