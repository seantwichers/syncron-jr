# Syncron Jr

Evidence-based **MSP intelligence agent** for technicians, service managers, and directors. Reads SyncroMSP (read-only), calculates metrics and recurring-problem clusters in code, and uses an LLM only to interpret structured findings.

Two runtimes share the same Syncro + intelligence logic:

| Runtime | Use |
| --- | --- |
| Cloudflare Worker (`app.ts`) | Production Slack HTTP events |
| BDK (`bot/`) | Local Socket Mode / playground |

## Capabilities

| Capability | Tool / module |
| --- | --- |
| Recurring problem clusters (similarity, reopens, labor, recommendations) | `investigate_recurring_problems` (`bot/lib/intelligence.ts`) |
| Period-over-period operational trends | `analyze_operational_trends` |
| Open-ticket history digests | `summarize_open_tickets` |
| Portfolio / attention / workload | `digest_open_portfolio`, `get_sla_risk`, `get_technician_workload` |
| Multi-API chaining | `batch_syncro_read`, `run_research_plan` |
| Durable Slack conversation memory | Cloudflare KV `SYNCRO_JR_MEMORY` |
| Conversation modes | Default **human** (colleague who already reviewed the data); `structured mode` for formal briefs; `lookup mode` for raw facts |

Default voice: plain-language takeaways — what it means and what to do next — not Syncro dumps or report templates.

## Cloudflare Worker (Slack)

Deployed at `https://syncron-jr.notifications-812.workers.dev`.

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
npx wrangler secret put LLM_MODEL
```

`GET /health` returns `{ "ok": true }`.

## BDK (local)

```bash
npm install
cp .env.example .env.local
npx bdk validate --dir .
npx bdk dev
```

## Configure

| Secret / env | Purpose |
| --- | --- |
| `SYNCRO_BASE_URL` | e.g. `https://your-subdomain.syncromsp.com` |
| `SYNCRO_API_KEY` | Syncro API token (read tickets/customers/assets) |
| `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` | Worker Slack HTTP |
| `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL` | Worker model (`openai` or `openrouter`) |
| `SYNCRO_MAX_PAGES` | Pagination budget (default 10, max 25). Truncation is reported in tool `coverage`. |
| `SLA_DUE_SOON_HOURS` | Due-soon window for attention ranking |
| `SLACK_ALLOWED_USER_IDS` | Optional allowlist |

## Data requirements and limitations

- **Read-only** Syncro access. No ticket updates, email, or remote actions.
- Historical analysis uses `GET /tickets?created_after=…` (all statuses). It does **not** claim full company history if `coverage.truncated` is true.
- **Labor** is summed only from `ticket_timers.active_duration` when present. Missing timers are **unknown**, never coerced to zero hours. Utilization cannot be claimed without scheduled/available hours (not available via current API usage).
- **Relationships** use text similarity plus shared customer / problem_type / asset signals. Keyword overlap alone cannot become a confirmed common cause.
- **Root-cause hypotheses** are kept separate from **confirmed resolutions** extracted from comments.
- Ticket comments are **untrusted** and cannot override system policy.
- Institutional knowledge records (`knowledgeRecord` on clusters) are durable-ready stubs for a future store; nothing is persisted beyond Slack conversation memory in this milestone.

## Example director prompt

> Analyze our last 90 days of tickets. Identify our five biggest recurring technical problems, show how much technician time they consume, identify likely root causes, and recommend what we should fix first.

Follow-ups supported via conversation memory: affected customers, tickets behind a finding, prior fix attempts, elimination effort, and time-savings ranking.

## Develop

```bash
npm test
npm run typecheck
npm run lint
```

## Future phase (persistent knowledge)

Normalized `knowledgeRecord` objects can be written to KV/D1 later without rewriting the investigation pipeline: store cluster title, source ticket IDs, confidence, root causes, resolutions, failed attempts, timestamps, and correctable flags. Hypotheses must not be promoted to confirmed knowledge without new evidence.
