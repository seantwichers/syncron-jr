import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConversationMemory, handleWorkerRequest } from "../app.ts";

const SECRET = "signing-secret";

function env(): Record<string, string> {
  return {
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_SIGNING_SECRET: SECRET,
    SYNCRO_BASE_URL: "https://demo.syncromsp.com",
    SYNCRO_API_KEY: "syncro-test-key",
    LLM_API_KEY: "sk-test",
    LLM_PROVIDER: "openai",
  };
}

function signedRequest(body: string, init: { method?: string; contentType: string; signature?: string }): Request {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = init.signature ?? `v0=${createHmac("sha256", SECRET).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  return new Request("https://assistant.example/slack/events", {
    method: init.method ?? "POST",
    headers: {
      "content-type": init.contentType,
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": signature,
    },
    body,
  });
}

describe("Cloudflare Worker request handler", () => {
  it("answers health checks without looking for static files", async () => {
    const response = await handleWorkerRequest(new Request("https://assistant.example/health"), {}, { waitUntil() {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "msp-assistant" });
  });

  it("rejects a bad Slack signature and returns the url verification challenge", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    };
    const bad = await handleWorkerRequest(
      signedRequest(JSON.stringify({ type: "url_verification", challenge: "abc" }), {
        contentType: "application/json",
        signature: "v0=bad",
      }),
      env(),
      { waitUntil() {} },
      { fetchImpl },
    );
    expect(bad.status).toBe(401);
    expect(calls).toEqual([]);

    const body = JSON.stringify({ type: "url_verification", challenge: "challenge-token" });
    const ok = await handleWorkerRequest(
      signedRequest(body, { contentType: "application/json" }),
      env(),
      { waitUntil() {} },
      { fetchImpl },
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ challenge: "challenge-token" });
    expect(calls).toEqual([]);
  });

  it("acknowledges a mention and posts the reply through Slack", async () => {
    const posted: unknown[] = [];
    const tasks: Promise<unknown>[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      posted.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const body = JSON.stringify({
      type: "event_callback",
      event_id: "Ev123",
      event: {
        type: "app_mention",
        user: "U1",
        text: "<@UBOT> help",
        ts: "111.222",
        channel: "C1",
      },
    });
    const response = await handleWorkerRequest(
      signedRequest(body, { contentType: "application/json" }),
      env(),
      { waitUntil(promise) { tasks.push(promise); } },
      { fetchImpl, memory: new ConversationMemory() },
    );
    expect(response.status).toBe(200);
    await Promise.all(tasks);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      url: "https://slack.com/api/chat.postMessage",
      body: {
        channel: "C1",
        thread_ts: "111.222",
        text: expect.stringMatching(/Ask me about Syncro/),
      },
    });
  });

  it("answers a dedicated-channel ticket question without a mention", async () => {
    const posted: { url: string; body: { text?: string; thread_ts?: string } | null }[] = [];
    const syncroUrls: string[] = [];
    const tasks: Promise<unknown>[] = [];
    let completions = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/chat/completions")) {
        completions += 1;
        const requestBody = JSON.parse(String(init?.body)) as { tool_choice: string };
        expect(requestBody.tool_choice).toBe(completions === 1 ? "required" : "auto");
        const payload = completions === 1
          ? {
              choices: [{
                message: {
                  tool_calls: [{
                    id: "call_channel",
                    type: "function",
                    function: {
                      name: "search_tickets",
                      arguments: JSON.stringify({ status: "On-Hold", problem_type: "Printer", tag: "Hardware" }),
                    },
                  }],
                },
              }],
            }
          : { choices: [{ message: { content: "Findings: ticket 300 is an On-Hold printer ticket." } }] };
        return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("syncromsp.com")) {
        syncroUrls.push(url);
        const parsed = new URL(url);
        expect(parsed.searchParams.has("problem_type")).toBe(false);
        expect(parsed.searchParams.has("tag")).toBe(false);
        return new Response(JSON.stringify({
          tickets: [{
            id: 3,
            number: 300,
            subject: "Printer jam",
            created_at: "2026-10-09T12:00:00.000Z",
            updated_at: "2026-10-09T12:00:00.000Z",
            status: "On-Hold",
            problem_type: "Printer",
            priority: "High",
            due_date: "2026-10-20T12:00:00.000Z",
            tag_list: ["Hardware"],
            customer_id: 9,
            customer_business_then_name: "Northwind",
          }],
          meta: { page: 1, per_page: 50, total_pages: 1, total_entries: 1 },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      posted.push({ url, body: init?.body ? JSON.parse(String(init.body)) as { text?: string; thread_ts?: string } : null });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const response = await deliver({
      fetchImpl,
      tasks,
      eventId: "Ev-channel",
      event: {
        type: "message",
        channel_type: "channel",
        user: "U1",
        text: "Any On-Hold printer tickets?",
        ts: "200.100",
        channel: "Cdesk",
      },
    });
    expect(response.status).toBe(200);
    await Promise.all(tasks);
    expect(syncroUrls.some((url) => url.includes("/tickets"))).toBe(true);
    expect(posted.map((item) => item.body?.text).join("\n")).toMatch(/ticket 300/);
    expect(posted.at(-1)?.body?.thread_ts).toBe("200.100");
    expect(posted.at(-1)?.body?.text).toContain("https://demo.syncromsp.com/tickets/3");
  });

  it("keeps a channel thread follow-up and ignores bots, other channels, and duplicate events", async () => {
    const posted: { body: { channel?: string; thread_ts?: string } | null }[] = [];
    const tasks: Promise<unknown>[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      posted.push({ body: init?.body ? JSON.parse(String(init.body)) as { channel?: string; thread_ts?: string } : null });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const bindings = { ...env(), SLACK_CHANNEL_IDS: "Cdesk" };
    const thread = await deliver({
      fetchImpl,
      tasks,
      bindings,
      eventId: "Ev-thread",
      event: {
        type: "message",
        channel_type: "channel",
        user: "U1",
        text: "help",
        ts: "200.201",
        thread_ts: "200.100",
        channel: "Cdesk",
      },
    });
    expect(thread.status).toBe(200);

    const bot = await deliver({
      fetchImpl,
      tasks,
      bindings,
      eventId: "Ev-bot",
      event: {
        type: "message",
        channel_type: "channel",
        user: "UBOT",
        bot_id: "B1",
        text: "Checking Syncro…",
        ts: "200.202",
        channel: "Cdesk",
      },
    });
    expect(bot.status).toBe(200);

    const other = await deliver({
      fetchImpl,
      tasks,
      bindings,
      eventId: "Ev-other",
      event: {
        type: "message",
        channel_type: "channel",
        user: "U1",
        text: "Any overdue tickets?",
        ts: "200.203",
        channel: "Cgeneral",
      },
    });
    expect(other.status).toBe(200);

    const direct = await deliver({
      fetchImpl,
      tasks,
      bindings,
      eventId: "Ev-dm",
      event: {
        type: "message",
        channel_type: "im",
        user: "U1",
        text: "help",
        ts: "200.204",
        channel: "D1",
      },
    });
    expect(direct.status).toBe(200);

    const mention = await deliver({
      fetchImpl,
      tasks,
      bindings,
      eventId: "Ev-mention-dup",
      event: {
        type: "app_mention",
        user: "U1",
        text: "<@UBOT> help",
        ts: "200.205",
        channel: "Cdesk",
      },
    });
    const messageDuplicate = await deliver({
      fetchImpl,
      tasks,
      bindings,
      eventId: "Ev-message-dup",
      event: {
        type: "message",
        channel_type: "channel",
        user: "U1",
        text: "<@UBOT> help",
        ts: "200.205",
        channel: "Cdesk",
      },
    });
    expect(mention.status).toBe(200);
    expect(messageDuplicate.status).toBe(200);
    await Promise.all(tasks);
    expect(posted.map((item) => item.body?.thread_ts)).toEqual(["200.100", "200.204", "200.205"]);
    expect(posted.map((item) => item.body?.channel)).toEqual(["Cdesk", "D1", "Cdesk"]);
  });
});

function deliver(options: {
  fetchImpl: typeof fetch;
  tasks: Promise<unknown>[];
  event: Record<string, unknown>;
  eventId: string;
  bindings?: Record<string, string>;
}): Promise<Response> {
  const body = JSON.stringify({ type: "event_callback", event_id: options.eventId, event: options.event });
  return handleWorkerRequest(
    signedRequest(body, { contentType: "application/json" }),
    options.bindings ?? env(),
    { waitUntil(promise) { options.tasks.push(promise); } },
    { fetchImpl: options.fetchImpl, memory: new ConversationMemory() },
  );
}
