import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { assetDetailsSchema, getAssetDetails } from "../lib/syncro.js";

export default defineTool({
  description: "Retrieve one customer asset record by id, including custom properties when present.",
  execution: "server",
  effect: "read",
  inputSchema: assetDetailsSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await getAssetDetails(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
