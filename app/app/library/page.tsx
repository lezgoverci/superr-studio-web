import { PageContainer } from "@/components/app-shell/page-container";
import { ArtifactPanel } from "@/components/artifacts/artifact-panel";

type LibraryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const query = await searchParams;
  const workflowId = firstValue(query.workflowId);
  const executionId = firstValue(query.executionId);

  return (
    <PageContainer>
      <div className="space-y-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Library</h1>
          <p className="text-muted-foreground text-sm">
            Manage generated files, media, and published outputs across workflow
            runs.
          </p>
        </div>
        <ArtifactPanel executionId={executionId} workflowId={workflowId} />
      </div>
    </PageContainer>
  );
}
