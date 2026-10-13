import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { searchTickets, searchTicketsSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Search Syncro tickets. Defaults to open tickets (status=Not Closed). Returns up to 100 tickets (default 50). For a full history digest of every open ticket, prefer summarize_open_tickets.",
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
