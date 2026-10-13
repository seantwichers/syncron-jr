export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const GEMINI_INLINE_MAX_BYTES = 14 * 1024 * 1024;
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "webm", "ogg", "flac"] as const;
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

export const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    envName: "OPENAI_API_KEY",
    models: ["whisper-1", "gpt-4o-mini-transcribe", "gpt-4o-transcribe"],
  },
  {
    id: "groq",
    label: "Groq",
    envName: "GROQ_API_KEY",
    models: ["whisper-large-v3", "whisper-large-v3-turbo"],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    envName: "GEMINI_API_KEY",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  {
    id: "deepgram",
    label: "Deepgram",
    envName: "DEEPGRAM_API_KEY",
    models: ["nova-3", "nova-2"],
  },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

const ENV_NAMES = PROVIDERS.map((provider) => provider.envName);

const MIME_TO_EXTENSION: Record<string, AudioExtension> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

const MIME_BY_EXTENSION: Record<AudioExtension, { upload: string; gemini: string }> = {
  mp3: { upload: "audio/mpeg", gemini: "audio/mp3" },
  wav: { upload: "audio/wav", gemini: "audio/wav" },
  m4a: { upload: "audio/mp4", gemini: "audio/m4a" },
  webm: { upload: "audio/webm", gemini: "audio/webm" },
  ogg: { upload: "audio/ogg", gemini: "audio/ogg" },
  flac: { upload: "audio/flac", gemini: "audio/flac" },
};

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly dropConnection = false,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = Math.round(mb * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} MB` : `${rounded.toFixed(1)} MB`;
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}

export function providerById(id: ProviderId): (typeof PROVIDERS)[number] {
  const provider = PROVIDERS.find((item) => item.id === id);
  if (!provider) throw new HttpError(400, "Choose a provider.");
  return provider;
}

export function validateModel(model: string): string {
  const trimmed = model.trim();
  if (!MODEL_ID.test(trimmed)) {
    throw new HttpError(
      400,
      "Enter a model id using letters, numbers, and . _ : - characters.",
    );
  }
  return trimmed;
}

export function validateApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new HttpError(
      400,
      "Add an API key for this provider, or set it in transcribe/.env.local.",
    );
  }
  if (trimmed.length > 4096 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new HttpError(400, "The API key has a character this app will not send.");
  }
  return trimmed;
}

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function detectAudio(filename: string, mime: string): AudioExtension | null {
  const extension = extensionOf(filename);
  if (extension) {
    return isAudioExtension(extension) ? extension : null;
  }
  return MIME_TO_EXTENSION[mime.toLowerCase()] ?? null;
}

export function mimeFor(extension: AudioExtension, provider: ProviderId): string {
  const mime = MIME_BY_EXTENSION[extension];
  return provider === "gemini" ? mime.gemini : mime.upload;
}

export function catalogPayload(env: Record<string, string>): {
  maxUploadBytes: number;
  geminiInlineMaxBytes: number;
  extensions: readonly AudioExtension[];
  providers: Array<{
    id: ProviderId;
    label: string;
    envName: string;
    serverKey: boolean;
    models: readonly string[];
  }>;
} {
  return {
    maxUploadBytes: MAX_UPLOAD_BYTES,
    geminiInlineMaxBytes: GEMINI_INLINE_MAX_BYTES,
    extensions: AUDIO_EXTENSIONS,
    providers: PROVIDERS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      envName: provider.envName,
      serverKey: Boolean(env[provider.envName]?.trim()),
      models: provider.models,
    })),
  };
}

export function configuredKey(provider: ProviderId, env: Record<string, string>): string {
  const name = providerById(provider).envName;
  return env[name]?.trim() ?? "";
}

export function redact(message: string, secret: string): string {
  let out = message;
  if (secret) out = out.split(secret).join("[redacted]");
  out = out.replace(/\bsk-[A-Za-z0-9_*\-]{4,}\b/g, "sk-[redacted]");
  out = out.replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, "[redacted]");
  return out;
}

export function isKnownEnvName(name: string): boolean {
  return (ENV_NAMES as readonly string[]).includes(name) || name === "PORT";
}

function isAudioExtension(value: string): value is AudioExtension {
  return (AUDIO_EXTENSIONS as readonly string[]).includes(value);
}
