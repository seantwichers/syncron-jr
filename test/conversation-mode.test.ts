import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONVERSATION_MODE,
  buildModePrompt,
  modeSwitchAck,
  parseModeSwitch,
} from "../bot/lib/conversation-mode.js";
import { ConversationMemory } from "../bot/lib/conversation-memory.js";
import { buildSystemPrompt } from "../bot/lib/system-prompt.js";

describe("parseModeSwitch", () => {
  it("detects human mode switch-only", () => {
    expect(parseModeSwitch("human mode")).toEqual({
      mode: "human",
      remainder: "",
      switchOnly: true,
    });
  });

  it("detects structured/conversation mode", () => {
    expect(parseModeSwitch("conversation mode")).toEqual({
      mode: "intelligence",
      remainder: "",
      switchOnly: true,
    });
    expect(parseModeSwitch("structured mode")).toEqual({
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

  it("detects talk-like-a-human phrasing", () => {
    const parsed = parseModeSwitch("talk like a human — what's risky?");
    expect(parsed?.mode).toBe("human");
    expect(parsed?.remainder).toMatch(/risky/i);
  });

  it("ignores ordinary questions", () => {
    expect(parseModeSwitch("Who has the heaviest open queue?")).toBeNull();
  });
});

describe("mode prompts", () => {
  it("defaults to human colleague voice", () => {
    expect(DEFAULT_CONVERSATION_MODE).toBe("human");
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/already reviewed Syncro/i);
    expect(prompt).toMatch(/Active mode: human/i);
    expect(buildModePrompt("human")).toMatch(/plain first-person/i);
    expect(buildModePrompt("human")).toMatch(/No section labels/i);
    expect(buildModePrompt("human")).toMatch(/Do NOT call Waiting on Customer/i);
  });

  it("keeps structured mode formal", () => {
    expect(buildSystemPrompt("intelligence")).toMatch(/Active mode: structured/i);
    expect(buildModePrompt("intelligence")).toMatch(/Executive finding/i);
  });

  it("keeps lookup mode factual", () => {
    expect(buildSystemPrompt("lookup")).toMatch(/Active mode: lookup/);
    expect(buildModePrompt("lookup")).toMatch(/Skip long interpretation/);
  });

  it("acks mode switches clearly", () => {
    expect(modeSwitchAck("human")).toMatch(/human mode/i);
    expect(modeSwitchAck("intelligence")).toMatch(/structured mode/i);
    expect(modeSwitchAck("lookup")).toMatch(/lookup mode/i);
  });
});

describe("ConversationMemory mode persistence", () => {
  it("defaults to human and persists mode across backends", async () => {
    const store = new Map<string, string>();
    const backend = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const memory = new ConversationMemory({ backend });
    const loaded = await memory.load("im:U1:D1");
    expect(loaded.mode).toBe("human");

    await memory.setMode("im:U1:D1", "lookup");
    const cold = new ConversationMemory({ backend });
    expect(await cold.getMode("im:U1:D1")).toBe("lookup");
  });

  it("treats legacy stored state without mode as human", async () => {
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
    expect(state.mode).toBe("human");
    expect(state.briefing).toBe("prior");
  });
});
