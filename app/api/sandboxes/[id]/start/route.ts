import { NextResponse } from "next/server";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sandboxes, type SandboxStatus } from "@/lib/db/schema";
import { resolveVercelSandboxCredentials } from "@/lib/vercel-sandbox-credentials";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/sandboxes/:id/start
 *
 * Re-creates a sandbox VM for a stopped/failed managed sandbox.
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
      where: and(
        eq(sandboxes.id, id),
        eq(sandboxes.userId, session.user.id),
      ),
    });

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (record.status === "running") {
      return NextResponse.json(
        { error: "Sandbox is already running." },
        { status: 409 },
      );
    }

    if (!record.integrationId) {
      return NextResponse.json(
        { error: "No Vercel connection linked. Delete and re-create the sandbox." },
        { status: 400 },
      );
    }

    const credentials = await resolveVercelSandboxCredentials(
      record.integrationId,
    );
    const sandbox = await VercelSandbox.create({
      ...credentials,
      runtime: (record.runtime as Parameters<typeof VercelSandbox.create>[0] extends { runtime?: infer R } ? R : never) || "node24",
      ...(record.timeout ? { timeout: record.timeout } : {}),
    });

    await db
      .update(sandboxes)
      .set({
        vercelSandboxId: sandbox.sandboxId,
        status: "running" as SandboxStatus,
        updatedAt: new Date(),
      })
      .where(eq(sandboxes.id, record.id));

    return NextResponse.json({
      id: record.id,
      name: record.name,
      status: "running",
      vercelSandboxId: sandbox.sandboxId,
    });
  } catch (error) {
    console.error("Failed to start sandbox:", error);
    return NextResponse.json(
      {
        error: "Failed to start sandbox",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
