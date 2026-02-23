import type { OpenCodeConnectionConfig } from "@/lib/opencode-client";

export const OPENCODE_SESSION_MAPPING_KEY =
  "superr:opencode:session-mapping:v1";

type MappingStore = {
  version: 1;
  connections: Record<string, Record<string, SessionWorkflowMappingEntry>>;
};

export type SessionWorkflowMappingEntry = {
  workflowId: string;
  workflowName?: string;
  sessionTitle?: string;
  linkedAt: number;
  lastOpenedAt: number;
};

const DEFAULT_USERNAME = "superr";
const TRAILING_SLASH_REGEX = /\/+$/;

function readStore(): MappingStore {
  if (typeof window === "undefined") {
    return { version: 1, connections: {} };
  }

  const raw = localStorage.getItem(OPENCODE_SESSION_MAPPING_KEY);
  if (!raw) {
    return { version: 1, connections: {} };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MappingStore>;
    if (parsed.version !== 1 || typeof parsed.connections !== "object") {
      return { version: 1, connections: {} };
    }
    return {
      version: 1,
      connections: parsed.connections as MappingStore["connections"],
    };
  } catch {
    return { version: 1, connections: {} };
  }
}

function writeStore(store: MappingStore): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(OPENCODE_SESSION_MAPPING_KEY, JSON.stringify(store));
}

export function getOpenCodeSessionConnectionKey(
  connection: Pick<OpenCodeConnectionConfig, "url" | "username">
): string {
  const normalizedUrl = connection.url
    .trim()
    .replace(TRAILING_SLASH_REGEX, "")
    .toLowerCase();
  const normalizedUsername =
    connection.username?.trim().toLowerCase() || DEFAULT_USERNAME;
  return `${normalizedUrl}|${normalizedUsername}`;
}

export function listSessionWorkflowMappings(
  connectionKey: string
): Record<string, SessionWorkflowMappingEntry> {
  const store = readStore();
  return store.connections[connectionKey] ?? {};
}

export function getSessionWorkflowMapping(
  connectionKey: string,
  sessionId: string
): SessionWorkflowMappingEntry | null {
  return listSessionWorkflowMappings(connectionKey)[sessionId] ?? null;
}

type UpsertMappingInput = {
  connectionKey: string;
  sessionId: string;
  workflowId: string;
  workflowName?: string;
  sessionTitle?: string;
};

export function upsertSessionWorkflowMapping(input: UpsertMappingInput): void {
  const now = Date.now();
  const store = readStore();
  const existing = store.connections[input.connectionKey]?.[input.sessionId];

  store.connections[input.connectionKey] = {
    ...(store.connections[input.connectionKey] ?? {}),
    [input.sessionId]: {
      workflowId: input.workflowId,
      workflowName: input.workflowName ?? existing?.workflowName,
      sessionTitle: input.sessionTitle ?? existing?.sessionTitle,
      linkedAt: existing?.linkedAt ?? now,
      lastOpenedAt: now,
    },
  };

  writeStore(store);
}

export function markSessionWorkflowMappingOpened(
  connectionKey: string,
  sessionId: string
): void {
  const store = readStore();
  const existing = store.connections[connectionKey]?.[sessionId];
  if (!existing) {
    return;
  }

  store.connections[connectionKey] = {
    ...store.connections[connectionKey],
    [sessionId]: {
      ...existing,
      lastOpenedAt: Date.now(),
    },
  };

  writeStore(store);
}

export function removeSessionWorkflowMapping(
  connectionKey: string,
  sessionId: string
): void {
  const store = readStore();
  const existingConnectionMappings = store.connections[connectionKey];
  if (!existingConnectionMappings) {
    return;
  }

  const nextMappings = { ...existingConnectionMappings };
  delete nextMappings[sessionId];

  store.connections[connectionKey] = nextMappings;
  writeStore(store);
}
