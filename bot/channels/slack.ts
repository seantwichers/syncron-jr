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
      title: "What's risky right now?",
      message: "What's actually risky in our open queue right now, and what would you do first?",
    },
    {
      title: "Aspen resolved work",
      message: "Tell me about Aspen's resolved tickets.",
    },
    {
      title: "Human mode",
      message: "human mode",
    },
  ],
  suggestedPromptsTitle: "Ask Syncron Jr",
});
