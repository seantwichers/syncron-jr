/**
 * Deterministic open-ticket reply helpers for human-mode Slack answers.
 */

export const WORKER_BUILD = "human-brief-v5";

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

/** Situation / pulse questions — want judgment, not a full inventory. */
export function isOpenTicketSituationRequest(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || isOpenTicketRundownRequest(normalized)) return false;
  return (
    /\bwhat'?s\s+up\s+with\s+(?:the\s+)?open\s+tickets?\b/i.test(normalized) ||
    /\bhow(?:'?s| is| are)\s+(?:the\s+)?(?:open\s+)?(?:queue|tickets?)\b/i.test(normalized) ||
    /\b(?:status|pulse|overview|sitrep)\s+(?:of\s+|on\s+)?(?:the\s+)?open\s+tickets?\b/i.test(normalized) ||
    /\bopen\s+tickets?\b.*\b(?:looking|doing|stand|situation|status)\b/i.test(normalized) ||
    /\b(?:give me|got)\s+a\s+(?:quick\s+)?(?:read|pulse|take)\s+on\s+(?:the\s+)?open\s+tickets?\b/i.test(normalized)
  );
}

/** “Which are easy / quick wins / actionable” follow-ups. */
export function isEasyActionableRequest(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return (
    /\b(?:actionable|easy\s+to\s+(?:address|fix|close|knock\s+out)|quick\s+wins?|low[- ]hanging|easy\s+wins?)\b/i.test(
      normalized,
    ) ||
    /\bwhich\s+(?:ones?|tickets?)\s+(?:are|look)\s+(?:easy|simple|quick|actionable)\b/i.test(normalized)
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

function ticketLabel(row: Record<string, unknown>): string {
  const number = typeof row.number === "number" ? `#${row.number}` : typeof row.id === "number" ? `id ${row.id}` : "ticket";
  const url = typeof row.url === "string" && row.url.includes("/tickets/") ? row.url : null;
  return url ? `<${url}|${number}>` : number;
}

function formatRosterBullet(row: Record<string, unknown>): string {
  const customer = typeof row.customerName === "string" && row.customerName ? row.customerName : "Unknown customer";
  const status = typeof row.status === "string" && row.status ? row.status : "Unknown";
  const assignee = typeof row.assigneeName === "string" && row.assigneeName ? row.assigneeName : "Unassigned";
  const subject = typeof row.subject === "string" && row.subject ? row.subject : "(no subject)";
  const age = typeof row.ageDays === "number" ? `${Math.round(row.ageDays * 10) / 10}d` : null;
  const overdue = row.overdue === true
    ? (typeof row.overdueHours === "number" ? `overdue ${Math.round(row.overdueHours)}h` : "overdue")
    : null;
  const cues = [age, overdue].filter(Boolean).join(", ");
  return `• ${ticketLabel(row)} · ${customer} · ${status} · ${assignee}${cues ? ` · ${cues}` : ""} — ${subject}`;
}

function portfolioCounts(result: unknown): { open: number; overdue: number | null; customerReply: number | null; unassigned: number | null } {
  const record = asRecord(result);
  const roster = record ? rosterFromToolResult(record) : null;
  const portfolio = asRecord(record?.portfolio);
  const counts = asRecord(portfolio?.counts);
  const open = typeof record?.openTicketCount === "number"
    ? record.openTicketCount
    : roster?.length ?? 0;
  const overdue = typeof counts?.overdue === "number"
    ? counts.overdue
    : roster
      ? roster.filter((row) => row.overdue === true).length
      : null;
  const customerReply = typeof counts?.customerReply === "number"
    ? counts.customerReply
    : roster
      ? roster.filter((row) => row.customerReply === true || /customer reply/i.test(String(row.status ?? ""))).length
      : null;
  const unassigned = typeof counts?.unassigned === "number"
    ? counts.unassigned
    : roster
      ? roster.filter((row) => !row.assigneeName).length
      : null;
  return { open, overdue, customerReply, unassigned };
}

function topAttentionRows(roster: Record<string, unknown>[], limit = 3): Record<string, unknown>[] {
  return [...roster]
    .sort((left, right) => {
      const leftOver = left.overdue === true ? 1 : 0;
      const rightOver = right.overdue === true ? 1 : 0;
      if (rightOver !== leftOver) return rightOver - leftOver;
      const leftAge = typeof left.ageDays === "number" ? left.ageDays : 0;
      const rightAge = typeof right.ageDays === "number" ? right.ageDays : 0;
      return rightAge - leftAge;
    })
    .slice(0, limit);
}

/** Short human pulse — never a full inventory. */
export function formatOpenTicketSituationBrief(result: unknown): string | null {
  const record = asRecord(result);
  const roster = record ? rosterFromToolResult(record) : null;
  if (!record || !roster?.length) return null;
  const { open, overdue, customerReply } = portfolioCounts(record);
  const hot = topAttentionRows(roster, 3);
  const overdueBit = overdue != null ? `*${overdue}* overdue` : "a chunk overdue";
  const replyBit = customerReply != null && customerReply > 0
    ? ` About *${customerReply}* are sitting on customer reply / waiting on the customer.`
    : "";

  const hotLines = hot.map((row) => {
    const subject = typeof row.subject === "string" ? row.subject : "open item";
    const customer = typeof row.customerName === "string" ? row.customerName : "a customer";
    const age = typeof row.ageDays === "number" ? `${Math.round(row.ageDays)}d` : "a while";
    return `• ${ticketLabel(row)} — ${customer}: ${subject} (${age})`;
  });

  return [
    `I looked through the open queue — *${open}* open, ${overdueBit}.${replyBit}`,
    "",
    "What stands out:",
    ...hotLines,
    "",
    "If I were running the board today, I’d clear the short/simple New and In Progress items first, then chase the oldest customer-blocked ones so they stop aging. Want the full list, or just the easy wins?",
  ].join("\n");
}

const BLOCKED_STATUSES = /waiting on customer|on-hold|on hold|scheduled|project/i;
const EASY_SUBJECT = /\b(headset|ctrl\+?p|print|printer|password|email group|new user|call rating|did|phone|monitor|mouse|keyboard|wifi|vpn|mfa|sharepoint access|calendar)\b/i;

/** Score higher = easier for the MSP to knock out without waiting on the customer. */
export function easyActionableScore(row: Record<string, unknown>): number {
  const status = String(row.status ?? "");
  const subject = String(row.subject ?? "");
  const age = typeof row.ageDays === "number" ? row.ageDays : 99;
  let score = 0;

  if (BLOCKED_STATUSES.test(status)) score -= 50;
  if (/^new$/i.test(status)) score += 40;
  if (/in progress/i.test(status)) score += 30;
  if (/customer reply/i.test(status)) score += 5; // needs a nudge, not a true easy fix
  if (/waiting on a7/i.test(status)) score += 25; // ball in our court

  if (age <= 1) score += 35;
  else if (age <= 3) score += 25;
  else if (age <= 7) score += 10;
  else if (age > 30) score -= 25;

  if (EASY_SUBJECT.test(subject)) score += 25;
  if (/ai driven|integration|migration|camera|switch port|stp|website and phone cleanup|phone tree/i.test(subject)) {
    score -= 20;
  }
  // Notification / junk subjects that look "New" but aren't real work.
  if (/jotform|signed successfully|was signed|kyc|your loa/i.test(subject)) score -= 80;
  if (row.overdue === true && age > 14) score -= 10;
  return score;
}

function isNotificationNoise(row: Record<string, unknown>): boolean {
  const subject = String(row.subject ?? "");
  const customer = String(row.customerName ?? "");
  return /jotform|signed successfully|was signed|kyc|your loa/i.test(subject)
    || /^jotform/i.test(customer);
}

export function pickEasyActionableTickets(
  roster: Record<string, unknown>[],
  limit = 5,
): Record<string, unknown>[] {
  return [...roster]
    .filter((row) => !isNotificationNoise(row))
    .map((row) => ({ row, score: easyActionableScore(row) }))
    .filter((item) => item.score >= 25)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.row);
}

export function formatEasyActionableBrief(result: unknown): string | null {
  const record = asRecord(result);
  const roster = record ? rosterFromToolResult(record) : null;
  if (!roster?.length) return null;
  const picks = pickEasyActionableTickets(roster, 5);
  if (!picks.length) {
    return "I looked for quick wins in the open queue — nothing looks truly easy right now. Most of what’s open is either customer-blocked, on hold, or a bigger project. Want me to list the oldest overdue instead?";
  }

  const lines = picks.map((row) => {
    const customer = typeof row.customerName === "string" ? row.customerName : "customer";
    const status = typeof row.status === "string" ? row.status : "open";
    const subject = typeof row.subject === "string" ? row.subject : "item";
    const age = typeof row.ageDays === "number" ? `${Math.round(row.ageDays * 10) / 10}d old` : "recent";
    const why = /^new$/i.test(status)
      ? "new / hasn’t been touched much"
      : /in progress/i.test(status)
        ? "already in motion"
        : /waiting on a7/i.test(status)
          ? "ball is in our court"
          : EASY_SUBJECT.test(subject)
            ? "looks like a contained request"
            : "young enough to knock out";
    return `• ${ticketLabel(row)} · ${customer} — ${subject} (${status}, ${age}; ${why})`;
  });

  return [
    "If you want stuff we can actually move today without waiting on a customer, I’d start here:",
    "",
    ...lines,
    "",
    "I skipped the long Waiting-on-Customer / On-Hold items — those aren’t “easy,” they’re blocked. Say the word if you want a chase list for those instead.",
  ].join("\n");
}

/** Host-authored Slack text covering every roster row. */
export function formatOpenTicketRundown(result: unknown): string | null {
  const record = asRecord(result);
  if (!record) return null;
  const roster = rosterFromToolResult(record);
  if (!roster?.length) return null;

  const openCount = typeof record.openTicketCount === "number" ? record.openTicketCount : roster.length;
  const { overdue } = portfolioCounts(record);
  const portfolio = asRecord(record.portfolio);
  const scanned = typeof portfolio?.scanned === "number" ? portfolio.scanned : openCount;
  const omitted = typeof record.omitted === "number" ? record.omitted : Math.max(0, openCount - roster.length);

  const takeaway =
    overdue != null && overdue > 0
      ? `I went through the open queue — *${openCount}* open, and *${overdue}* of those are overdue. Here’s the full list.`
      : `I went through the open queue — *${openCount}* open ticket${openCount === 1 ? "" : "s"}. Here’s the full list.`;
  const coverage = omitted > 0 ? `_Showing ${roster.length} of ${scanned} (hit the max_tickets cap)._` : null;

  return [takeaway, coverage, "", ...roster.map(formatRosterBullet)]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Only force a full roster when the user explicitly asked for all/list/rundown.
 * Situation questions must stay short even if summarize_open_tickets was used.
 */
export function ensureCompleteOpenTicketRundown(
  reply: string,
  toolResults: unknown[],
  userText: string,
): string {
  if (!isOpenTicketRundownRequest(userText)) return reply;
  const result = findOpenTicketRundownResult(toolResults);
  const formatted = result ? formatOpenTicketRundown(result) : null;
  if (!formatted || !result) return reply;

  const roster = rosterFromToolResult(result);
  if (!roster?.length) return reply;
  const ticketMentions = reply.match(/#\d{3,}|\bid\s+\d+/gi)?.length ?? 0;
  if (ticketMentions >= roster.length) return reply;
  return formatted;
}
