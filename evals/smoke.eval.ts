import { defineEval, includes } from "@cursor/bdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Agent explains how it helps with Syncro without crashing.",
  async test(t) {
    await t.send("What can you help me with in Syncro?");
    t.succeeded();
    t.check(t.reply, includes(/ticket|Syncro|overdue|workload/i));
  },
});
