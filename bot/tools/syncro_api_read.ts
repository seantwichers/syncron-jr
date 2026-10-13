import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { syncroApiRead, syncroApiReadSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Read-only GET against an allowlisted Syncro API path when no specialized tool fits. Path must start with /tickets, /customers, /customer_assets, /contacts, /invoices, /appointments, /users, /schedules, /products, /leads, /vendors, or /purchase_orders.",
  execution: "server",
  effect: "read",
  inputSchema: syncroApiReadSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await syncroApiRead(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
