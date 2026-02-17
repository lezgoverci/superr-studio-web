import type { Spec } from "@json-render/core";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { WorkflowRunner } from "@/components/workflow-run/workflow-runner";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";

type WorkflowRunPageProps = {
  params: Promise<{ workflowId: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSpec(value: unknown): Spec | null {
  if (!isRecord(value)) {
    return null;
  }

  const root = value.root;
  const elements = value.elements;

  if (typeof root !== "string" || !isRecord(elements)) {
    return null;
  }

  return value as unknown as Spec;
}

export default async function WorkflowRunPage({
  params,
}: WorkflowRunPageProps) {
  const { workflowId } = await params;

  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: headerStore,
  });

  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, workflowId),
  });

  if (!workflow) {
    notFound();
  }

  const isOwner = session?.user?.id === workflow.userId;
  const canView = isOwner || workflow.visibility === "public";

  if (!canView) {
    notFound();
  }

  const spec = parseSpec(workflow.uiSpec);

  return (
    <main className="pointer-events-auto min-h-dvh w-full bg-muted/20 px-4 py-10">
      <div className="mx-auto mb-6 w-full max-w-3xl">
        <h1 className="font-semibold text-2xl tracking-tight">
          {workflow.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Provide input and submit to execute this workflow.
        </p>
      </div>

      {spec ? (
        <WorkflowRunner
          isOwner={isOwner}
          spec={spec}
          workflowId={workflow.id}
        />
      ) : (
        <div className="mx-auto w-full max-w-3xl rounded-xl border bg-background p-6 text-muted-foreground text-sm shadow-sm">
          This workflow does not have a generated run form yet.
        </div>
      )}
    </main>
  );
}
