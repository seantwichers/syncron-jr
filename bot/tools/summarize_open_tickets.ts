import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { summarizeOpenTickets, summarizeOpenTicketsSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Rundown of ALL open tickets. Default brief one-liner per ticket for the full open queue (max 100). Set include_history=true only when the user wants comment-history digests. Never substitute a top-N attention list.",
  execution: "server",
  effect: "read",
  inputSchema: summarizeOpenTicketsSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await summarizeOpenTickets(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
