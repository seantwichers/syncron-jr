import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { searchTickets, searchTicketsSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Search Syncro tickets. Defaults to open (Not Closed). For resolved/closed history use status=Resolved (Closed maps to Resolved). Multi-location customers (e.g. Aspen) search across the group and return totalAvailable.",
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
