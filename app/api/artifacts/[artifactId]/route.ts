import { NextResponse } from "next/server";
import {
  deleteArtifactForUser,
  getArtifactForUser,
  updateArtifactForUser,
} from "@/lib/artifacts/service";
import { auth } from "@/lib/auth";
import type { ArtifactVisibility } from "@/lib/db/schema";

function serializeDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function serializeArtifact(
  artifact: NonNullable<Awaited<ReturnType<typeof getArtifactForUser>>>
) {
  return {
    ...artifact,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
    publication: artifact.publication
      ? {
          ...artifact.publication,
          createdAt: artifact.publication.createdAt.toISOString(),
          updatedAt: artifact.publication.updatedAt.toISOString(),
          publishedAt: serializeDate(artifact.publication.publishedAt),
        }
      : null,
  };
}

function parseVisibility(value: unknown): ArtifactVisibility | undefined {
  if (value === "private" || value === "public") {
    return value;
  }
  return;
}

function parseMetadata(
  value: unknown
): Record<string, unknown> | null | undefined {
  if (value === null) {
    return null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { artifactId } = await context.params;
    const artifact = await getArtifactForUser({
      artifactId,
      userId: session.user.id,
    });

    if (!artifact) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeArtifact(artifact));
  } catch (error) {
    console.error("Failed to load artifact:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load artifact",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ artifactId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { artifactId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const updated = await updateArtifactForUser({
      artifactId,
      userId: session.user.id,
      title: typeof body.title === "string" ? body.title : undefined,
      pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
      visibility: parseVisibility(body.visibility),
      metadata: parseMetadata(body.metadata),
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to update artifact:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update artifact",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ artifactId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { artifactId } = await context.params;
    const deleted = await deleteArtifactForUser({
      artifactId,
      userId: session.user.id,
    });

    if (!deleted) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete artifact:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete artifact",
      },
      { status: 500 }
    );
  }
}
