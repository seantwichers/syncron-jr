# Syncron Jr

BDK Slack assistant for MSP technicians, service managers, and owners. Ask in Slack; the agent reads Syncro (read-only), ranks attention in code, and answers from tool evidence.

## What it can answer

- Overdue and at-risk tickets, with a stable attention order
- Ticket detail, recent comments, linked assets, and timer notes
- Customer lookup without sending email, phone, or street address to the model
- Open-ticket counts, aging, recurring problem types, and assignee queue size
- Troubleshooting or escalation suggestions grounded in retrieved tickets

Follow-ups stay in the Slack thread. Mention the bot or DM it.

## Develop

```bash
npm install
cp .env.example .env.local
# Mint Slack tokens (writes SYNCRON_JR_SLACK_* into .env.local):
npx bdk slack create --dir . --name "Syncron Jr"
npx bdk validate --dir .
npx bdk dev
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve locally with playground |
| `npm test` | Mocked Syncro unit tests |
| `npm run check` | Typecheck |
| `npx bdk validate --dir .` | Validate agent surface |
| `npx bdk slack doctor --prefix SYNCRON_JR` | Check Slack tokens |

## Configure

Required secrets:

- `SYNCRO_BASE_URL` such as `https://your-subdomain.syncromsp.com`
- `SYNCRO_API_KEY`

Slack tokens come from `bdk slack create` (`SYNCRON_JR_SLACK_BOT_TOKEN`, `SYNCRON_JR_SLACK_APP_TOKEN`).

Optional:

- `SLACK_ALLOWED_USER_IDS` — comma-separated Slack user IDs; empty allows the workspace
- `SLA_DUE_SOON_HOURS` (default 24)
- `SYNCRO_MAX_PAGES` (default 4)
- `SYNCRO_TIMEOUT_MS` (default 20000)

## Deploy

```bash
git push
npx bdk deploy --dir .
npx bdk secrets set syncron-jr SYNCRO_BASE_URL
npx bdk secrets set syncron-jr SYNCRO_API_KEY
```

Use a Cursor service account for hosted deploy. Redeploy after setting secrets.
