import { isHex } from '@polkadot/util'
import { signatureVerify } from '@polkadot/util-crypto'
import { Refusal } from './refusal.js'

const FRESH_MS = 5 * 60 * 1000

/**
 * What the wallet signs with the account's own key before a sign in opens, the
 * shape wallet/src/chain/verify.ts builds. The provider and the time ride
 * inside, so one signature opens one channel for a few minutes.
 */
export const ownerMessage = (address: string, provider: string, at: number): string =>
  `numen-identity\n${address}\n${provider}\n${at}`

export function checkOwner(
  address: string,
  provider: string,
  at: string,
  sig: string,
  now = Date.now(),
): void {
  const when = Number(at)
  if (at === '' || !Number.isInteger(when) || sig === '') {
    throw new Refusal('The wallet did not sign for this address')
  }
  if (Math.abs(now - when) > FRESH_MS) {
    throw new Refusal('The signature is too old, start over from the wallet')
  }

  let valid = false
  if (isHex(sig)) {
    try {
      valid = signatureVerify(ownerMessage(address, provider, when), sig, address).isValid
    } catch {
      valid = false
    }
  }
  if (!valid) throw new Refusal('The signature does not check out')
}
