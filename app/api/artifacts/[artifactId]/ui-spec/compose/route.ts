import { NextResponse } from "next/server";
import {
  getArtifactForUser,
  makePublicationSlug,
  upsertArtifactPublicationForUser,
} from "@/lib/artifacts/service";
import { auth } from "@/lib/auth";
import type { ArtifactPublicationVisibility } from "@/lib/db/schema";
import { composeWorkflowUiSpec } from "@/lib/workflow-ui-spec/compose";

const DEFAULT_PROMPT =
  "Generate a clean, read-only artifact presentation layout with title, context, and preview content.";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseVisibility(value: unknown): ArtifactPublicationVisibility {
  if (value === "public") {
    return "public";
  }
  return "unlisted";
}

function buildArtifactSummary(
  artifact: NonNullable<Awaited<ReturnType<typeof getArtifactForUser>>>
): string {
  return [
    `Artifact ID: ${artifact.id}`,
    `Title: ${artifact.title}`,
    `Kind: ${artifact.kind}`,
    artifact.mimeType ? `MIME Type: ${artifact.mimeType}` : "",
    artifact.blobUrl ? `URL: ${artifact.blobUrl}` : "",
    artifact.inlineContent ? `Inline Content: ${artifact.inlineContent}` : "",
    artifact.metadata
      ? `Metadata: ${JSON.stringify(artifact.metadata, null, 2)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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

    const prompt = asTrimmedString(body.prompt) || DEFAULT_PROMPT;
    const model = asTrimmedString(body.model);
    const composed = await composeWorkflowUiSpec({
      prompt,
      workflowSummary: buildArtifactSummary(artifact),
      currentSpec: artifact.publication?.uiSpec || null,
      model: model || undefined,
    });

    const title =
      asTrimmedString(body.title) ||
      artifact.publication?.title ||
      artifact.title;
    const slug = makePublicationSlug(
      asTrimmedString(body.slug) ||
        artifact.publication?.slug ||
        artifact.title,
      artifact.id
    );
    const visibility = parseVisibility(body.visibility);
    const publication = await upsertArtifactPublicationForUser({
      artifactId: artifact.id,
      userId: session.user.id,
      slug,
      title,
      description:
        typeof body.description === "string"
          ? body.description
          : artifact.publication?.description || null,
      visibility,
      uiSpec: composed.spec,
      uiSpecVersion: "1",
      uiMetadata: {
        generatedBy: "artifact-ui",
        generatedAt: new Date().toISOString(),
        model: composed.modelUsed,
      },
    });

    return NextResponse.json({
      spec: composed.spec,
      modelUsed: composed.modelUsed,
      publication: {
        ...publication,
        createdAt: publication.createdAt.toISOString(),
        updatedAt: publication.updatedAt.toISOString(),
        publishedAt: publication.publishedAt?.toISOString() || null,
      },
      publicUrl: `/a/${publication.slug}`,
    });
  } catch (error) {
    console.error("Failed to compose artifact UI spec:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to compose artifact UI spec",
      },
      { status: 500 }
    );
  }
}
