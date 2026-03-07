export type AiAgentPageType =
  | "dashboard"
  | "workflow-editor"
  | "workflows"
  | "sessions"
  | "library"
  | "settings"
  | "agent"
  | "unknown";

export type AiAgentPageContextSeed = {
  pageType: AiAgentPageType;
  route: string;
  entities?: Record<string, string>;
  capabilities?: string[];
  summary: string;
  contextKey?: string;
  metadata?: Record<string, string>;
};

export type AiAgentPageContext = {
  contextKey: string;
  pageType: AiAgentPageType;
  route: string;
  entities: Record<string, string>;
  capabilities: string[];
  summary: string;
  metadata?: Record<string, string>;
};

export type AiAgentContextEnvelope = AiAgentPageContext & {
  contextVersion: 1;
};

export type AiAgentPageContextDetails = {
  contextKey?: string;
  entities?: Record<string, unknown>;
  capabilities?: string[];
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type AiAgentContextResolveInput = {
  pathname: string;
  searchParams?: URLSearchParams | null;
  details?: AiAgentPageContextDetails | null;
};

export type AiAgentContextRetriever = (
  input: AiAgentContextResolveInput
) => AiAgentPageContextSeed | null;
