import { defineTool } from "@cursor/bdk/tools";
import { z } from "zod";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { getTicketSettings } from "../lib/syncro.js";

export default defineTool({
  description: "Return Syncro ticket settings: status list, ticket types, appointment types, and technicians from GET /tickets/settings.",
  execution: "server",
  effect: "read",
  inputSchema: z.object({}),
  async execute() {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await getTicketSettings(syncro));
    } catch (error) {
      return toolError(error);
    }
  },
});
