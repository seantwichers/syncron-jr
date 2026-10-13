import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { searchAssets, searchAssetsSchema } from "../lib/syncro.js";

export default defineTool({
  description: "Search customer assets (endpoints/devices) in Syncro by customer_id and/or query.",
  execution: "server",
  effect: "read",
  inputSchema: searchAssetsSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await searchAssets(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
