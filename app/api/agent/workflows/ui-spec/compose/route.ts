import { streamText } from "ai";
import { NextResponse } from "next/server";
import { AGENT_SCOPES, authenticateAgentRequest } from "@/lib/agent-auth";
import { workflowRunCatalog } from "@/lib/workflow-run/catalog";

const FENCED_JSON_PREFIX_PATTERN = /^```json\s*/i;
const FENCED_PREFIX_PATTERN = /^```\s*/i;
const FENCED_SUFFIX_PATTERN = /```$/i;

type ComposeUiSpecRequest = {
  prompt: string;
  requestedModel: string;
  workflowSummary: string;
  currentSpec: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseComposeRequestBody(body: unknown): ComposeUiSpecRequest {
  if (!body || typeof body !== "object") {
    return {
      prompt: "",
      requestedModel: "",
      workflowSummary: "",
      currentSpec: null,
    };
  }

  const payload = body as Record<string, unknown>;
  return {
    prompt: asTrimmedString(payload.prompt),
    requestedModel: asTrimmedString(payload.model),
    workflowSummary: asTrimmedString(payload.workflowSummary),
    currentSpec: payload.currentSpec ?? null,
  };
}

function resolveModel(requestedModel: string): string {
  if (requestedModel) {
    return requestedModel;
  }

  if (process.env.AI_GENERATION_MODEL?.trim()) {
    return process.env.AI_GENERATION_MODEL.trim();
  }

  return "openai/gpt-5.1-instant";
}

function getConfiguredAiKey(): string | null {
  return process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || null;
}

function buildUserPrompt({
  prompt,
  workflowSummary,
  currentSpec,
}: Pick<
  ComposeUiSpecRequest,
  "prompt" | "workflowSummary" | "currentSpec"
>): string {
  return [
    "Generate a json-render spec for a workflow run form.",
    workflowSummary ? `Workflow summary:\n${workflowSummary}` : "",
    `Task:\n${prompt}`,
    currentSpec
      ? `Current spec (update in-place if possible):\n${JSON.stringify(currentSpec, null, 2)}`
      : "",
    "Output ONLY a JSON object representing the final spec.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectCharPositions(text: string, target: "{" | "}"): number[] {
  const positions: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === target) {
      positions.push(i);
    }
  }
  return positions;
}

function parseFirstJsonObject(text: string): unknown {
  const starts = collectCharPositions(text, "{");
  const ends = collectCharPositions(text, "}");

  for (const start of starts) {
    for (let i = ends.length - 1; i >= 0; i -= 1) {
      const end = ends[i];
      if (end <= start) {
        continue;
      }

      const parsed = tryParseJson(text.slice(start, end + 1));
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  throw new Error("Model did not return valid JSON.");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const directCandidates = [
    trimmed,
    trimmed
      .replace(FENCED_JSON_PREFIX_PATTERN, "")
      .replace(FENCED_PREFIX_PATTERN, "")
      .replace(FENCED_SUFFIX_PATTERN, "")
      .trim(),
  ];

  for (const candidate of directCandidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return parseFirstJsonObject(trimmed);
}

function isSpecLike(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.root === "string" &&
    candidate.elements !== null &&
    typeof candidate.elements === "object" &&
    !Array.isArray(candidate.elements)
  );
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

    const body = await request.json().catch(() => null);
    const parsedBody = parseComposeRequestBody(body);

    if (!parsedBody.prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = getConfiguredAiKey();

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "AI API key not configured on server. Please contact support.",
        },
        { status: 500 }
      );
    }

    const model = resolveModel(parsedBody.requestedModel);

    const basePrompt = workflowRunCatalog.prompt();
    const userPrompt = buildUserPrompt(parsedBody);

    const result = streamText({
      model,
      system: basePrompt,
      prompt: userPrompt,
      temperature: 0.2,
    });

    const text = await result.text;
    const specCandidate = extractJson(text);

    if (!isSpecLike(specCandidate)) {
      return NextResponse.json(
        { error: "Generated output is not a valid spec object." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      spec: specCandidate,
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
