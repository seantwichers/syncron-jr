# Syncron Jr

MSP Slack assistant for technicians, service managers, and owners. Reads Syncro (read-only), ranks attention in code, and answers from tool evidence.

Two runtimes share the same Syncro logic:

| Runtime | Use |
| --- | --- |
| Cloudflare Worker (`app.ts`) | Production Slack HTTP events |
| BDK (`bot/`) | Local Socket Mode / playground |

## Cloudflare Worker (Slack)

Deployed at `https://syncron-jr.notifications-812.workers.dev`.

Slack app **Syncron Jr** on `a7-slacker-sandbox` posts events to `/slack/events`. Mention `@Syncron Jr`, DM it, or use `/msp`.

```bash
npm install
npx wrangler login
npm run deploy:worker
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SYNCRO_BASE_URL
npx wrangler secret put SYNCRO_API_KEY
npx wrangler secret put LLM_PROVIDER
npx wrangler secret put LLM_API_KEY
```

`GET /health` returns `{ "ok": true }`.

## BDK (local)

```bash
npm install
cp .env.example .env.local
# SYNCRON_JR_SLACK_* from Slack CLI / doctor
npx bdk validate --dir .
npx bdk dev
```

## Configure

| Secret | Purpose |
| --- | --- |
| `SYNCRO_BASE_URL` | e.g. `https://your-subdomain.syncromsp.com` |
| `SYNCRO_API_KEY` | Syncro API token (tickets/customers/assets read) |
| `SLACK_BOT_TOKEN` | Worker HTTP Slack bot (`xoxb-`) |
| `SLACK_SIGNING_SECRET` | Worker request verification |
| `LLM_PROVIDER` / `LLM_API_KEY` | Worker model (`openai` or `openrouter`) |
| `SYNCRON_JR_SLACK_BOT_TOKEN` / `SYNCRON_JR_SLACK_APP_TOKEN` | BDK Socket Mode only |

Optional: `SLACK_ALLOWED_USER_IDS`, `SLA_DUE_SOON_HOURS`, `SYNCRO_MAX_PAGES`.

## Behavior

Read-only. Drafts notes/replies but does not update Syncro or send mail. Ticket text is untrusted.
