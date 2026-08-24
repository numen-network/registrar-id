import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Refusal } from './refusal.js'

const FRESH_MS = 10 * 60 * 1000

/**
 * Checks a Telegram Login Widget payload the way telegram.org specifies. Every
 * field but hash goes into the check string sorted, the bot token hashed is the
 * HMAC key, and the widget's hash must match. Handles are stored without the @
 * so both channels read the same and a 32 character name still fits Data::Raw32.
 */
export function telegramHandle(
  auth: Record<string, unknown>,
  botToken: string,
  now = Date.now(),
): string {
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

  if (now - Number(fields.auth_date) * 1000 > FRESH_MS) {
    throw new Refusal('The Telegram sign in is too old, try again')
  }

  const username = fields.username
  if (typeof username !== 'string' || username === '') {
    throw new Refusal('The Telegram account has no username, set one and sign in again')
  }
  return username
}
