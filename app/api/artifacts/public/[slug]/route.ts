import { NextResponse } from "next/server";
import { getPublicArtifactBySlug } from "@/lib/artifacts/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const result = await getPublicArtifactBySlug(slug);

    if (!result) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      artifact: {
        ...result.artifact,
        createdAt: result.artifact.createdAt.toISOString(),
        updatedAt: result.artifact.updatedAt.toISOString(),
      },
      publication: {
        ...result.publication,
        createdAt: result.publication.createdAt.toISOString(),
        updatedAt: result.publication.updatedAt.toISOString(),
        publishedAt: result.publication.publishedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("Failed to get public artifact:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get public artifact",
      },
      { status: 500 }
    );
  }
}
