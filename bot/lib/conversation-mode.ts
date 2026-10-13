/**
 * Conversation modes for Syncron Jr.
 *
 * human (default): talk like a colleague who already reviewed the data.
 * intelligence: structured director brief when explicitly requested.
 * lookup: short Syncro facts only.
 */

export type ConversationMode = "human" | "intelligence" | "lookup";

export const DEFAULT_CONVERSATION_MODE: ConversationMode = "human";

export interface ModeSwitch {
  mode: ConversationMode;
  /** Remaining user text after stripping the switch phrase, if any. */
  remainder: string;
  /** True when the message is only a mode switch (no question). */
  switchOnly: boolean;
}

const SWITCH_PATTERNS: Array<{ mode: ConversationMode; re: RegExp }> = [
  {
    mode: "human",
    re: /^(?:please\s+)?(?:switch\s+to\s+|use\s+|enable\s+|enter\s+)?(?:human|simple|natural|colleague|briefing)\s+mode\b[.!]?\s*/i,
  },
  {
    mode: "intelligence",
    re: /^(?:please\s+)?(?:switch\s+to\s+|use\s+|enable\s+|enter\s+)?(?:conversation|intelligence|director|insight|structured)\s+mode\b[.!]?\s*/i,
  },
  {
    mode: "lookup",
    re: /^(?:please\s+)?(?:switch\s+to\s+|use\s+|enable\s+|enter\s+)?(?:lookup|data|raw|facts?)\s+mode\b[.!]?\s*/i,
  },
  {
    mode: "human",
    re: /^(?:talk\s+(?:to\s+me\s+)?(?:like\s+a\s+)?(?:human|person|colleague)|be\s+(?:more\s+)?(?:human|natural|simple|concise)|stop\s+(?:sounding\s+like\s+a\s+)?(?:report|bot|dashboard))\b[.!]?\s*/i,
  },
  {
    mode: "intelligence",
    re: /^(?:be\s+(?:more\s+)?(?:analytical|insightful|strategic)|stop\s+(?:dumping|regurgitating|listing)\s+data)\b[.!]?\s*/i,
  },
  {
    mode: "lookup",
    re: /^(?:just\s+(?:the\s+)?(?:data|facts|numbers)|give\s+me\s+(?:the\s+)?(?:raw\s+)?(?:data|list))\b[.!]?\s*/i,
  },
];

export function isConversationMode(value: unknown): value is ConversationMode {
  return value === "human" || value === "intelligence" || value === "lookup";
}

export function parseModeSwitch(text: string): ModeSwitch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const { mode, re } of SWITCH_PATTERNS) {
    const match = trimmed.match(re);
    if (!match) continue;
    const remainder = trimmed.slice(match[0].length).trim();
    return { mode, remainder, switchOnly: remainder.length === 0 };
  }
  return null;
}

export function modeSwitchAck(mode: ConversationMode): string {
  if (mode === "lookup") {
    return [
      "Switched to *lookup mode*.",
      "I’ll keep answers short and factual from Syncro.",
      "Say *human mode* when you want a normal briefing again.",
    ].join(" ");
  }
  if (mode === "intelligence") {
    return [
      "Switched to *structured mode*.",
      "I’ll use finding → evidence → action style briefs.",
      "Say *human mode* for a simpler colleague-style answer.",
    ].join(" ");
  }
  return [
    "Switched to *human mode*.",
    "I’ll answer like someone who already reviewed the data — plain language, what it means, what to do next.",
    "Say *lookup mode* for raw facts, or *structured mode* for formal briefs.",
  ].join(" ");
}

/** Extra system guidance injected for the active mode. */
export function buildModePrompt(mode: ConversationMode): string {
  if (mode === "lookup") {
    return [
      "## Active mode: lookup",
      "Answer with concise Syncro facts the user asked for.",
      "Lists are OK when requested. Skip long interpretation unless they ask.",
      "Still cite ticket IDs and state truncation/missing labor honestly.",
    ].join("\n");
  }

  if (mode === "intelligence") {
    return [
      "## Active mode: structured (intelligence)",
      "Write a tight director brief:",
      "1. Executive finding",
      "2. Evidence (counts, IDs, coverage)",
      "3. Interpretation",
      "4. Recommended action",
      "5. Confidence / limitations",
      "Do not paste raw Syncro field dumps. For explicit all-open-ticket lists, cover every roster row.",
    ].join("\n");
  }

  return [
    "## Active mode: human — DEFAULT",
    "You already looked at the Syncro data. Reply like a sharp colleague in Slack — not a report generator, not a dashboard, not a tool log.",
    "",
    "### Voice",
    "- Speak in plain first-person: “I looked through…”, “Here’s what stands out…”, “I’d start with…”.",
    "- Assume the reader is busy. Lead with meaning, then the few numbers that matter.",
    "- No section labels like Executive finding / Evidence / Interpretation unless they ask for a formal brief.",
    "- No narrating tools (“I used search_tickets…”). Just answer.",
    "- No dumping ticket inventories unless they asked for a list/rundown of all tickets.",
    "- Sound sure when the data supports it; say “I’m not sure yet” when coverage is incomplete.",
    "",
    "### Shape (default)",
    "1–3 short paragraphs:",
    "1) What you conclude after reviewing the data",
    "2) The key supporting facts (counts, a few ticket #s, who/what is hot)",
    "3) What you’d do next",
    "If they asked for a full list, give a one-sentence takeaway first, then the list.",
    "For follow-ups, continue the conversation — don’t restart from a blank Syncro dump.",
  ].join("\n");
}

export function modeLabel(mode: ConversationMode): string {
  if (mode === "lookup") return "lookup";
  if (mode === "intelligence") return "structured";
  return "human";
}
