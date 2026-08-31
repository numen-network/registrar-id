/** Chain constants mirrored from numen. */

export const SS58_PREFIX = 14240

export const UNIT = 10n ** 18n

export const ISSUANCE_TTL_MS = 60 * 60 * 1000

/** Every channel this service signs into and judges. Adding one starts here. */
export const CHANNELS = ['telegram', 'discord'] as const

export type Channel = (typeof CHANNELS)[number]

export const isChannel = (value: string): value is Channel =>
  (CHANNELS as readonly string[]).includes(value)

/**
 * What an account writes about itself. Nobody can prove any of it, so the
 * judgement policy lets it through unchecked.
 */
export const PROFILE = ['display', 'avatar', 'about'] as const
