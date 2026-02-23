"use client";

import { Check, ChevronDown, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeployButton } from "@/components/deploy-button";
import { GitHubStarsButton } from "@/components/github-stars-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { UserMenu } from "../workflows/user-menu";

const WORKFLOW_EDITOR_PATH = /^\/app\/workflows\/[^/]+$/;
const WORKFLOW_DETAIL_PATH = /^\/app\/workflows\/([^/]+)$/;

type WorkflowOption = {
  id: string;
  name: string;
};

type WorkflowSelectorContentProps = {
  pathname: string;
  currentWorkflowRouteId: string | null;
  isLoadingWorkflows: boolean;
  hasWorkflowLoadError: boolean;
  workflows: WorkflowOption[];
  onRetryLoad: () => void;
  onSelectNewWorkflow: () => void;
  onSelectWorkflow: (workflowId: string) => void;
};

function getWorkflowRouteId(pathname: string): string | null {
  if (pathname === "/app/workflows" || pathname === "/app/workflows/new") {
    return null;
  }
  const match = pathname.match(WORKFLOW_DETAIL_PATH);
  return match ? match[1] : null;
}

function getWorkflowSelectorLabel(
  pathname: string,
  workflows: WorkflowOption[],
  currentWorkflowRouteId: string | null
): string {
  if (pathname === "/app/workflows/new") {
    return "New Workflow";
  }
  if (pathname === "/app/workflows") {
    return "Select Workflow";
  }
  if (!currentWorkflowRouteId) {
    return "Workflow";
  }
  return (
    workflows.find((workflow) => workflow.id === currentWorkflowRouteId)
      ?.name || "Workflow"
  );
}

function WorkflowSelectorContent({
  pathname,
  currentWorkflowRouteId,
  isLoadingWorkflows,
  hasWorkflowLoadError,
  workflows,
  onRetryLoad,
  onSelectNewWorkflow,
  onSelectWorkflow,
}: WorkflowSelectorContentProps) {
  return (
    <>
      <DropdownMenuItem
        className="flex items-center justify-between"
        onSelect={onSelectNewWorkflow}
      >
        <span>New Workflow</span>
        {pathname === "/app/workflows/new" ? (
          <Check className="size-4 shrink-0" />
        ) : null}
      </DropdownMenuItem>
      <DropdownMenuSeparator />

      {isLoadingWorkflows ? (
        <DropdownMenuItem disabled>Loading workflows...</DropdownMenuItem>
      ) : null}

      {!isLoadingWorkflows && hasWorkflowLoadError ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onRetryLoad();
          }}
        >
          Retry loading workflows
        </DropdownMenuItem>
      ) : null}

      {!(isLoadingWorkflows || hasWorkflowLoadError) &&
      workflows.length === 0 ? (
        <DropdownMenuItem disabled>No workflows found</DropdownMenuItem>
      ) : null}

      {isLoadingWorkflows || hasWorkflowLoadError
        ? null
        : workflows.map((workflow) => (
            <DropdownMenuItem
              className="flex items-center justify-between"
              key={workflow.id}
              onSelect={() => onSelectWorkflow(workflow.id)}
            >
              <span className="truncate">{workflow.name}</span>
              {workflow.id === currentWorkflowRouteId ? (
                <Check className="size-4 shrink-0" />
              ) : null}
            </DropdownMenuItem>
          ))}
    </>
  );
}

function WorkflowSelector({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [hasWorkflowLoadError, setHasWorkflowLoadError] = useState(false);

  const currentWorkflowRouteId = useMemo(
    () => getWorkflowRouteId(pathname),
    [pathname]
  );

  const loadWorkflows = useCallback(async () => {
    setIsLoadingWorkflows(true);
    setHasWorkflowLoadError(false);

    try {
      const allWorkflows = await api.workflow.getAll();
      const workflowOptions = allWorkflows
        .filter((workflow) => workflow.name !== "__current__")
        .map((workflow) => ({ id: workflow.id, name: workflow.name }));
      setWorkflows(workflowOptions);
    } catch (error) {
      console.error("Failed to load workflows for header selector:", error);
      setHasWorkflowLoadError(true);
    } finally {
      setIsLoadingWorkflows(false);
    }
  }, []);

  const refreshWorkflows = useCallback(() => {
    loadWorkflows().catch(() => undefined);
  }, [loadWorkflows]);

  useEffect(() => {
    refreshWorkflows();
  }, [refreshWorkflows]);

  const selectorLabel = useMemo(
    () => getWorkflowSelectorLabel(pathname, workflows, currentWorkflowRouteId),
    [pathname, workflows, currentWorkflowRouteId]
  );

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          refreshWorkflows();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          className="ml-1 flex max-w-[220px] items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-sm transition-colors hover:bg-muted/60"
          type="button"
        >
          <span className="truncate">{selectorLabel}</span>
          {isLoadingWorkflows ? (
            <Loader2 className="size-3 shrink-0 animate-spin opacity-60" />
          ) : null}
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <WorkflowSelectorContent
          currentWorkflowRouteId={currentWorkflowRouteId}
          hasWorkflowLoadError={hasWorkflowLoadError}
          isLoadingWorkflows={isLoadingWorkflows}
          onRetryLoad={refreshWorkflows}
          onSelectNewWorkflow={() => router.push("/app/workflows/new")}
          onSelectWorkflow={(workflowId) =>
            router.push(`/app/workflows/${workflowId}`)
          }
          pathname={pathname}
          workflows={workflows}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const isWorkflowSection = pathname.startsWith("/app/workflows");
  const isWorkflowEditor =
    pathname === "/app/workflows/new" || WORKFLOW_EDITOR_PATH.test(pathname);

  return (
    <header className="pointer-events-auto h-14 border-b bg-background/95 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-3 px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <Link
            className="flex shrink-0 items-center gap-2 md:gap-3"
            href="/app"
          >
            <div className="rounded-lg bg-primary/15 p-1.5 text-primary">
              <Sparkles className="size-4" />
            </div>
            <span className="hidden font-semibold text-sm tracking-tight sm:inline md:text-base">
              Superr Workflow
            </span>
          </Link>

          {isWorkflowSection ? <WorkflowSelector pathname={pathname} /> : null}
        </div>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="relative flex h-9 w-56 items-center rounded-full border bg-muted/70 p-1">
            <div
              className={cn(
                "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm transition-transform duration-300",
                isWorkflowSection ? "translate-x-full" : "translate-x-0"
              )}
            />
            <button
              className={cn(
                "relative z-10 flex-1 rounded-full font-medium text-xs transition-colors",
                isWorkflowSection ? "text-muted-foreground" : "text-foreground"
              )}
              onClick={() => router.push("/app")}
              type="button"
            >
              Workspace
            </button>
            <button
              className={cn(
                "relative z-10 flex-1 rounded-full font-medium text-xs transition-colors",
                isWorkflowSection ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => router.push("/app/workflows/new")}
              type="button"
            >
              Builder
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          {pathname === "/app" ? (
            <div className="hidden items-center gap-2 lg:flex">
              <GitHubStarsButton />
              <DeployButton />
            </div>
          ) : null}

          {isWorkflowEditor ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/app/workflows">All Workflows</Link>
            </Button>
          ) : null}

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
