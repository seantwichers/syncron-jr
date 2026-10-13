import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import {
  analyzeOperationalTrends,
  analyzeOperationalTrendsSchema,
} from "../lib/intelligence.js";

export default defineTool({
  description:
    "Compare operational metrics for a recent period versus the preceding baseline (ticket volume, resolutions, backlog, reopens, recorded labor, SLA flags). Reports coverage and never treats missing timers as zero labor.",
  execution: "server",
  effect: "read",
  inputSchema: analyzeOperationalTrendsSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await analyzeOperationalTrends(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
