import { describe, expect, it } from 'vitest'
import { declaredFields } from './config.js'

describe('declaredFields', () => {
  // Telegram is bit 6 and discord bit 7, the cross repo contract with the
  // runtime and the wallet
  it('reads the runtime bit order', () => {
    expect(declaredFields((1n << 6n) | (1n << 7n))).toEqual(['telegram', 'discord'])
    expect(declaredFields(1n << 5n)).toEqual(['x'])
    expect(declaredFields(1n)).toEqual(['display'])
  })

  it('claims nothing for a registrar that declared nothing', () => {
    expect(declaredFields(0n)).toEqual([])
  })
})
