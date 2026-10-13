/**
 * Deterministic open-ticket rundown helpers.
 * Used when the user asks for all open tickets so the reply cannot be
 * silently truncated by the model to a couple of examples.
 */

export const WORKER_BUILD = "resolved-tickets-v3";

export function isOpenTicketRundownRequest(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return (
    /\b(?:brief\s+)?rundown\b.*\bopen\s+tickets?\b/i.test(normalized) ||
    /\b(?:all|every)\s+open\s+tickets?\b/i.test(normalized) ||
    /\b(?:list|summary|summarize|digest)\b.*\b(?:all\s+)?open\s+tickets?\b/i.test(normalized) ||
    /\bopen\s+tickets?\b.*\b(?:rundown|list|summary|summarize|all)\b/i.test(normalized)
  );
}

export function wantsOpenTicketHistory(text: string): boolean {
  return /\b(what happened|full history|comment history|history digest|everything that happened|digest each)\b/i.test(
    text,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rosterFromToolResult(result: unknown): Record<string, unknown>[] | null {
  const record = asRecord(result);
  if (!record) return null;
  const mode = typeof record.mode === "string" ? record.mode : "";
  const isRundown =
    mode === "open_ticket_brief_rundown" ||
    mode === "open_ticket_history_digest" ||
    Array.isArray(record.roster);
  if (!isRundown) return null;
  const rows = Array.isArray(record.roster)
    ? record.roster
    : Array.isArray(record.tickets)
      ? record.tickets
      : null;
  if (!rows?.length) return null;
  return rows.filter((row): row is Record<string, unknown> => Boolean(asRecord(row)));
}

export function findOpenTicketRundownResult(toolResults: unknown[]): Record<string, unknown> | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = asRecord(toolResults[index]);
    if (!result) continue;
    if (rosterFromToolResult(result)) return result;
  }
  return null;
}

function formatRosterBullet(row: Record<string, unknown>): string {
  const number = typeof row.number === "number" ? `#${row.number}` : typeof row.id === "number" ? `id ${row.id}` : "ticket";
  const customer = typeof row.customerName === "string" && row.customerName ? row.customerName : "Unknown customer";
  const status = typeof row.status === "string" && row.status ? row.status : "Unknown";
  const assignee = typeof row.assigneeName === "string" && row.assigneeName ? row.assigneeName : "Unassigned";
  const subject = typeof row.subject === "string" && row.subject ? row.subject : "(no subject)";
  const age = typeof row.ageDays === "number" ? `${row.ageDays}d` : null;
  const overdue = row.overdue === true
    ? (typeof row.overdueHours === "number" ? `overdue ${row.overdueHours}h` : "overdue")
    : null;
  const cues = [age, overdue].filter(Boolean).join(", ");
  const url = typeof row.url === "string" && row.url.includes("/tickets/") ? row.url : null;
  const label = url ? `<${url}|${number}>` : number;
  const what = typeof row.whatHappened === "string" && row.whatHappened.trim()
    ? ` — ${row.whatHappened.trim().replace(/\s+/g, " ").slice(0, 160)}`
    : "";
  return `• ${label} · ${customer} · ${status} · ${assignee}${cues ? ` · ${cues}` : ""} — ${subject}${what}`;
}

/** Host-authored Slack text covering every roster row. */
export function formatOpenTicketRundown(result: unknown): string | null {
  const record = asRecord(result);
  if (!record) return null;
  const roster = rosterFromToolResult(record);
  if (!roster?.length) return null;

  const openCount = typeof record.openTicketCount === "number" ? record.openTicketCount : roster.length;
  const portfolio = asRecord(record.portfolio);
  const counts = asRecord(portfolio?.counts);
  const overdue = typeof counts?.overdue === "number"
    ? counts.overdue
    : typeof portfolio?.overdue === "number"
      ? portfolio.overdue
      : null;
  const scanned = typeof portfolio?.scanned === "number" ? portfolio.scanned : openCount;
  const omitted = typeof record.omitted === "number" ? record.omitted : Math.max(0, openCount - roster.length);
  const includeHistory = record.includeHistory === true || record.mode === "open_ticket_history_digest";

  const lines = [
    `*Bottom line:* ${openCount} open ticket${openCount === 1 ? "" : "s"}` +
      (overdue != null ? ` · ${overdue} overdue` : "") +
      `.`,
    `*Coverage:* showing ${roster.length} of ${scanned} scanned` +
      (omitted > 0 ? ` (${omitted} omitted by max_tickets)` : "") +
      (includeHistory ? " with history notes" : " (brief rundown)") +
      ".",
    "",
    `*All open tickets (${roster.length}):*`,
    ...roster.map(formatRosterBullet),
  ];
  return lines.join("\n");
}

/** If the model reply under-covers the roster, replace with the host rundown. */
export function ensureCompleteOpenTicketRundown(
  reply: string,
  toolResults: unknown[],
  userText: string,
): string {
  const result = findOpenTicketRundownResult(toolResults);
  const wantsRundown = isOpenTicketRundownRequest(userText);
  if (!result && !wantsRundown) return reply;

  const formatted = result ? formatOpenTicketRundown(result) : null;
  if (!formatted) return reply;

  const roster = rosterFromToolResult(result)!;
  const ticketMentions = reply.match(/#\d{3,}|\bid\s+\d+/gi)?.length ?? 0;
  if (ticketMentions >= roster.length) return reply;
  // Model under-covered the queue (common failure: 2 of 34). Prefer host roster.
  return formatted;
}
