import { AI_AGENT_CONTEXT_RETRIEVERS } from "@/lib/ai-agent/page-context/retrievers";
import type {
  AiAgentContextEnvelope,
  AiAgentContextResolveInput,
  AiAgentPageContext,
  AiAgentPageContextDetails,
  AiAgentPageContextSeed,
  AiAgentPageType,
} from "@/lib/ai-agent/page-context/types";

const MAX_SUMMARY_LENGTH = 280;
const MAX_ENTITY_ENTRIES = 12;
const MAX_CAPABILITY_ENTRIES = 12;
const MAX_METADATA_ENTRIES = 12;
const MAX_VALUE_LENGTH = 180;
const MAX_CONTEXT_BYTES = 4000;
const SECRET_KEY_REGEX = /(token|secret|password|api[-_]?key|authorization)/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, MAX_VALUE_LENGTH);
}

function sanitizeSummary(value: unknown, fallback: string): string {
  const nextSummary = sanitizeText(value, fallback);
  return nextSummary.slice(0, MAX_SUMMARY_LENGTH);
}

function sanitizeMap(
  value: unknown,
  maxEntries: number
): Record<string, string> {
  if (!(value && typeof value === "object")) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const safeEntries: [string, string][] = [];

  for (const [rawKey, rawValue] of entries) {
    const key = sanitizeText(rawKey);
    if (!key || SECRET_KEY_REGEX.test(key)) {
      continue;
    }

    let normalizedValue: string;
    if (typeof rawValue === "string") {
      normalizedValue = sanitizeText(rawValue);
    } else if (
      typeof rawValue === "number" ||
      typeof rawValue === "boolean" ||
      rawValue === null
    ) {
      normalizedValue = String(rawValue);
    } else {
      continue;
    }

    if (!normalizedValue) {
      continue;
    }

    safeEntries.push([key, normalizedValue.slice(0, MAX_VALUE_LENGTH)]);
    if (safeEntries.length >= maxEntries) {
      break;
    }
  }

  return Object.fromEntries(safeEntries);
}

function sanitizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();
  for (const rawEntry of value) {
    const entry = sanitizeText(rawEntry);
    if (!(entry && !SECRET_KEY_REGEX.test(entry))) {
      continue;
    }
    deduped.add(entry);
    if (deduped.size >= MAX_CAPABILITY_ENTRIES) {
      break;
    }
  }

  return [...deduped];
}

function mergePageContextSeed(
  seed: AiAgentPageContextSeed,
  details?: AiAgentPageContextDetails | null
): AiAgentPageContextSeed {
  const mergedEntities = {
    ...sanitizeMap(seed.entities ?? {}, MAX_ENTITY_ENTRIES),
    ...sanitizeMap(details?.entities, MAX_ENTITY_ENTRIES),
  };
  const mergedMetadata = {
    ...sanitizeMap(seed.metadata ?? {}, MAX_METADATA_ENTRIES),
    ...sanitizeMap(details?.metadata, MAX_METADATA_ENTRIES),
  };
  const mergedCapabilities = [
    ...sanitizeCapabilities(seed.capabilities ?? []),
    ...sanitizeCapabilities(details?.capabilities ?? []),
  ];

  return {
    ...seed,
    contextKey: sanitizeText(details?.contextKey, seed.contextKey ?? ""),
    entities: mergedEntities,
    capabilities: [...new Set(mergedCapabilities)].slice(
      0,
      MAX_CAPABILITY_ENTRIES
    ),
    summary: sanitizeSummary(details?.summary, seed.summary),
    metadata:
      Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
  };
}

function computeContextKey(seed: AiAgentPageContextSeed): string {
  if (seed.contextKey?.trim()) {
    return seed.contextKey.trim();
  }

  if (seed.pageType === "workflow-editor" && seed.entities?.workflowId) {
    return `workflow:${seed.entities.workflowId}`;
  }

  if (seed.pageType === "workflows" && seed.entities?.workflowDraft === "new") {
    return "workflow:new";
  }

  return `page:${seed.pageType}`;
}

function clampContextSize(
  context: AiAgentContextEnvelope
): AiAgentContextEnvelope {
  let nextContext = context;
  let payload = JSON.stringify(nextContext);

  if (payload.length <= MAX_CONTEXT_BYTES) {
    return nextContext;
  }

  if (nextContext.metadata && Object.keys(nextContext.metadata).length > 0) {
    nextContext = { ...nextContext, metadata: undefined };
    payload = JSON.stringify(nextContext);
    if (payload.length <= MAX_CONTEXT_BYTES) {
      return nextContext;
    }
  }

  const entityEntries = Object.entries(nextContext.entities).slice(0, 6);
  nextContext = {
    ...nextContext,
    entities: Object.fromEntries(entityEntries),
    summary: nextContext.summary.slice(0, 160),
  };
  payload = JSON.stringify(nextContext);
  if (payload.length <= MAX_CONTEXT_BYTES) {
    return nextContext;
  }

  return {
    ...nextContext,
    capabilities: nextContext.capabilities.slice(0, 6),
    summary: nextContext.summary.slice(0, 120),
  };
}

function createDefaultContext(pathname: string): AiAgentPageContextSeed {
  return {
    pageType: "unknown",
    route: pathname.startsWith("/app") ? pathname : "/app",
    capabilities: ["chat-assistance"],
    summary: "Working inside the app.",
  };
}

function findBaseSeed(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed {
  for (const retriever of AI_AGENT_CONTEXT_RETRIEVERS) {
    const seed = retriever(input);
    if (seed) {
      return seed;
    }
  }
  return createDefaultContext(input.pathname);
}

export function createPageContextFromSeed(
  seed: AiAgentPageContextSeed
): AiAgentPageContext {
  return {
    contextKey: computeContextKey(seed),
    pageType: seed.pageType as AiAgentPageType,
    route: sanitizeText(seed.route, "/app"),
    entities: sanitizeMap(seed.entities ?? {}, MAX_ENTITY_ENTRIES),
    capabilities: sanitizeCapabilities(seed.capabilities ?? []),
    summary: sanitizeSummary(seed.summary, "Working inside the app."),
    ...(seed.metadata
      ? { metadata: sanitizeMap(seed.metadata, MAX_METADATA_ENTRIES) }
      : {}),
  };
}

export function resolveAiAgentPageContext(
  input: AiAgentContextResolveInput
): AiAgentContextEnvelope {
  const baseSeed = findBaseSeed(input);
  const mergedSeed = mergePageContextSeed(baseSeed, input.details);
  const context = createPageContextFromSeed(mergedSeed);

  return clampContextSize({
    contextVersion: 1,
    ...context,
  });
}
