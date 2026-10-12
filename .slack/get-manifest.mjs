import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function target() {
  const env = process.env.SLACK_ENV ?? process.env.SLACK_APP_ENVIRONMENT;
  if (env === "deployed" || env === "prod") return "manifest.prod.json";
  if (env === "local" || env === "dev") return "manifest.dev.json";
  try {
    const raw = readFileSync(join(here, "cli-environment"), "utf8").trim();
    if (raw === "deployed" || raw === "prod") return "manifest.prod.json";
  } catch {
    // default local
  }
  return "manifest.dev.json";
}

process.stdout.write(readFileSync(join(here, target()), "utf8"));
