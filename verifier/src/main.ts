import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { refused, Store, verified } from '@numen-id/shared'
import { authorizeUrl, discordHandle } from './discord.js'
import { env } from './env.js'
import { donePage, telegramPage } from './pages.js'
import { Refusal } from './refusal.js'
import { openState, sealState } from './state.js'
import { telegramHandle } from './telegram.js'

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{40,64}$/

const store = new Store(env.dbPath)
const app = new Hono()

app.get('/verify', (c) => {
  const provider = c.req.query('provider')
  const address = c.req.query('address') ?? ''
  if (!ADDRESS.test(address)) return c.text('There is no address to verify for', 400)

  if (provider === 'telegram') return c.html(telegramPage(env.botName, address, env.walletOrigin))
  if (provider === 'discord') {
    return c.redirect(
      authorizeUrl(env.discordId, env.discordRedirect, sealState(address, env.stateSecret)),
    )
  }
  return c.text('Unknown provider', 400)
})

app.post('/api/telegram', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    address?: unknown
    auth?: unknown
  } | null
  const address = typeof body?.address === 'string' ? body.address : ''
  if (!ADDRESS.test(address) || typeof body?.auth !== 'object' || body.auth === null) {
    return c.json(refused(address, 'The request is not shaped like a login'), 400)
  }

  try {
    const handle = telegramHandle(body.auth as Record<string, unknown>, env.botToken)
    return c.json(verified(address, 'telegram', handle, store.issue(address, 'telegram', handle)))
  } catch (problem) {
    if (problem instanceof Refusal) return c.json(refused(address, problem.message))
    throw problem
  }
})

app.get('/callback/discord', async (c) => {
  let address: string
  try {
    address = openState(c.req.query('state') ?? '', env.stateSecret)
  } catch (problem) {
    if (problem instanceof Refusal) return c.html(donePage(refused('', problem.message), env.walletOrigin))
    throw problem
  }

  const code = c.req.query('code')
  if (!code) {
    return c.html(donePage(refused(address, 'The Discord sign in was cancelled'), env.walletOrigin))
  }

  try {
    const handle = await discordHandle(code, env.discordId, env.discordSecret, env.discordRedirect)
    return c.html(
      donePage(
        verified(address, 'discord', handle, store.issue(address, 'discord', handle)),
        env.walletOrigin,
      ),
    )
  } catch (problem) {
    if (problem instanceof Refusal) return c.html(donePage(refused(address, problem.message), env.walletOrigin))
    throw problem
  }
})

serve({ fetch: app.fetch, port: env.port }, (bound) => {
  console.log(`verifier listening on ${bound.port}`)
})
