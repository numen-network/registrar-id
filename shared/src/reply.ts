import type { Channel } from './config.js'

/**
 * What the popup posts back to the wallet, the shape wallet/src/chain/verify.ts
 * reads. proven carries only the channel this session signed in with.
 */
export interface Proven {
  telegram: string
  discord: string
}

export interface Reply {
  kind: 'numen-identity'
  address: string
  proven?: Proven
  expiresAt?: number
  refused?: string
}

export const provenFor = (channel: Channel, handle: string): Proven => ({
  telegram: '',
  discord: '',
  [channel]: handle,
})

export const verified = (
  address: string,
  channel: Channel,
  handle: string,
  expiresAt: number,
): Reply => ({
  kind: 'numen-identity',
  address,
  proven: provenFor(channel, handle),
  expiresAt,
})

export const refused = (address: string, why: string): Reply => ({
  kind: 'numen-identity',
  address,
  refused: why,
})
