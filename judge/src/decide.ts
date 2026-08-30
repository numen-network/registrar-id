import { PROFILE } from '@numen-id/shared'

/** An issuance still standing for the address being judged. */
export interface Open {
  id: number
  channel: string
  handle: string
}

export type Verdict = { judge: true; spend: number[] } | { judge: false; why: string }

/** Text that renders as nothing, whitespace and invisible format characters alike. */
const BLANK = /^[\s\p{Cf}]*$/u

/**
 * The whole judgement policy. What counts as provable is the registrar's own
 * set_fields declaration, and anything filled outside it and the profile is
 * unprovable and sinks the record. A record nobody can name sinks too. Every
 * declared channel the record wears needs either the handle this registrar
 * already stood behind before the write, inherited free of charge, or a live
 * sign in with the same handle, and the transfer riding the same extrinsic has
 * to cover one price per fresh sign in. Anything less is left alone rather than
 * argued with.
 */
export function decide(
  info: Record<string, string>,
  open: Open[],
  inherited: Record<string, string>,
  declared: string[],
  paid: bigint,
  price: bigint,
): Verdict {
  if (BLANK.test(info.display ?? '')) return { judge: false, why: 'the record goes by no name' }

  const allowed = new Set<string>([...PROFILE, ...declared])
  for (const [name, text] of Object.entries(info)) {
    if (text !== '' && !allowed.has(name)) {
      return { judge: false, why: `${name} is filled and nobody can prove it` }
    }
  }

  const wanted = declared.filter((channel) => (info[channel] ?? '') !== '')
  if (wanted.length === 0) return { judge: false, why: 'no channel on the record' }

  const spend: number[] = []
  for (const channel of wanted) {
    if (inherited[channel] === info[channel]) continue
    const match = open.find((entry) => entry.channel === channel && entry.handle === info[channel])
    if (!match) return { judge: false, why: `no sign in stands behind ${channel}` }
    spend.push(match.id)
  }

  const owed = price * BigInt(spend.length)
  if (paid < owed) return { judge: false, why: `paid ${paid}, the checks cost ${owed}` }

  return { judge: true, spend }
}
