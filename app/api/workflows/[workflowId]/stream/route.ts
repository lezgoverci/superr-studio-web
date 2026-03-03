import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import {
  subscribe,
  type WorkflowOperation,
} from "@/lib/workflow-subscriptions";

function encodeSseOperation(operation: WorkflowOperation): Uint8Array {
  const encoder = new TextEncoder();
  const lines = [`data: ${JSON.stringify(operation)}`, ""];
  return encoder.encode(`${lines.join("\n")}\n`);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workflowId } = await context.params;

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

    const stream = new ReadableStream({
      start(controller) {
        console.log(
          "[Workflow Stream] Client connected for workflow:",
          workflowId
        );

        // Send initial replaceAll with current DB state
        const sendCurrentState = async () => {
          const currentWorkflow = await db.query.workflows.findFirst({
            where: and(
              eq(workflows.id, workflowId),
              eq(workflows.userId, session.user.id)
            ),
          });

          if (currentWorkflow) {
            const operation: WorkflowOperation = {
              op: "replaceAll",
              nodes: currentWorkflow.nodes as unknown[],
              edges: currentWorkflow.edges as unknown[],
            };
            console.log(
              "[Workflow Stream] Sending current state, nodes:",
              currentWorkflow.nodes.length,
              "edges:",
              currentWorkflow.edges.length
            );
            controller.enqueue(encodeSseOperation(operation));
          }
        };

        sendCurrentState().catch((error) => {
          console.error(
            "[Workflow Stream] Failed to send current state:",
            error
          );
        });

        const unsubscribe = subscribe(workflowId, (operation) => {
          try {
            console.log("[Workflow Stream] Sending operation:", operation.op);
            controller.enqueue(encodeSseOperation(operation));
          } catch (error) {
            console.error("Failed to encode operation:", error);
          }
        });

        request.signal.addEventListener(
          "abort",
          () => {
            unsubscribe();
            controller.close();
          },
          { once: true }
        );
      },
      cancel() {
        // No cleanup needed for in-memory subscription
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    console.error("Failed to open workflow stream:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to open workflow stream",
      },
      { status: 500 }
    );
  }
}
