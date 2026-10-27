import { CHANNELS, type Store } from '@numen-id/shared'
import type { Chain } from './chain.js'
import { decide } from './decide.js'

/**
 * Judges each record whose owner asked this registrar for a judgement in one
 * block. A sign in counts if it stood at the time the block carries, so a
 * judge catching up after a stop answers the way it would have on the spot.
 */
export async function judgeBlock(
  chain: Pick<Chain, 'index' | 'requestsIn' | 'identityAt' | 'provideJudgement'>,
  store: Store,
  price: bigint,
  height: number,
): Promise<void> {
  const { blockHash, parentHash, time, requests } = await chain.requestsIn(height)
  for (const { who, paid } of requests) {
    const read = await chain.identityAt(blockHash, who)
    if (!read) continue

    // The record is read off the block's end, so a request withdrawn later in
    // the same block leaves nothing to answer
    if (!read.askedBy.includes(chain.index)) continue

    // What stood before the write. A channel this registrar already judged
    // there keeps its standing while the handle does not move, free of charge
    const parent = await chain.identityAt(parentHash, who)
    const inherited: Record<string, string> = {}
    if (parent?.checkedBy.includes(chain.index)) {
      for (const channel of CHANNELS) {
        const handle = parent.fields[channel]
        if (handle) inherited[channel] = handle
      }
    }

    const verdict = decide(read.fields, store.openFor(who, height, time), inherited, paid, price)
    if (verdict.stamp === null) {
      console.log(`${who} at ${height} left alone, ${verdict.why}`)
      continue
    }

    const refusal = await chain.provideJudgement(who, read.hash, verdict.stamp)
    if (refusal !== null) {
      console.log(`${who} at ${height} turned down by the chain, ${refusal}`)
      continue
    }

    if (verdict.stamp === 'Reasonable') {
      store.consume(verdict.spend, height)
      console.log(`${who} judged at ${height}`)
    } else {
      console.log(`${who} marked ${verdict.stamp} at ${height}, ${verdict.why}`)
    }
  }
}
