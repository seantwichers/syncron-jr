import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import {
  investigateRecurringProblems,
  investigateRecurringProblemsSchema,
} from "../lib/intelligence.js";

export default defineTool({
  description:
    "Investigate recurring technical problems across historical Syncro tickets. Returns evidence-backed clusters with ticket IDs, reopens, labor when timers exist, confidence, and recommended actions. Use for director questions about top recurring issues.",
  execution: "server",
  effect: "read",
  inputSchema: investigateRecurringProblemsSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await investigateRecurringProblems(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
