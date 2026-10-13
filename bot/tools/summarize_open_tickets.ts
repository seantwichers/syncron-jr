import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { summarizeOpenTickets, summarizeOpenTicketsSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Summarize all open tickets with full comment-history digests (what happened on each). Use for 'summary of all open tickets'. Returns many tickets (default 50, max 100), not a top-10 list.",
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
