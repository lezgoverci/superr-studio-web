import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import {
  buildWorkflowSummary,
  composeWorkflowUiSpec,
  DEFAULT_UI_SPEC_PROMPT,
} from "@/lib/workflow-ui-spec/compose";

type ComposeUiSpecBody = {
  prompt: string;
  model: string;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBody(value: unknown): ComposeUiSpecBody {
  if (!value || typeof value !== "object") {
    return { prompt: "", model: "" };
  }

  const payload = value as Record<string, unknown>;
  return {
    prompt: asTrimmedString(payload.prompt),
    model: asTrimmedString(payload.model),
  };
}

function resolvePrompt(bodyPrompt: string): string {
  return bodyPrompt || DEFAULT_UI_SPEC_PROMPT;
}

function isValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("valid spec object");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

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

    const body = parseBody(await request.json().catch(() => null));
    const prompt = resolvePrompt(body.prompt);
    const workflowSummary = buildWorkflowSummary({
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes,
      edges: workflow.edges,
    });

    const composed = await composeWorkflowUiSpec({
      prompt,
      workflowSummary,
      currentSpec: workflow.uiSpec,
      model: body.model,
    });

    await db
      .update(workflows)
      .set({
        uiSpec: composed.spec,
        uiSpecVersion: "1",
        uiMetadata: {
          generatedBy: "canvas",
          generatedAt: new Date().toISOString(),
          model: composed.modelUsed,
        },
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    return NextResponse.json({
      workflowId,
      spec: composed.spec,
      modelUsed: composed.modelUsed,
      runUrl: `/workflows/${workflowId}/run`,
    });
  } catch (error) {
    console.error("Failed to compose workflow UI spec:", error);
    const message =
      error instanceof Error ? error.message : "Failed to compose UI spec";

    return NextResponse.json(
      {
        error: message,
      },
      { status: isValidationError(error) ? 422 : 500 }
    );
  }
}
