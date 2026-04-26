import { NextResponse } from "next/server";
import { AGENT_SCOPES, authenticateAgentRequest } from "@/lib/agent-auth";
import { getWhopAccessGuardResponse } from "@/lib/whop-access-guard";
import { composeWorkflowUiSpec } from "@/lib/workflow-ui-spec/compose";

type ComposeUiSpecBody = {
  prompt: string;
  model: string;
  workflowSummary: string;
  currentSpec: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseComposeBody(body: unknown): ComposeUiSpecBody {
  if (!body || typeof body !== "object") {
    return {
      prompt: "",
      model: "",
      workflowSummary: "",
      currentSpec: null,
    };
  }

  const payload = body as Record<string, unknown>;
  return {
    prompt: asTrimmedString(payload.prompt),
    model: asTrimmedString(payload.model),
    workflowSummary: asTrimmedString(payload.workflowSummary),
    currentSpec: payload.currentSpec ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const agentAuth = await authenticateAgentRequest(request, [
      AGENT_SCOPES.workflowCompose,
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

    const parsedBody = parseComposeBody(await request.json().catch(() => null));

    if (!parsedBody.prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const composed = await composeWorkflowUiSpec({
      prompt: parsedBody.prompt,
      workflowSummary: parsedBody.workflowSummary,
      currentSpec: parsedBody.currentSpec,
      model: parsedBody.model,
    });

    return NextResponse.json({
      spec: composed.spec,
      modelUsed: composed.modelUsed,
    });
  } catch (error) {
    console.error("Failed to compose workflow UI spec:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to compose UI spec",
      },
      { status: 500 }
    );
  }
}
