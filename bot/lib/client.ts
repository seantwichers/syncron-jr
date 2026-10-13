import type { JsonObject } from "@cursor/bdk";
import {
  AppError,
  AuthorizationError,
  ConfigurationError,
  RequestBudget,
  SyncroClient,
  loadSyncroConfig,
  type ToolRuntime,
} from "./syncro.js";

/** Tool execute must return JSON-shaped values (no interface types). */
export function asJson(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

const MAX_REQUESTS_PER_TURN = 24;

export function parseAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const ids = raw.split(",").map((item) => item.trim()).filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

export function isUserAllowed(slackUserId: string, allowed: Set<string> | null): boolean {
  if (!slackUserId) return false;
  if (!allowed) return true;
  return allowed.has(slackUserId);
}

export type SyncroToolContext = {
  syncro: SyncroClient;
  runtime: ToolRuntime;
};

/**
 * Build a Syncro client from process.env. Secrets are read at call time
 * (hosted deployments inject them per request, not at module load).
 */
export function createSyncroToolContext(env: NodeJS.ProcessEnv = process.env): SyncroToolContext {
  const config = loadSyncroConfig(env);
  const budget = new RequestBudget(MAX_REQUESTS_PER_TURN);
  return {
    syncro: new SyncroClient({
      apiBase: config.syncroApiBase,
      webOrigin: config.syncroWebOrigin,
      apiKey: config.syncroApiKey,
      timeoutMs: config.timeoutMs,
      maxPages: config.maxPages,
      budget,
    }),
    runtime: {
      now: new Date(),
      dueSoonHours: config.dueSoonHours,
    },
  };
}

export function toolError(error: unknown): JsonObject {
  if (error instanceof AuthorizationError) throw error;
  if (error instanceof ConfigurationError) {
    return { error: error.message };
  }
  if (error instanceof AppError && error.expose) {
    return { error: error.message };
  }
  return { error: "Could not complete that Syncro read." };
}
