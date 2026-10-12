import { defineAgent } from "@cursor/bdk";

export default defineAgent({
  name: "Syncron Jr",
  model: {
    id: "grok-4.5",
    params: [
      { id: "effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  hosting: {
    // Customer Syncro subdomains are https://<tenant>.syncromsp.com
    egressDomains: ["*.syncromsp.com"],
    secretNames: ["SYNCRO_BASE_URL", "SYNCRO_API_KEY"],
  },
});
