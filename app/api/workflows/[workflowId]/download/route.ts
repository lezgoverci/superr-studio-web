import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { buildExportPayload } from "@/lib/workflow-export-utils";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await context.params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.id, workflowId),
        eq(workflows.userId, session.user.id)
      ),
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    const exportPayload = await buildExportPayload({
      name: workflow.name,
      nodes: workflow.nodes as WorkflowNode[],
      edges: workflow.edges as WorkflowEdge[],
    });

    return NextResponse.json({
      success: true,
      files: exportPayload.files,
      warnings: exportPayload.diagnostics.warnings,
      unsupportedActions: exportPayload.diagnostics.unsupportedActions,
      missingTemplates: exportPayload.diagnostics.missingTemplates,
    });
  } catch (error) {
    console.error("Failed to prepare workflow download:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to prepare workflow download",
      },
      { status: 500 }
    );
  }
}
