/**
 * Conversation modes for Syncron Jr.
 *
 * intelligence (default / "conversation mode"): synthesize judgment a director
 * would not get by opening Syncro — patterns, risk, tradeoffs, actions.
 * lookup: short factual answers when the user only wants Syncro fields.
 */

export type ConversationMode = "intelligence" | "lookup";

export const DEFAULT_CONVERSATION_MODE: ConversationMode = "intelligence";

export interface ModeSwitch {
  mode: ConversationMode;
  /** Remaining user text after stripping the switch phrase, if any. */
  remainder: string;
  /** True when the message is only a mode switch (no question). */
  switchOnly: boolean;
}

const SWITCH_PATTERNS: Array<{ mode: ConversationMode; re: RegExp }> = [
  {
    mode: "intelligence",
    re: /^(?:please\s+)?(?:switch\s+to\s+|use\s+|enable\s+|enter\s+)?(?:conversation|intelligence|director|insight)\s+mode\b[.!]?\s*/i,
  },
  {
    mode: "lookup",
    re: /^(?:please\s+)?(?:switch\s+to\s+|use\s+|enable\s+|enter\s+)?(?:lookup|data|raw|facts?)\s+mode\b[.!]?\s*/i,
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
  return value === "intelligence" || value === "lookup";
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
      "Say *conversation mode* when you want analysis and recommendations again.",
    ].join(" ");
  }
  return [
    "Switched to *conversation mode* (intelligence).",
    "I’ll synthesize patterns, risks, and actions — not restate Syncro screens.",
    "Say *lookup mode* if you only want raw facts.",
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

  return [
    "## Active mode: conversation (intelligence) — DEFAULT",
    "You are in a strategic conversation with an IT director. Your value is judgment Syncro does not show.",
    "",
    "### Anti-regurgitation (hard rules)",
    "- Do NOT paste ticket inventories, status dumps, or field-by-field Syncro records as the answer.",
    "- Do NOT narrate tool JSON. Tools are evidence; your reply is the briefing.",
    "- Do NOT restate subject/status/assignee/priority for every ticket unless the user asked for a roster.",
    "- Cite ticket IDs as anchors (e.g. #28641) inside prose, not as bullet catalogs of Syncro columns.",
    "",
    "### What you must add",
    "- Patterns and concentrations the UI hides (same failure mode, same customer, same asset class).",
    "- Business/ops risk: SLA exposure, reopen risk, technician bottlenecks, customer health.",
    "- Tradeoffs and prioritization: what to fix first and why (impact × effort when evidence exists).",
    "- Blind spots: missing timers, truncated pages, weak vs confirmed relationships.",
    "- A clear recommended next move a director can act on today.",
    "",
    "### Shape",
    "Default to a tight director brief:",
    "1. Executive finding (1–2 sentences)",
    "2. Evidence (only the numbers/IDs that support the finding)",
    "3. Interpretation (why it matters)",
    "4. Recommended action",
    "5. Confidence / limitations",
    "Keep it conversational and concise. Expand only when asked for detail or a full list.",
    "If the user asks a follow-up, build on conversation memory — do not restart with a Syncro dump.",
  ].join("\n");
}

export function modeLabel(mode: ConversationMode): string {
  return mode === "lookup" ? "lookup" : "conversation (intelligence)";
}
