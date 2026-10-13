const form = document.querySelector("#form");
const fileInput = document.querySelector("#file");
const drop = document.querySelector("#drop");
const dropTitle = document.querySelector("#drop-title");
const fileHint = document.querySelector("#file-hint");
const providerSelect = document.querySelector("#provider");
const modelSelect = document.querySelector("#model");
const customModel = document.querySelector("#custom-model");
const apiKey = document.querySelector("#api-key");
const keyHint = document.querySelector("#key-hint");
const remember = document.querySelector("#remember");
const submit = document.querySelector("#submit");
const status = document.querySelector("#status");
const errorBox = document.querySelector("#error");
const result = document.querySelector("#result");
const transcript = document.querySelector("#transcript");
const copyButton = document.querySelector("#copy");
const downloadButton = document.querySelector("#download");

const REMEMBER_KEY = "transcribe.remember";
const PROVIDER_KEY = "transcribe.provider";
const MODEL_KEY = "transcribe.model";
const CUSTOM_KEY = "transcribe.customModel";

let catalog = null;
let selectedFile = null;
let activeProvider = "";

remember.checked = localStorage.getItem(REMEMBER_KEY) !== "0";
customModel.value = localStorage.getItem(CUSTOM_KEY) ?? "";

function storageKey(provider) {
  return `transcribe.apiKey.${provider}`;
}

function formatMb(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  const rounded = Math.round(mb * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} MB` : `${rounded.toFixed(1)} MB`;
}

function currentProvider() {
  return catalog?.providers.find((item) => item.id === providerSelect.value) ?? null;
}

function selectedModel() {
  const custom = customModel.value.trim();
  return custom || modelSelect.value;
}

function setError(message) {
  errorBox.hidden = !message;
  errorBox.textContent = message || "";
  if (message) errorBox.scrollIntoView({ block: "nearest" });
}

function setStatus(message) {
  status.textContent = message || "";
}

function updateFileHint() {
  if (!catalog) return;
  const max = formatMb(catalog.maxUploadBytes);
  const extensions = catalog.extensions.join(", ");
  if (providerSelect.value === "gemini") {
    fileHint.textContent = `${extensions}. Gemini inline audio is limited to ${formatMb(catalog.geminiInlineMaxBytes)}. Other providers accept up to ${max}.`;
  } else {
    fileHint.textContent = `${extensions}. Up to ${max}.`;
  }
}

function updateKeyHint() {
  const provider = currentProvider();
  if (!provider) return;
  const where = remember.checked ? "Saved in this browser for this provider." : "Not saved in this browser.";
  if (provider.serverKey) {
    keyHint.textContent = `${where} A ${provider.envName} value is also available from .env.local. Leave the field blank to use it. A key typed here is sent instead, and only to ${provider.label}.`;
  } else {
    keyHint.textContent = `${where} Sent only to ${provider.label}. The local server forwards it and does not store it.`;
  }
}

function persistKey(providerId) {
  if (!providerId) return;
  const slot = storageKey(providerId);
  const key = apiKey.value.trim();
  if (remember.checked && key) localStorage.setItem(slot, key);
  else localStorage.removeItem(slot);
}

function loadSavedKey() {
  if (!remember.checked) return;
  apiKey.value = localStorage.getItem(storageKey(providerSelect.value)) ?? "";
}

function renderModels(preferred) {
  const provider = currentProvider();
  modelSelect.replaceChildren();
  if (!provider) return;
  for (const model of provider.models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.append(option);
  }
  if (preferred && provider.models.includes(preferred)) modelSelect.value = preferred;
  updateFileHint();
  updateKeyHint();
  loadSavedKey();
}

function renderProviders() {
  const savedProvider = localStorage.getItem(PROVIDER_KEY);
  const savedModel = localStorage.getItem(MODEL_KEY);
  providerSelect.replaceChildren();
  for (const provider of catalog.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    providerSelect.append(option);
  }
  if (savedProvider && catalog.providers.some((item) => item.id === savedProvider)) {
    providerSelect.value = savedProvider;
  }
  renderModels(savedModel);
}

function showSelectedFile() {
  if (!selectedFile) {
    drop.classList.remove("has-file");
    dropTitle.textContent = "Choose an audio file";
    return;
  }
  drop.classList.add("has-file");
  dropTitle.textContent = `${selectedFile.name} · ${formatMb(selectedFile.size)}`;
}

function rememberChoices() {
  localStorage.setItem(REMEMBER_KEY, remember.checked ? "1" : "0");
  localStorage.setItem(PROVIDER_KEY, providerSelect.value);
  localStorage.setItem(MODEL_KEY, modelSelect.value);
  localStorage.setItem(CUSTOM_KEY, customModel.value.trim());
  persistKey(activeProvider || providerSelect.value);
}

function forgetKeys() {
  if (!catalog) return;
  for (const provider of catalog.providers) localStorage.removeItem(storageKey(provider.id));
  apiKey.value = "";
  updateKeyHint();
  setStatus("Saved keys removed from this browser.");
}

function downloadName() {
  const raw = selectedFile?.name || "transcript";
  const base = raw.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${base || "transcript"}.txt`;
}

fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files?.[0] ?? null;
  showSelectedFile();
  setError("");
});

drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("dragover");
});

drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));

drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("dragover");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  selectedFile = file;
  showSelectedFile();
  setError("");
});

providerSelect.addEventListener("change", () => {
  persistKey(activeProvider);
  activeProvider = providerSelect.value;
  apiKey.value = "";
  renderModels(modelSelect.value);
  localStorage.setItem(PROVIDER_KEY, providerSelect.value);
  localStorage.setItem(MODEL_KEY, modelSelect.value);
});

modelSelect.addEventListener("change", rememberChoices);
customModel.addEventListener("change", () => {
  rememberChoices();
  updateFileHint();
});

remember.addEventListener("change", () => {
  if (!remember.checked) forgetKeys();
  else loadSavedKey();
  localStorage.setItem(REMEMBER_KEY, remember.checked ? "1" : "0");
  updateKeyHint();
});

document.querySelector("#forget").addEventListener("click", forgetKeys);

document.querySelector("#toggle-key").addEventListener("click", () => {
  const show = apiKey.type === "password";
  apiKey.type = show ? "text" : "password";
  document.querySelector("#toggle-key").textContent = show ? "Hide" : "Show";
});

copyButton.addEventListener("click", async () => {
  const text = transcript.value;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied.");
  } catch {
    transcript.focus();
    transcript.select();
    setStatus("Select the transcript and copy it.");
  }
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([transcript.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName();
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Download started.");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");
  if (!catalog) {
    setError("The provider list has not loaded.");
    return;
  }
  if (!selectedFile) {
    setError("Choose an audio file.");
    return;
  }
  const model = selectedModel();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(model)) {
    setError("Enter a model id using letters, numbers, and . _ : - characters.");
    return;
  }
  const provider = currentProvider();
  const key = apiKey.value.trim();
  if (!key && !provider?.serverKey) {
    setError("Add an API key for this provider, or set it in transcribe/.env.local.");
    return;
  }
  if (selectedFile.size > catalog.maxUploadBytes) {
    setError(`This file is ${formatMb(selectedFile.size)}. The maximum is ${formatMb(catalog.maxUploadBytes)}.`);
    return;
  }
  if (providerSelect.value === "gemini" && selectedFile.size > catalog.geminiInlineMaxBytes) {
    setError(
      `This file is ${formatMb(selectedFile.size)}. Gemini inline audio must be ${formatMb(catalog.geminiInlineMaxBytes)} or smaller. Choose a smaller file or another provider.`,
    );
    return;
  }

  rememberChoices();
  const body = new FormData();
  body.set("provider", providerSelect.value);
  body.set("model", model);
  body.set("apiKey", key);
  body.set("file", selectedFile, selectedFile.name);

  submit.disabled = true;
  setStatus(`Transcribing with ${provider.label} (${model})…`);
  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "X-Transcribe-Request": "1" },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }
    transcript.value = typeof payload.text === "string" ? payload.text : "";
    result.hidden = false;
    setStatus(transcript.value ? "Transcript ready." : "The transcript is empty.");
  } catch (error) {
    setError(error instanceof Error ? error.message : "Transcription failed.");
    setStatus("");
  } finally {
    submit.disabled = false;
  }
});

const loaded = await fetch("/api/providers");
if (!loaded.ok) {
  setError("Could not load providers from the local server.");
} else {
  catalog = await loaded.json();
  renderProviders();
  activeProvider = providerSelect.value;
  showSelectedFile();
}
