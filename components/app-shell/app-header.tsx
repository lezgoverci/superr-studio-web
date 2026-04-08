"use client";

import { Check, ChevronDown, Loader2, Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import { isWorkflowEditorRoute } from "@/lib/app-route-utils";
import { cn } from "@/lib/utils";
import { UserMenu } from "../workflows/user-menu";
import { NavContent } from "./app-nav";
import { useAppShellContext } from "./shell-context";

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { builderEntryHref, builderNavItems, currentArea, workspaceNavItems } =
    useAppShellContext();
  const isWorkflowSection = pathname.startsWith("/app/workflows");
  const isBuilderSection = currentArea === "builder";
  const mobileNavItems =
    currentArea === "builder" ? builderNavItems : workspaceNavItems;
  const isWorkflowEditor = isWorkflowEditorRoute(pathname);

  return (
    <header className="pointer-events-auto h-14 border-b bg-background/95 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-3 px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          {/* Mobile Navigation */}
          {!isWorkflowEditor && (
            <div className="flex items-center lg:hidden">
              <Sheet onOpenChange={setIsMobileMenuOpen} open={isMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    className="h-8 w-8 shrink-0 rounded-full text-foreground/80 hover:bg-muted/80"
                    size="icon"
                    variant="ghost"
                  >
                    <Menu className="size-4.5" />
                    <span className="sr-only">Toggle navigation menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  className="flex w-64 flex-col border-r bg-background p-0"
                  side="left"
                >
                  <div className="border-b p-4">
                    <Link
                      className="flex items-center gap-2 px-2"
                      href="/app"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Sparkles className="size-4 text-primary" />
                      <span className="font-semibold text-foreground text-sm tracking-tight">
                        SuperrStudio
                      </span>
                    </Link>
                  </div>
                  <div className="w-full flex-1 overflow-y-auto p-4">
                    <div className="mb-4 space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          className="justify-center"
                          onClick={() => {
                            router.push("/app");
                            setIsMobileMenuOpen(false);
                          }}
                          size="sm"
                          type="button"
                          variant={isBuilderSection ? "outline" : "default"}
                        >
                          Workspace
                        </Button>
                        <Button
                          className="justify-center"
                          onClick={() => {
                            router.push(builderEntryHref);
                            setIsMobileMenuOpen(false);
                          }}
                          size="sm"
                          type="button"
                          variant={isBuilderSection ? "default" : "outline"}
                        >
                          Builder
                        </Button>
                      </div>

                      <div className="px-3">
                        <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                          {isBuilderSection ? "Builder" : "Workspace"}
                        </div>
                      </div>
                    </div>
                    <NavContent
                      items={mobileNavItems}
                      onItemClick={() => setIsMobileMenuOpen(false)}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}

          <Link
            className="flex shrink-0 items-center gap-2 md:gap-3"
            href="/app"
          >
            <div className="hidden rounded-lg bg-primary/15 p-1.5 text-primary lg:flex">
              <Sparkles className="size-4" />
            </div>
            <span className="hidden font-semibold text-sm tracking-tight md:text-base lg:inline">
              SuperrStudio
            </span>
          </Link>

          {isWorkflowSection ? <WorkflowSelector pathname={pathname} /> : null}
        </div>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="relative flex h-9 w-56 items-center rounded-full border bg-muted/70 p-1">
            <div
              className={cn(
                "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm transition-transform duration-300",
                isBuilderSection ? "translate-x-full" : "translate-x-0"
              )}
            />
            <button
              className={cn(
                "relative z-10 flex-1 rounded-full font-medium text-xs transition-colors",
                isBuilderSection ? "text-muted-foreground" : "text-foreground"
              )}
              onClick={() => router.push("/app")}
              type="button"
            >
              Workspace
            </button>
            <button
              className={cn(
                "relative z-10 flex-1 rounded-full font-medium text-xs transition-colors",
                isBuilderSection ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => router.push(builderEntryHref)}
              type="button"
            >
              Builder
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
