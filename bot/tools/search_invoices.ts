import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { searchInvoices, searchInvoicesSchema } from "../lib/syncro.js";

export default defineTool({
  description: "Search Syncro invoices by customer, status, or created date. Returns a sample page with balance summary.",
  execution: "server",
  effect: "read",
  inputSchema: searchInvoicesSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await searchInvoices(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
