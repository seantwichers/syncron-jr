# Transcribe

Local page for uploading audio and transcribing it with your own API key. It is separate from the Syncron Jr bot and does not talk to Syncro.

Run it with Node. Do not use Bun.

## Run

Requires Node 22.13 or newer.

```bash
cd transcribe
npm install
npm run build
npm start
```

Open http://127.0.0.1:8787

The server listens on `127.0.0.1` only. Set `PORT` in `.env.local` to change it (default `8787`).

`npm run typecheck` checks types. `npm test` builds the app and runs the smoke tests.

## API keys

The browser sends the key with each transcription. The server forwards that key to the provider you selected and does not store it, write it to disk, or log it.

Keep the key in either place:

- Paste it on the page and leave **Remember this key in this browser** checked. It is stored in `localStorage` on this computer, one entry per provider (`transcribe.apiKey.<provider>`). Uncheck the box, or use **Remove saved keys**, to delete those entries.
- Copy `.env.example` to `.env.local` and set the variables you use. `.env.local` is gitignored. Do not commit it. A key typed on the page overrides the file for that request. Leave the field blank to use the file.

An exported environment variable with the same name overrides `.env.local`.

The key is sent only to the selected provider:

| Provider | Request |
| --- | --- |
| OpenAI | `POST https://api.openai.com/v1/audio/transcriptions` |
| Groq | `POST https://api.groq.com/openai/v1/audio/transcriptions` |
| Google Gemini | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with inline audio |
| Deepgram | `POST https://api.deepgram.com/v1/listen` |

## Models

The page lists these models and also accepts a custom model id:

| Provider | Models |
| --- | --- |
| OpenAI | `whisper-1`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe` |
| Groq | `whisper-large-v3`, `whisper-large-v3-turbo` |
| Google Gemini | `gemini-2.5-flash`, `gemini-2.5-pro` |
| Deepgram | `nova-3`, `nova-2` |

`gemini-2.5-flash` and `gemini-2.5-pro` are still the published Gemini API model codes, and both accept audio input. Google may limit 2.5 access to projects that have used those models before. To call the dedicated speech model through the same inline `generateContent` request, type `gemini-3.5-transcribe` in **Custom model id**. Other provider model ids, such as OpenAI `gpt-transcribe`, can be entered the same way.

## Limits

Accepted types: mp3, wav, m4a, webm, ogg, and flac.

Maximum upload: **25 MB** (25 × 1024 × 1024 bytes). A larger file is rejected with an error before it is sent to a provider.

Gemini inline audio is limited to **14 MB**. Gemini caps an inline request at about 20 MB, and base64 encoding expands the file, so a 25 MB upload can still be too large for Gemini. The page and the server both return that error. Use a smaller file or another provider.
