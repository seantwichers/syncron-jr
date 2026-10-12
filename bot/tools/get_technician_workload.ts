import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { getTechnicianWorkload, metricsSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Group open tickets by assignee and compare queue sizes. The imbalance note is a count comparison, not a measure of effort.",
  execution: "server",
  effect: "read",
  inputSchema: metricsSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await getTechnicianWorkload(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
