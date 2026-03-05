import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteOpencodeConnection,
  deleteOpencodeConnectionForUser,
  getAllOpencodeConnectionsForUser,
  getResolvedOpencodeConnectionForUser,
  upsertOpencodeConnectionForUser,
} from "@/lib/db/opencode-connections";
import {
  createBasicAuthHeader,
  DEFAULT_OPENCODE_USERNAME,
  normalizeOpencodeBaseUrl,
  parseOpencodeUrl,
} from "@/lib/opencode-server-utils";

type UpsertConnectionRequest = {
  url?: string;
  username?: string;
  password?: string;
  name?: string;
  directory?: string;
};

const TRAILING_SLASH_REGEX = /\/+$/;
const MULTIPLE_SLASH_REGEX = /\/+/g;

function buildTargetPath(basePathname: string, segments: string[]): string {
  const normalizedBase = basePathname.replace(TRAILING_SLASH_REGEX, "");
  const encodedSegments = segments.map((segment) =>
    encodeURIComponent(segment)
  );
  const appendedPath = encodedSegments.join("/");
  return `${normalizedBase}/${appendedPath}`.replace(MULTIPLE_SLASH_REGEX, "/");
}

async function resolveOpencodeDirectory(
  url: string,
  username: string,
  password: string
): Promise<string | null> {
  const targetBaseUrl = parseOpencodeUrl(url);
  if (!targetBaseUrl) {
    return null;
  }

  targetBaseUrl.pathname = buildTargetPath(targetBaseUrl.pathname, ["path"]);

  try {
    const response = await fetch(targetBaseUrl, {
      method: "GET",
      headers: {
        Authorization: createBasicAuthHeader(password, username),
        "Accept-Encoding": "identity",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as {
      directory?: unknown;
    } | null;
    const directory =
      typeof payload?.directory === "string" ? payload.directory.trim() : "";

    return directory || null;
  } catch {
    return null;
  }
}

function isAuthError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("environment variable")
  );
}

async function getAuthenticatedUserId(
  request: Request
): Promise<string | Response> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session.user.id;
}

export async function GET(request: Request) {
  const userIdOrError = await getAuthenticatedUserId(request);
  if (typeof userIdOrError !== "string") {
    return userIdOrError;
  }

  try {
    const connections = await getAllOpencodeConnectionsForUser(userIdOrError);
    const activeConnection = connections.find((c) => c.isActive);

    if (connections.length === 0) {
      return NextResponse.json({
        configured: false,
        connections: [],
        activeConnectionId: null,
      });
    }

    return NextResponse.json({
      configured: true,
      connections: connections.map((c) => ({
        id: c.id,
        name: c.name,
        mode: c.mode,
        url: c.url,
        directory: c.directory,
        username: c.username,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      activeConnectionId: activeConnection?.id ?? connections[0]?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: isAuthError(error)
          ? "Server encryption is not configured."
          : "Failed to load OpenCode connections.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const userIdOrError = await getAuthenticatedUserId(request);
  if (typeof userIdOrError !== "string") {
    return userIdOrError;
  }

  const body = (await request
    .json()
    .catch(() => null)) as UpsertConnectionRequest | null;

  const urlInput = body?.url?.trim() ?? "";
  const username = body?.username?.trim() || DEFAULT_OPENCODE_USERNAME;
  const passwordInput = body?.password?.trim() ?? "";
  const name = body?.name?.trim() ?? null;
  const directoryInput = body?.directory?.trim() ?? "";

  if (!urlInput) {
    return NextResponse.json({ error: "URL is required." }, { status: 400 });
  }

  const parsedUrl = parseOpencodeUrl(urlInput);
  if (!parsedUrl) {
    return NextResponse.json(
      {
        error:
          "Invalid Agent URL. Use HTTPS for remote hosts or HTTP only for localhost/127.0.0.1/::1.",
      },
      { status: 400 }
    );
  }

  try {
    const existing = await getResolvedOpencodeConnectionForUser(userIdOrError);
    const password = passwordInput || existing?.password;
    const normalizedUrl = normalizeOpencodeBaseUrl(parsedUrl);

    if (!password) {
      return NextResponse.json(
        { error: "Password is required for new connections." },
        { status: 400 }
      );
    }

    const resolvedDirectory =
      directoryInput ||
      (await resolveOpencodeDirectory(normalizedUrl, username, password));

    const saved = await upsertOpencodeConnectionForUser({
      userId: userIdOrError,
      name,
      mode: "self_hosted",
      url: normalizedUrl,
      directory: resolvedDirectory,
      username,
      password,
    });

    const allConnections =
      await getAllOpencodeConnectionsForUser(userIdOrError);

    return NextResponse.json({
      configured: true,
      connection: {
        id: saved.id,
        name: saved.name,
        mode: saved.mode,
        url: saved.url,
        directory: saved.directory,
        username: saved.username,
        isActive: saved.isActive,
      },
      activeConnectionId:
        allConnections.find((c) => c.isActive)?.id ??
        allConnections[0]?.id ??
        null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: isAuthError(error)
          ? "Server encryption is not configured."
          : "Failed to save OpenCode connection.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const userIdOrError = await getAuthenticatedUserId(request);
  if (typeof userIdOrError !== "string") {
    return userIdOrError;
  }

  const url = new URL(request.url);
  const connectionId = url.searchParams.get("id");

  try {
    if (connectionId) {
      await deleteOpencodeConnection(userIdOrError, connectionId);
    } else {
      await deleteOpencodeConnectionForUser(userIdOrError);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: isAuthError(error)
          ? "Server encryption is not configured."
          : "Failed to delete OpenCode connection.",
      },
      { status: 500 }
    );
  }
}
