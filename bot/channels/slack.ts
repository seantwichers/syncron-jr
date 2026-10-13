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
      title: "Ops risk brief",
      message: "What's the real operational risk in our open queue right now, and what should we do first?",
    },
    {
      title: "Recurring problems",
      message: "Analyze the last 90 days: top recurring technical problems and what we should fix first.",
    },
    {
      title: "Conversation mode",
      message: "conversation mode",
    },
  ],
  suggestedPromptsTitle: "Ask Syncron Jr",
});
