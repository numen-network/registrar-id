# Automatic ID registrar

The identity service behind `id.numen-network.org`. The wallet signs for the address with the account's own key and opens the service in a popup, the user signs in with Telegram or Discord to prove a handle, and a registrar judgement lands on chain once the paid `set_identity` does. Without that signature the service opens no sign in, so an issuance can only ever land on an address the wallet holds.

Two programs share one SQLite file and nothing else.

| dir         | role                                                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifier/` | public web service. Checks the wallet's signature for the address, then the OAuth sign in, and writes one time issuances. Holds the bot token and OAuth secrets, never the registrar key                                                                                        |
| `judge/`    | private daemon with no inbound port. Walks blocks, and for every judgement request aimed at this registrar, weighs the issuances, the payment riding the same extrinsic, and what it already judged on the parent block, then sends `provide_judgement`. Holds the registrar key |
| `shared/`   | the issuance store and the constants both sides agree on                                                                                                                                                                                                                         |

An issuance is one proven sign in for one address. It lives an hour and one judgement spends it. A fresh sign in leaves the earlier ones standing. An unspent issuance is deleted when its hour runs out, while a spent one stays on as the audit trail.

A channel this registrar already stood behind survives a rewrite for free, as long as the handle does not move. That standing is read off the parent block rather than any database, so only a new or moved handle needs a fresh sign in and the payment that goes with it.

One fresh sign in, one price. The payment is a plain transfer to the treasury, an account the judge derives from the chain's own pallet id, and it has to ride the same extrinsic as the record. The wallet sends `batch_all(set_identity, request_judgement, transfer)` so the whole thing lands together or not at all. The judge counts transfers in that one extrinsic and nowhere else, and leaves a record that paid short alone. Nothing gets vouched for free.

The judgement request is what makes a record this registrar's business, whether it rides the batch that writes the record or comes on its own later. Without one the judge walks past, whatever the record says.

A record it does look at gets one of two answers. `Reasonable` for a record that goes by a name, wears an avatar address a wallet can render, puts a sign in behind every channel, and fills nothing past display, avatar, bio, telegram and discord. `Erroneous` for one that misses any of those. `Erroneous` survives the account's own rewrites. Only clearing the identity or a new judgement from this registrar lifts it.

## Requirements

- Node 24+ and pnpm
- A C++ toolchain for `better-sqlite3` when no prebuild matches your Node
- An archive node, for state at every block since genesis
- A registrar key added on chain via `add_registrar`. Without it the judge exits at startup with `the chain does not know this key as a registrar`
- One Telegram bot per network, its login domain set to that network's verifier host
- A Discord OAuth app redirecting to the verifier's `/callback/discord`

## Run

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather) using `/newbot`, then point `/setdomain` at the verifier's host. Its username without the `@` and its token go into `verifier/.env` as `TELEGRAM_BOT_NAME` and `TELEGRAM_BOT_TOKEN`.
2. Create an app in the [Discord Developer Portal](https://discord.com/developers/applications) and add `https://<verifier host>/callback/discord` under OAuth2 redirects. The client ID, the client secret and that URL go into `verifier/.env` as `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_REDIRECT_URI`.
3. Copy `verifier/.env.example` to `verifier/.env` and `judge/.env.example` to `judge/.env`, fill in the rest of both files.

```bash
pnpm install
pnpm build
pnpm test
node --env-file=verifier/.env verifier/dist/main.js
node --env-file=judge/.env judge/dist/main.js
```

### Run it as a service

numen-id-verifier.service

```ini
[Unit]
Description=Numen id verifier
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
WorkingDirectory=/opt/registrar-id
ExecStart=/usr/bin/node --env-file=/opt/registrar-id/verifier.env /opt/registrar-id/verifier/dist/main.js
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

numen-id-judge.service

```ini
[Unit]
Description=Numen id judge
After=network-online.target numen.service
Wants=network-online.target

[Service]
Type=exec
WorkingDirectory=/opt/registrar-id
ExecStart=/usr/bin/node --env-file=/opt/registrar-id/judge.env /opt/registrar-id/judge/dist/main.js
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

## Updating

```bash
git pull && pnpm install --frozen-lockfile && pnpm build
systemctl restart numen-id-verifier numen-id-judge
```
