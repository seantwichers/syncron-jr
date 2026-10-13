import { defineAgent } from "@cursor/bdk";

export default defineAgent({
  name: "Syncron Jr",
  model: {
    id: "claude-sonnet-4.5",
    params: [{ id: "effort", value: "high" }],
  },
  hosting: {
    // Customer Syncro subdomains are https://<tenant>.syncromsp.com
    egressDomains: ["*.syncromsp.com"],
    secretNames: ["SYNCRO_BASE_URL", "SYNCRO_API_KEY"],
  },
});
