import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { type SandboxStatus, sandboxes } from "@/lib/db/schema";
import { resolveVercelSandboxCredentials } from "@/lib/vercel-sandbox-credentials";

// ── Response types ──────────────────────────────────────────────────

export type SandboxListItem = {
  id: string;
  name: string;
  status: SandboxStatus;
  vercelSandboxId: string | null;
  integrationId: string | null;
  runtime: string | null;
  timeout: number | null;
  createdAt: string;
  updatedAt: string;
};

type CreateSandboxRequest = {
  name: string;
  integrationId: string;
  runtime?: string;
  timeout?: number;
};

// ── GET /api/sandboxes ──────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const records = await db
      .select()
      .from(sandboxes)
      .where(eq(sandboxes.userId, session.user.id))
      .orderBy(sandboxes.createdAt);

    const response: SandboxListItem[] = records.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      vercelSandboxId: r.vercelSandboxId,
      integrationId: r.integrationId,
      runtime: r.runtime,
      timeout: r.timeout,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to list sandboxes:", error);
    return NextResponse.json(
      {
        error: "Failed to list sandboxes",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ── POST /api/sandboxes ─────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: CreateSandboxRequest = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (!body.integrationId?.trim()) {
      return NextResponse.json(
        { error: "A Vercel connection is required." },
        { status: 400 }
      );
    }

    // Resolve credentials and create Vercel sandbox
    const credentials = await resolveVercelSandboxCredentials(
      body.integrationId
    );
    const sandbox = await VercelSandbox.create({
      ...credentials,
      runtime:
        (body.runtime as Parameters<typeof VercelSandbox.create>[0] extends {
          runtime?: infer R;
        }
          ? R
          : never) || "node24",
      ...(body.timeout ? { timeout: body.timeout } : {}),
    });

    // Persist to database
    const [record] = await db
      .insert(sandboxes)
      .values({
        userId: session.user.id,
        name: body.name.trim(),
        vercelSandboxId: sandbox.sandboxId,
        integrationId: body.integrationId,
        status: "running" as SandboxStatus,
        runtime: body.runtime || "node24",
        timeout: body.timeout ?? null,
      })
      .returning();

    const response: SandboxListItem = {
      id: record.id,
      name: record.name,
      status: record.status,
      vercelSandboxId: record.vercelSandboxId,
      integrationId: record.integrationId,
      runtime: record.runtime,
      timeout: record.timeout,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Failed to create sandbox:", error);
    return NextResponse.json(
      {
        error: "Failed to create sandbox",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
