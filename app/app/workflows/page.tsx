"use client";

import { ArrowRight, Globe, Lock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@/components/app-shell/page-container";
import { Button } from "@/components/ui/button";
import { api, type SavedWorkflow } from "@/lib/api-client";

function formatUpdatedAt(updatedAt: string): string {
  return new Date(updatedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AppWorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const allWorkflows = await api.workflow.getAll();
      const filteredWorkflows = allWorkflows.filter(
        (workflow) => workflow.name !== "__current__"
      );
      setWorkflows(filteredWorkflows);
    } catch (error) {
      console.error("Failed to load workflows:", error);
      setErrorMessage("Failed to load workflows. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshWorkflows = useCallback(() => {
    loadWorkflows().catch(() => undefined);
  }, [loadWorkflows]);

  useEffect(() => {
    refreshWorkflows();
  }, [refreshWorkflows]);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">Workflows</h1>
            <p className="text-muted-foreground text-sm">
              View and open your existing workflows in the builder.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={isLoading}
              onClick={refreshWorkflows}
              size="sm"
              variant="secondary"
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button asChild size="sm">
              <Link href="/app/workflows/new">New Workflow</Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                className="h-20 animate-pulse rounded-lg border bg-muted/40"
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list for loading skeleton
                key={index}
              />
            ))}
          </div>
        ) : null}

        {!isLoading && errorMessage ? (
          <div className="rounded-lg border bg-background p-6">
            <p className="font-medium text-sm">{errorMessage}</p>
            <Button
              className="mt-4"
              onClick={refreshWorkflows}
              size="sm"
              variant="secondary"
            >
              Try again
            </Button>
          </div>
        ) : null}

        {!(isLoading || errorMessage) && workflows.length === 0 ? (
          <div className="rounded-lg border bg-background p-6">
            <h2 className="font-semibold text-lg tracking-tight">
              No workflows yet
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Create your first workflow to start building in the canvas.
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link href="/app/workflows/new">Create Workflow</Link>
            </Button>
          </div>
        ) : null}

        {!(isLoading || errorMessage) && workflows.length > 0 ? (
          <div className="space-y-2">
            {workflows.map((workflow) => (
              <button
                className="flex w-full items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/40"
                key={workflow.id}
                onClick={() => router.push(`/app/workflows/${workflow.id}`)}
                type="button"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium text-sm">
                    {workflow.name}
                  </p>
                  {workflow.description ? (
                    <p className="line-clamp-1 text-muted-foreground text-xs">
                      {workflow.description}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      No description
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[11px] uppercase">
                    {workflow.visibility === "public" ? (
                      <Globe className="size-3" />
                    ) : (
                      <Lock className="size-3" />
                    )}
                    {workflow.visibility}
                  </span>
                  <p className="hidden text-muted-foreground text-xs md:block">
                    Updated {formatUpdatedAt(workflow.updatedAt)}
                  </p>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
