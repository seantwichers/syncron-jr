import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { getSlaRisk, slaRiskSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Rank open tickets that need attention first. Use this for overdue tickets, SLA risk, and what to work on next. Ranking is calculated in code from sla flags, due_date, customer_reply, and assignment.",
  execution: "server",
  effect: "read",
  inputSchema: slaRiskSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await getSlaRisk(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
