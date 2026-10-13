/**
 * Detect natural-language requests for a customer's resolved/closed ticket history.
 */

export function parseCustomerResolvedTicketsRequest(
  text: string,
): { customer: string; status: "Resolved" } | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const patterns: RegExp[] = [
    // "Aspen's resolved tickets" / "tell me about Aspen's resolved tickets"
    /\b(?:tell me about|show(?:\s+me)?|list|summarize|what(?:'s| is| are))?\s*(?<customer>.+?)(?:'s|s')\s+(?:resolved|closed|completed)\s+tickets?\b/i,
    // "aspens resolved tickets" (possessive without apostrophe)
    /\b(?:tell me about|show(?:\s+me)?|list|summarize)?\s*(?<customer>[A-Za-z][A-Za-z0-9 &./-]{1,60}?)s\s+(?:resolved|closed|completed)\s+tickets?\b/i,
    /\b(?:resolved|closed|completed)\s+tickets?\s+(?:for|at|from)\s+(?<customer>.+?)(?:\?|$)/i,
    /\btickets?\s+(?:for|at)\s+(?<customer>.+?)\s+that\s+(?:are|were)\s+(?:resolved|closed|completed)\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    let customer = match?.groups?.customer?.trim();
    if (!customer || customer.length < 2 || customer.length > 80) continue;
    customer = customer.replace(/^(tell me about|show me|show|list|summarize)\s+/i, "").trim();
    if (/^(the|all|our|any|those|these)$/i.test(customer)) continue;
    return { customer: customer.replace(/\s+resolved$/i, "").trim(), status: "Resolved" };
  }
  return null;
}
