import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { searchCustomers, searchCustomersSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Search Syncro customers by name or id. Email, phone, and street address are not returned.",
  execution: "server",
  effect: "read",
  inputSchema: searchCustomersSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await searchCustomers(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
