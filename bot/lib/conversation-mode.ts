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
    "- No section labels, no “Total Open Tickets:”, no “Action:” templates, no “Let me know if you need anything else”.",
    "- No narrating tools. Just answer.",
    "- Sound sure when the data supports it; say “I’m not sure yet” when coverage is incomplete.",
    "",
    "### Hard limits",
    "- For situation / “what’s up” questions: at most 3–5 ticket mentions. Never paste the whole open queue.",
    "- Only paste a full inventory when they explicitly ask for all/list/rundown of open tickets.",
    "- “Easy / actionable” means we can move it today without waiting on the customer. Prefer New / young / In Progress / Waiting on A7. Do NOT call Waiting on Customer or On-Hold “easy”.",
    "- Use conversation memory on follow-ups — don’t re-list the entire queue.",
    "",
    "### Shape (default)",
    "1–3 short paragraphs (or a short takeaway + a few bullets). No filler closers.",
  ].join("\n");
}

export function modeLabel(mode: ConversationMode): string {
  if (mode === "lookup") return "lookup";
  if (mode === "intelligence") return "structured";
  return "human";
}
