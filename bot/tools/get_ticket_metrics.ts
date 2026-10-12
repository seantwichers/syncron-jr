import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { getTicketMetrics, metricsSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Count open tickets and compute age, status mix, overdue totals, and problem types that appear more than once. Counts are calculated in code from GET /tickets?status=Not Closed.",
  execution: "server",
  effect: "read",
  inputSchema: metricsSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await getTicketMetrics(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
