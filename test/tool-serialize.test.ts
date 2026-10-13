import { describe, expect, it } from "vitest";

/**
 * Mirrors app.ts serializeToolResult compaction rules so large open-ticket
 * payloads keep a complete roster instead of a 2-ticket string preview.
 */
function serializeToolResult(result: unknown, max: number): string {
  const full = JSON.stringify(result);
  if (full.length <= max) return full;
  if (!result || typeof result !== "object") {
    return JSON.stringify({ truncated: true, preview: full.slice(0, Math.max(0, max - 80)) });
  }
  const record = result as Record<string, unknown>;
  const roster = Array.isArray(record.roster)
    ? record.roster
    : Array.isArray(record.tickets)
      ? record.tickets
      : null;
  if (!roster?.length) {
    return JSON.stringify({ truncated: true, preview: full.slice(0, Math.max(0, max - 80)) });
  }
  const compactRoster = roster.map((row) => {
    if (!row || typeof row !== "object") return row;
    const ticket = row as Record<string, unknown>;
    return {
      number: ticket.number ?? null,
      id: ticket.id ?? null,
      subject: typeof ticket.subject === "string" ? ticket.subject.slice(0, 120) : null,
      status: ticket.status ?? null,
      customerName: ticket.customerName ?? null,
      assigneeName: ticket.assigneeName ?? null,
      ageDays: ticket.ageDays ?? null,
      overdue: ticket.overdue ?? null,
      url: ticket.url ?? null,
    };
  });
  return JSON.stringify({
    truncatedForModel: true,
    openTicketCount: record.openTicketCount ?? compactRoster.length,
    rosterCount: compactRoster.length,
    roster: compactRoster,
    tickets: compactRoster,
  });
}

describe("serializeToolResult roster preservation", () => {
  it("keeps all 34 roster rows when the full payload exceeds the cap", () => {
    const roster = Array.from({ length: 34 }, (_, index) => ({
      number: 2000 + index,
      id: index + 1,
      subject: `Very long subject ${"x".repeat(200)} ${index}`,
      status: "In Progress",
      customerName: `Customer ${index}`,
      assigneeName: "Erin Tech",
      ageDays: index,
      overdue: index % 5 === 0,
      url: `https://example.test/tickets/${index + 1}`,
      whatHappened: "y".repeat(800),
    }));
    const payload = {
      mode: "open_ticket_history_digest",
      openTicketCount: 34,
      roster,
      tickets: roster,
      portfolio: { scanned: 34 },
      replyInstruction: "Cover every row",
    };
    expect(JSON.stringify(payload).length).toBeGreaterThan(20_000);
    const serialized = serializeToolResult(payload, 8_000);
    const parsed = JSON.parse(serialized) as {
      truncatedForModel?: boolean;
      roster: unknown[];
      openTicketCount: number;
    };
    expect(parsed.truncatedForModel).toBe(true);
    expect(parsed.openTicketCount).toBe(34);
    expect(parsed.roster).toHaveLength(34);
    expect(serialized).not.toMatch(/"preview":/);
  });
});
