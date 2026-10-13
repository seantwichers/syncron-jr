import { describe, expect, it } from "vitest";
import {
  easyActionableScore,
  ensureCompleteOpenTicketRundown,
  formatEasyActionableBrief,
  formatOpenTicketRundown,
  formatOpenTicketSituationBrief,
  isEasyActionableRequest,
  isOpenTicketRundownRequest,
  isOpenTicketSituationRequest,
  pickEasyActionableTickets,
  wantsOpenTicketHistory,
} from "../bot/lib/open-ticket-rundown.js";

function rosterRow(overrides: Record<string, unknown> = {}) {
  return {
    number: 3000,
    id: 1,
    subject: "Subject",
    status: "In Progress",
    customerName: "Customer",
    assigneeName: "Erin Tech",
    ageDays: 2,
    overdue: false,
    url: "https://example.test/tickets/1",
    ...overrides,
  };
}

describe("request detectors", () => {
  it("treats situation asks differently from full rundowns", () => {
    expect(isOpenTicketSituationRequest("whats up with open tickets")).toBe(true);
    expect(isOpenTicketRundownRequest("whats up with open tickets")).toBe(false);
    expect(isOpenTicketRundownRequest("how about all open tickets")).toBe(true);
    expect(isOpenTicketSituationRequest("how about all open tickets")).toBe(false);
    expect(isEasyActionableRequest("which are actionable and easy to address")).toBe(true);
  });
});

describe("formatOpenTicketSituationBrief", () => {
  it("stays short and never lists every ticket", () => {
    const roster = Array.from({ length: 35 }, (_, index) =>
      rosterRow({
        number: 3000 + index,
        id: index + 1,
        subject: `Issue ${index + 1}`,
        customerName: `Customer ${index + 1}`,
        ageDays: 100 - index,
        overdue: index < 24,
        url: `https://example.test/tickets/${index + 1}`,
      }),
    );
    const text = formatOpenTicketSituationBrief({
      mode: "open_ticket_brief_rundown",
      openTicketCount: 35,
      roster,
      tickets: roster,
      portfolio: { scanned: 35, counts: { overdue: 24, customerReply: 12 } },
    });
    expect(text).toMatch(/I looked through the open queue/i);
    expect(text).toMatch(/\*35\*/);
    expect(text).toMatch(/Want the full list/);
    expect((text?.match(/#\d+/g) ?? []).length).toBeLessThanOrEqual(5);
    expect((text?.match(/^• /gm) ?? []).length).toBeLessThanOrEqual(5);
  });
});

describe("easy actionable picks", () => {
  it("prefers new/young work over customer-blocked tickets", () => {
    const blocked = rosterRow({
      number: 29413,
      status: "Waiting on Customer",
      ageDays: 69,
      overdue: true,
      subject: "New Location Gibraltar",
    });
    const easy = rosterRow({
      number: 30191,
      status: "New",
      ageDays: 1.1,
      overdue: false,
      subject: "Ctrl+p not working",
      customerName: "The Shed Yard",
    });
    const noise = rosterRow({
      number: 30189,
      status: "New",
      ageDays: 1.1,
      overdue: false,
      subject: "Your LOA, KYC, IT Recommendation, Phone Bill was signed successfully!",
      customerName: "Jotform Sign",
    });
    expect(easyActionableScore(easy)).toBeGreaterThan(easyActionableScore(blocked));
    expect(easyActionableScore(easy)).toBeGreaterThan(easyActionableScore(noise));
    const picks = pickEasyActionableTickets([blocked, easy, noise], 5);
    expect(picks.map((row) => row.number)).toEqual([30191]);

    const brief = formatEasyActionableBrief({
      mode: "open_ticket_brief_rundown",
      openTicketCount: 3,
      roster: [blocked, easy, noise],
      tickets: [blocked, easy, noise],
    });
    expect(brief).toMatch(/Ctrl\+p/i);
    expect(brief).not.toMatch(/New Location Gibraltar/);
    expect(brief).not.toMatch(/signed successfully/i);
    expect(brief).toMatch(/Skipped the long Waiting-on-Customer/i);
  });
});

describe("formatOpenTicketRundown", () => {
  it("emits one bullet per roster row for explicit full-list asks", () => {
    const roster = Array.from({ length: 34 }, (_, index) =>
      rosterRow({
        number: 3000 + index,
        id: index + 1,
        subject: `Subject ${index + 1}`,
        customerName: `Customer ${index + 1}`,
        ageDays: index,
        url: `https://example.test/tickets/${index + 1}`,
      }),
    );
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
  it("does not force a full inventory on situation questions", () => {
    const roster = Array.from({ length: 34 }, (_, index) =>
      rosterRow({ number: 4000 + index, id: index + 1, url: `https://example.test/tickets/${index + 1}` }),
    );
    const toolResult = {
      mode: "open_ticket_brief_rundown",
      openTicketCount: 34,
      roster,
      tickets: roster,
      portfolio: { scanned: 34, counts: { overdue: 0 } },
    };
    const short = "Queue looks heavy — 34 open, mostly aging customer replies.";
    expect(
      ensureCompleteOpenTicketRundown(short, [toolResult], "whats up with open tickets"),
    ).toBe(short);
  });

  it("replaces an under-covered model reply when user asked for all tickets", () => {
    const roster = Array.from({ length: 34 }, (_, index) =>
      rosterRow({
        number: 4000 + index,
        id: index + 1,
        subject: `Issue ${index + 1}`,
        customerName: `Cust ${index + 1}`,
        url: `https://example.test/tickets/${index + 1}`,
      }),
    );
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
  });
});
