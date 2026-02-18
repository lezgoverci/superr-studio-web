import type { Spec } from "@json-render/core";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PublicArtifactSpec } from "@/components/artifacts/public-artifact-spec";
import { getPublicArtifactBySlug } from "@/lib/artifacts/service";

type PublicArtifactPageProps = {
  params: Promise<{ slug: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSpec(value: unknown): Spec | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!(typeof value.root === "string" && isRecord(value.elements))) {
    return null;
  }
  return value as unknown as Spec;
}

function renderArtifactPreview(artifact: {
  kind: string;
  title: string;
  blobUrl: string | null;
  inlineContent: string | null;
}) {
  if (artifact.kind === "image" && artifact.blobUrl) {
    return (
      <Image
        alt={artifact.title}
        className="max-h-[60vh] w-auto rounded border object-contain"
        height={800}
        src={artifact.blobUrl}
        unoptimized
        width={1200}
      />
    );
  }

  if (artifact.kind === "video" && artifact.blobUrl) {
    return (
      <video
        className="max-h-[60vh] w-full rounded border"
        controls
        src={artifact.blobUrl}
      >
        <track kind="captions" />
      </video>
    );
  }

  if (artifact.kind === "web_page" && artifact.blobUrl) {
    return (
      <iframe
        className="h-[70vh] w-full rounded border bg-background"
        sandbox="allow-scripts allow-same-origin"
        src={artifact.blobUrl}
        title={artifact.title}
      />
    );
  }

  if (artifact.inlineContent) {
    return (
      <pre className="max-h-[70vh] overflow-auto rounded border bg-muted/30 p-4 font-mono text-xs">
        {artifact.inlineContent}
      </pre>
    );
  }

  if (artifact.blobUrl) {
    return (
      <a
        className="inline-flex rounded border px-3 py-2 text-sm hover:bg-muted"
        href={artifact.blobUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        Open artifact
      </a>
    );
  }

  return (
    <div className="rounded border border-dashed p-4 text-muted-foreground text-sm">
      Preview is unavailable for this artifact.
    </div>
  );
}

export default async function PublicArtifactPage({
  params,
}: PublicArtifactPageProps) {
  const { slug } = await params;
  const result = await getPublicArtifactBySlug(slug);

  if (!result) {
    notFound();
  }

  const spec = parseSpec(result.publication.uiSpec);

  return (
    <main className="pointer-events-auto min-h-dvh w-full bg-muted/20 px-4 py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-tight">
            {result.publication.title}
          </h1>
          {result.publication.description ? (
            <p className="text-muted-foreground text-sm">
              {result.publication.description}
            </p>
          ) : null}
        </header>

        <section className="rounded-xl border bg-background p-6 shadow-sm">
          {spec ? (
            <PublicArtifactSpec spec={spec} />
          ) : (
            <div className="space-y-3">
              <h2 className="font-medium text-base">Artifact Preview</h2>
              {renderArtifactPreview(result.artifact)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
