import { streamText } from "ai";
import { NextResponse } from "next/server";
import { AGENT_SCOPES, authenticateAgentRequest } from "@/lib/agent-auth";
import {
  buildWorkflowSystemPrompt,
  buildWorkflowUserPrompt,
  createWorkflowOperationStream,
  type ExistingWorkflowForPrompt,
} from "@/lib/workflow-composer/compose-workflow";
import { generateAIActionPrompts } from "@/plugins";

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

    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const existingWorkflow = body.existingWorkflow as
      | ExistingWorkflowForPrompt
      | undefined;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "AI API key not configured on server. Please contact support.",
        },
        { status: 500 }
      );
    }

    const requestedModel =
      typeof body.model === "string" ? body.model.trim() : "";
    const configuredModel = process.env.AI_GENERATION_MODEL?.trim();
    const systemPrompt = buildWorkflowSystemPrompt(generateAIActionPrompts());
    const userPrompt = buildWorkflowUserPrompt({
      prompt,
      existingWorkflow,
    });

    const result = streamText({
      model:
        requestedModel ||
        (configuredModel && configuredModel.length > 0
          ? configuredModel
          : "openai/gpt-5.1-instant"),
      system: systemPrompt,
      prompt: userPrompt,
    });

    return new Response(createWorkflowOperationStream(result.textStream), {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Failed to compose workflow with agent key:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to compose workflow",
      },
      { status: 500 }
    );
  }
}
