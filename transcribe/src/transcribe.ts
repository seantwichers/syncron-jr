import { Buffer } from "node:buffer";

import {
  GEMINI_INLINE_MAX_BYTES,
  HttpError,
  formatMegabytes,
  mimeFor,
  redact,
  type AudioExtension,
  type ProviderId,
} from "./catalog.js";

export interface TranscribeInput {
  provider: ProviderId;
  model: string;
  apiKey: string;
  audio: Buffer;
  extension: AudioExtension;
  fetchImpl?: typeof fetch;
  geminiInlineMaxBytes?: number;
}

const PROVIDER_TIMEOUT_MS = 120_000;
const MAX_PROVIDER_BODY = 5_000_000;

export async function transcribeAudio(input: TranscribeInput): Promise<string> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const mime = mimeFor(input.extension, input.provider);
  switch (input.provider) {
    case "openai":
      return openAiCompatible(fetchImpl, "https://api.openai.com/v1/audio/transcriptions", input, mime);
    case "groq":
      return openAiCompatible(
        fetchImpl,
        "https://api.groq.com/openai/v1/audio/transcriptions",
        input,
        mime,
      );
    case "gemini":
      return gemini(fetchImpl, input, mime);
    case "deepgram":
      return deepgram(fetchImpl, input, mime);
  }
}

async function openAiCompatible(
  fetchImpl: typeof fetch,
  url: string,
  input: TranscribeInput,
  mime: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.audio)], { type: mime }),
    `audio.${input.extension}`,
  );
  form.append("model", input.model);
  form.append("response_format", "json");
  const response = await callProvider(fetchImpl, url, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
  });
  return readTranscript(response, input.apiKey, jsonTextTranscript);
}

async function gemini(fetchImpl: typeof fetch, input: TranscribeInput, mime: string): Promise<string> {
  const limit = input.geminiInlineMaxBytes ?? GEMINI_INLINE_MAX_BYTES;
  if (input.audio.length > limit) {
    throw new HttpError(
      413,
      `This file is ${formatMegabytes(input.audio.length)}. Gemini inline audio must be ${formatMegabytes(limit)} or smaller, because the provider caps an inline request at about 20 MB after encoding. Choose a smaller file or another provider.`,
    );
  }
  const parts: Array<Record<string, unknown>> = [];
  if (!input.model.includes("transcribe")) {
    parts.push({
      text: "Transcribe the speech in this audio into plain text. Return only the transcript, in the original language, with no timestamps, speaker labels, or commentary.",
    });
  }
  parts.push({
    inline_data: {
      mime_type: mime,
      data: input.audio.toString("base64"),
    },
  });
  const response = await callProvider(
    fetchImpl,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.apiKey,
      },
      body: JSON.stringify({ contents: [{ parts }] }),
    },
  );
  return readTranscript(response, input.apiKey, geminiTranscript);
}

async function deepgram(fetchImpl: typeof fetch, input: TranscribeInput, mime: string): Promise<string> {
  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", input.model);
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  const response = await callProvider(fetchImpl, url, {
    method: "POST",
    headers: {
      Authorization: `Token ${input.apiKey}`,
      "Content-Type": mime,
    },
    body: new Uint8Array(input.audio),
  });
  return readTranscript(response, input.apiKey, deepgramTranscript);
}

async function callProvider(fetchImpl: typeof fetch, url: string | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new HttpError(504, "The provider took too long to respond.");
    }
    throw new HttpError(502, "Could not reach the provider.");
  }
}

async function readTranscript(
  response: Response,
  secret: string,
  extract: (payload: unknown) => string,
): Promise<string> {
  const raw = await response.text();
  if (raw.length > MAX_PROVIDER_BODY) {
    throw new HttpError(502, "The provider response was too large.");
  }
  if (!response.ok) {
    throw new HttpError(statusFor(response.status), providerErrorMessage(response.status, raw, secret));
  }
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(502, "The provider returned an unreadable transcript.");
  }
  return extract(payload);
}

function statusFor(status: number): number {
  if (status === 401 || status === 403 || status === 413 || status === 429) return status;
  return 502;
}

function providerErrorMessage(status: number, raw: string, secret: string): string {
  let detail = raw.slice(0, 4000);
  try {
    detail = pickMessage(JSON.parse(raw) as unknown) || detail;
  } catch {
    detail = raw.slice(0, 400);
  }
  detail = redact(detail, secret).replace(/\s+/g, " ").trim().slice(0, 400);
  if (status === 401 || status === 403) {
    return detail
      ? `The provider rejected the API key. ${detail}`
      : "The provider rejected the API key.";
  }
  return detail
    ? `The provider returned an error. ${detail}`
    : `The provider returned an error (${status}).`;
}

function pickMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.err_msg === "string") return record.err_msg;
  if (typeof record.message === "string") return record.message;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function jsonTextTranscript(payload: unknown): string {
  if (!payload || typeof payload !== "object" || typeof (payload as { text?: unknown }).text !== "string") {
    throw new HttpError(502, "The provider returned an unreadable transcript.");
  }
  return (payload as { text: string }).text.trim();
}

export function geminiTranscript(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(502, "Gemini returned an unreadable transcript.");
  }
  const record = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }>;
    promptFeedback?: { blockReason?: unknown };
  };
  const parts = record.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((part) => part && typeof part.text === "string" && part.thought !== true)
    .map((part) => (part.text as string).trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  if (text) return text;
  const reason = record.promptFeedback?.blockReason;
  if (typeof reason === "string" && reason) {
    throw new HttpError(502, `Gemini blocked the audio (${reason}).`);
  }
  throw new HttpError(502, "Gemini returned an empty transcript.");
}

export function deepgramTranscript(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(502, "Deepgram returned an unreadable transcript.");
  }
  const channels = (
    payload as {
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: unknown }> }> };
    }
  ).results?.channels;
  if (!Array.isArray(channels)) {
    throw new HttpError(502, "Deepgram returned an unreadable transcript.");
  }
  return channels
    .map((channel) => {
      const transcript = channel.alternatives?.[0]?.transcript;
      return typeof transcript === "string" ? transcript.trim() : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}
