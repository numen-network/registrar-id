import { Store } from '@numen-id/shared'
import { Chain } from './chain.js'
import { env } from './env.js'
import { judgeBlock } from './judge.js'

const store = new Store(env.dbPath)
const chain = await Chain.connect(env.rpc, env.suri)

let tip = await chain.tip()
chain.onNewHeight((height) => {
  tip = Math.max(tip, height)
})

// The first run starts at the tip, whatever happened before the service existed
// is not its business
if (store.cursor() === null) store.advance(tip)

// How far the judge has got, in chain time. A sign in that ran out before then
// can back no block still to come
let judgedUpTo = 0
setInterval(() => store.prune(judgedUpTo), 3_600_000).unref()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

console.log(`judging from block ${store.cursor()} toward ${tip}`)

while (true) {
  const cursor = store.cursor() ?? tip
  if (cursor >= tip) {
    await sleep(3000)
    continue
  }

  const height = cursor + 1
  try {
    judgedUpTo = await judgeBlock(chain, store, env.price, height)
    store.advance(height)
  } catch (problem) {
    console.error(`block ${height} failed, trying again`, problem)
    await sleep(5000)
  }
}
