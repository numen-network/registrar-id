import { CHANNELS, PROFILE } from '@numen-id/shared'

/** An issuance still standing for the address being judged. */
export interface Open {
  id: number
  channel: string
  handle: string
}

/** What this registrar writes on a record it looked at. */
export type Stamp = 'Reasonable' | 'Erroneous'

export type Verdict =
  | { stamp: 'Reasonable'; spend: number[] }
  | { stamp: 'Erroneous'; why: string }
  | { stamp: null; why: string }

/** Text that renders as nothing, whitespace and invisible format characters alike. */
const BLANK = /^[\s\p{Cf}]*$/u

/** An address a wallet can actually hang a picture off. */
const PICTURE = /^https:\/\/\S+\.(?:png|jpe?g|gif|webp)$/i

const ALLOWED = new Set<string>([...PROFILE, ...CHANNELS])

/**
 * The whole judgement policy. Erroneous goes on a record that has no name,
 * wears an avatar address no wallet can render, claims a channel the newest
 * proof does not back, or fills anything past the profile and the two channels.
 * A channel this registrar already stood behind rides free. A handle that
 * moved needs the transfer to cover it. Short payment is the one thing left
 * alone rather than argued with, since it means the wallet and the judge
 * disagree on the price.
 */
export function decide(
  info: Record<string, string>,
  open: Open[],
  inherited: Record<string, string>,
  paid: bigint,
  price: bigint,
): Verdict {
  if (BLANK.test(info.display ?? '')) {
    return { stamp: 'Erroneous', why: 'the record goes by no name' }
  }

  const avatar = info.avatar ?? ''
  if (avatar !== '' && !PICTURE.test(avatar)) {
    return { stamp: 'Erroneous', why: 'the avatar shows no picture' }
  }

  const wanted = CHANNELS.map((channel) => ({ channel, handle: info[channel] ?? '' })).filter(
    (entry) => entry.handle !== '',
  )
  if (wanted.length === 0) return { stamp: 'Erroneous', why: 'no channel on the record' }

  // What this registrar stood behind before the write, with a live sign in
  // speaking over it. The store keeps one open issuance per channel, so the
  // newest proof is the only one a channel gets to answer with
  const stands: Record<string, { handle: string; id?: number }> = {}
  for (const [channel, handle] of Object.entries(inherited)) stands[channel] = { handle }
  for (const entry of open) stands[entry.channel] = { handle: entry.handle, id: entry.id }

  const spend: number[] = []
  for (const { channel, handle } of wanted) {
    const proof = stands[channel]
    if (proof?.handle !== handle) {
      return { stamp: 'Erroneous', why: `no sign in stands behind ${channel}` }
    }
    if (proof.id !== undefined && inherited[channel] !== handle) spend.push(proof.id)
  }

  for (const [name, text] of Object.entries(info)) {
    if (text !== '' && !ALLOWED.has(name)) {
      return { stamp: 'Erroneous', why: `${name} is filled and nobody can prove it` }
    }
  }

  const owed = price * BigInt(spend.length)
  if (paid < owed) return { stamp: null, why: `paid ${paid}, the checks cost ${owed}` }

  return { stamp: 'Reasonable', spend }
}
