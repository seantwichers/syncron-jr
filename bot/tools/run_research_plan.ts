import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { runResearchPlan, runResearchPlanSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Execute a multi-step Syncro research plan in one tool call. Chain portfolio digests, metrics, ticket/customer/asset/invoice lookups, and batch API reads for complex big-picture investigations.",
  execution: "server",
  effect: "read",
  inputSchema: runResearchPlanSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await runResearchPlan(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
