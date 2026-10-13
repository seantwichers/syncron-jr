import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { batchSyncroRead, batchSyncroReadSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Run up to 8 allowlisted Syncro GET requests in one call and return digested samples. Use to string together invoices, appointments, customers, assets, etc.",
  execution: "server",
  effect: "read",
  inputSchema: batchSyncroReadSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await batchSyncroRead(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
