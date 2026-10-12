import {
  defaultSlackAuth,
  type SlackMessageHandler,
  slackChannel,
} from "@cursor/bdk/channels/slack";
import { isUserAllowed, parseAllowlist } from "../lib/client.js";

const handleSlack: SlackMessageHandler = async (ctx, message) => {
  const auth = defaultSlackAuth(message, ctx);
  if (auth === null) {
    return null;
  }

  const allowed = parseAllowlist(process.env.SLACK_ALLOWED_USER_IDS);
  const userId = message.author?.userId ?? "";
  if (!isUserAllowed(userId, allowed)) {
    await ctx.thread.post("You're not authorized to use the MSP assistant.");
    return null;
  }

  return { auth };
};

export default slackChannel({
  envPrefix: "SYNCRON_JR",
  onAppMention: handleSlack,
  onDirectMessage: handleSlack,
  suggestedPrompts: [
    {
      title: "Overdue first",
      message: "Show me overdue tickets and tell me which ones need attention first.",
    },
    {
      title: "Oldest ticket",
      message: "What should we do about the oldest open ticket?",
    },
    {
      title: "Heavy queues",
      message: "Who has the heaviest open queue?",
    },
  ],
  suggestedPromptsTitle: "Ask Syncron Jr",
});
