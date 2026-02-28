import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createOpencode } from "ai-sdk-provider-opencode-sdk";
import { NextResponse } from "next/server";
import type { AiAgentContextEnvelope } from "@/lib/ai-agent/page-context/types";
import { auth } from "@/lib/auth";
import { getResolvedOpencodeConnectionForUser } from "@/lib/db/opencode-connections";
import {
  createBasicAuthHeader,
  normalizeOpencodeBaseUrl,
  parseOpencodeUrl,
  parsePromptModel,
} from "@/lib/opencode-server-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
  messages?: UIMessage[];
  sessionId?: string;
  pageContext?: unknown;
};

const MAX_CONTEXT_ENTRIES = 12;
const MAX_CONTEXT_VALUE_LENGTH = 200;
const MAX_CONTEXT_PAYLOAD_BYTES = 3500;
const SECRET_KEY_REGEX = /(token|secret|password|api[-_]?key|authorization)/i;

function parseRequestBody(body: unknown): ChatRequestBody {
  if (!body || typeof body !== "object") {
    return {};
  }
  return body as ChatRequestBody;
}

function getModelOrError(): { providerID: string; modelID: string } | Response {
  const configuredModel = parsePromptModel(process.env.OPENCODE_CHAT_MODEL);
  if (configuredModel) {
    return configuredModel;
  }

  return NextResponse.json(
    {
      error:
        "OPENCODE_CHAT_MODEL is required and must be in provider/model format (for example: anthropic/claude-sonnet-4-5).",
    },
    { status: 500 }
  );
}

function sanitizeContextMap(raw: unknown): Record<string, string> {
  if (!(raw && typeof raw === "object")) {
    return {};
  }

  const resultEntries: [string, string][] = [];

  for (const [rawKey, rawValue] of Object.entries(
    raw as Record<string, unknown>
  )) {
    const key = rawKey.trim();
    if (!(key && !SECRET_KEY_REGEX.test(key))) {
      continue;
    }

    if (
      !(
        typeof rawValue === "string" ||
        typeof rawValue === "number" ||
        typeof rawValue === "boolean" ||
        rawValue === null
      )
    ) {
      continue;
    }

    const value = String(rawValue).trim().slice(0, MAX_CONTEXT_VALUE_LENGTH);
    if (!value) {
      continue;
    }

    resultEntries.push([key.slice(0, 64), value]);
    if (resultEntries.length >= MAX_CONTEXT_ENTRIES) {
      break;
    }
  }

  return Object.fromEntries(resultEntries);
}

function sanitizeContextCapabilities(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const values = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }

    const normalized = entry.trim().slice(0, 80);
    if (!(normalized && !SECRET_KEY_REGEX.test(normalized))) {
      continue;
    }

    values.add(normalized);
    if (values.size >= MAX_CONTEXT_ENTRIES) {
      break;
    }
  }

  return [...values];
}

function sanitizePageContext(raw: unknown): AiAgentContextEnvelope | null {
  if (!(raw && typeof raw === "object")) {
    return null;
  }

  const input = raw as Partial<AiAgentContextEnvelope>;
  if (!(input.contextVersion === 1 && typeof input.contextKey === "string")) {
    return null;
  }

  if (
    !(
      typeof input.pageType === "string" &&
      typeof input.route === "string" &&
      typeof input.summary === "string"
    )
  ) {
    return null;
  }

  const sanitizedContext: AiAgentContextEnvelope = {
    contextVersion: 1,
    contextKey: input.contextKey.trim().slice(0, 80),
    pageType: input.pageType
      .trim()
      .slice(0, 40) as AiAgentContextEnvelope["pageType"],
    route: input.route.trim().slice(0, 180),
    summary: input.summary.trim().slice(0, 280),
    entities: sanitizeContextMap(input.entities),
    capabilities: sanitizeContextCapabilities(input.capabilities),
    ...(input.metadata ? { metadata: sanitizeContextMap(input.metadata) } : {}),
  };

  if (
    !(
      sanitizedContext.contextKey &&
      sanitizedContext.pageType &&
      sanitizedContext.route &&
      sanitizedContext.summary
    )
  ) {
    return null;
  }

  let payloadSize = JSON.stringify(sanitizedContext).length;
  if (payloadSize <= MAX_CONTEXT_PAYLOAD_BYTES) {
    return sanitizedContext;
  }

  const minimizedContext: AiAgentContextEnvelope = {
    ...sanitizedContext,
    metadata: undefined,
    entities: Object.fromEntries(
      Object.entries(sanitizedContext.entities).slice(0, 6)
    ),
    capabilities: sanitizedContext.capabilities.slice(0, 6),
    summary: sanitizedContext.summary.slice(0, 160),
  };
  payloadSize = JSON.stringify(minimizedContext).length;
  if (payloadSize <= MAX_CONTEXT_PAYLOAD_BYTES) {
    return minimizedContext;
  }

  return {
    ...minimizedContext,
    summary: minimizedContext.summary.slice(0, 120),
    entities: Object.fromEntries(
      Object.entries(minimizedContext.entities).slice(0, 4)
    ),
  };
}

function buildPageContextSystemPrompt(
  pageContext: AiAgentContextEnvelope | null
): string | undefined {
  if (!pageContext) {
    return;
  }

  const entityEntries = Object.entries(pageContext.entities);
  const metadataEntries = Object.entries(pageContext.metadata ?? {});
  const capabilityList = pageContext.capabilities.join(", ");

  const contextLines = [
    "You are assisting inside the Superr app.",
    "Current page context:",
    `- Context key: ${pageContext.contextKey}`,
    `- Page type: ${pageContext.pageType}`,
    `- Route: ${pageContext.route}`,
    `- Summary: ${pageContext.summary}`,
  ];

  if (entityEntries.length > 0) {
    contextLines.push(
      `- Entities: ${entityEntries
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`
    );
  }

  if (capabilityList) {
    contextLines.push(`- Available capabilities: ${capabilityList}`);
  }

  if (metadataEntries.length > 0) {
    contextLines.push(
      `- Metadata: ${metadataEntries
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`
    );
  }

  contextLines.push(
    "Use this context to make answers relevant. If user intent conflicts with context, ask a clarification question."
  );

  return contextLines.join("\n");
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    const body = parseRequestBody(rawBody);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const pageContext = sanitizePageContext(body.pageContext);
    const pageContextPrompt = buildPageContextSystemPrompt(pageContext);

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    const connection = await getResolvedOpencodeConnectionForUser(
      session.user.id
    );

    if (!connection) {
      return NextResponse.json(
        {
          error:
            "Agent server is not configured. Open Settings > AI Agent to add your OpenCode server.",
        },
        { status: 400 }
      );
    }

    const parsedUrl = parseOpencodeUrl(connection.url);
    if (!parsedUrl) {
      return NextResponse.json(
        {
          error:
            "Invalid Agent URL. Use HTTPS for remote hosts or HTTP only for localhost/127.0.0.1/::1.",
        },
        { status: 400 }
      );
    }

    const model = getModelOrError();
    if (model instanceof Response) {
      return model;
    }

    const provider = createOpencode({
      autoStartServer: false,
      baseUrl: normalizeOpencodeBaseUrl(parsedUrl),
      clientOptions: {
        headers: {
          Authorization: createBasicAuthHeader(
            connection.password,
            connection.username
          ),
        },
      },
    });

    const modelId = `${model.providerID}/${model.modelID}`;
    const languageModel = provider(
      modelId,
      body.sessionId?.trim() ? { sessionId: body.sessionId.trim() } : undefined
    );

    const messagesWithoutId = messages.map((message) => {
      const { id: _id, ...rest } = message;
      return rest;
    });

    const result = streamText({
      model: languageModel,
      ...(pageContextPrompt ? { system: pageContextPrompt } : {}),
      messages: await convertToModelMessages(messagesWithoutId),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to stream chat",
      },
      { status: 500 }
    );
  }
}
