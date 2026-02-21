import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createOpencode } from "ai-sdk-provider-opencode-sdk";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createBasicAuthHeader,
  DEFAULT_OPENCODE_USERNAME,
  normalizeOpencodeBaseUrl,
  parseOpencodeUrl,
  parsePromptModel,
} from "@/lib/opencode-server-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
  messages?: UIMessage[];
  opencodeUrl?: string;
  opencodeToken?: string;
  opencodeUsername?: string;
  sessionId?: string;
};

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
    const opencodeUrl = body.opencodeUrl?.trim() ?? "";
    const opencodeToken = body.opencodeToken?.trim() ?? "";

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    if (!(opencodeUrl && opencodeToken)) {
      return NextResponse.json(
        { error: "OpenCode URL and token are required." },
        { status: 400 }
      );
    }

    const parsedUrl = parseOpencodeUrl(opencodeUrl);
    if (!parsedUrl) {
      return NextResponse.json(
        {
          error:
            "Invalid OpenCode URL. Use HTTPS for remote hosts or HTTP only for localhost/127.0.0.1/::1.",
        },
        { status: 400 }
      );
    }

    const model = getModelOrError();
    if (model instanceof Response) {
      return model;
    }

    const normalizedUsername =
      body.opencodeUsername?.trim() || DEFAULT_OPENCODE_USERNAME;
    const provider = createOpencode({
      autoStartServer: false,
      baseUrl: normalizeOpencodeBaseUrl(parsedUrl),
      clientOptions: {
        headers: {
          Authorization: createBasicAuthHeader(
            opencodeToken,
            normalizedUsername
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
