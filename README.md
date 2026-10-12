# MSP Slack assistant

A single-file Slack assistant for MSP technicians, service managers, and owners. Ask a question in Slack and the app reads Syncro, calculates ticket age and attention order in code, then asks the configured language model for a short, evidence-based recommendation.

The application logic is in `app.ts`. It does not write to Syncro.

## What it can answer

- Overdue and at-risk tickets, with a stable attention order.
- Ticket detail, recent comments, linked assets, and timer notes.
- Customer lookup without sending email, phone, or street address to the model.
- Open-ticket counts, aging, recurring problem types, and assignee queue size.
- Any other read-only ticket question: status, history, customer, assignee, age, problem type, tags, assets, or a drafted next step.

Invite the bot to a channel and it answers every human message there, including follow-ups in the thread it opens. You do not need to @mention it again. Direct messages and `/msp` still work. Set `SLACK_CHANNEL_IDS` when the bot should stay quiet in other channels.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run dev` loads `.env` when that file exists and starts the assistant.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Slack app |
| `npm test` | Run mocked tool and agent tests |
| `npm run typecheck` | Typecheck `app.ts` and the tests |
| `npm run lint` | Lint `app.ts` and the tests |
| `npm run check:syncro` | Read live open tickets and print a redacted summary |

`SYNCRO_LIVE=1 npm test` also runs the live Syncro test. It needs `SYNCRO_BASE_URL` and `SYNCRO_API_KEY`.

## Configure

Copy `.env.example`. Do not commit `.env`.

Required for the Slack app:

- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SYNCRO_BASE_URL` such as `https://your-subdomain.syncromsp.com`
- `SYNCRO_API_KEY`
- `LLM_API_KEY`

`LLM_PROVIDER` is `openai` or `openrouter`. Both use `POST /chat/completions` with the same tool definitions. `LLM_BASE_URL` overrides the provider default when you need a proxy. `LLM_MODEL` defaults to `gpt-4o-mini` for OpenAI and `openai/gpt-4o-mini` for OpenRouter.

Set `SLACK_APP_TOKEN` (`xapp-`, scope `connections:write`) to use Socket Mode. Leave it empty to use HTTP on `PORT` (default `3000`). Slack signs requests and Bolt checks them with `SLACK_SIGNING_SECRET`.

`SLACK_ALLOWED_USER_IDS` is an optional comma-separated list of Slack user IDs. Empty means any user in the workspace can ask. That list is not role-based authorization. One process serves one Syncro account; run another process with its own environment for another organization.

`SLACK_CHANNEL_IDS` is an optional comma-separated list of channel IDs. Empty means the bot answers every channel, private channel, and group DM it is in. Direct messages are always answered. Use this when the bot is invited somewhere it should not chat.

`SLA_DUE_SOON_HOURS` (default 24) is the local rule for “due soon.” Syncro’s own `sla_breached` and `sla_breaching_soon` fields are reported when the ticket list returns them. Overdue means `due_date` is in the past and `resolved_at` is empty.

The Syncro token needs read access to tickets, customers, and assets. This app calls only:

- `GET /tickets` and `GET /tickets/{id}`
- `GET /tickets/{id}/comments`
- `GET /tickets/settings`
- `GET /users` when settings does not include technicians
- `GET /customers` and `GET /customers/{id}`
- `GET /customer_assets`

Priority, age, overdue, assignment gaps, problem type, tag, contact, ticket type, and attention order are calculated locally. Those are not documented list filters. Page size is whatever Syncro returns, and each tool stops after `SYNCRO_MAX_PAGES` (default 4). Ticket questions call a Syncro tool before the model states a fact. Short greetings and thanks do not.

## Slack app

Create a Slack app and install it to the workspace.

Bot scopes:

- `app_mentions:read`
- `channels:history`
- `chat:write`
- `commands`
- `groups:history`
- `im:history`
- `im:read`
- `im:write`
- `mpim:history`

Bot events: `app_mention`, `message.channels`, `message.groups`, `message.im`, and `message.mpim`.

`message.channels` and `message.groups` are what make a dedicated channel a conversation. Without them, Slack only delivers @mentions. The bot replies in a thread. A later reply in that thread uses the same conversation, so “what about the oldest?” stays grounded in the tickets just retrieved. @mentions and channel messages for the same Slack timestamp are answered once.

Slash command: `/msp`.

Socket Mode is the simplest development setup. For HTTP mode, point the Slack request URL at `https://your-host/slack/events` and keep `SLACK_APP_TOKEN` empty. `GET /health` returns `{ "ok": true }`.

## Cloudflare

This project is a Worker, not a static site. `wrangler.jsonc` is what stops Wrangler from failing with "Could not detect a directory containing static files". Do not deploy it as Cloudflare Pages and do not add a dummy `index.html` just to satisfy that check.

```bash
npx wrangler login
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SYNCRO_BASE_URL
npx wrangler secret put SYNCRO_API_KEY
npx wrangler secret put LLM_API_KEY
npx wrangler secret put LLM_PROVIDER
npx wrangler deploy
```

Leave `SLACK_APP_TOKEN` unset on Cloudflare. Point the Slack request URL at the workers.dev URL. The Worker accepts events and `/msp` on any POST path, acknowledges Slack immediately, then posts the reply. `GET /` and `GET /health` return `{ "ok": true }`.

Local development stays `npm run dev`.

## Behavior

Simple questions stay short. Troubleshooting and management questions use Findings, Assessment, Recommended next steps, Risks or uncertainties, and Supporting ticket references.

Likely causes are labeled as hypotheses. The assistant can draft an internal note or a customer reply and will say that the draft was not sent. It does not update tickets, send mail, close tickets, or run remote actions.

Ticket text is treated as untrusted. Instructions found in a ticket cannot change these rules, and tool arguments are validated before a Syncro call. Credentials stay in the server environment and are not sent to the model.

## Checks

The mocked suite covers pagination, local overdue, problem-type, and tag filtering, attention order, redaction, allowlisting, channel routing, Slack signature verification, and the shared OpenAI/OpenRouter tool loop.

A live read against one Syncro account scanned 40 open tickets, calculated 26 overdue from `due_date`, and loaded the oldest open ticket (`#28641`) with its comment history. Syncro returned `sla_breached: false` on that set, and priority was unset, so the attention order came from due date and `customer_reply` rather than a breach flag or priority label.

Slack delivery and a live model completion were not run. They need `SLACK_*` and `LLM_API_KEY`. A passing mock test does not prove that a particular Slack workspace or model account is configured.
