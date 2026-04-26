import { NextResponse } from "next/server";
import { AGENT_SCOPES, authenticateAgentRequest } from "@/lib/agent-auth";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { generateId } from "@/lib/utils/id";
import { getWhopAccessGuardResponse } from "@/lib/whop-access-guard";
import { serializeWorkflowDates } from "@/lib/workflow-route-utils";
import { AgentComposeWorkflowSchema } from "@/lib/workflow-schema";

export async function POST(request: Request) {
  try {
    const agentAuth = await authenticateAgentRequest(request, [
      AGENT_SCOPES.workflowCompose,
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

    const rawBody = await request.json().catch(() => null);
    const parsed = AgentComposeWorkflowSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, description, nodes, edges } = parsed.data;
    const workflowId = generateId();

    const coercedEdges = edges.map((edge) => {
      if (!edge.type || edge.type === "default") {
        return { ...edge, type: "animated" };
      }
      return edge;
    });

    const [newWorkflow] = await db
      .insert(workflows)
      .values({
        id: workflowId,
        name,
        description,
        nodes,
        edges: coercedEdges,
        userId: agentAuth.userId,
        visibility: "private",
      })
      .returning();

    return NextResponse.json(serializeWorkflowDates(newWorkflow));
  } catch (error) {
    console.error("Failed to save agent-generated workflow:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save workflow",
      },
      { status: 500 }
    );
  }
}
