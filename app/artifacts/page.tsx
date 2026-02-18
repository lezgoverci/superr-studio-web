import { ArtifactPanel } from "@/components/artifacts/artifact-panel";

type ArtifactPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function ArtifactsPage({
  searchParams,
}: ArtifactPageProps) {
  const query = await searchParams;
  const workflowId = firstValue(query.workflowId);
  const executionId = firstValue(query.executionId);

  return (
    <main className="pointer-events-auto min-h-dvh w-full bg-muted/20 px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Artifacts</h1>
          <p className="text-muted-foreground text-sm">
            Manage generated files, media, and published outputs across workflow
            runs.
          </p>
        </div>

        <ArtifactPanel executionId={executionId} workflowId={workflowId} />
      </div>
    </main>
  );
}
