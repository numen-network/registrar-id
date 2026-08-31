import { CHANNELS, Store } from '@numen-id/shared'
import { Chain } from './chain.js'
import { decide } from './decide.js'
import { env } from './env.js'

const store = new Store(env.dbPath)
const chain = await Chain.connect(env.rpc, env.suri)

let tip = await chain.tip()
chain.onNewHeight((height) => {
  tip = Math.max(tip, height)
})

// The first run starts at the tip, whatever happened before the service existed
// is not its business
if (store.cursor() === null) store.advance(tip)

setInterval(() => store.prune(), 3_600_000).unref()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function judgeBlock(height: number): Promise<void> {
  const { blockHash, parentHash, sets } = await chain.setsIn(height)
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

    const verdict = decide(read.fields, store.openFor(who), inherited, paid, env.price)
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

console.log(`judging from block ${store.cursor()} toward ${tip}`)

while (true) {
  const cursor = store.cursor() ?? tip
  if (cursor >= tip) {
    await sleep(3000)
    continue
  }

  const height = cursor + 1
  try {
    await judgeBlock(height)
    store.advance(height)
  } catch (problem) {
    console.error(`block ${height} failed, trying again`, problem)
    await sleep(5000)
  }
}
