import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { listContacts, listContactsSchema } from "../lib/syncro.js";

export default defineTool({
  description: "List Syncro contacts, optionally filtered by customer_id or query.",
  execution: "server",
  effect: "read",
  inputSchema: listContactsSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await listContacts(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
