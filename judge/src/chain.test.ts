import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { Chain } from './chain.js'

/** A chain whose node takes every judgement and reports back only through `answer`. */
function nodeThat(answer: (watch: (result: object) => void) => void) {
  const api = Object.assign(new EventEmitter(), {
    tx: {
      identity: {
        provideJudgement: () => ({
          signAndSend: async (_pair: unknown, _options: unknown, watch: (result: object) => void) => {
            answer(watch)
            return () => {}
          },
        }),
      },
    },
  })
  const chain = Object.assign(Object.create(Chain.prototype), { api, regIndex: 0 }) as Chain
  return { api, chain }
}

describe('provideJudgement', () => {
  it('stops waiting once the connection drops', async () => {
    const { api, chain } = nodeThat(() => {})
    const sent = chain.provideJudgement('nuAlice', '0x1d', 'Reasonable')

    api.emit('disconnected')

    await expect(sent).rejects.toThrow('connection dropped')
  })

  it('stops listening for a drop once the judgement is in a block', async () => {
    const { api, chain } = nodeThat((watch) => setTimeout(() => watch({ status: { isInBlock: true } })))

    expect(await chain.provideJudgement('nuAlice', '0x1d', 'Reasonable')).toBeNull()
    expect(api.listenerCount('disconnected')).toBe(0)
  })

  it('stops listening for a drop when the send itself fails', async () => {
    const { api, chain } = nodeThat(() => {
      throw new Error('1014: Priority is too low')
    })

    await expect(chain.provideJudgement('nuAlice', '0x1d', 'Reasonable')).rejects.toThrow('Priority')
    expect(api.listenerCount('disconnected')).toBe(0)
  })
})
