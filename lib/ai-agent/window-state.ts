import { atom } from "jotai";
import type { AiAgentContextEnvelope } from "@/lib/ai-agent/page-context/types";

export type AiAgentWindowMode = "minimized" | "fullpage";

export type AiAgentMinimizedView = "thread" | "input-only";

export type AiAgentWindowState = {
  mode: AiAgentWindowMode;
  isOpen: boolean;
  minimizedView: AiAgentMinimizedView;
  originPath: string | null;
  activeContextKey: string | null;
  activeContext: AiAgentContextEnvelope | null;
  sessionByContextKey: Record<string, string>;
};

const AI_AGENT_WINDOW_STATE_STORAGE_KEY = "superr:ai-agent:window-state:v1";

const DEFAULT_AI_AGENT_WINDOW_STATE: AiAgentWindowState = {
  mode: "minimized",
  isOpen: true,
  minimizedView: "input-only",
  originPath: null,
  activeContextKey: null,
  activeContext: null,
  sessionByContextKey: {},
};

function sanitizePath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized.startsWith("/app")) {
    return null;
  }
  return normalized;
}

function sanitizeSessionMap(value: unknown): Record<string, string> {
  if (!(value && typeof value === "object")) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const normalizedEntries: [string, string][] = [];

  for (const [key, rawValue] of entries) {
    if (!(typeof rawValue === "string" && key.trim() && rawValue.trim())) {
      continue;
    }
    normalizedEntries.push([key.trim(), rawValue.trim()]);
    if (normalizedEntries.length >= 200) {
      break;
    }
  }

  return Object.fromEntries(normalizedEntries);
}

function sanitizeContext(rawContext: unknown): AiAgentContextEnvelope | null {
  if (!(rawContext && typeof rawContext === "object")) {
    return null;
  }

  const input = rawContext as Partial<AiAgentContextEnvelope>;
  if (!(input.contextVersion === 1 && input.contextKey && input.pageType)) {
    return null;
  }

  if (
    !(typeof input.contextKey === "string" && typeof input.route === "string")
  ) {
    return null;
  }

  if (
    !(typeof input.summary === "string" && Array.isArray(input.capabilities))
  ) {
    return null;
  }

  return {
    contextVersion: 1,
    contextKey: input.contextKey,
    pageType: input.pageType,
    route: input.route,
    summary: input.summary,
    entities:
      input.entities && typeof input.entities === "object"
        ? (input.entities as Record<string, string>)
        : {},
    capabilities: input.capabilities.filter(
      (entry): entry is string => typeof entry === "string"
    ),
    ...(input.metadata && typeof input.metadata === "object"
      ? { metadata: input.metadata as Record<string, string> }
      : {}),
  };
}

function sanitizeWindowState(raw: unknown): AiAgentWindowState {
  if (!(raw && typeof raw === "object")) {
    return DEFAULT_AI_AGENT_WINDOW_STATE;
  }

  const input = raw as Partial<AiAgentWindowState>;
  const mode: AiAgentWindowMode =
    input.mode === "fullpage" ? input.mode : "minimized";
  const isOpen = typeof input.isOpen === "boolean" ? input.isOpen : true;
  const minimizedView: AiAgentMinimizedView =
    input.minimizedView === "thread" ? "thread" : "input-only";

  return {
    mode,
    isOpen,
    minimizedView,
    originPath: sanitizePath(input.originPath),
    activeContextKey:
      typeof input.activeContextKey === "string"
        ? input.activeContextKey
        : null,
    activeContext: sanitizeContext(input.activeContext),
    sessionByContextKey: sanitizeSessionMap(input.sessionByContextKey),
  };
}

function normalizeHydratedWindowState(
  state: AiAgentWindowState
): AiAgentWindowState {
  if (state.mode !== "minimized" || state.minimizedView === "input-only") {
    return state;
  }

  return {
    ...state,
    minimizedView: "input-only",
  };
}

export function loadAiAgentWindowStateFromStorage(): AiAgentWindowState {
  if (typeof window === "undefined") {
    return DEFAULT_AI_AGENT_WINDOW_STATE;
  }

  const rawValue = localStorage.getItem(AI_AGENT_WINDOW_STATE_STORAGE_KEY);
  if (!rawValue) {
    return DEFAULT_AI_AGENT_WINDOW_STATE;
  }

  try {
    return normalizeHydratedWindowState(
      sanitizeWindowState(JSON.parse(rawValue))
    );
  } catch {
    return DEFAULT_AI_AGENT_WINDOW_STATE;
  }
}

export function saveAiAgentWindowStateToStorage(
  state: AiAgentWindowState
): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(
    AI_AGENT_WINDOW_STATE_STORAGE_KEY,
    JSON.stringify(sanitizeWindowState(state))
  );
}

export const aiAgentWindowStateAtom = atom<AiAgentWindowState>(
  DEFAULT_AI_AGENT_WINDOW_STATE
);

export const hydrateAiAgentWindowStateAtom = atom(
  null,
  (_get, set, state: AiAgentWindowState) => {
    set(
      aiAgentWindowStateAtom,
      normalizeHydratedWindowState(sanitizeWindowState(state))
    );
  }
);

export const setAiAgentWindowModeAtom = atom(
  null,
  (get, set, mode: AiAgentWindowMode) => {
    set(aiAgentWindowStateAtom, {
      ...get(aiAgentWindowStateAtom),
      mode,
      isOpen: true,
    });
  }
);

export const openAiAgentAtom = atom(
  null,
  (
    get,
    set,
    payload?: {
      mode?: AiAgentWindowMode;
      originPath?: string | null;
      context?: AiAgentContextEnvelope | null;
    }
  ) => {
    const previous = get(aiAgentWindowStateAtom);
    const nextMode = payload?.mode ?? previous.mode;

    set(aiAgentWindowStateAtom, {
      ...previous,
      mode: nextMode,
      isOpen: true,
      originPath:
        payload?.originPath !== undefined
          ? sanitizePath(payload.originPath)
          : previous.originPath,
      activeContext: payload?.context ?? previous.activeContext,
      activeContextKey:
        payload?.context?.contextKey ?? previous.activeContextKey,
    });
  }
);

export const closeAiAgentAtom = atom(null, (get, set) => {
  set(aiAgentWindowStateAtom, {
    ...get(aiAgentWindowStateAtom),
    isOpen: false,
  });
});

export const setAiAgentActiveContextAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      contextKey: string | null;
      context: AiAgentContextEnvelope | null;
    }
  ) => {
    set(aiAgentWindowStateAtom, {
      ...get(aiAgentWindowStateAtom),
      activeContextKey: payload.contextKey,
      activeContext: payload.context,
    });
  }
);

export const setAiAgentOriginPathAtom = atom(
  null,
  (get, set, originPath: string | null) => {
    set(aiAgentWindowStateAtom, {
      ...get(aiAgentWindowStateAtom),
      originPath: sanitizePath(originPath),
    });
  }
);

export const setAiAgentSessionForContextAtom = atom(
  null,
  (
    get,
    set,
    payload: { contextKey: string; sessionId: string | null | undefined }
  ) => {
    const previous = get(aiAgentWindowStateAtom);
    const normalizedContextKey = payload.contextKey.trim();
    if (!normalizedContextKey) {
      return;
    }

    const nextSessionMap = { ...previous.sessionByContextKey };
    const normalizedSessionId = payload.sessionId?.trim();
    if (normalizedSessionId) {
      nextSessionMap[normalizedContextKey] = normalizedSessionId;
    } else {
      delete nextSessionMap[normalizedContextKey];
    }

    set(aiAgentWindowStateAtom, {
      ...previous,
      sessionByContextKey: nextSessionMap,
    });
  }
);
