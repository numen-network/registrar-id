import { afterEach, describe, expect, it, vi } from 'vitest'
import { ISSUANCE_TTL_MS, Store, UNIT } from '@numen-id/shared'
import type { Stamp } from './decide.js'
import { judgeBlock } from './judge.js'

const ALICE = 'nuAlice'
const BOB = 'nuBob'
const PRICE = 10n * UNIT
const SIGNED_IN = 1_700_000_000_000
const HOUR = 60 * 60 * 1000

/**
 * A block made at `time` in which each account in `handles` sets a paid record
 * with its Telegram handle and asks this registrar to judge it.
 */
function blockAt(time: number, handles: Record<string, string> = { [ALICE]: 'alice' }) {
  const stamps: [string, Stamp][] = []
  const chain = {
    index: 0,
    requestsIn: async () => ({
      blockHash: '0xb',
      parentHash: '0xa',
      time,
      requests: Object.keys(handles).map((who) => ({ who, paid: PRICE })),
    }),
    identityAt: async (blockHash: string, who: string) =>
      blockHash === '0xb'
        ? { fields: { display: who, telegram: handles[who]! }, hash: '0x1d', checkedBy: [], askedBy: [0] }
        : null,
    provideJudgement: async (who: string, _infoHash: string, stamp: Stamp) => {
      stamps.push([who, stamp])
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
    expect(stamps).toEqual([[ALICE, 'Reasonable']])
  })

  it('marks a record Erroneous when its sign in ran out before the block was made', async () => {
    const store = new Store(':memory:')
    store.issue(ALICE, 'telegram', 'alice', SIGNED_IN)
    const { chain, stamps } = blockAt(SIGNED_IN + ISSUANCE_TTL_MS)

    await judgeBlock(chain, store, PRICE, 100)

    expect(stamps).toEqual([[ALICE, 'Erroneous']])
  })

  it('marks a record Erroneous when its sign in came after the block was made', async () => {
    const store = new Store(':memory:')
    store.issue(ALICE, 'telegram', 'alice', SIGNED_IN)
    const { chain, stamps } = blockAt(SIGNED_IN - 1)

    await judgeBlock(chain, store, PRICE, 100)

    expect(stamps).toEqual([[ALICE, 'Erroneous']])
  })

  it('answers the same when a block runs again after a later request in it failed', async () => {
    const store = new Store(':memory:')
    store.issue(ALICE, 'telegram', 'alice', SIGNED_IN)
    store.issue(BOB, 'telegram', 'bob', SIGNED_IN)
    const { chain, stamps } = blockAt(SIGNED_IN + HOUR / 6, { [ALICE]: 'alice', [BOB]: 'bob' })
    const provide = chain.provideJudgement
    let dropped = false
    chain.provideJudgement = async (who, infoHash, stamp) => {
      if (who === BOB && !dropped) {
        dropped = true
        throw new Error('the connection dropped before the chain answered')
      }
      return provide(who, infoHash, stamp)
    }

    await expect(judgeBlock(chain, store, PRICE, 100)).rejects.toThrow('connection dropped')
    await judgeBlock(chain, store, PRICE, 100)

    expect(stamps).toEqual([
      [ALICE, 'Reasonable'],
      [ALICE, 'Reasonable'],
      [BOB, 'Reasonable'],
    ])
  })
})
