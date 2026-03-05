import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getResolvedOpencodeConnectionForUser } from "@/lib/db/opencode-connections";
import {
  createBasicAuthHeader,
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

function decodeDirectoryHeaderValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(trimmed).trim();
    return decoded || null;
  } catch {
    return trimmed;
  }
}

function getRequestDirectory(request: Request): string | null {
  const headerValue = request.headers.get("x-opencode-directory");
  if (!headerValue) {
    return null;
  }

  return decodeDirectoryHeaderValue(headerValue);
}

function buildUpstreamHeaders(
  request: Request,
  password: string,
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
      lowerName === "accept-encoding" ||
      lowerName.startsWith("x-opencode-")
    ) {
      continue;
    }

    headers.set(name, value);
  }

  headers.set("Authorization", createBasicAuthHeader(password, username));
  // Request uncompressed responses so we can stream the body through without
  // needing to decompress it server-side (after stripping content-encoding).
  headers.set("Accept-Encoding", "identity");

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

  const connection = await getResolvedOpencodeConnectionForUser(
    session.user.id
  );

  if (!connection) {
    return NextResponse.json(
      { error: "Agent connection is not configured." },
      { status: 400 }
    );
  }

  const targetBaseUrl = parseOpencodeUrl(connection.url);
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
  const requestDirectory = getRequestDirectory(request);
  if (requestDirectory && !targetBaseUrl.searchParams.has("directory")) {
    targetBaseUrl.searchParams.set("directory", requestDirectory);
  }

  const hasRequestBody = !["GET", "HEAD"].includes(request.method);
  const body = hasRequestBody
    ? maybeInjectPromptModel(request, pathSegments, await request.arrayBuffer())
    : undefined;

  try {
    const upstreamResponse = await fetch(targetBaseUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(
        request,
        connection.password,
        connection.username
      ),
      body,
      redirect: "follow",
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.set("X-OpenCode-Server-Id", connection.id);
    responseHeaders.set("X-OpenCode-Server-Url", connection.url);
    if (connection.name) {
      responseHeaders.set("X-OpenCode-Server-Name", connection.name);
    }

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
