import { CHANNELS, type Store } from '@numen-id/shared'
import type { Chain } from './chain.js'
import { decide } from './decide.js'

/**
 * Judges each record written in one block that asks this registrar for a
 * judgement, and returns the time the block carries. A sign in counts if it
 * stood at that time, so a judge catching up after a stop answers the way it
 * would have on the spot.
 */
export async function judgeBlock(
  chain: Pick<Chain, 'index' | 'setsIn' | 'identityAt' | 'provideJudgement'>,
  store: Store,
  price: bigint,
  height: number,
): Promise<number> {
  const { blockHash, parentHash, time, sets } = await chain.setsIn(height)
  for (const { who, paid } of sets) {
    const read = await chain.identityAt(blockHash, who)
    if (!read) continue

    // The judgement request riding the same batch is how somebody asks to be
    // judged. A record that never asked is nobody's business here
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

    const verdict = decide(read.fields, store.openFor(who, time), inherited, paid, price)
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
  return time
}
