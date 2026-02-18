import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workflowExecutions } from "@/lib/db/schema";
import {
  EXECUTION_STATUS_STREAM_NAMESPACE,
  isWorkflowStatusStreamEvent,
  type WorkflowStatusStreamEvent,
} from "@/lib/workflow-status-stream";

function parseStartIndex(value: string | null): number | undefined {
  if (!value) {
    return;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return;
  }

  return parsed;
}

function resolveStartIndex(request: Request): number | undefined {
  const url = new URL(request.url);
  const queryStartIndex = parseStartIndex(url.searchParams.get("startIndex"));
  if (queryStartIndex !== undefined) {
    return queryStartIndex;
  }

  const lastEventId = parseStartIndex(request.headers.get("last-event-id"));
  if (lastEventId !== undefined) {
    return lastEventId + 1;
  }

  return;
}

function encodeSseFrame(input: {
  id: number;
  payload: WorkflowStatusStreamEvent | unknown;
}): Uint8Array {
  const encoder = new TextEncoder();
  const payload = input.payload === undefined ? null : input.payload;
  const lines = [`id: ${input.id}`];

  if (isWorkflowStatusStreamEvent(payload)) {
    lines.push(`event: ${payload.type}`);
  }

  lines.push(`data: ${JSON.stringify(payload)}`, "");
  return encoder.encode(`${lines.join("\n")}\n`);
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "ResponseAborted")
  );
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<WorkflowStatusStreamEvent>,
  reason: string
): Promise<void> {
  await reader.cancel().catch((error) => {
    if (!isAbortLikeError(error)) {
      console.error(
        `[Execution Stream] Failed to cancel reader: ${reason}`,
        error
      );
    }
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ executionId: string }> }
) {
  try {
    const { executionId } = await context.params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
      with: {
        workflow: true,
      },
    });

    if (!execution) {
      return NextResponse.json(
        { error: "Execution not found" },
        { status: 404 }
      );
    }

    if (execution.workflow.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!execution.workflowRunId) {
      return NextResponse.json(
        {
          error:
            "This execution does not have a workflow run stream. It may be a legacy execution.",
        },
        { status: 409 }
      );
    }

    const startIndex = resolveStartIndex(request);
    const run = getRun(execution.workflowRunId);
    const readable = run.getReadable<WorkflowStatusStreamEvent>({
      namespace: EXECUTION_STATUS_STREAM_NAMESPACE,
      startIndex,
    });
    const reader = readable.getReader();
    let eventIndex = startIndex ?? 0;

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const handleAbort = () => {
          cancelReader(reader, "client disconnected").catch((error) => {
            console.error(
              "[Execution Stream] Unexpected error while cancelling reader:",
              error
            );
          });
          controller.close();
        };

        request.signal.addEventListener("abort", handleAbort, { once: true });

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            controller.enqueue(
              encodeSseFrame({
                id: eventIndex,
                payload: value,
              })
            );
            eventIndex += 1;
          }

          controller.close();
        } catch (error) {
          if (!request.signal.aborted) {
            console.error(
              "[Execution Stream] Failed to read workflow status stream:",
              error
            );
          }
          controller.close();
        } finally {
          request.signal.removeEventListener("abort", handleAbort);
          reader.releaseLock();
        }
      },
      cancel: async () => {
        await cancelReader(reader, "client cancelled stream");
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
    console.error("Failed to open execution status stream:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to open execution status stream",
      },
      { status: 500 }
    );
  }
}
