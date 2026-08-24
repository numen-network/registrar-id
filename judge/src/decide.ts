/** One identity field as read off the chain, already out of its Data wrapping. */
export interface Field {
  kind: 'none' | 'raw' | 'other'
  text: string
}

/** An issuance still standing for the address being judged. */
export interface Open {
  id: number
  channel: string
  handle: string
}

export type Verdict = { judge: true; spend: number[] } | { judge: false; why: string }

/**
 * The whole judgement policy. What counts as provable is the registrar's own
 * set_fields declaration, anything filled outside it is unprovable and sinks
 * the record. Every declared channel the record wears needs either the handle
 * this registrar already stood behind before the write, inherited free of
 * charge, or a live sign in with the same handle, and the transfer riding the
 * same extrinsic has to cover one price per fresh sign in. Anything less is
 * left alone rather than argued with.
 */
export function decide(
  info: Record<string, Field>,
  open: Open[],
  inherited: Record<string, string>,
  declared: string[],
  paid: bigint,
  price: bigint,
): Verdict {
  const allowed = new Set(['display', ...declared])
  for (const [name, field] of Object.entries(info)) {
    if (field.kind === 'other') return { judge: false, why: `${name} is not plain text` }
    if (field.kind === 'raw' && !allowed.has(name)) {
      return { judge: false, why: `${name} is filled and nobody can prove it` }
    }
  }

  const wanted = declared.filter((channel) => info[channel]?.kind === 'raw')
  if (wanted.length === 0) return { judge: false, why: 'no channel on the record' }

  const spend: number[] = []
  for (const channel of wanted) {
    if (inherited[channel] === info[channel]?.text) continue
    const match = open.find(
      (entry) => entry.channel === channel && entry.handle === info[channel]?.text,
    )
    if (!match) return { judge: false, why: `no sign in stands behind ${channel}` }
    spend.push(match.id)
  }

  const owed = price * BigInt(spend.length)
  if (paid < owed) return { judge: false, why: `paid ${paid}, the checks cost ${owed}` }

  return { judge: true, spend }
}
