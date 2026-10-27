import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Refusal } from './refusal.js'

const FRESH_MS = 10 * 60 * 1000

export interface TelegramLogin {
  handle: string
  hash: string
  /** The last moment the login still passes as fresh. */
  until: number
}

/**
 * Checks a Telegram Login Widget payload the way telegram.org specifies. Every
 * field but hash goes into the check string sorted, the bot token hashed is the
 * HMAC key, and the widget's hash must match. Handles are stored without the @
 * so both channels read the same and a 32 character name still fits Data::Raw32.
 */
export function telegramLogin(
  auth: Record<string, unknown>,
  botToken: string,
  now = Date.now(),
): TelegramLogin {
  const { hash, ...fields } = auth
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new Refusal('Telegram sent no signature')
  }

  const lines = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${String(fields[key])}`)
    .join('\n')
  const secret = createHash('sha256').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(lines).digest()
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) {
    throw new Refusal('The Telegram sign in does not check out')
  }

  const until = Number(fields.auth_date) * 1000 + FRESH_MS
  if (now > until) {
    throw new Refusal('The Telegram sign in is too old, try again')
  }

  const username = fields.username
  if (typeof username !== 'string' || username === '') {
    throw new Refusal('The Telegram account has no username, set one and sign in again')
  }
  return { handle: username, hash, until }
}

/**
 * One Telegram login backs one address. The widget signs a new login on every
 * click, so a payload sent again is either a double click or a replay onto
 * someone else's address.
 */
export class SpentLogins {
  private spent = new Map<string, { address: string; expiresAt: number; until: number }>()

  /** The expiry of the issuance this login backs, issuing it the first time round. */
  spend(login: TelegramLogin, address: string, issue: () => number, now = Date.now()): number {
    for (const [hash, entry] of this.spent) if (entry.until < now) this.spent.delete(hash)

    const earlier = this.spent.get(login.hash)
    if (earlier) {
      if (earlier.address !== address) {
        throw new Refusal('This Telegram sign in already went to another address, sign in again')
      }
      return earlier.expiresAt
    }

    const expiresAt = issue()
    this.spent.set(login.hash, { address, expiresAt, until: login.until })
    return expiresAt
  }
}
