import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteCustomNodeForUser,
  getCustomNodeDefinitionForUser,
  getCustomNodeWithVersionForUser,
  listCustomNodeVersionsForUser,
  updateCustomNodeDefinition,
} from "@/lib/db/custom-nodes";

type UpdateCustomNodeRequest = {
  name?: string;
  description?: string;
  runtime?: string;
  configSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  secretSchema?: Record<string, unknown> | null;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ customNodeId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { customNodeId } = await context.params;

    const definition = await getCustomNodeDefinitionForUser(
      session.user.id,
      customNodeId
    );

    if (!definition) {
      return NextResponse.json(
        { error: "Custom node not found" },
        { status: 404 }
      );
    }

    const latest = await getCustomNodeWithVersionForUser(
      session.user.id,
      customNodeId
    );
    const versions = await listCustomNodeVersionsForUser(
      session.user.id,
      customNodeId
    );

    return NextResponse.json({
      ...definition,
      latestCode: latest?.version.code || "",
      latestChangelog: latest?.version.changelog || null,
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        changelog: version.changelog,
        createdAt: version.createdAt,
      })),
    });
  } catch (error) {
    console.error("[custom-nodes] Failed to load custom node:", error);
    return NextResponse.json(
      { error: "Failed to load custom node" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ customNodeId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request
      .json()
      .catch(() => null)) as UpdateCustomNodeRequest | null;
    const { customNodeId } = await context.params;

    const updated = await updateCustomNodeDefinition({
      userId: session.user.id,
      customNodeId,
      ...(body?.name !== undefined ? { name: body.name } : {}),
      ...(body?.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body?.runtime !== undefined ? { runtime: body.runtime } : {}),
      ...(body?.configSchema !== undefined
        ? { configSchema: body.configSchema }
        : {}),
      ...(body?.outputSchema !== undefined
        ? { outputSchema: body.outputSchema }
        : {}),
      ...(body?.secretSchema !== undefined
        ? { secretSchema: body.secretSchema }
        : {}),
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Custom node not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[custom-nodes] Failed to update custom node:", error);
    return NextResponse.json(
      { error: "Failed to update custom node" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ customNodeId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { customNodeId } = await context.params;

    const deleted = await deleteCustomNodeForUser({
      userId: session.user.id,
      customNodeId,
    });

    if (!deleted) {
      return NextResponse.json(
        { error: "Custom node not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[custom-nodes] Failed to delete custom node:", error);
    return NextResponse.json(
      { error: "Failed to delete custom node" },
      { status: 500 }
    );
  }
}
