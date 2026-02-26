import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createBasicAuthHeader,
  DEFAULT_OPENCODE_USERNAME,
  parseOpencodeUrl,
  parsePromptModel,
} from "@/lib/opencode-server-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRAILING_SLASH_REGEX = /\/+$/;
const MULTIPLE_SLASH_REGEX = /\/+/g;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const JSON_CONTENT_TYPE = "application/json";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function isSessionPromptRoute(pathSegments: string[]): boolean {
  if (pathSegments.length < 3 || pathSegments[0] !== "session") {
    return false;
  }
  const sessionAction = pathSegments[2];
  return (
    sessionAction === "message" ||
    sessionAction === "prompt" ||
    sessionAction === "prompt_async"
  );
}

function maybeInjectPromptModel(
  request: Request,
  pathSegments: string[],
  body: ArrayBuffer | undefined
): BodyInit | undefined {
  if (!(body && isSessionPromptRoute(pathSegments))) {
    return body;
  }

  const configuredModel = parsePromptModel(process.env.OPENCODE_CHAT_MODEL);
  if (!configuredModel) {
    return body;
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes(JSON_CONTENT_TYPE)) {
    return body;
  }

  try {
    const rawBody = new TextDecoder().decode(body);
    const parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    return JSON.stringify({
      ...parsedBody,
      model: configuredModel,
    });
  } catch {
    return body;
  }
}

function buildTargetPath(basePathname: string, segments: string[]): string {
  const normalizedBase = basePathname.replace(TRAILING_SLASH_REGEX, "");
  const encodedSegments = segments.map((segment) =>
    encodeURIComponent(segment)
  );
  const appendedPath = encodedSegments.join("/");
  return `${normalizedBase}/${appendedPath}`.replace(MULTIPLE_SLASH_REGEX, "/");
}

function buildUpstreamHeaders(
  request: Request,
  token: string,
  username: string
): Headers {
  const headers = new Headers();

  for (const [name, value] of request.headers.entries()) {
    const lowerName = name.toLowerCase();

    if (
      HOP_BY_HOP_HEADERS.has(lowerName) ||
      lowerName === "host" ||
      lowerName === "content-length" ||
      lowerName === "origin" ||
      lowerName.startsWith("x-opencode-")
    ) {
      continue;
    }

    headers.set(name, value);
  }

  headers.set("Authorization", createBasicAuthHeader(token, username));

  return headers;
}

async function resolvePathSegments(context: RouteContext): Promise<string[]> {
  const resolvedParams = await context.params;
  return resolvedParams.path ?? [];
}

async function handleProxy(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrlHeader = request.headers.get("x-opencode-url");
  const token = request.headers.get("x-opencode-token")?.trim();
  const username =
    request.headers.get("x-opencode-username")?.trim() ||
    DEFAULT_OPENCODE_USERNAME;

  if (!(baseUrlHeader && token)) {
    return NextResponse.json(
      { error: "Agent connection is not configured." },
      { status: 400 }
    );
  }

  const targetBaseUrl = parseOpencodeUrl(baseUrlHeader);
  if (!targetBaseUrl) {
    return NextResponse.json(
      {
        error:
          "Invalid Agent URL. Use HTTPS for remote hosts or HTTP only for localhost/127.0.0.1/::1.",
      },
      { status: 400 }
    );
  }

  const pathSegments = await resolvePathSegments(context);
  const currentUrl = new URL(request.url);

  targetBaseUrl.pathname = buildTargetPath(
    targetBaseUrl.pathname,
    pathSegments
  );
  targetBaseUrl.search = currentUrl.search;

  const hasRequestBody = !["GET", "HEAD"].includes(request.method);
  const body = hasRequestBody
    ? maybeInjectPromptModel(request, pathSegments, await request.arrayBuffer())
    : undefined;

  try {
    const upstreamResponse = await fetch(targetBaseUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request, token, username),
      body,
      redirect: "follow",
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-encoding");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to connect to Agent server.",
      },
      { status: 502 }
    );
  }
}

export function GET(request: Request, context: RouteContext) {
  return handleProxy(request, context);
}

export function POST(request: Request, context: RouteContext) {
  return handleProxy(request, context);
}

export function PUT(request: Request, context: RouteContext) {
  return handleProxy(request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return handleProxy(request, context);
}

export function DELETE(request: Request, context: RouteContext) {
  return handleProxy(request, context);
}

export function OPTIONS(request: Request, context: RouteContext) {
  return handleProxy(request, context);
}
