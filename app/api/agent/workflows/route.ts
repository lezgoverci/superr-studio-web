import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AGENT_SCOPES, authenticateAgentRequest } from "@/lib/agent-auth";
import { db } from "@/lib/db";
import { validateWorkflowIntegrations } from "@/lib/db/integrations";
import { workflows } from "@/lib/db/schema";
import { generateId } from "@/lib/utils/id";
import { getWhopAccessGuardResponse } from "@/lib/whop-access-guard";
import {
  createDefaultTriggerNode,
  normalizeWorkflowVisibility,
  serializeWorkflowDates,
} from "@/lib/workflow-route-utils";

type WorkflowNodeForValidation = {
  data?: {
    config?: {
      integrationId?: string;
    };
  };
};

type CreateWorkflowPayload = {
  name: string;
  nodes: WorkflowNodeForValidation[] | null;
  edges: Record<string, unknown>[] | null;
  description: string | null;
  visibility: "private" | "public";
  uiSpec: Record<string, unknown> | null;
  uiSpecVersion: string | null;
  uiMetadata: Record<string, unknown> | null;
};

type CompleteCreateWorkflowPayload = Omit<
  CreateWorkflowPayload,
  "nodes" | "edges"
> & {
  nodes: WorkflowNodeForValidation[];
  edges: Record<string, unknown>[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseObjectPayload(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseCreateWorkflowPayload(body: unknown): CreateWorkflowPayload {
  const payload = isRecord(body) ? body : {};

  return {
    name: asTrimmedString(payload.name),
    nodes: Array.isArray(payload.nodes)
      ? (payload.nodes as WorkflowNodeForValidation[])
      : null,
    edges: Array.isArray(payload.edges)
      ? (payload.edges as Record<string, unknown>[])
      : null,
    description:
      typeof payload.description === "string" ? payload.description : null,
    visibility: normalizeWorkflowVisibility(payload.visibility),
    uiSpec: parseObjectPayload(payload.uiSpec),
    uiSpecVersion:
      typeof payload.uiSpecVersion === "string" ? payload.uiSpecVersion : null,
    uiMetadata: parseObjectPayload(payload.uiMetadata),
  };
}

function hasRequiredCreateFields(
  payload: CreateWorkflowPayload
): payload is CompleteCreateWorkflowPayload {
  return (
    payload.name.length > 0 && payload.nodes !== null && payload.edges !== null
  );
}

async function resolveWorkflowName(
  userId: string,
  requestedName: string
): Promise<string> {
  if (requestedName !== "Untitled Workflow") {
    return requestedName;
  }

  const userWorkflows = await db.query.workflows.findMany({
    where: eq(workflows.userId, userId),
  });

  return `Untitled ${userWorkflows.length + 1}`;
}

export async function POST(request: Request) {
  try {
    const agentAuth = await authenticateAgentRequest(request, [
      AGENT_SCOPES.workflowWrite,
    ]);

    if (!agentAuth.ok) {
      return NextResponse.json(
        { error: agentAuth.error },
        { status: agentAuth.status }
      );
    }

    const whopAccessGuard = await getWhopAccessGuardResponse(agentAuth.userId);
    if (whopAccessGuard) {
      return whopAccessGuard;
    }

    const body = await request.json().catch(() => null);
    const payload = parseCreateWorkflowPayload(body);

    if (!hasRequiredCreateFields(payload)) {
      return NextResponse.json(
        { error: "Name, nodes, and edges are required" },
        { status: 400 }
      );
    }

    const validation = await validateWorkflowIntegrations(
      payload.nodes,
      agentAuth.userId
    );
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid integration references in workflow" },
        { status: 403 }
      );
    }

    const normalizedNodes =
      payload.nodes.length > 0 ? payload.nodes : [createDefaultTriggerNode()];
    const workflowName = await resolveWorkflowName(
      agentAuth.userId,
      payload.name
    );

    const workflowId = generateId();

    const [newWorkflow] = await db
      .insert(workflows)
      .values({
        id: workflowId,
        name: workflowName,
        description: payload.description,
        nodes: normalizedNodes,
        edges: payload.edges,
        userId: agentAuth.userId,
        visibility: payload.visibility,
        uiSpec: payload.uiSpec,
        uiSpecVersion: payload.uiSpecVersion,
        uiMetadata: payload.uiMetadata,
      })
      .returning();

    return NextResponse.json(serializeWorkflowDates(newWorkflow));
  } catch (error) {
    console.error("Failed to create workflow with agent key:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create workflow",
      },
      { status: 500 }
    );
  }
}
