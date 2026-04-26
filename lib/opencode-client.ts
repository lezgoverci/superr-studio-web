import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/client";
import {
  DEFAULT_OPENCODE_USERNAME,
  normalizeOpencodeBaseUrl,
} from "@/lib/opencode-server-utils";

const OPENCODE_PROXY_BASE_URL = "/api/opencode";

export type OpenCodeConnectionConfig = {
  url: string;
  username: string;
  directory?: string;
};

let client: OpencodeClient | null = null;
let connectionConfig: OpenCodeConnectionConfig | null = null;

function normalizeConnectionConfig(
  config: OpenCodeConnectionConfig
): OpenCodeConnectionConfig {
  return {
    url: normalizeOpencodeBaseUrl(config.url),
    username: config.username.trim() || DEFAULT_OPENCODE_USERNAME,
    ...(config.directory?.trim() ? { directory: config.directory.trim() } : {}),
  };
}

export function getConnectionConfig(): OpenCodeConnectionConfig | null {
  return connectionConfig;
}

export function saveConnectionConfig(config: OpenCodeConnectionConfig): void {
  connectionConfig = normalizeConnectionConfig(config);
  client = null;
}

export function clearConnectionConfig(): void {
  connectionConfig = null;
  client = null;
}

export function getOpenCodeClient(): OpencodeClient | null {
  if (!connectionConfig) {
    return null;
  }

  if (client) {
    return client;
  }

  client = createOpencodeClient({
    baseUrl: OPENCODE_PROXY_BASE_URL,
    ...(connectionConfig.directory
      ? { directory: connectionConfig.directory }
      : {}),
  });

  return client;
}

export async function pingOpenCode(): Promise<boolean> {
  const openCodeClient = getOpenCodeClient();
  if (!openCodeClient) {
    return false;
  }

  try {
    const response = await openCodeClient.app.agents();
    return !response.error;
  } catch {
    return false;
  }
}

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

export const OPENCODE_QUERY_KEYS = {
  connection: ["opencode", "connection"],
  sessions: ["opencode", "sessions"],
  session: (id: string) => ["opencode", "session", id],
  messages: (id: string) => ["opencode", "session", id, "messages"],
  providers: ["opencode", "providers"],
  agents: ["opencode", "agents"],
};
