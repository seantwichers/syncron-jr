import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { request as httpRequest } from "node:http";

import { GEMINI_INLINE_MAX_BYTES, MAX_UPLOAD_BYTES, redact } from "../dist/catalog.js";
import { loadEnvFileSync, parseEnv } from "../dist/env.js";
import { createApp } from "../dist/server.js";
import { geminiTranscript } from "../dist/transcribe.js";

const SECRET = "sk-test-secret-value-0123456789";
const ENV_SECRET = "env-secret-value-should-not-leak";

function tinyWav() {
  const dataSize = 8;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(8000, 28);
  bytes.writeUInt16LE(1, 32);
  bytes.writeUInt16LE(8, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

function headersOf(init) {
  return Object.fromEntries(new Headers(init?.headers).entries());
}

async function readCall(url, init) {
  const headers = headersOf(init);
  const call = { url: String(url), headers };
  if (init?.body instanceof FormData) {
    call.model = init.body.get("model");
    call.responseFormat = init.body.get("response_format");
    const file = init.body.get("file");
    call.fileName = file instanceof File ? file.name : "";
    call.fileSize = file instanceof File ? file.size : 0;
    call.fileType = file instanceof File ? file.type : "";
  } else if (typeof init?.body === "string") {
    call.json = JSON.parse(init.body);
  } else if (init?.body) {
    call.byteLength = init.body.byteLength ?? init.body.length;
  }
  return call;
}

function providerResponse(url) {
  const href = String(url);
  if (href.includes("generativelanguage.googleapis.com")) {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "hidden reasoning" },
                { text: "gemini transcript" },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  }
  if (href.includes("api.deepgram.com")) {
    return new Response(
      JSON.stringify({
        results: {
          channels: [
            { alternatives: [{ transcript: "deepgram one" }] },
            { alternatives: [{ transcript: "deepgram two" }] },
          ],
        },
      }),
      { status: 200 },
    );
  }
  return new Response(JSON.stringify({ text: "whisper transcript" }), { status: 200 });
}

async function withApp(options, fn) {
  const logs = [];
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(await readCall(url, init));
    if (options.failWith) return options.failWith(url, init);
    return providerResponse(url);
  };
  const server = createApp({
    env: options.env ?? {},
    envFilePath: options.envFilePath,
    maxUploadBytes: options.maxUploadBytes,
    geminiInlineMaxBytes: options.geminiInlineMaxBytes,
    fetchImpl,
    log: (line) => logs.push(line),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await fn({ port, calls, logs });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function transcribe(port, fields, file) {
  const form = new FormData();
  form.set("provider", fields.provider);
  form.set("model", fields.model);
  form.set("apiKey", fields.apiKey ?? "");
  if (file !== null) {
    form.set(
      "file",
      new Blob([file?.bytes ?? tinyWav()], { type: file?.type ?? "audio/wav" }),
      file?.name ?? "clip.wav",
    );
  }
  return fetch(`http://127.0.0.1:${port}/api/transcribe`, {
    method: "POST",
    headers: { "X-Transcribe-Request": "1", ...(fields.headers ?? {}) },
    body: form,
  });
}

test("limits and env parsing stay explicit", () => {
  assert.equal(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
  assert.equal(GEMINI_INLINE_MAX_BYTES, 14 * 1024 * 1024);
  assert.equal(redact(`bad ${SECRET} sk-abcdefghijklmnopqrstuvwxyz`, SECRET), "bad [redacted] sk-[redacted]");
  assert.equal(
    redact("Incorrect API key provided: sk-brows*****************0000.", SECRET),
    "Incorrect API key provided: sk-[redacted].",
  );
  assert.deepEqual(
    parseEnv("# note\nOPENAI_API_KEY=\"abc\"\nSYNCRO_API_KEY=nope\nexport GROQ_API_KEY='groq'\nPORT=8787\n"),
    { OPENAI_API_KEY: "abc", GROQ_API_KEY: "groq", PORT: "8787" },
  );
});

test("gemini transcript skips thought parts", () => {
  assert.equal(
    geminiTranscript({
      candidates: [{ content: { parts: [{ thought: true, text: "think" }, { text: "spoken words" }] } }],
    }),
    "spoken words",
  );
});

test("health, catalog, and page do not reveal keys", async () => {
  await withApp({ env: { OPENAI_API_KEY: ENV_SECRET, GEMINI_API_KEY: "" } }, async ({ port }) => {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.deepEqual(await health.json(), { ok: true });

    const providers = await fetch(`http://127.0.0.1:${port}/api/providers`);
    const catalog = await providers.json();
    assert.equal(JSON.stringify(catalog).includes(ENV_SECRET), false);
    assert.equal(catalog.maxUploadBytes, MAX_UPLOAD_BYTES);
    assert.equal(catalog.providers.find((item) => item.id === "openai").serverKey, true);
    assert.equal(catalog.providers.find((item) => item.id === "groq").serverKey, false);
    assert.deepEqual(
      catalog.providers.map((item) => item.models),
      [
        ["whisper-1", "gpt-4o-mini-transcribe", "gpt-4o-transcribe"],
        ["whisper-large-v3", "whisper-large-v3-turbo"],
        ["gemini-2.5-flash", "gemini-2.5-pro"],
        ["nova-3", "nova-2"],
      ],
    );

    const page = await fetch(`http://127.0.0.1:${port}/`);
    const html = await page.text();
    assert.match(html, /Transcribe/);
    assert.equal(html.includes(ENV_SECRET), false);
    const favicon = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
    assert.equal(favicon.status, 204);
  });
});

test("each provider receives only its own request and key", async () => {
  const cases = [
    {
      provider: "openai",
      model: "gpt-4o-mini-transcribe",
      host: "https://api.openai.com/v1/audio/transcriptions",
      text: "whisper transcript",
    },
    {
      provider: "groq",
      model: "whisper-large-v3-turbo",
      host: "https://api.groq.com/openai/v1/audio/transcriptions",
      text: "whisper transcript",
    },
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      host: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      text: "gemini transcript",
    },
    {
      provider: "deepgram",
      model: "nova-3",
      host: "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true",
      text: "deepgram one\ndeepgram two",
    },
  ];

  for (const item of cases) {
    await withApp({ env: { OPENAI_API_KEY: ENV_SECRET, GROQ_API_KEY: ENV_SECRET } }, async ({ port, calls, logs }) => {
      const response = await transcribe(port, {
        provider: item.provider,
        model: item.model,
        apiKey: SECRET,
      });
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.text, item.text);
      assert.equal(JSON.stringify(payload).includes(SECRET), false);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, item.host);
      assert.equal(logs.join("\n").includes(SECRET), false);
      assert.equal(logs.join("\n").includes(ENV_SECRET), false);

      if (item.provider === "openai" || item.provider === "groq") {
        assert.equal(calls[0].headers.authorization, `Bearer ${SECRET}`);
        assert.equal(calls[0].model, item.model);
        assert.equal(calls[0].responseFormat, "json");
        assert.equal(calls[0].fileName, `audio.${item.provider === "openai" ? "wav" : "wav"}`);
      }
      if (item.provider === "gemini") {
        assert.equal(calls[0].headers["x-goog-api-key"], SECRET);
        assert.equal(calls[0].url.includes(SECRET), false);
        assert.match(calls[0].json.contents[0].parts[0].text, /Transcribe the speech/);
        assert.equal(calls[0].json.contents[0].parts[1].inline_data.mime_type, "audio/wav");
        assert.equal(calls[0].json.contents[0].parts[1].inline_data.data.length > 0, true);
        assert.equal(JSON.stringify(calls[0].json).includes(SECRET), false);
      }
      if (item.provider === "deepgram") {
        assert.equal(calls[0].headers.authorization, `Token ${SECRET}`);
        assert.equal(calls[0].headers["content-type"], "audio/wav");
        assert.equal(calls[0].byteLength, tinyWav().length);
      }
    });
  }
});

test("a custom gemini transcribe model sends inline audio without a prompt", async () => {
  await withApp({ env: {} }, async ({ port, calls }) => {
    const response = await transcribe(port, {
      provider: "gemini",
      model: "gemini-3.5-transcribe",
      apiKey: SECRET,
    }, { name: "talk.mp3", type: "audio/mpeg", bytes: Buffer.from("not-a-real-mp3") });
    assert.equal((await response.json()).text, "gemini transcript");
    assert.equal(
      calls[0].url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent",
    );
    assert.equal(calls[0].json.contents[0].parts.length, 1);
    assert.equal(calls[0].json.contents[0].parts[0].inline_data.mime_type, "audio/mp3");
  });
});

test("blank key uses the server env key and a typed key wins", async () => {
  await withApp({ env: { DEEPGRAM_API_KEY: ENV_SECRET } }, async ({ port, calls }) => {
    const fromEnv = await transcribe(port, { provider: "deepgram", model: "nova-2", apiKey: "" });
    assert.equal((await fromEnv.json()).text, "deepgram one\ndeepgram two");
    assert.equal(calls[0].headers.authorization, `Token ${ENV_SECRET}`);

    const typed = await transcribe(port, { provider: "deepgram", model: "nova-2", apiKey: SECRET });
    assert.equal(calls[1].headers.authorization, `Token ${SECRET}`);
  });
});

test("provider errors redact the key", async () => {
  await withApp(
    {
      env: {},
      failWith: () =>
        new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${SECRET}` } }), {
          status: 401,
        }),
    },
    async ({ port, logs }) => {
      const response = await transcribe(port, { provider: "openai", model: "whisper-1", apiKey: SECRET });
      const payload = await response.json();
      assert.equal(response.status, 401);
      assert.match(payload.error, /rejected the API key/);
      assert.equal(payload.error.includes(SECRET), false);
      assert.match(payload.error, /\[redacted\]/);
      assert.equal(logs.join("\n").includes(SECRET), false);
    },
  );
});

test("rejects missing files, bad types, bad models, and missing keys", async () => {
  await withApp({ env: {} }, async ({ port, calls }) => {
    const missing = await transcribe(port, { provider: "openai", model: "whisper-1", apiKey: SECRET }, null);
    assert.equal(missing.status, 400);
    assert.match((await missing.json()).error, /Choose an audio file/);

    const text = await transcribe(
      port,
      { provider: "openai", model: "whisper-1", apiKey: SECRET },
      { name: "notes.txt", type: "text/plain", bytes: Buffer.from("hello") },
    );
    assert.equal(text.status, 400);
    assert.match((await text.json()).error, /mp3, wav, m4a, webm, ogg, or flac/);

    const model = await transcribe(port, { provider: "openai", model: "../whisper", apiKey: SECRET });
    assert.equal(model.status, 400);

    const key = await transcribe(port, { provider: "groq", model: "whisper-large-v3", apiKey: "bad\nkey" });
    assert.equal(key.status, 400);

    const absent = await transcribe(port, { provider: "groq", model: "whisper-large-v3", apiKey: "  " });
    assert.equal(absent.status, 400);
    assert.match((await absent.json()).error, /API key/);
    assert.equal(calls.length, 0);
  });
});

test("enforces the upload limit and the Gemini inline limit", async () => {
  await withApp({ env: {}, maxUploadBytes: 32 }, async ({ port, calls }) => {
    const response = await transcribe(port, { provider: "openai", model: "whisper-1", apiKey: SECRET });
    const payload = await response.json();
    assert.equal(response.status, 413);
    assert.match(payload.error, /maximum is 0.0 MB|maximum is/);
    assert.match(payload.error, /MB/);
    assert.equal(calls.length, 0);
  });

  await withApp({ env: {}, geminiInlineMaxBytes: 8 }, async ({ port }) => {
    const response = await transcribe(port, {
      provider: "gemini",
      model: "gemini-2.5-pro",
      apiKey: SECRET,
    });
    const payload = await response.json();
    assert.equal(response.status, 413);
    assert.match(payload.error, /Gemini inline audio/);
  });
});

test("rejects a declared body over the size limit", async () => {
  await withApp({ env: {}, maxUploadBytes: 1024 }, async ({ port }) => {
    const payload = Buffer.alloc(80 * 1024);
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/transcribe",
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            "content-length": String(payload.length),
            "x-transcribe-request": "1",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end(payload);
    });
    assert.equal(status, 413);
  });
});

test("rejects cross-origin posts and posts without the local header", async () => {
  await withApp({ env: {} }, async ({ port, calls }) => {
    const cross = await fetch(`http://127.0.0.1:${port}/api/transcribe`, {
      method: "POST",
      headers: { Origin: "https://evil.example", "X-Transcribe-Request": "1" },
    });
    assert.equal(cross.status, 403);

    const header = await fetch(`http://127.0.0.1:${port}/api/transcribe`, { method: "POST" });
    assert.equal(header.status, 400);
    assert.equal(calls.length, 0);
  });
});

test("loads a gitignored env file without returning its values", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "transcribe-"));
  const filePath = path.join(directory, ".env.local");
  const fileSecret = "file-secret-value-999";
  await writeFile(filePath, `DEEPGRAM_API_KEY=${fileSecret}\nSYNCRO_API_KEY=do-not-load\n`);
  assert.deepEqual(loadEnvFileSync(filePath), { DEEPGRAM_API_KEY: fileSecret });

  const previous = process.env.DEEPGRAM_API_KEY;
  delete process.env.DEEPGRAM_API_KEY;
  try {
    const logs = [];
    const calls = [];
    const server = createApp({
      envFilePath: filePath,
      log: (line) => logs.push(line),
      fetchImpl: async (url, init) => {
        calls.push(await readCall(url, init));
        return providerResponse(url);
      },
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      const catalog = await (await fetch(`http://127.0.0.1:${port}/api/providers`)).json();
      assert.equal(JSON.stringify(catalog).includes(fileSecret), false);
      assert.equal(catalog.providers.find((item) => item.id === "deepgram").serverKey, true);
      const response = await transcribe(port, { provider: "deepgram", model: "nova-3", apiKey: "" });
      assert.equal(response.status, 200);
      assert.equal(calls[0].headers.authorization, `Token ${fileSecret}`);
      assert.equal(logs.join("\n").includes(fileSecret), false);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    if (previous === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = previous;
  }
});
