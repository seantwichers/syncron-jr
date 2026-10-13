/**
 * Durable conversation memory for Syncron Jr.
 * Keeps recent turns plus a rolling director briefing so follow-ups stay coherent.
 */

import {
  DEFAULT_CONVERSATION_MODE,
  isConversationMode,
  type ConversationMode,
} from "./conversation-mode.js";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationState {
  messages: StoredMessage[];
  /** Compact rolling briefing of prior discussion (entities, decisions, open threads). */
  briefing: string;
  /** Active reply style for this conversation. Defaults to intelligence. */
  mode: ConversationMode;
  updatedAt: number;
}

export interface MemoryBackend {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface ConversationMemoryOptions {
  ttlMs?: number;
  maxMessages?: number;
  maxEntries?: number;
  /** Cloudflare KV or compatible store. Optional — falls back to process memory. */
  backend?: MemoryBackend | null;
  /** Prefix for backend keys. */
  keyPrefix?: string;
  redact?: (text: string) => string;
  truncate?: (text: string, max: number) => string;
}

const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const DEFAULT_MAX_MESSAGES = 40;

function defaultTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function identity(text: string): string {
  return text;
}

/** Stable memory key for Slack events. DMs stay continuous across messages. */
export function slackMemoryKey(input: {
  channel: string;
  userId: string;
  isDirectMessage: boolean;
  threadTs?: string | null;
  messageTs: string;
  kind?: "event" | "slash";
}): string {
  if (input.kind === "slash") return `slash:${input.userId}`;
  if (input.isDirectMessage) return `im:${input.userId}:${input.channel}`;
  const thread = input.threadTs && input.threadTs.length ? input.threadTs : input.messageTs;
  return `channel:${input.channel}:thread:${thread}`;
}

export function extractMemoryHints(text: string): string[] {
  const hints = new Set<string>();
  for (const match of text.matchAll(/#(\d{3,})/g)) {
    hints.add(`ticket #${match[1]}`);
  }
  for (const match of text.matchAll(/\bticket\s+#?(\d{3,})\b/gi)) {
    hints.add(`ticket #${match[1]}`);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s>|]+\/tickets\/(\d+)/g)) {
    hints.add(`ticket id ${match[1]}`);
  }
  // Capture short Proper Name / Company-like phrases from assistant bottom lines sparingly
  for (const match of text.matchAll(/\*([^*]{3,60})\*/g)) {
    const value = match[1]?.trim();
    if (value && !/^(bottom line|key findings|risks|next|findings|assessment)/i.test(value)) {
      hints.add(value);
    }
  }
  return [...hints].slice(0, 12);
}

export function buildRollingBriefing(
  previous: string,
  userText: string,
  assistantText: string,
  options?: { maxChars?: number },
): string {
  const maxChars = options?.maxChars ?? 1800;
  const hints = [
    ...extractMemoryHints(userText),
    ...extractMemoryHints(assistantText),
  ];
  const uniqueHints = [...new Set(hints)].slice(0, 16);
  const userLine = userText.replace(/\s+/g, " ").trim().slice(0, 220);
  const assistantLine = assistantText
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? assistantText.slice(0, 220);
  const turn = [
    `User: ${userLine}`,
    `Director: ${assistantLine.replace(/\s+/g, " ").trim().slice(0, 280)}`,
    uniqueHints.length ? `Topics: ${uniqueHints.join("; ")}` : null,
  ].filter(Boolean).join("\n");

  const combined = [previous.trim(), turn].filter(Boolean).join("\n---\n");
  if (combined.length <= maxChars) return combined;
  // Keep the newest material.
  return combined.slice(combined.length - maxChars).replace(/^[^\n]*\n?/, "");
}

export class ConversationMemory {
  private readonly entries = new Map<string, ConversationState>();
  private readonly ttlMs: number;
  private readonly maxMessages: number;
  private readonly maxEntries: number;
  private readonly backend: MemoryBackend | null;
  private readonly keyPrefix: string;
  private readonly redact: (text: string) => string;
  private readonly truncate: (text: string, max: number) => string;

  constructor(options: ConversationMemoryOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
    this.maxEntries = options.maxEntries ?? 200;
    this.backend = options.backend ?? null;
    this.keyPrefix = options.keyPrefix ?? "conv:";
    this.redact = options.redact ?? identity;
    this.truncate = options.truncate ?? defaultTruncate;
  }

  private storageKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private empty(now = Date.now()): ConversationState {
    return {
      messages: [],
      briefing: "",
      mode: DEFAULT_CONVERSATION_MODE,
      updatedAt: now,
    };
  }

  private normalizeState(parsed: ConversationState, now: number): ConversationState | null {
    if (
      !parsed ||
      !Array.isArray(parsed.messages) ||
      typeof parsed.updatedAt !== "number" ||
      this.expired(parsed, now)
    ) {
      return null;
    }
    return {
      messages: parsed.messages
        .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
        .map((message) => ({ role: message.role, content: message.content })),
      briefing: typeof parsed.briefing === "string" ? parsed.briefing : "",
      mode: isConversationMode(parsed.mode) ? parsed.mode : DEFAULT_CONVERSATION_MODE,
      updatedAt: parsed.updatedAt,
    };
  }

  private expired(state: ConversationState, now: number): boolean {
    return now - state.updatedAt > this.ttlMs;
  }

  async load(key: string, now = Date.now()): Promise<ConversationState> {
    const local = this.entries.get(key);
    if (local && !this.expired(local, now)) {
      return {
        messages: local.messages.map((message) => ({ ...message })),
        briefing: local.briefing,
        mode: isConversationMode(local.mode) ? local.mode : DEFAULT_CONVERSATION_MODE,
        updatedAt: local.updatedAt,
      };
    }
    if (this.backend) {
      try {
        const raw = await this.backend.get(this.storageKey(key));
        if (raw) {
          const parsed = JSON.parse(raw) as ConversationState;
          const state = this.normalizeState(parsed, now);
          if (state) {
            this.entries.set(key, state);
            return {
              messages: state.messages.map((message) => ({ ...message })),
              briefing: state.briefing,
              mode: state.mode,
              updatedAt: state.updatedAt,
            };
          }
        }
      } catch {
        // Fall through to empty local state.
      }
    }
    if (local) this.entries.delete(key);
    return this.empty(now);
  }

  async getMessages(key: string, now = Date.now()): Promise<StoredMessage[]> {
    const state = await this.load(key, now);
    return state.messages;
  }

  async getBriefing(key: string, now = Date.now()): Promise<string> {
    const state = await this.load(key, now);
    return state.briefing;
  }

  async getMode(key: string, now = Date.now()): Promise<ConversationMode> {
    const state = await this.load(key, now);
    return state.mode;
  }

  async setMode(key: string, mode: ConversationMode, now = Date.now()): Promise<ConversationState> {
    const state = await this.load(key, now);
    state.mode = mode;
    state.updatedAt = now;
    this.entries.set(key, state);
    this.evictIfNeeded(key);
    await this.persist(key, state);
    return {
      messages: state.messages.map((message) => ({ ...message })),
      briefing: state.briefing,
      mode: state.mode,
      updatedAt: state.updatedAt,
    };
  }

  async appendTurn(
    key: string,
    userText: string,
    assistantText: string,
    now = Date.now(),
  ): Promise<ConversationState> {
    const state = await this.load(key, now);
    const userContent = this.truncate(this.redact(userText), 3_500);
    const assistantContent = this.truncate(this.redact(assistantText), 4_500);
    state.messages.push({ role: "user", content: userContent });
    state.messages.push({ role: "assistant", content: assistantContent });
    state.messages = state.messages.slice(-this.maxMessages);
    state.briefing = buildRollingBriefing(state.briefing, userContent, assistantContent);
    state.updatedAt = now;
    this.entries.set(key, state);
    this.evictIfNeeded(key);
    await this.persist(key, state);
    return {
      messages: state.messages.map((message) => ({ ...message })),
      briefing: state.briefing,
      mode: state.mode,
      updatedAt: state.updatedAt,
    };
  }

  /** Backward-compatible append of a single message (tests / simple callers). */
  async append(key: string, role: StoredMessage["role"], content: string, now = Date.now()): Promise<void> {
    const state = await this.load(key, now);
    state.messages.push({ role, content: this.truncate(this.redact(content), 4_000) });
    state.messages = state.messages.slice(-this.maxMessages);
    state.updatedAt = now;
    this.entries.set(key, state);
    this.evictIfNeeded(key);
    await this.persist(key, state);
  }

  private evictIfNeeded(keepKey: string): void {
    if (this.entries.size <= this.maxEntries) return;
    const oldest = [...this.entries.entries()].sort((left, right) => left[1].updatedAt - right[1].updatedAt)[0];
    if (oldest && oldest[0] !== keepKey) this.entries.delete(oldest[0]);
  }

  private async persist(key: string, state: ConversationState): Promise<void> {
    if (!this.backend) return;
    try {
      await this.backend.put(this.storageKey(key), JSON.stringify(state), {
        expirationTtl: Math.max(60, Math.floor(this.ttlMs / 1000)),
      });
    } catch {
      // Local cache still holds the turn for this isolate.
    }
  }
}

export function kvBackendFromBinding(binding: unknown): MemoryBackend | null {
  if (!binding || typeof binding !== "object") return null;
  const kv = binding as { get?: unknown; put?: unknown };
  if (typeof kv.get !== "function" || typeof kv.put !== "function") return null;
  return {
    get: (key) => (kv.get as (key: string) => Promise<string | null>)(key),
    put: (key, value, options) =>
      (kv.put as (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>)(key, value, options),
  };
}
