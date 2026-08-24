import { Refusal } from './refusal.js'

const API = 'https://discord.com/api/v10'

export function authorizeUrl(clientId: string, redirect: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    scope: 'identify',
    state,
  })
  return `https://discord.com/oauth2/authorize?${query}`
}

/** Trades the callback code for who signed in. The username is the handle. */
export async function discordHandle(
  code: string,
  clientId: string,
  clientSecret: string,
  redirect: string,
): Promise<string> {
  const token = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
    }),
  })
  if (!token.ok) throw new Refusal('Discord did not accept the sign in')
  const { access_token } = (await token.json()) as { access_token?: string }
  if (!access_token) throw new Refusal('Discord sent no token back')

  const me = await fetch(`${API}/users/@me`, {
    headers: { authorization: `Bearer ${access_token}` },
  })
  if (!me.ok) throw new Refusal('Discord would not say who signed in')
  const { username } = (await me.json()) as { username?: string }
  if (!username) throw new Refusal('Discord sent no username back')
  return username
}
