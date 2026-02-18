/**
 * API Client for making type-safe API calls to the backend
 * Replaces server actions with API endpoints
 */

import type {
  ArtifactPublicationRecord,
  ArtifactRecord,
  ArtifactWithPublicationRecord,
} from "./artifacts/types";
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

// AI API

type StreamMessage = {
  type: "operation" | "complete" | "error";
  operation?: {
    op:
      | "setName"
      | "setDescription"
      | "addNode"
      | "addEdge"
      | "removeNode"
      | "removeEdge"
      | "updateNode";
    name?: string;
    description?: string;
    node?: unknown;
    edge?: unknown;
    nodeId?: string;
    edgeId?: string;
    updates?: {
      position?: { x: number; y: number };
      data?: unknown;
    };
  };
  error?: string;
};

type StreamState = {
  buffer: string;
  currentData: WorkflowData;
};

type OperationHandler = (
  op: StreamMessage["operation"],
  state: StreamState
) => void;

function handleSetName(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.name) {
    state.currentData.name = op.name;
  }
}

function handleSetDescription(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.description) {
    state.currentData.description = op.description;
  }
}

function handleAddNode(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.node) {
    state.currentData.nodes = [
      ...state.currentData.nodes,
      op.node as WorkflowNode,
    ];
  }
}

function handleAddEdge(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.edge) {
    state.currentData.edges = [
      ...state.currentData.edges,
      op.edge as WorkflowEdge,
    ];
  }
}

function handleRemoveNode(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.nodeId) {
    state.currentData.nodes = state.currentData.nodes.filter(
      (n) => n.id !== op.nodeId
    );
    state.currentData.edges = state.currentData.edges.filter(
      (e) => e.source !== op.nodeId && e.target !== op.nodeId
    );
  }
}

function handleRemoveEdge(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.edgeId) {
    state.currentData.edges = state.currentData.edges.filter(
      (e) => e.id !== op.edgeId
    );
  }
}

function handleUpdateNode(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.nodeId && op.updates) {
    state.currentData.nodes = state.currentData.nodes.map((n) => {
      if (n.id === op.nodeId) {
        return {
          ...n,
          ...(op.updates?.position ? { position: op.updates.position } : {}),
          ...(op.updates?.data
            ? { data: { ...n.data, ...op.updates.data } }
            : {}),
        };
      }
      return n;
    });
  }
}

const operationHandlers: Record<string, OperationHandler> = {
  setName: handleSetName,
  setDescription: handleSetDescription,
  addNode: handleAddNode,
  addEdge: handleAddEdge,
  removeNode: handleRemoveNode,
  removeEdge: handleRemoveEdge,
  updateNode: handleUpdateNode,
};

function applyOperation(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (!op?.op) {
    return;
  }

  const handler = operationHandlers[op.op];
  if (handler) {
    handler(op, state);
  }
}

function processStreamLine(
  line: string,
  onUpdate: (data: WorkflowData) => void,
  state: StreamState
): void {
  if (!line.trim()) {
    return;
  }

  try {
    const message = JSON.parse(line) as StreamMessage;

    if (message.type === "operation" && message.operation) {
      applyOperation(message.operation, state);
      onUpdate({ ...state.currentData });
    } else if (message.type === "error") {
      console.error("[API Client] Error:", message.error);
      throw new Error(message.error);
    }
  } catch (error) {
    console.error("[API Client] Failed to parse JSONL line:", error);
  }
}

function processStreamChunk(
  value: Uint8Array,
  decoder: TextDecoder,
  onUpdate: (data: WorkflowData) => void,
  state: StreamState
): void {
  state.buffer += decoder.decode(value, { stream: true });

  // Process complete JSONL lines
  const lines = state.buffer.split("\n");
  state.buffer = lines.pop() || "";

  for (const line of lines) {
    processStreamLine(line, onUpdate, state);
  }
}

export const aiApi = {
  generate: (
    prompt: string,
    existingWorkflow?: {
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      name?: string;
    }
  ) =>
    apiCall<WorkflowData>("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify({ prompt, existingWorkflow }),
    }),
  generateStream: async (
    prompt: string,
    onUpdate: (data: WorkflowData) => void,
    existingWorkflow?: {
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      name?: string;
    }
  ): Promise<WorkflowData> => {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, existingWorkflow }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: StreamState = {
      buffer: "",
      currentData: existingWorkflow
        ? {
            nodes: existingWorkflow.nodes || [],
            edges: existingWorkflow.edges || [],
            name: existingWorkflow.name,
          }
        : { nodes: [], edges: [] },
    };

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        processStreamChunk(value, decoder, onUpdate, state);
      }

      return state.currentData;
    } finally {
      reader.releaseLock();
    }
  },
};

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
  isVercelUser: boolean;
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
    apiCall<{ code: string; workflowName: string }>(
      `/api/workflows/${id}/code`
    ),

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

// Export all APIs as a single object
export const api = {
  artifact: artifactApi,
  ai: aiApi,
  aiGateway: aiGatewayApi,
  agentWorkflow: agentWorkflowApi,
  integration: integrationApi,
  user: userApi,
  workflow: workflowApi,
};
