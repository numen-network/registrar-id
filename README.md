# Automatic ID registrar

The identity service behind `id.numen-network.org`. The wallet opens it in a popup, the user signs in with Telegram or Discord to prove a handle, and a registrar judgement lands on chain once the paid `set_identity` does.

Two programs share one SQLite file and nothing else.

| dir         | role                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verifier/` | public web service. Checks OAuth sign ins and writes one time issuances. Holds the bot token and OAuth secrets, never the registrar key                                                                                                    |
| `judge/`    | private daemon with no inbound port. Walks blocks, and for every `IdentitySet` carrying a judgement request for this registrar, weighs the issuances, the payment riding the same extrinsic, and what it already judged on the parent block, then sends `provide_judgement`. Holds the registrar key |
| `shared/`   | the issuance store and the constants both sides agree on                                                                                                                                                                                   |

An issuance is one proven sign in for one address. It lives an hour, and one judgement spends it.

A channel this registrar already stood behind survives a rewrite for free, as long as the handle does not move. That standing is read off the parent block rather than any database, so only a new or moved handle needs a fresh sign in and the payment that goes with it.

One fresh sign in, one price. The payment is a plain transfer to the treasury, an account the judge derives from the chain's own pallet id, and it has to ride the same extrinsic as the record. The wallet sends `batch_all(set_identity, request_judgement, transfer)` so the whole thing lands together or not at all. The judge counts transfers in that one extrinsic and nowhere else, and leaves a record that paid short alone. Nothing gets vouched for free.

The judgement request is what makes a record this registrar's business. Without one the judge walks past, whatever the record says.

A record it does look at gets one of two answers. `Reasonable` for a record that goes by a name, wears an avatar address a wallet can render, puts a sign in behind every channel, and fills nothing past display, avatar, about, telegram and discord. `Erroneous` for one that misses any of those. `Erroneous` survives the account's own rewrites and only this registrar can lift it.

## Run

```
pnpm install
pnpm build
pnpm test
node --env-file=verifier/.env verifier/dist/main.js
node --env-file=judge/.env judge/dist/main.js
```

`better-sqlite3` compiles from source whenever no prebuild matches the Node version, so the host needs a C++ toolchain.

The chain has to know that key as a registrar before any of this runs. Until an `add_registrar` puts it there, the judge exits at startup with `the chain does not know this key as a registrar`.

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
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

## Updating

```bash
git pull && pnpm install --frozen-lockfile && pnpm build
```

Restart both services afterwards. Anything under `shared/` reaches both of them, so restarting one leaves the other on old code. The judge resumes from its cursor and loses nothing.

A newly required variable announces itself at startup as `missing NAME in the environment`.
