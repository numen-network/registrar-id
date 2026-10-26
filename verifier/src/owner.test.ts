import { Keyring } from '@polkadot/keyring'
import type { KeyringPair } from '@polkadot/keyring/types'
import { u8aToHex, u8aWrapBytes } from '@polkadot/util'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { checkOwner, ownerMessage } from './owner.js'
import { Refusal } from './refusal.js'

const NOW = 1_700_000_000_000
const MINUTE = 60 * 1000

let alice: KeyringPair
let bob: KeyringPair

beforeAll(async () => {
  await cryptoWaitReady()
  const keyring = new Keyring({ type: 'sr25519', ss58Format: 14240 })
  alice = keyring.addFromUri('//Alice')
  bob = keyring.addFromUri('//Bob')
})

/** Signs the way the wallet does, the message wrapped in Bytes tags. */
const signed = (pair: KeyringPair, address: string, provider: string, at: number): string =>
  u8aToHex(pair.sign(u8aWrapBytes(new TextEncoder().encode(ownerMessage(address, provider, at)))))

describe('checkOwner', () => {
  it('lets the key behind the address through', () => {
    const sig = signed(alice, alice.address, 'telegram', NOW)
    expect(() => checkOwner(alice.address, 'telegram', String(NOW), sig, NOW)).not.toThrow()
  })

  it('refuses a signature from another key', () => {
    const sig = signed(bob, alice.address, 'telegram', NOW)
    expect(() => checkOwner(alice.address, 'telegram', String(NOW), sig, NOW)).toThrow(
      'does not check out',
    )
  })

  it('refuses a signature made for the other channel', () => {
    const sig = signed(alice, alice.address, 'telegram', NOW)
    expect(() => checkOwner(alice.address, 'discord', String(NOW), sig, NOW)).toThrow(Refusal)
  })

  it('refuses a signature older than five minutes', () => {
    const sig = signed(alice, alice.address, 'telegram', NOW)
    expect(() => checkOwner(alice.address, 'telegram', String(NOW), sig, NOW + 5 * MINUTE)).not.toThrow()
    expect(() => checkOwner(alice.address, 'telegram', String(NOW), sig, NOW + 5 * MINUTE + 1)).toThrow(
      'too old',
    )
  })

  it('refuses a sign in with no signature or no time', () => {
    const sig = signed(alice, alice.address, 'telegram', NOW)
    expect(() => checkOwner(alice.address, 'telegram', String(NOW), '', NOW)).toThrow('did not sign')
    expect(() => checkOwner(alice.address, 'telegram', '', sig, NOW)).toThrow('did not sign')
    expect(() => checkOwner(alice.address, 'telegram', 'soon', sig, NOW)).toThrow('did not sign')
  })

  it('refuses a signature that is not hex', () => {
    expect(() => checkOwner(alice.address, 'telegram', String(NOW), 'nothex', NOW)).toThrow(Refusal)
  })
})
