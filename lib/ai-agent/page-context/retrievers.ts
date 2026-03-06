import type {
  AiAgentContextResolveInput,
  AiAgentContextRetriever,
  AiAgentPageContextSeed,
} from "@/lib/ai-agent/page-context/types";

const WORKFLOW_EDITOR_ROUTE_REGEX = /^\/app\/workflows\/([^/]+)$/;

function createWorkflowEditorContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  const match = input.pathname.match(WORKFLOW_EDITOR_ROUTE_REGEX);
  const workflowId = match?.[1];
  if (!workflowId) {
    return null;
  }

  const tab = input.searchParams?.get("tab")?.trim();

  return {
    pageType: "workflow-editor",
    route: "/app/workflows/[workflowId]",
    entities: {
      workflowId,
      ...(tab ? { tab } : {}),
    },
    capabilities: [
      "edit-workflow",
      "run-workflow",
      "inspect-canvas",
      "configure-steps",
    ],
    summary: `Working inside workflow editor for workflow ${workflowId}.`,
  };
}

function createWorkflowsContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  if (input.pathname === "/app/workflows/new") {
    return {
      pageType: "workflows",
      route: "/app/workflows/new",
      contextKey: "workflow:new",
      entities: {
        workflowDraft: "new",
      },
      capabilities: ["create-workflow", "open-existing-workflows"],
      summary: "Creating a new workflow.",
    };
  }

  if (input.pathname !== "/app/workflows") {
    return null;
  }

  return {
    pageType: "workflows",
    route: "/app/workflows",
    capabilities: ["browse-workflows", "open-workflow", "create-workflow"],
    summary: "Browsing workflows.",
  };
}

function createSessionsContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  if (input.pathname !== "/app/sessions") {
    return null;
  }

  return {
    pageType: "sessions",
    route: "/app/sessions",
    capabilities: ["review-sessions", "reopen-session-in-workflow"],
    summary: "Reviewing OpenCode conversation sessions.",
  };
}

function createDashboardContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  if (input.pathname !== "/app") {
    return null;
  }

  return {
    pageType: "dashboard",
    route: "/app",
    capabilities: ["navigate-workspace", "start-new-workflow"],
    summary: "Viewing workspace dashboard.",
  };
}

function createSettingsContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  if (input.pathname !== "/app/settings") {
    return null;
  }

  return {
    pageType: "settings",
    route: "/app/settings",
    capabilities: ["manage-preferences", "manage-connections"],
    summary: "Viewing settings.",
  };
}

function createLibraryContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  if (input.pathname !== "/app/library") {
    return null;
  }

  return {
    pageType: "library",
    route: "/app/library",
    capabilities: ["browse-artifacts", "publish-artifacts"],
    summary: "Browsing artifact library.",
  };
}

function createAgentContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  if (input.pathname !== "/app/agent") {
    return null;
  }

  return {
    pageType: "agent",
    route: "/app/agent",
    capabilities: ["full-agent-chat", "manage-sessions"],
    summary: "Using AI Agent full-page chat.",
  };
}

function createBuildNodeContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  if (input.pathname !== "/app/build-node") {
    return null;
  }

  const customNodeId = input.searchParams?.get("customNodeId")?.trim();
  const workflowId = input.searchParams?.get("workflowId")?.trim();

  return {
    pageType: "build-node",
    route: "/app/build-node",
    capabilities: [
      "build-custom-node",
      "generate-custom-node-code",
      "edit-custom-node",
    ],
    entities: {
      ...(customNodeId ? { customNodeId } : {}),
      ...(workflowId ? { workflowId } : {}),
    },
    summary: customNodeId
      ? `Building custom node ${customNodeId}.`
      : "Building a reusable custom node.",
  };
}

function createFallbackContext(
  input: AiAgentContextResolveInput
): AiAgentPageContextSeed | null {
  if (!input.pathname.startsWith("/app")) {
    return null;
  }

  return {
    pageType: "unknown",
    route: input.pathname,
    capabilities: ["chat-assistance"],
    summary: `Working in app route ${input.pathname}.`,
  };
}

export const AI_AGENT_CONTEXT_RETRIEVERS: AiAgentContextRetriever[] = [
  createWorkflowEditorContext,
  createWorkflowsContext,
  createSessionsContext,
  createDashboardContext,
  createSettingsContext,
  createLibraryContext,
  createAgentContext,
  createBuildNodeContext,
  createFallbackContext,
];
