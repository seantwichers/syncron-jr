import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { searchTickets, searchTicketsSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Search Syncro tickets. Defaults to open tickets with the documented status filter Not Closed. Priority, overdue, age, unassigned, and customer_reply filters are applied locally because the list endpoint does not document them. Results include an attention order calculated in code.",
  execution: "server",
  effect: "read",
  inputSchema: searchTicketsSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await searchTickets(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
