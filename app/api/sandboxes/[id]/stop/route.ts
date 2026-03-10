import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { type SandboxStatus, sandboxes } from "@/lib/db/schema";
import { resolveVercelSandboxCredentials } from "@/lib/vercel-sandbox-credentials";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/sandboxes/:id/stop
 *
 * Stops a running managed sandbox VM.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const record = await db.query.sandboxes.findFirst({
      where: and(eq(sandboxes.id, id), eq(sandboxes.userId, session.user.id)),
      columns: {
        id: true,
        name: true,
        vercelSandboxId: true,
        integrationId: true,
        status: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (record.status === "stopped") {
      return NextResponse.json(
        { error: "Sandbox is already stopped." },
        { status: 409 }
      );
    }

    if (record.vercelSandboxId && record.integrationId) {
      try {
        const credentials = await resolveVercelSandboxCredentials(
          record.integrationId
        );
        const sandbox = await VercelSandbox.get({
          sandboxId: record.vercelSandboxId,
          ...credentials,
        });
        await sandbox.stop();
      } catch {
        // Best-effort: sandbox may already have timed out
      }
    }

    await db
      .update(sandboxes)
      .set({
        status: "stopped" as SandboxStatus,
        updatedAt: new Date(),
      })
      .where(eq(sandboxes.id, record.id));

    return NextResponse.json({
      id: record.id,
      name: record.name,
      status: "stopped",
    });
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    return NextResponse.json(
      {
        error: "Failed to stop sandbox",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
