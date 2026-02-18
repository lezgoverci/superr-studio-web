import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { AGENT_SCOPES, authenticateAgentRequest } from "@/lib/agent-auth";
import { db } from "@/lib/db";
import { validateWorkflowIntegrations } from "@/lib/db/integrations";
import { workflowExecutions, workflows } from "@/lib/db/schema";
import { executeWorkflow } from "@/lib/workflow-executor.workflow";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";

// biome-ignore lint/nursery/useMaxParams: Background execution requires all workflow context.
async function executeWorkflowBackground(
  executionId: string,
  workflowId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  input: Record<string, unknown>
): Promise<string> {
  try {
    const run = await start(executeWorkflow, [
      {
        nodes,
        edges,
        triggerInput: input,
        executionId,
        workflowId,
      },
    ]);

    await db
      .update(workflowExecutions)
      .set({
        workflowRunId: run.runId,
      })
      .where(eq(workflowExecutions.id, executionId));

    return run.runId;
  } catch (error) {
    console.error("[Agent Workflow Execute] Error during execution:", error);

    await db
      .update(workflowExecutions)
      .set({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      })
      .where(eq(workflowExecutions.id, executionId));
    throw error;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const agentAuth = await authenticateAgentRequest(request, [
      AGENT_SCOPES.workflowExecute,
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

    const validation = await validateWorkflowIntegrations(
      workflow.nodes as WorkflowNode[],
      agentAuth.userId
    );

    if (!validation.valid) {
      return NextResponse.json(
        { error: "Workflow contains invalid integration references" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const input =
      body.input && typeof body.input === "object"
        ? (body.input as Record<string, unknown>)
        : {};

    const [execution] = await db
      .insert(workflowExecutions)
      .values({
        workflowId,
        userId: agentAuth.userId,
        status: "running",
        input,
      })
      .returning();

    const workflowRunId = await executeWorkflowBackground(
      execution.id,
      workflowId,
      workflow.nodes as WorkflowNode[],
      workflow.edges as WorkflowEdge[],
      input
    );

    return NextResponse.json({
      executionId: execution.id,
      workflowRunId,
      status: "running",
    });
  } catch (error) {
    console.error("Failed to execute workflow with agent key:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to execute workflow",
      },
      { status: 500 }
    );
  }
}
