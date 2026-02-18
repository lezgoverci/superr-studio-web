import { NextResponse } from "next/server";
import { listArtifactsForUser } from "@/lib/artifacts/service";
import { auth } from "@/lib/auth";
import type { ArtifactKind } from "@/lib/db/schema";

const VALID_KINDS = new Set<ArtifactKind>([
  "file",
  "image",
  "video",
  "audio",
  "web_page",
  "url",
  "json",
  "text",
  "unknown",
]);

function parseKind(value: string | null): ArtifactKind | undefined {
  if (!value) {
    return;
  }
  const normalized = value.trim() as ArtifactKind;
  return VALID_KINDS.has(normalized) ? normalized : undefined;
}

function serializeDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function serializeArtifactRow(
  row: Awaited<ReturnType<typeof listArtifactsForUser>>["items"][number]
) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publication: row.publication
      ? {
          ...row.publication,
          createdAt: row.publication.createdAt.toISOString(),
          updatedAt: row.publication.updatedAt.toISOString(),
          publishedAt: serializeDate(row.publication.publishedAt),
        }
      : null,
  };
}

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId") || undefined;
    const executionId = searchParams.get("executionId") || undefined;
    const q = searchParams.get("q") || undefined;
    const cursor = searchParams.get("cursor") || undefined;
    const limitValue = searchParams.get("limit");
    const kind = parseKind(searchParams.get("kind"));
    const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;

    const result = await listArtifactsForUser({
      userId: session.user.id,
      workflowId,
      executionId,
      kind,
      q,
      cursor,
      limit,
    });

    return NextResponse.json({
      items: result.items.map(serializeArtifactRow),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    console.error("Failed to list artifacts:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list artifacts",
      },
      { status: 500 }
    );
  }
}
