import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Refusal } from './refusal.js'

const FRESH_MS = 10 * 60 * 1000

interface Payload {
  address: string
  nonce: string
  at: number
}

const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64url')

/** The OAuth state, which is how the address survives the trip through Discord. */
export function sealState(address: string, secret: string, now = Date.now()): string {
  const payload: Payload = { address, nonce: randomBytes(16).toString('hex'), at: now }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function openState(state: string, secret: string, now = Date.now()): string {
  const [body, signature] = state.split('.')
  if (!body || !signature) throw new Refusal('The sign in came back without its state')

  const expected = Buffer.from(sign(body, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new Refusal('The sign in state does not check out')
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload
  if (now - payload.at > FRESH_MS) throw new Refusal('The sign in took too long, start over')
  return payload.address
}
