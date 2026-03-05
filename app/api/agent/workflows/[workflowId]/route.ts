import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AGENT_SCOPES, authenticateAgentRequest } from "@/lib/agent-auth";
import { db } from "@/lib/db";
import { validateWorkflowIntegrations } from "@/lib/db/integrations";
import { workflows } from "@/lib/db/schema";
import { diffWorkflow } from "@/lib/workflow-diff";
import {
  normalizeWorkflowVisibility,
  serializeWorkflowDates,
} from "@/lib/workflow-route-utils";
import {
  broadcastBatch,
  type WorkflowOperation,
} from "@/lib/workflow-subscriptions";

type ApiError = {
  status: number;
  error: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWorkflowOperation(value: unknown): value is WorkflowOperation {
  if (!isRecord(value)) {
    return false;
  }
  const op = value.op;
  return (
    op === "addNode" ||
    op === "addEdge" ||
    op === "removeNode" ||
    op === "removeEdge" ||
    op === "updateNode" ||
    op === "updateEdge" ||
    op === "replaceAll"
  );
}

function isWorkflowOperationArray(
  value: unknown
): value is WorkflowOperation[] {
  return Array.isArray(value) && value.every(isWorkflowOperation);
}

function parseUiPayload(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseRequestBody(body: unknown): Record<string, unknown> | null {
  return isRecord(body) ? body : null;
}

function validateVisibilityValue(value: unknown): ApiError | null {
  if (value === undefined) {
    return null;
  }

  if (value === "private" || value === "public") {
    return null;
  }

  return {
    status: 400,
    error: "Invalid visibility value. Must be 'private' or 'public'",
  };
}

async function validatePatchBody(
  body: Record<string, unknown>,
  userId: string
): Promise<ApiError | null> {
  const visibilityError = validateVisibilityValue(body.visibility);
  if (visibilityError) {
    return visibilityError;
  }

  if (!Array.isArray(body.nodes)) {
    return null;
  }

  const validation = await validateWorkflowIntegrations(body.nodes, userId);
  if (validation.valid) {
    return null;
  }

  return {
    status: 403,
    error: "Invalid integration references in workflow",
  };
}

function buildPatchUpdateData(
  body: Record<string, unknown>
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof body.name === "string") {
    updateData.name = body.name;
  }

  if (typeof body.description === "string" || body.description === null) {
    updateData.description = body.description;
  }

  if (Array.isArray(body.nodes)) {
    updateData.nodes = body.nodes;
  }

  if (Array.isArray(body.edges)) {
    updateData.edges = body.edges.map((edge) => {
      if (isRecord(edge) && (!edge.type || edge.type === "default")) {
        return { ...edge, type: "animated" };
      }
      return edge;
    });
  }

  if (body.visibility !== undefined) {
    updateData.visibility = normalizeWorkflowVisibility(body.visibility);
  }

  if (body.uiSpec !== undefined) {
    updateData.uiSpec = parseUiPayload(body.uiSpec);
  }

  if (typeof body.uiSpecVersion === "string" || body.uiSpecVersion === null) {
    updateData.uiSpecVersion = body.uiSpecVersion;
  }

  if (body.uiMetadata !== undefined) {
    updateData.uiMetadata = parseUiPayload(body.uiMetadata);
  }

  return updateData;
}

function errorResponse({ error, status }: ApiError): NextResponse {
  return NextResponse.json({ error }, { status });
}

function normalizeEdgeType(
  edge: Record<string, unknown>
): Record<string, unknown> {
  const edgeType = edge.type;
  if (typeof edgeType !== "string" || edgeType === "default") {
    return { ...edge, type: "animated" };
  }
  return edge;
}

function normalizeOperationBatch(
  operations: WorkflowOperation[]
): WorkflowOperation[] {
  return operations.map((operation) => {
    if (
      operation.op === "addEdge" &&
      operation.edge &&
      typeof operation.edge === "object"
    ) {
      return {
        ...operation,
        edge: normalizeEdgeType(operation.edge as Record<string, unknown>),
      };
    }

    if (operation.op === "replaceAll" && Array.isArray(operation.edges)) {
      return {
        ...operation,
        edges: operation.edges.map((edge) => {
          if (isRecord(edge)) {
            return normalizeEdgeType(edge);
          }
          return edge;
        }),
      };
    }

    return operation;
  });
}

function maybeBroadcastWorkflowDiff(params: {
  workflowId: string;
  existingNodes: unknown[];
  existingEdges: unknown[];
  nextNodes: unknown;
  nextEdges: unknown;
}): void {
  const { workflowId, existingNodes, existingEdges, nextNodes, nextEdges } =
    params;

  if (!(Array.isArray(nextNodes) && Array.isArray(nextEdges))) {
    return;
  }

  const operations = diffWorkflow(
    existingNodes,
    existingEdges,
    nextNodes,
    nextEdges
  );
  if (operations.length > 0) {
    broadcastBatch(workflowId, operations);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
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

    const { workflowId } = await context.params;

    const workflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.id, workflowId),
        eq(workflows.userId, agentAuth.userId)
      ),
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeWorkflowDates(workflow));
  } catch (error) {
    console.error("Failed to get workflow with agent key:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get workflow",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
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

    const { workflowId } = await context.params;

    const existingWorkflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.id, workflowId),
        eq(workflows.userId, agentAuth.userId)
      ),
    });

    if (!existingWorkflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    const body = parseRequestBody(await request.json().catch(() => null));

    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Handle operations (broadcast only, no DB write)
    if (isWorkflowOperationArray(body.operations)) {
      const normalizedOperations = normalizeOperationBatch(body.operations);

      // Broadcast operations to subscribers
      broadcastBatch(workflowId, normalizedOperations);

      return NextResponse.json({
        success: true,
        message: "Operations broadcasted",
        operations: normalizedOperations,
      });
    }

    // Existing behavior: save full workflow to DB
    const validationError = await validatePatchBody(body, agentAuth.userId);
    if (validationError) {
      return errorResponse(validationError);
    }

    const updateData = buildPatchUpdateData(body);

    const [updatedWorkflow] = await db
      .update(workflows)
      .set(updateData)
      .where(eq(workflows.id, workflowId))
      .returning();

    if (!updatedWorkflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // Compute fine-grained operations by diffing old vs new workflow.
    // This lets the canvas animate individual add/remove/update operations
    // even when the agent sends the complete nodes/edges.
    maybeBroadcastWorkflowDiff({
      workflowId,
      existingNodes: existingWorkflow.nodes as unknown[],
      existingEdges: existingWorkflow.edges as unknown[],
      nextNodes: body.nodes,
      nextEdges: body.edges,
    });

    return NextResponse.json(serializeWorkflowDates(updatedWorkflow));
  } catch (error) {
    console.error("Failed to update workflow with agent key:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update workflow",
      },
      { status: 500 }
    );
  }
}
