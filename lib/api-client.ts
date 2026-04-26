/**
 * API Client for making type-safe API calls to the backend
 * Replaces server actions with API endpoints
 */

import type {
  ArtifactPublicationRecord,
  ArtifactRecord,
  ArtifactWithPublicationRecord,
} from "./artifacts/types";
import type {
  HubBrainResponse,
  HubBrainSourceMutationResponse,
  HubEarnResponse,
  HubLevelCheckResponse,
  HubMemberProfile,
  HubProgressResponse,
  HubWhopAccess,
} from "./hub/types";
import type { IntegrationConfig, IntegrationType } from "./types/integration";
import type { WorkflowEdge, WorkflowNode } from "./workflow-store";

// Workflow data types
export type WorkflowVisibility = "private" | "public";

export type WorkflowData = {
  id?: string;
  name?: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  uiSpec?: Record<string, unknown> | null;
  uiSpecVersion?: string | null;
  uiMetadata?: Record<string, unknown> | null;
  visibility?: WorkflowVisibility;
};

export type SavedWorkflow = WorkflowData & {
  id: string;
  name: string;
  visibility: WorkflowVisibility;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
};

// API error class
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Helper function to make API calls
async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(response.status, error.error || "Request failed");
  }

  return response.json();
}

export type Integration = {
  id: string;
  name: string;
  type: IntegrationType;
  isManaged?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationWithConfig = Integration & {
  config: IntegrationConfig;
};

// AI Gateway types
export type AiGatewayStatusResponse = {
  enabled: boolean;
  signedIn: boolean;
  hasVercelConnection: boolean;
  hasManagedKey: boolean;
  managedIntegrationId?: string;
};

export type AiGatewayConsentResponse = {
  success: boolean;
  hasManagedKey: boolean;
  managedIntegrationId?: string;
  error?: string;
};

export type VercelTeam = {
  id: string;
  name: string;
  slug: string;
  avatar?: string;
  isPersonal: boolean;
};

export type AiGatewayTeamsResponse = {
  teams: VercelTeam[];
};

export type AiGatewayConnectResponse = {
  url: string;
  redirect: boolean;
};

export type OpencodeConnectionMode =
  | "self_hosted"
  | "managed_shared"
  | "dedicated";

export type OpencodeConnection = {
  id: string;
  name: string | null;
  mode: OpencodeConnectionMode;
  url: string;
  directory: string | null;
  username: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type OpencodeConnectionResponse = {
  configured: boolean;
  connection: OpencodeConnection | null;
  activeConnectionId: string | null;
  connections?: OpencodeConnection[];
};

export type OpencodeConnectionsListResponse = {
  configured: boolean;
  connections: OpencodeConnection[];
  activeConnectionId: string | null;
};

export type ActivateConnectionResponse = {
  success: boolean;
  activeConnectionId: string;
  connections: OpencodeConnection[];
};

export type OpencodePathInfo = {
  home: string;
  state: string;
  config: string;
  worktree: string;
  directory: string;
};

// Integration API
export const integrationApi = {
  // List all integrations
  getAll: (type?: IntegrationType) =>
    apiCall<Integration[]>(`/api/integrations${type ? `?type=${type}` : ""}`),

  // Get single integration with config
  get: (id: string) =>
    apiCall<IntegrationWithConfig>(`/api/integrations/${id}`),

  // Create integration
  create: (data: {
    name: string;
    type: IntegrationType;
    config: IntegrationConfig;
  }) =>
    apiCall<Integration>("/api/integrations", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Update integration
  update: (id: string, data: { name?: string; config?: IntegrationConfig }) =>
    apiCall<IntegrationWithConfig>(`/api/integrations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Delete integration
  delete: (id: string) =>
    apiCall<{ success: boolean }>(`/api/integrations/${id}`, {
      method: "DELETE",
    }),

  // Test existing integration connection
  testConnection: (integrationId: string) =>
    apiCall<{ status: "success" | "error"; message: string }>(
      `/api/integrations/${integrationId}/test`,
      {
        method: "POST",
      }
    ),

  // Test credentials without saving
  testCredentials: (data: {
    type: IntegrationType;
    config: IntegrationConfig;
  }) =>
    apiCall<{ status: "success" | "error"; message: string }>(
      "/api/integrations/test",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
};

// User API
export const userApi = {
  get: () =>
    apiCall<{
      id: string;
      name: string | null;
      email: string;
      image: string | null;
      isAnonymous: boolean | null;
      providerId: string | null;
    }>("/api/user"),

  update: (data: { name?: string; email?: string }) =>
    apiCall<{ success: boolean }>("/api/user", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Workflow API
export const workflowApi = {
  // Get all workflows
  getAll: () => apiCall<SavedWorkflow[]>("/api/workflows"),

  // Get a specific workflow
  getById: (id: string) => apiCall<SavedWorkflow>(`/api/workflows/${id}`),

  // Create a new workflow
  create: (workflow: Omit<WorkflowData, "id">) =>
    apiCall<SavedWorkflow>("/api/workflows/create", {
      method: "POST",
      body: JSON.stringify(workflow),
    }),

  // Update a workflow
  update: (id: string, workflow: Partial<WorkflowData>) =>
    apiCall<SavedWorkflow>(`/api/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(workflow),
    }),

  // Delete a workflow
  delete: (id: string) =>
    apiCall<{ success: boolean }>(`/api/workflows/${id}`, {
      method: "DELETE",
    }),

  // Duplicate a workflow
  duplicate: (id: string) =>
    apiCall<SavedWorkflow>(`/api/workflows/${id}/duplicate`, {
      method: "POST",
    }),

  // Get current workflow state
  getCurrent: () => apiCall<WorkflowData>("/api/workflows/current"),

  // Save current workflow state
  saveCurrent: (nodes: WorkflowNode[], edges: WorkflowEdge[]) =>
    apiCall<WorkflowData>("/api/workflows/current", {
      method: "POST",
      body: JSON.stringify({ nodes, edges }),
    }),

  // Execute workflow
  execute: (id: string, input: Record<string, unknown> = {}) =>
    apiCall<{
      executionId: string;
      workflowRunId: string;
      status: string;
      output?: unknown;
      error?: string;
      duration?: number;
    }>(`/api/workflow/${id}/execute`, {
      method: "POST",
      body: JSON.stringify({ input }),
    }),

  // Trigger workflow via webhook
  triggerWebhook: (id: string, input: Record<string, unknown> = {}) =>
    apiCall<{
      executionId: string;
      workflowRunId: string;
      status: string;
    }>(`/api/workflows/${id}/webhook`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Get workflow code
  getCode: (id: string) =>
    apiCall<{
      code: string;
      workflowName: string;
      isDeployable: boolean;
      purpose: "preview";
    }>(`/api/workflows/${id}/code`),

  // Get executions
  getExecutions: (id: string) =>
    apiCall<
      Array<{
        id: string;
        workflowId: string;
        userId: string;
        workflowRunId: string | null;
        status: string;
        artifactCount?: number;
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
      }>
    >(`/api/workflows/${id}/executions`),

  // Delete executions
  deleteExecutions: (id: string) =>
    apiCall<{ success: boolean; deletedCount: number }>(
      `/api/workflows/${id}/executions`,
      {
        method: "DELETE",
      }
    ),

  // Get execution logs
  getExecutionLogs: (executionId: string) =>
    apiCall<{
      execution: {
        id: string;
        workflowId: string;
        userId: string;
        status: string;
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
        workflow: {
          id: string;
          name: string;
          nodes: unknown;
          edges: unknown;
        };
      };
      logs: Array<{
        id: string;
        executionId: string;
        nodeId: string;
        nodeName: string;
        nodeType: string;
        status: "pending" | "running" | "success" | "error";
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
      }>;
    }>(`/api/workflows/executions/${executionId}/logs`),

  // Get execution status
  getExecutionStatus: (executionId: string) =>
    apiCall<{
      status: string;
      nodeStatuses: Array<{
        nodeId: string;
        status: "pending" | "running" | "success" | "error";
      }>;
    }>(`/api/workflows/executions/${executionId}/status`),

  // Download workflow
  download: (id: string) =>
    apiCall<{
      success: boolean;
      files?: Record<string, string>;
      warnings?: string[];
      unsupportedActions?: string[];
      missingTemplates?: string[];
      error?: string;
    }>(`/api/workflows/${id}/download`),

  // Compose and persist run UI spec for a workflow
  composeUiSpec: (
    id: string,
    payload: {
      prompt?: string;
      model?: string;
    } = {}
  ) =>
    apiCall<{
      workflowId: string;
      spec: Record<string, unknown>;
      modelUsed: string;
      runUrl: string;
    }>(`/api/workflows/${id}/ui-spec/compose`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Auto-save with debouncing (kept for backwards compatibility)
  autoSaveCurrent: (() => {
    let autosaveTimeout: NodeJS.Timeout | null = null;
    const AUTOSAVE_DELAY = 2000;

    return (nodes: WorkflowNode[], edges: WorkflowEdge[]): void => {
      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
      }

      autosaveTimeout = setTimeout(() => {
        workflowApi.saveCurrent(nodes, edges).catch((error) => {
          console.error("Auto-save failed:", error);
        });
      }, AUTOSAVE_DELAY);
    };
  })(),

  // Auto-save specific workflow with debouncing
  autoSaveWorkflow: (() => {
    let autosaveTimeout: NodeJS.Timeout | null = null;
    const AUTOSAVE_DELAY = 2000;

    return (
      id: string,
      data: Partial<WorkflowData>,
      debounce = true
    ): Promise<SavedWorkflow> | undefined => {
      if (!debounce) {
        return workflowApi.update(id, data);
      }

      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
      }

      autosaveTimeout = setTimeout(() => {
        workflowApi.update(id, data).catch((error) => {
          console.error("Auto-save failed:", error);
        });
      }, AUTOSAVE_DELAY);
    };
  })(),
};

type ArtifactKind =
  | "file"
  | "image"
  | "video"
  | "audio"
  | "web_page"
  | "url"
  | "json"
  | "text"
  | "unknown";

type ArtifactPublicationVisibility = "unlisted" | "public";

export const artifactApi = {
  list: (params?: {
    workflowId?: string;
    executionId?: string;
    kind?: ArtifactKind;
    q?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.workflowId) {
      searchParams.set("workflowId", params.workflowId);
    }
    if (params?.executionId) {
      searchParams.set("executionId", params.executionId);
    }
    if (params?.kind) {
      searchParams.set("kind", params.kind);
    }
    if (params?.q) {
      searchParams.set("q", params.q);
    }
    if (params?.cursor) {
      searchParams.set("cursor", params.cursor);
    }
    if (typeof params?.limit === "number") {
      searchParams.set("limit", String(params.limit));
    }

    const queryString = searchParams.toString();
    const endpoint = queryString
      ? `/api/artifacts?${queryString}`
      : "/api/artifacts";

    return apiCall<{
      items: ArtifactWithPublicationRecord[];
      nextCursor: string | null;
    }>(endpoint);
  },

  getById: (artifactId: string) =>
    apiCall<ArtifactWithPublicationRecord>(`/api/artifacts/${artifactId}`),

  update: (
    artifactId: string,
    payload: {
      title?: string;
      pinned?: boolean;
      visibility?: "private" | "public";
      metadata?: Record<string, unknown> | null;
    }
  ) =>
    apiCall<ArtifactWithPublicationRecord>(`/api/artifacts/${artifactId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  delete: (artifactId: string) =>
    apiCall<{ success: boolean }>(`/api/artifacts/${artifactId}`, {
      method: "DELETE",
    }),

  publish: (
    artifactId: string,
    payload?: {
      slug?: string;
      title?: string;
      description?: string;
      visibility?: ArtifactPublicationVisibility;
    }
  ) =>
    apiCall<{
      publication: ArtifactPublicationRecord;
      publicUrl: string;
    }>(`/api/artifacts/${artifactId}/publish`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),

  composeUiSpec: (
    artifactId: string,
    payload?: {
      prompt?: string;
      model?: string;
      slug?: string;
      title?: string;
      description?: string;
      visibility?: ArtifactPublicationVisibility;
    }
  ) =>
    apiCall<{
      spec: Record<string, unknown>;
      modelUsed: string;
      publication: ArtifactPublicationRecord;
      publicUrl: string;
    }>(`/api/artifacts/${artifactId}/ui-spec/compose`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),

  getPublic: (slug: string) =>
    apiCall<{
      artifact: ArtifactRecord;
      publication: ArtifactPublicationRecord;
    }>(`/api/artifacts/public/${slug}`),
};

export const agentWorkflowApi = {
  compose: (
    apiKey: string,
    payload: {
      prompt: string;
      existingWorkflow?: {
        nodes: WorkflowNode[];
        edges: WorkflowEdge[];
        name?: string;
      };
      model?: string;
    }
  ) =>
    fetch("/api/agent/workflows/compose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    }),

  create: (
    apiKey: string,
    payload: Omit<WorkflowData, "id"> & { visibility?: WorkflowVisibility }
  ) =>
    apiCall<SavedWorkflow>("/api/agent/workflows", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    }),

  update: (
    apiKey: string,
    workflowId: string,
    payload: Partial<WorkflowData>
  ) =>
    apiCall<SavedWorkflow>(`/api/agent/workflows/${workflowId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    }),

  execute: (
    apiKey: string,
    workflowId: string,
    input: Record<string, unknown> = {}
  ) =>
    apiCall<{ executionId: string; workflowRunId: string; status: string }>(
      `/api/agent/workflows/${workflowId}/execute`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input }),
      }
    ),

  composeUiSpec: (
    apiKey: string,
    payload: {
      prompt: string;
      workflowSummary?: string;
      currentSpec?: Record<string, unknown>;
      model?: string;
    }
  ) =>
    apiCall<{ spec: Record<string, unknown> }>(
      "/api/agent/workflows/ui-spec/compose",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      }
    ),
};

// AI Gateway API (User Keys feature)
export const aiGatewayApi = {
  // Get status (whether feature is enabled, user has managed key, etc.)
  getStatus: () => apiCall<AiGatewayStatusResponse>("/api/ai-gateway/status"),

  // Start OAuth account linking flow for Vercel (required for managed keys).
  connectVercel: (callbackURL?: string) =>
    apiCall<AiGatewayConnectResponse>("/api/ai-gateway/connect", {
      method: "POST",
      body: JSON.stringify({ callbackURL }),
    }),

  // Get available Vercel teams
  getTeams: () => apiCall<AiGatewayTeamsResponse>("/api/ai-gateway/teams"),

  // Grant consent and create managed API key
  consent: (teamId: string, teamName: string) =>
    apiCall<AiGatewayConsentResponse>("/api/ai-gateway/consent", {
      method: "POST",
      body: JSON.stringify({ teamId, teamName }),
    }),

  // Revoke consent and delete managed API key
  revokeConsent: () =>
    apiCall<AiGatewayConsentResponse>("/api/ai-gateway/consent", {
      method: "DELETE",
    }),
};

export const opencodeApi = {
  getConnection: () =>
    apiCall<OpencodeConnectionsListResponse>("/api/opencode/connection"),

  saveConnection: (data: {
    url: string;
    username: string;
    password?: string;
    name?: string;
    directory?: string;
  }) =>
    apiCall<OpencodeConnectionResponse>("/api/opencode/connection", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteConnection: (connectionId?: string) =>
    apiCall<{ success: boolean }>(
      `/api/opencode/connection${connectionId ? `?id=${connectionId}` : ""}`,
      {
        method: "DELETE",
      }
    ),

  activateConnection: (connectionId: string) =>
    apiCall<ActivateConnectionResponse>(
      `/api/opencode-settings/connections/${connectionId}/activate`,
      {
        method: "PUT",
      }
    ),

  getPath: () => apiCall<OpencodePathInfo>("/api/opencode/path"),

  disposeInstance: (options?: { directory?: string }) =>
    apiCall<boolean>(
      `/api/opencode/instance/dispose${options?.directory ? `?directory=${encodeURIComponent(options.directory)}` : ""}`,
      {
        method: "POST",
      }
    ),
};

export const userPreferencesApi = {
  get: () =>
    apiCall<{ workflowOperationDelayMs: number }>("/api/user/preferences"),

  update: (data: { workflowOperationDelayMs: number }) =>
    apiCall<{ workflowOperationDelayMs: number }>("/api/user/preferences", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const hubApi = {
  access: {
    get: () => apiCall<HubWhopAccess>("/api/hub/access"),
  },
  profile: {
    get: () => apiCall<HubMemberProfile>("/api/hub/profile"),
    update: (data: {
      role?: HubMemberProfile["role"];
      displayName?: string | null;
      bio?: string | null;
      location?: string | null;
      avatarUrl?: string | null;
      isPublic?: boolean;
      currentRole?: string | null;
      targetRole?: string | null;
      skillLevel?: HubMemberProfile["skillLevel"];
      aiFamiliarity?: HubMemberProfile["aiFamiliarity"];
      careerPressure?: HubMemberProfile["careerPressure"];
      firstGoal?: string | null;
      completeOnboarding?: boolean;
    }) =>
      apiCall<HubMemberProfile>("/api/hub/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  progress: {
    get: () => apiCall<HubProgressResponse>("/api/hub/progress"),
    update: (data: { trackId: string; taskId: string; completed?: boolean }) =>
      apiCall<HubProgressResponse>("/api/hub/progress", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  brain: {
    get: () => apiCall<HubBrainResponse>("/api/hub/brain"),
    link: (data: { notebookIdOrUrl: string }) =>
      apiCall<HubBrainResponse>("/api/hub/brain/link", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    provision: (data?: { force?: boolean }) =>
      apiCall<HubBrainResponse>("/api/hub/brain/provision", {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    addUrlSource: (data: { url: string }) =>
      apiCall<HubBrainSourceMutationResponse>("/api/hub/brain/sources/url", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    addTextSource: (data: { title: string; content: string }) =>
      apiCall<HubBrainSourceMutationResponse>("/api/hub/brain/sources/text", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  earn: {
    get: () => apiCall<HubEarnResponse>("/api/hub/earn"),
  },
  level: {
    check: () => apiCall<HubLevelCheckResponse>("/api/hub/level"),
    up: () =>
      apiCall<HubLevelCheckResponse>("/api/hub/level", {
        method: "POST",
      }),
  },
};

// Skills types
export type SkillStatus = "installed" | "installing" | "failed";

export type UserSkillRecord = {
  id: string;
  userId: string;
  skillName: string;
  description: string | null;
  source: string;
  sourceType: "github" | "local" | "well-known";
  version: string | null;
  status: SkillStatus;
  metadata: Record<string, unknown> | null;
  installedAt: string;
  updatedAt: string;
};

export type MarketplaceSearchResult = {
  name: string;
  slug: string;
  source: string;
  installs: number;
};

export type InstallSkillResult = {
  success: true;
  skillId: string;
  skillName: string;
  description: string | null;
  source: string;
  sourceType: "github" | "local" | "well-known";
};

export const skillsApi = {
  list: () => apiCall<UserSkillRecord[]>("/api/skills"),

  install: (data: { source: string; skillName?: string; agentCwd?: string }) =>
    apiCall<InstallSkillResult>("/api/skills", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  uninstall: (id: string, data?: { agentCwd?: string }) =>
    apiCall<{ success: boolean }>(`/api/skills/${id}`, {
      method: "DELETE",
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),

  search: (query: string) =>
    apiCall<{ skills: MarketplaceSearchResult[] }>(
      `/api/skills/search?q=${encodeURIComponent(query)}`
    ),
};

// Export all APIs as a single object
export const api = {
  artifact: artifactApi,
  aiGateway: aiGatewayApi,
  agentWorkflow: agentWorkflowApi,
  hub: hubApi,

  integration: integrationApi,
  opencode: opencodeApi,
  skills: skillsApi,
  user: userApi,
  userPreferences: userPreferencesApi,
  workflow: workflowApi,
};
