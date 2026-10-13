import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  MAX_UPLOAD_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  HttpError,
  catalogPayload,
  configuredKey,
  detectAudio,
  formatMegabytes,
  isProviderId,
  validateApiKey,
  validateModel,
} from "./catalog.js";
import { loadEnvFileSync } from "./env.js";
import { transcribeAudio } from "./transcribe.js";

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "DEEPGRAM_API_KEY",
  "PORT",
] as const;

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

export interface AppOptions {
  env?: Record<string, string>;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  maxUploadBytes?: number;
  geminiInlineMaxBytes?: number;
  publicDir?: string;
  envFilePath?: string;
}

interface HandlerContext {
  env: Record<string, string>;
  fetchImpl: typeof fetch;
  log: (line: string) => void;
  maxUploadBytes: number;
  publicDir: string;
}

export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function createApp(options: AppOptions = {}): Server {
  const root = packageRoot();
  const context: HandlerContext = {
    env: resolveEnv(root, options),
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    log: options.log ?? ((line) => console.log(line)),
    maxUploadBytes: options.maxUploadBytes ?? MAX_UPLOAD_BYTES,
    publicDir: options.publicDir ?? path.join(root, "public"),
  };

  return createServer(async (req, res) => {
    const pathName = (req.url ?? "/").split("?")[0] ?? "/";
    try {
      await handle(req, res, context, options.geminiInlineMaxBytes);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "Something went wrong.";
      if (!res.headersSent) sendJson(res, status, { error: message });
      else res.destroy();
      if (error instanceof HttpError && error.dropConnection) req.destroy();
      if (pathName === "/api/transcribe") context.log(`POST /api/transcribe ${status}`);
      if (!(error instanceof HttpError)) {
        context.log(`error ${error instanceof Error ? error.name : "Error"}`);
      }
    }
  });
}

function resolveEnv(root: string, options: AppOptions): Record<string, string> {
  if (options.env) return options.env;
  const fileEnv = loadEnvFileSync(options.envFilePath ?? path.join(root, ".env.local"));
  const merged = { ...fileEnv };
  for (const key of ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) merged[key] = value.trim();
  }
  return merged;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  context: HandlerContext,
  geminiInlineMaxBytes: number | undefined,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/api/providers") {
    sendJson(res, 200, catalogPayload(context.env));
    return;
  }

  const staticFile = method === "GET" ? STATIC_FILES[url.pathname] : undefined;
  if (staticFile) {
    const filePath = path.join(context.publicDir, staticFile.file);
    const body = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": staticFile.type,
      "Content-Length": body.length,
      "Cache-Control": "no-cache",
    });
    res.end(body);
    return;
  }

  if (url.pathname === "/api/transcribe") {
    if (method !== "POST") throw new HttpError(405, "Use POST to transcribe audio.");
    await transcribeRequest(req, res, context, geminiInlineMaxBytes);
    return;
  }

  throw new HttpError(404, "Not found.");
}

async function transcribeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: HandlerContext,
  geminiInlineMaxBytes: number | undefined,
): Promise<void> {
  assertLocalBrowser(req);
  const body = await readLimitedBody(req, context.maxUploadBytes);
  const form = await parseForm(body, req.headers["content-type"]);
  const providerRaw = stringField(form, "provider");
  if (!isProviderId(providerRaw)) throw new HttpError(400, "Choose a provider.");
  const provider = providerRaw;
  const model = validateModel(stringField(form, "model"));
  const postedKey = stringField(form, "apiKey");
  const apiKey = validateApiKey(postedKey || configuredKey(provider, context.env));
  const file = form.get("file");
  if (!isUpload(file)) throw new HttpError(400, "Choose an audio file.");
  const extension = detectAudio(file.name, file.type);
  if (!extension) {
    throw new HttpError(400, "Use an mp3, wav, m4a, webm, ogg, or flac file.");
  }
  if (file.size <= 0) throw new HttpError(400, "That audio file is empty.");
  if (file.size > context.maxUploadBytes) {
    throw new HttpError(
      413,
      `This file is ${formatMegabytes(file.size)}. The maximum is ${formatMegabytes(context.maxUploadBytes)}.`,
    );
  }

  const audio = Buffer.from(await file.arrayBuffer());
  const text = await transcribeAudio({
    provider,
    model,
    apiKey,
    audio,
    extension,
    fetchImpl: context.fetchImpl,
    geminiInlineMaxBytes,
  });
  context.log(`POST /api/transcribe 200 ${provider} ${model} ${audio.length}`);
  sendJson(res, 200, { text });
}

function assertLocalBrowser(req: IncomingMessage): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.length > 0) {
    let hostname = "";
    try {
      hostname = new URL(origin).hostname;
    } catch {
      throw new HttpError(403, "This local app only accepts requests from itself.");
    }
    if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1") {
      throw new HttpError(403, "This local app only accepts requests from itself.");
    }
  }
  if (req.headers["x-transcribe-request"] !== "1") {
    throw new HttpError(400, "This request did not come from the local transcribe page.");
  }
}

async function readLimitedBody(req: IncomingMessage, maxUploadBytes: number): Promise<Buffer> {
  const limit = maxUploadBytes + MULTIPART_OVERHEAD_BYTES;
  const declared = req.headers["content-length"];
  if (typeof declared === "string" && Number(declared) > limit) {
    throw new HttpError(
      413,
      `This file is too large. The maximum is ${formatMegabytes(maxUploadBytes)}.`,
      true,
    );
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > limit) {
      req.destroy();
      throw new HttpError(
        413,
        `This file is too large. The maximum is ${formatMegabytes(maxUploadBytes)}.`,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function parseForm(body: Buffer, contentType: string | undefined): Promise<FormData> {
  if (!contentType || !contentType.toLowerCase().includes("multipart/form-data")) {
    throw new HttpError(400, "Upload the audio file as form data.");
  }
  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("content-length", String(body.length));
  try {
    const request = new Request("http://127.0.0.1/api/transcribe", {
      method: "POST",
      headers,
      body: new Uint8Array(body),
    });
    return await request.formData();
  } catch {
    throw new HttpError(400, "Could not read the upload. Try the file again.");
  }
}

function stringField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function isUpload(value: FormDataEntryValue | null): value is File {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).name === "string" &&
    typeof (value as File).size === "number"
  );
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function listenPort(env: Record<string, string>): number {
  const raw = env.PORT || process.env.PORT || "8787";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 8787;
  return port;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const env = resolveEnv(packageRoot(), {});
  const server = createApp();
  const port = listenPort(env);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Transcribe listening on http://127.0.0.1:${port}`);
  });
}
