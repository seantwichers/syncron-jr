import { describe, expect, it } from "vitest";
import {
  ensureCompleteOpenTicketRundown,
  formatOpenTicketRundown,
  isOpenTicketRundownRequest,
  wantsOpenTicketHistory,
} from "../bot/lib/open-ticket-rundown.js";

describe("isOpenTicketRundownRequest", () => {
  it("matches brief rundown phrasing", () => {
    expect(isOpenTicketRundownRequest("Give me a brief rundown of all open tickets")).toBe(true);
    expect(isOpenTicketRundownRequest("summary of all open tickets")).toBe(true);
    expect(isOpenTicketRundownRequest("list every open ticket")).toBe(true);
  });

  it("ignores unrelated questions", () => {
    expect(isOpenTicketRundownRequest("Who has the heaviest open queue?")).toBe(false);
    expect(isOpenTicketRundownRequest("What should we fix first?")).toBe(false);
  });
});

describe("formatOpenTicketRundown", () => {
  it("emits one bullet per roster row", () => {
    const roster = Array.from({ length: 34 }, (_, index) => ({
      number: 3000 + index,
      id: index + 1,
      subject: `Subject ${index + 1}`,
      status: "In Progress",
      customerName: `Customer ${index + 1}`,
      assigneeName: "Erin Tech",
      ageDays: index,
      overdue: false,
      url: `https://example.test/tickets/${index + 1}`,
    }));
    const text = formatOpenTicketRundown({
      mode: "open_ticket_brief_rundown",
      openTicketCount: 34,
      omitted: 0,
      includeHistory: false,
      portfolio: { scanned: 34, counts: { overdue: 4 } },
      roster,
      tickets: roster,
    });
    expect(text).toMatch(/I went through the open queue/i);
    expect(text).toMatch(/\*34\*/);
    expect((text?.match(/^• /gm) ?? []).length).toBe(34);
  });
});

describe("ensureCompleteOpenTicketRundown", () => {
  it("replaces an under-covered model reply with the full roster", () => {
    const roster = Array.from({ length: 34 }, (_, index) => ({
      number: 4000 + index,
      id: index + 1,
      subject: `Issue ${index + 1}`,
      status: "New",
      customerName: `Cust ${index + 1}`,
      assigneeName: "Alex",
      ageDays: 1,
      overdue: false,
      url: `https://example.test/tickets/${index + 1}`,
    }));
    const toolResult = {
      mode: "open_ticket_brief_rundown",
      openTicketCount: 34,
      roster,
      tickets: roster,
      portfolio: { scanned: 34, counts: { overdue: 0 } },
    };
    const weakReply = "Here are the top issues:\n• #4000 Cust 1\n• #4001 Cust 2";
    const fixed = ensureCompleteOpenTicketRundown(
      weakReply,
      [toolResult],
      "Give me a brief rundown of all open tickets",
    );
    expect(fixed).not.toBe(weakReply);
    expect((fixed.match(/^• /gm) ?? []).length).toBe(34);
    expect(wantsOpenTicketHistory("brief rundown of all open tickets")).toBe(false);
    expect(wantsOpenTicketHistory("what happened on each open ticket")).toBe(true);
  });
});
