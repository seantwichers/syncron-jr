import { describe, expect, it } from "vitest";
import {
  ConversationMemory,
  buildRollingBriefing,
  extractMemoryHints,
  slackMemoryKey,
} from "../bot/lib/conversation-memory.js";

describe("slackMemoryKey", () => {
  it("keeps DMs continuous across message timestamps", () => {
    const first = slackMemoryKey({
      channel: "D123",
      userId: "U1",
      isDirectMessage: true,
      messageTs: "1.001",
    });
    const second = slackMemoryKey({
      channel: "D123",
      userId: "U1",
      isDirectMessage: true,
      messageTs: "1.002",
    });
    expect(first).toBe("im:U1:D123");
    expect(second).toBe(first);
  });

  it("scopes channel mentions by thread", () => {
    expect(
      slackMemoryKey({
        channel: "C1",
        userId: "U1",
        isDirectMessage: false,
        threadTs: "9.0",
        messageTs: "9.1",
      }),
    ).toBe("channel:C1:thread:9.0");
  });
});

describe("extractMemoryHints", () => {
  it("captures ticket references", () => {
    const hints = extractMemoryHints("Look at #28641 and ticket 29413 please");
    expect(hints).toEqual(expect.arrayContaining(["ticket #28641", "ticket #29413"]));
  });
});

describe("buildRollingBriefing", () => {
  it("appends turns and keeps newest material when capped", () => {
    const briefing = buildRollingBriefing(
      "old material ".repeat(200),
      "What about #28641?",
      "Bottom line: Mastermind Clinic ticket #28641 is still the oldest overdue item.",
      { maxChars: 400 },
    );
    expect(briefing).toContain("#28641");
    expect(briefing.length).toBeLessThanOrEqual(400);
  });
});

describe("ConversationMemory", () => {
  it("persists briefing across turns with a backend", async () => {
    const store = new Map<string, string>();
    const memory = new ConversationMemory({
      backend: {
        get: async (key) => store.get(key) ?? null,
        put: async (key, value) => {
          store.set(key, value);
        },
      },
      maxMessages: 10,
    });
    await memory.appendTurn("im:U1:D1", "Who is overloaded?", "Robert has the heaviest open queue.");
    const cold = new ConversationMemory({
      backend: {
        get: async (key) => store.get(key) ?? null,
        put: async (key, value) => {
          store.set(key, value);
        },
      },
    });
    const state = await cold.load("im:U1:D1");
    expect(state.messages).toHaveLength(2);
    expect(state.briefing).toMatch(/Robert|overloaded/i);
  });
});
