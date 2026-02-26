/**
 * OpenCode SDK client singleton.
 * Reads connection details from localStorage and provides a typed client
 * for the OpenCode local API server.
 */

import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/client";

export const OPENCODE_URL_KEY = "superr:opencode:url";
export const OPENCODE_TOKEN_KEY = "superr:opencode:token";
export const OPENCODE_USERNAME_KEY = "superr:opencode:username";
const OPENCODE_PROXY_BASE_URL = "/api/opencode";
const DEFAULT_OPENCODE_USERNAME = "superr";
const TRAILING_SLASH_REGEX = /\/$/;

export type OpenCodeConnectionConfig = {
  url: string;
  token: string;
  username?: string;
};

let _client: OpencodeClient | null = null;
let _config: OpenCodeConnectionConfig | null = null;

/**
 * Get the current connection config from localStorage.
 */
export function getConnectionConfig(): OpenCodeConnectionConfig | null {
  if (typeof window === "undefined") {
    return null;
  }
  const url = localStorage.getItem(OPENCODE_URL_KEY);
  const token = localStorage.getItem(OPENCODE_TOKEN_KEY);
  if (!(url && token)) {
    return null;
  }
  const username =
    localStorage.getItem(OPENCODE_USERNAME_KEY) ?? DEFAULT_OPENCODE_USERNAME;
  return { url, token, username };
}

/**
 * Save connection config to localStorage and reset the client.
 */
export function saveConnectionConfig(config: OpenCodeConnectionConfig): void {
  localStorage.setItem(
    OPENCODE_URL_KEY,
    config.url.replace(TRAILING_SLASH_REGEX, "")
  );
  localStorage.setItem(OPENCODE_TOKEN_KEY, config.token);
  localStorage.setItem(
    OPENCODE_USERNAME_KEY,
    config.username?.trim() || DEFAULT_OPENCODE_USERNAME
  );
  _client = null;
  _config = null;
}

/**
 * Clear saved connection config.
 */
export function clearConnectionConfig(): void {
  localStorage.removeItem(OPENCODE_URL_KEY);
  localStorage.removeItem(OPENCODE_TOKEN_KEY);
  localStorage.removeItem(OPENCODE_USERNAME_KEY);
  _client = null;
  _config = null;
}

/**
 * Get the OpenCode SDK client. Creates one if it doesn't exist.
 * Returns null if no connection config is saved.
 */
export function getOpenCodeClient(): OpencodeClient | null {
  const config = getConnectionConfig();
  if (!config) {
    return null;
  }

  // Re-use the cached client if config hasn't changed
  if (
    _client &&
    _config?.url === config.url &&
    _config?.token === config.token
  ) {
    return _client;
  }

  _config = config;
  _client = createOpencodeClient({
    // Browser calls go through a same-origin proxy route to avoid CORS preflight
    // failures against the local OpenCode server.
    baseUrl: OPENCODE_PROXY_BASE_URL,
    headers: {
      "x-opencode-url": config.url,
      "x-opencode-token": config.token,
      "x-opencode-username": config.username || DEFAULT_OPENCODE_USERNAME,
    },
  });

  return _client;
}

/**
 * Check if the OpenCode server is reachable.
 * Returns true if connected, false if not.
 */
export async function pingOpenCode(): Promise<boolean> {
  const client = getOpenCodeClient();
  if (!client) {
    return false;
  }

  try {
    const response = await client.app.agents();
    return !response.error;
  } catch {
    return false;
  }
}

/**
 * Retry pinging OpenCode to tolerate short startup races.
 */
export async function pingOpenCodeWithRetry(
  attempts = 6,
  delayMs = 500
): Promise<boolean> {
  const normalizedAttempts = Math.max(1, attempts);
  const normalizedDelay = Math.max(0, delayMs);

  for (let index = 0; index < normalizedAttempts; index += 1) {
    const connected = await pingOpenCode();
    if (connected) {
      return true;
    }

    const isLastAttempt = index >= normalizedAttempts - 1;
    if (!isLastAttempt) {
      await new Promise((resolve) => setTimeout(resolve, normalizedDelay));
    }
  }

  return false;
}

/**
 * React hook config key for react-query / SWR invalidation.
 */
export const OPENCODE_QUERY_KEYS = {
  connection: ["opencode", "connection"],
  sessions: ["opencode", "sessions"],
  session: (id: string) => ["opencode", "session", id],
  messages: (id: string) => ["opencode", "session", id, "messages"],
  providers: ["opencode", "providers"],
  agents: ["opencode", "agents"],
};
