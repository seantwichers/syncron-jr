import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { listUsers, listUsersSchema } from "../lib/syncro.js";

export default defineTool({
  description: "List Syncro users (technicians/staff) from GET /users.",
  execution: "server",
  effect: "read",
  inputSchema: listUsersSchema,
  async execute(args) {
    try {
      const { syncro } = createSyncroToolContext();
      return asJson(await listUsers(syncro, args));
    } catch (error) {
      return toolError(error);
    }
  },
});
