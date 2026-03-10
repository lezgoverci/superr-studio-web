import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sandboxes } from "@/lib/db/schema";
import { resolveVercelSandboxCredentials } from "@/lib/vercel-sandbox-credentials";
import type { SandboxListItem } from "../route";

type RouteParams = { params: Promise<{ id: string }> };

function mapVercelStatus(status: string): SandboxListItem["status"] {
  switch (status) {
    case "running":
      return "running";
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    default:
      return "stopped";
  }
}

async function resolveLiveStatus(record: {
  id: string;
  status: SandboxListItem["status"];
  vercelSandboxId: string | null;
  integrationId: string | null;
}) {
  if (!(record.vercelSandboxId && record.integrationId)) {
    return record.status;
  }

  try {
    const credentials = await resolveVercelSandboxCredentials(
      record.integrationId
    );
    const sandbox = await VercelSandbox.get({
      sandboxId: record.vercelSandboxId,
      ...credentials,
    });
    const liveStatus = mapVercelStatus(sandbox.status);

    if (liveStatus !== record.status) {
      await db
        .update(sandboxes)
        .set({ status: liveStatus, updatedAt: new Date() })
        .where(eq(sandboxes.id, record.id));
    }

    return liveStatus;
  } catch {
    return record.status;
  }
}

// ── GET /api/sandboxes/:id ──────────────────────────────────────────

export async function GET(request: Request, { params }: RouteParams) {
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
    });

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const liveStatus = await resolveLiveStatus(record);

    const response: SandboxListItem = {
      id: record.id,
      name: record.name,
      status: liveStatus,
      vercelSandboxId: record.vercelSandboxId,
      integrationId: record.integrationId,
      runtime: record.runtime,
      timeout: record.timeout,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to get sandbox:", error);
    return NextResponse.json(
      { error: "Failed to get sandbox" },
      { status: 500 }
    );
  }
}

// ── PATCH /api/sandboxes/:id ────────────────────────────────────────

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    const [updated] = await db
      .update(sandboxes)
      .set(updates)
      .where(and(eq(sandboxes.id, id), eq(sandboxes.userId, session.user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      status: updated.status,
    });
  } catch (error) {
    console.error("Failed to update sandbox:", error);
    return NextResponse.json(
      { error: "Failed to update sandbox" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/sandboxes/:id ───────────────────────────────────────

export async function DELETE(request: Request, { params }: RouteParams) {
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
        vercelSandboxId: true,
        integrationId: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Stop the Vercel sandbox if it's running
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
        // Best-effort: sandbox may already be stopped
      }
    }

    await db.delete(sandboxes).where(eq(sandboxes.id, record.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete sandbox:", error);
    return NextResponse.json(
      { error: "Failed to delete sandbox" },
      { status: 500 }
    );
  }
}
