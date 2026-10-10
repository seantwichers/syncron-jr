import { describe, expect, it } from "vitest";
import {
  SyncroClient,
  compareAttention,
  getSlaRisk,
  getTicketDetails,
  loadSyncroConfig,
  type TicketSummary,
} from "../app.ts";

const live = process.env.SYNCRO_LIVE === "1" && process.env.SYNCRO_BASE_URL && process.env.SYNCRO_API_KEY;

describe.skipIf(!live)("live Syncro read", () => {
  it("reads open tickets, ranks them, and loads the oldest ticket", async () => {
    const config = loadSyncroConfig(process.env);
    const syncro = new SyncroClient({
      apiBase: config.syncroApiBase,
      webOrigin: config.syncroWebOrigin,
      apiKey: config.syncroApiKey,
      timeoutMs: config.timeoutMs,
      maxPages: config.maxPages,
    });
    const now = new Date();
    const runtime = { now, dueSoonHours: config.dueSoonHours };
    const risk = await getSlaRisk(syncro, { limit: 10 }, runtime);
    const summary = risk as {
      scanned: number;
      needsAttention: TicketSummary[];
      oldest: TicketSummary | null;
      provenance: { truncated: boolean };
    };
    expect(summary.scanned).toBeGreaterThan(0);
    expect(summary.provenance.truncated).toBe(false);
    for (let index = 1; index < summary.needsAttention.length; index += 1) {
      const previous = summary.needsAttention[index - 1];
      const current = summary.needsAttention[index];
      if (!previous || !current) throw new Error("missing ranked ticket");
      expect(compareAttention(previous, current)).toBeLessThanOrEqual(0);
    }
    for (const ticket of summary.needsAttention) {
      expect(ticket.url).toContain(`${config.syncroWebOrigin}/tickets/`);
      if (ticket.overdue && ticket.dueDate) {
        expect(new Date(ticket.dueDate).getTime()).toBeLessThan(now.getTime());
      }
      expect(JSON.stringify(ticket)).not.toContain(config.syncroApiKey);
    }
    expect(summary.oldest).toBeTruthy();
    const oldest = summary.oldest;
    if (!oldest) throw new Error("oldest ticket missing");
    const detail = await getTicketDetails(syncro, { ticket_id: oldest.id }, runtime);
    expect(detail).toMatchObject({
      untrusted: true,
      ticket: { id: oldest.id },
    });
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain(config.syncroApiKey);
    expect(serialized).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });
});
