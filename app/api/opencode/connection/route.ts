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
  DEFAULT_OPENCODE_USERNAME,
  normalizeOpencodeBaseUrl,
  parseOpencodeUrl,
} from "@/lib/opencode-server-utils";

type UpsertConnectionRequest = {
  url?: string;
  username?: string;
  password?: string;
  name?: string;
};

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

    if (!password) {
      return NextResponse.json(
        { error: "Password is required for new connections." },
        { status: 400 }
      );
    }

    const saved = await upsertOpencodeConnectionForUser({
      userId: userIdOrError,
      name,
      mode: "self_hosted",
      url: normalizeOpencodeBaseUrl(parsedUrl),
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
