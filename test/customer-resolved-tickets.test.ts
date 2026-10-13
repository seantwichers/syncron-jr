import { describe, expect, it } from "vitest";
import { parseCustomerResolvedTicketsRequest } from "../bot/lib/customer-ticket-query.js";
import {
  SyncroClient,
  canonicalizeTicketStatus,
  customerMatchScore,
  searchTickets,
  type CustomerSummary,
} from "../bot/lib/syncro.js";

const RUNTIME = { now: new Date("2026-10-10T12:00:00.000Z"), dueSoonHours: 24 };
const ORIGIN = "https://demo.syncromsp.com";

function mockSyncro(handlers: Record<string, (url: URL) => unknown>): SyncroClient {
  return new SyncroClient({
    apiBase: `${ORIGIN}/api/v1`,
    webOrigin: ORIGIN,
    apiKey: "test-key",
    maxPages: 2,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "") || "/";
      const handler = handlers[path];
      if (!handler) throw new Error(`Unexpected path ${path}`);
      return new Response(JSON.stringify(handler(url)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}

describe("canonicalizeTicketStatus", () => {
  it("maps Closed/complete aliases to Resolved", () => {
    expect(canonicalizeTicketStatus("Closed")).toBe("Resolved");
    expect(canonicalizeTicketStatus("closed")).toBe("Resolved");
    expect(canonicalizeTicketStatus("complete")).toBe("Resolved");
    expect(canonicalizeTicketStatus("Resolved")).toBe("Resolved");
    expect(canonicalizeTicketStatus("Not Closed")).toBe("Not Closed");
    expect(canonicalizeTicketStatus("In Progress")).toBe("In Progress");
  });
});

describe("customerMatchScore", () => {
  const aspen = {
    id: 1,
    name: "Aspen Auto Clinic - Jet Stream (HQ)",
    email: null,
    phone: null,
    city: null,
    state: null,
    disabled: null,
    url: "https://example.test/customers/1",
  } satisfies CustomerSummary;
  const emily = {
    id: 2,
    name: "Emily Pontius",
    email: null,
    phone: null,
    city: null,
    state: null,
    disabled: null,
    url: "https://example.test/customers/2",
  } satisfies CustomerSummary;

  it("prefers business-name hits over incidental contact matches", () => {
    expect(customerMatchScore(aspen, "aspen")).toBeGreaterThan(customerMatchScore(emily, "aspen"));
    expect(customerMatchScore(aspen, "aspen")).toBeGreaterThanOrEqual(80);
    expect(customerMatchScore(emily, "aspen")).toBeLessThan(80);
  });
});

describe("parseCustomerResolvedTicketsRequest", () => {
  it("parses Aspen resolved-ticket phrasing", () => {
    expect(parseCustomerResolvedTicketsRequest("Tell me about aspens resolved tickets")).toEqual({
      customer: "aspen",
      status: "Resolved",
    });
    expect(parseCustomerResolvedTicketsRequest("Show Aspen's closed tickets")).toEqual({
      customer: "Aspen",
      status: "Resolved",
    });
    expect(parseCustomerResolvedTicketsRequest("resolved tickets for Aspen Auto")).toEqual({
      customer: "Aspen Auto",
      status: "Resolved",
    });
  });
});

describe("searchTickets resolved customer groups", () => {
  it("searches across multi-location customers instead of returning an empty ticket list", async () => {
    const syncro = mockSyncro({
      "/customers": () => ({
        customers: [
          { id: 10, business_name: "Emily Pontius", firstname: "Emily", lastname: "Pontius" },
          { id: 11, business_name: "Aspen Auto Clinic - Beacon" },
          { id: 12, business_name: "Aspen Auto Clinic - Jet Stream (HQ)" },
        ],
        meta: { total_pages: 1, total_entries: 3 },
      }),
      "/tickets": (url) => {
        expect(url.searchParams.get("status")).toBe("Resolved");
        expect((url.searchParams.get("query") ?? "").toLowerCase()).toContain("aspen");
        expect(url.searchParams.get("customer_id")).toBeNull();
        return {
          tickets: [
            {
              id: 1,
              number: 30001,
              subject: "Printer",
              status: "Resolved",
              created_at: "2026-09-01T12:00:00.000Z",
              updated_at: "2026-09-02T12:00:00.000Z",
              customer_business_then_name: "Aspen Auto Clinic - Beacon",
              customer_id: 11,
            },
            {
              id: 2,
              number: 30002,
              subject: "Wifi",
              status: "Resolved",
              created_at: "2026-09-03T12:00:00.000Z",
              updated_at: "2026-09-04T12:00:00.000Z",
              customer_business_then_name: "Aspen Auto Clinic - Jet Stream (HQ)",
              customer_id: 12,
            },
          ],
          meta: { total_pages: 1, total_entries: 900, per_page: 50 },
        };
      },
    });

    const result = (await searchTickets(
      syncro,
      { customer: "aspen", status: "Closed", include_closed: true, limit: 40 },
      RUNTIME,
    )) as {
      returned: number;
      totalAvailable: number | null;
      statusApplied: string | null;
      matchedCustomers: Array<{ name: string }>;
      tickets: unknown[];
      note: string;
    };

    expect(result.statusApplied).toBe("Resolved");
    expect(result.totalAvailable).toBe(900);
    expect(result.returned).toBe(2);
    expect(result.tickets).toHaveLength(2);
    expect(result.matchedCustomers.every((row) => /aspen/i.test(row.name))).toBe(true);
    expect(result.note).toMatch(/900|Showing/i);
  });
});
