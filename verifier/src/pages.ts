import type { Reply } from '@numen-id/shared'

/** Values headed into inline script, with the one character that could break out. */
const js = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

const text = (value: string): string =>
  value.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!)

const shell = (body: string): string => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Numen identity</title>
<style>
  body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #101014; color: #e8e8ec; font: 15px/1.5 system-ui, sans-serif; }
  main { text-align: center; padding: 24px; max-width: 420px; }
  code { color: #9ea0ad; font-size: 13px; word-break: break-all; }
  p { margin: 12px 0 0; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`

/**
 * Neither page closes itself. The wallet closes the window once it has read the
 * reply, and a window that closes in the same breath as its postMessage races
 * the reader, which then finds a dead window where the message should be.
 */
export const telegramPage = (botName: string, address: string, walletOrigin: string): string =>
  shell(`<p>Sign in to prove a Telegram handle for</p>
<code>${text(address)}</code>
<p id="word"></p>
<script>
  const ADDRESS = ${js(address)}
  function onTelegramAuth(auth) {
    fetch('/api/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: ADDRESS, auth }),
    })
      .then((response) => response.json())
      .then((reply) => {
        window.opener?.postMessage(reply, ${js(walletOrigin)})
        document.getElementById('word').textContent =
          reply.refused ?? 'Verified, this window can close'
      })
      .catch(() => {
        document.getElementById('word').textContent = 'The service could not be reached'
      })
  }
</script>
<div style="margin-top: 20px; display: flex; justify-content: center">
<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${text(botName)}" data-size="large" data-onauth="onTelegramAuth(user)"></script>
</div>`)

/** The end of the Discord round trip, spoken to the wallet and then to the user. */
export const donePage = (reply: Reply, walletOrigin: string): string =>
  shell(`<p>${text(reply.refused ?? 'Verified, this window can close')}</p>
<script>
  window.opener?.postMessage(${js(reply)}, ${js(walletOrigin)})
</script>`)
