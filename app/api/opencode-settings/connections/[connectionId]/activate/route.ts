import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAllOpencodeConnectionsForUser,
  setActiveOpencodeConnection,
} from "@/lib/db/opencode-connections";

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

export async function PUT(
  request: Request,
  context: { params: Promise<{ connectionId: string }> }
) {
  const userIdOrError = await getAuthenticatedUserId(request);
  if (typeof userIdOrError !== "string") {
    return userIdOrError;
  }

  const { connectionId } = await context.params;

  try {
    const updated = await setActiveOpencodeConnection(
      userIdOrError,
      connectionId
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Connection not found." },
        { status: 404 }
      );
    }

    const allConnections =
      await getAllOpencodeConnectionsForUser(userIdOrError);

    return NextResponse.json({
      success: true,
      activeConnectionId: updated.id,
      connections: allConnections.map((c) => ({
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: isAuthError(error)
          ? "Server encryption is not configured."
          : "Failed to activate connection.",
      },
      { status: 500 }
    );
  }
}
