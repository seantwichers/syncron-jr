import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { getOperationsBrief, operationsBriefSchema } from "../lib/syncro.js";

export default defineTool({
  description:
    "Executive snapshot of the open ticket queue: headline metrics, top attention tickets, workload by assignee, and ticket settings — one efficient scan for leadership questions.",
  execution: "server",
  effect: "read",
  inputSchema: operationsBriefSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await getOperationsBrief(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
