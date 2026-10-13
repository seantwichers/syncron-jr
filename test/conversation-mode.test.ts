import { describe, expect, it } from "vitest";
import {
  buildModePrompt,
  modeSwitchAck,
  parseModeSwitch,
} from "../bot/lib/conversation-mode.js";
import { ConversationMemory } from "../bot/lib/conversation-memory.js";
import { buildSystemPrompt } from "../bot/lib/system-prompt.js";

describe("parseModeSwitch", () => {
  it("detects conversation mode switch-only", () => {
    expect(parseModeSwitch("conversation mode")).toEqual({
      mode: "intelligence",
      remainder: "",
      switchOnly: true,
    });
  });

  it("detects lookup mode with a follow-on question", () => {
    expect(parseModeSwitch("lookup mode list open tickets for Acme")).toEqual({
      mode: "lookup",
      remainder: "list open tickets for Acme",
      switchOnly: false,
    });
  });

  it("detects anti-dump phrasing as intelligence", () => {
    const parsed = parseModeSwitch("stop dumping data — what's the real risk?");
    expect(parsed?.mode).toBe("intelligence");
    expect(parsed?.remainder).toMatch(/real risk/i);
  });

  it("ignores ordinary questions", () => {
    expect(parseModeSwitch("Who has the heaviest open queue?")).toBeNull();
  });
});

describe("mode prompts", () => {
  it("bakes anti-regurgitation rules into intelligence system prompt", () => {
    const prompt = buildSystemPrompt("intelligence");
    expect(prompt).toMatch(/Anti-regurgitation/i);
    expect(prompt).toMatch(/Do NOT paste raw Syncro field dumps/i);
    expect(prompt).toMatch(/summarize_open_tickets/i);
    expect(buildModePrompt("intelligence")).toMatch(/Recommended next move/i);
  });

  it("keeps lookup mode factual", () => {
    expect(buildSystemPrompt("lookup")).toMatch(/Active mode: lookup/);
    expect(buildModePrompt("lookup")).toMatch(/Skip long interpretation/);
  });

  it("acks mode switches clearly", () => {
    expect(modeSwitchAck("intelligence")).toMatch(/conversation mode/i);
    expect(modeSwitchAck("lookup")).toMatch(/lookup mode/i);
  });
});

describe("ConversationMemory mode persistence", () => {
  it("defaults to intelligence and persists mode across backends", async () => {
    const store = new Map<string, string>();
    const backend = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const memory = new ConversationMemory({ backend });
    const loaded = await memory.load("im:U1:D1");
    expect(loaded.mode).toBe("intelligence");

    await memory.setMode("im:U1:D1", "lookup");
    const cold = new ConversationMemory({ backend });
    expect(await cold.getMode("im:U1:D1")).toBe("lookup");
  });

  it("treats legacy stored state without mode as intelligence", async () => {
    const store = new Map<string, string>([
      [
        "conv:im:U1:D1",
        JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          briefing: "prior",
          updatedAt: Date.now(),
        }),
      ],
    ]);
    const memory = new ConversationMemory({
      backend: {
        get: async (key) => store.get(key) ?? null,
        put: async (key, value) => {
          store.set(key, value);
        },
      },
    });
    const state = await memory.load("im:U1:D1");
    expect(state.mode).toBe("intelligence");
    expect(state.briefing).toBe("prior");
  });
});
