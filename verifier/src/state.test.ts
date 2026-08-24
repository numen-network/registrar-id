import { describe, expect, it } from 'vitest'
import { Refusal } from './refusal.js'
import { openState, sealState } from './state.js'

const SECRET = 'state-secret'
const ADDR = 'nuSomeAddress'
const NOW = 1_700_000_000_000

describe('state', () => {
  it('carries the address through a round trip', () => {
    expect(openState(sealState(ADDR, SECRET, NOW), SECRET, NOW)).toBe(ADDR)
  })

  it('never seals the same twice', () => {
    expect(sealState(ADDR, SECRET, NOW)).not.toBe(sealState(ADDR, SECRET, NOW))
  })

  it('refuses a tampered body', () => {
    const [, signature] = sealState(ADDR, SECRET, NOW).split('.')
    const forged = `${Buffer.from(JSON.stringify({ address: 'nuThief', nonce: '00', at: NOW })).toString('base64url')}.${signature}`
    expect(() => openState(forged, SECRET, NOW)).toThrow(Refusal)
  })

  it('refuses another secret', () => {
    expect(() => openState(sealState(ADDR, 'other', NOW), SECRET, NOW)).toThrow(Refusal)
  })

  it('refuses a state older than ten minutes', () => {
    const state = sealState(ADDR, SECRET, NOW)
    expect(() => openState(state, SECRET, NOW + 11 * 60 * 1000)).toThrow('took too long')
  })

  it('refuses a bare word with no state shape', () => {
    expect(() => openState('nothing', SECRET, NOW)).toThrow(Refusal)
  })
})
