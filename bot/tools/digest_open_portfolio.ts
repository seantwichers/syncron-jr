import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { digestOpenPortfolio, digestOpenPortfolioSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Deep-scan open tickets across many Syncro pages and return a code-computed big-picture digest: metrics, top customers, technician load, and attention queue.",
  execution: "server",
  effect: "read",
  inputSchema: digestOpenPortfolioSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await digestOpenPortfolio(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
