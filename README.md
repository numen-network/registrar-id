# Automatic ID registrar

The identity service behind `id.numen-network.org`. The wallet opens it in a popup, the user signs in with Telegram or Discord to prove a handle, and a registrar judgement lands on chain once the paid `set_identity` does.

Two programs share one SQLite file and nothing else.

| dir         | role                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verifier/` | public web service. Checks OAuth sign ins and writes one time issuances. Holds the bot token and OAuth secrets, never the registrar key                                                                                                    |
| `judge/`    | private daemon with no inbound port. Walks blocks, matches `IdentitySet` against issuances, the payment riding the same extrinsic, and what it already judged on the parent block, then sends `provide_judgement`. Holds the registrar key |
| `shared/`   | the issuance store and the constants both sides agree on                                                                                                                                                                                   |

An issuance is one proven sign in for one address. It lives an hour, and one judgement spends it.

A channel this registrar already stood behind survives a rewrite for free, as long as the handle does not move. That standing is read off the parent block rather than any database, so only a new or moved handle needs a fresh sign in and the payment that goes with it.

One fresh sign in, one price. The payment is a plain transfer to the registrar account, and it has to ride the same extrinsic as the record. The wallet sends `batch_all(set_identity, transfer)` so the two land together or not at all. The judge counts transfers in that one extrinsic and nowhere else, and leaves a record that paid short alone. Nothing gets vouched for free.

The registrar's own on chain field declaration is the whole definition of provable. Fill a field outside it and the record gets nothing.

## Run

```
pnpm install
pnpm build
pnpm test
node --env-file=verifier/.env verifier/dist/main.js
node --env-file=judge/.env judge/dist/main.js
```
