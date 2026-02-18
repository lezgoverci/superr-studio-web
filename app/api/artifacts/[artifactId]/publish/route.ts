import { NextResponse } from "next/server";
import {
  getArtifactForUser,
  makePublicationSlug,
  upsertArtifactPublicationForUser,
} from "@/lib/artifacts/service";
import { auth } from "@/lib/auth";
import type { ArtifactPublicationVisibility } from "@/lib/db/schema";

function parseVisibility(value: unknown): ArtifactPublicationVisibility {
  if (value === "public") {
    return "public";
  }
  return "unlisted";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Route has auth, validation, and conflict handling branches.
export async function POST(
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

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const visibility = parseVisibility(body.visibility);
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : artifact.title;
    const slugInput =
      typeof body.slug === "string" && body.slug.trim()
        ? body.slug
        : artifact.publication?.slug || title;
    const slug = makePublicationSlug(slugInput, artifact.id);

    try {
      const publication = await upsertArtifactPublicationForUser({
        artifactId: artifact.id,
        userId: session.user.id,
        slug,
        title,
        description:
          typeof body.description === "string" ? body.description : null,
        visibility,
        uiSpec: artifact.publication?.uiSpec ?? null,
        uiSpecVersion: artifact.publication?.uiSpecVersion ?? null,
        uiMetadata: artifact.publication?.uiMetadata ?? null,
      });

      return NextResponse.json({
        publication: {
          ...publication,
          createdAt: publication.createdAt.toISOString(),
          updatedAt: publication.updatedAt.toISOString(),
          publishedAt: publication.publishedAt?.toISOString() || null,
        },
        publicUrl: `/a/${publication.slug}`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to publish artifact";
      if (message.includes("artifact_publications_slug_unique")) {
        return NextResponse.json(
          { error: "Slug is already in use. Choose a different slug." },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Failed to publish artifact:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to publish artifact",
      },
      { status: 500 }
    );
  }
}
