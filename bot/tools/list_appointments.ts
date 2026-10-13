import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { listAppointments, listAppointmentsSchema } from "../lib/syncro.js";

export default defineTool({
  description: "List Syncro appointments in a date range, optionally filtered by assignee user_id.",
  execution: "server",
  effect: "read",
  inputSchema: listAppointmentsSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await listAppointments(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
