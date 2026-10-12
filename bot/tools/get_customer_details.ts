import { defineTool } from "@cursor/bdk/tools";
import { asJson, createSyncroToolContext, toolError } from "../lib/client.js";
import { customerDetailsSchema, getCustomerDetails } from "../lib/syncro.js";

export default defineTool({
  description:
    "Retrieve one customer, a sample of open tickets, and a sample of assets. Contact details such as email and phone are omitted.",
  execution: "server",
  effect: "read",
  inputSchema: customerDetailsSchema,
  async execute(args) {
    try {
      const { syncro, runtime } = createSyncroToolContext();
      return asJson(await getCustomerDetails(syncro, args, runtime));
    } catch (error) {
      return toolError(error);
    }
  },
});
