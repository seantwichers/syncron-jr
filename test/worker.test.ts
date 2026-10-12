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
});
