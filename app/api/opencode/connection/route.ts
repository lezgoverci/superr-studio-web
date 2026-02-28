import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteOpencodeConnectionForUser,
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
    const connection =
      await getResolvedOpencodeConnectionForUser(userIdOrError);

    if (!connection) {
      return NextResponse.json({ configured: false, connection: null });
    }

    return NextResponse.json({
      configured: true,
      connection: {
        mode: connection.mode,
        url: connection.url,
        username: connection.username,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: isAuthError(error)
          ? "Server encryption is not configured."
          : "Failed to load OpenCode connection.",
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
      mode: "self_hosted",
      url: normalizeOpencodeBaseUrl(parsedUrl),
      username,
      password,
    });

    return NextResponse.json({
      configured: true,
      connection: {
        mode: saved.mode,
        url: saved.url,
        username: saved.username,
      },
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

  try {
    await deleteOpencodeConnectionForUser(userIdOrError);
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
