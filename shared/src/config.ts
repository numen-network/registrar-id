/** Chain constants mirrored from numen. */

export const SS58_PREFIX = 14240

export const UNIT = 10n ** 18n

export const ISSUANCE_TTL_MS = 60 * 60 * 1000

/** The channels the verifier can actually sign somebody into. */
export const CHANNELS = ['telegram', 'discord'] as const

export type Channel = (typeof CHANNELS)[number]

export const isChannel = (value: string): value is Channel =>
  (CHANNELS as readonly string[]).includes(value)

/**
 * numen_runtime identity_info field order, which is also the bit order of a
 * registrar's set_fields declaration.
 */
export const IDENTITY_FIELDS = [
  'display',
  'web',
  'email',
  'matrix',
  'github',
  'x',
  'telegram',
  'discord',
] as const

/** The fields a registrar declares it checks, read out of its fields mask. */
export function declaredFields(mask: bigint): string[] {
  return IDENTITY_FIELDS.filter((_, bit) => ((mask >> BigInt(bit)) & 1n) === 1n)
}
