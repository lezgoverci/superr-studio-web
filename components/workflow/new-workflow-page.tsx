"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { ArrowRight, Clock, Loader2, Plus } from "lucide-react";
import { nanoid } from "nanoid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, type SavedWorkflow } from "@/lib/api-client";
import { signInWithWhop, useSession } from "@/lib/auth-client";
import {
  currentWorkflowIdAtom,
  currentWorkflowNameAtom,
  currentWorkflowVisibilityAtom,
  edgesAtom,
  hasSidebarBeenShownAtom,
  isTransitioningFromHomepageAtom,
  nodesAtom,
  type WorkflowNode,
} from "@/lib/workflow-store";

// Helper function to create a default trigger node
function createDefaultTriggerNode() {
  return {
    id: nanoid(),
    type: "trigger" as const,
    position: { x: 0, y: 0 },
    data: {
      label: "",
      description: "",
      type: "trigger" as const,
      config: { triggerType: "Manual" },
      status: "idle" as const,
    },
  };
}

export function NewWorkflowPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const nodes = useAtomValue(nodesAtom);
  const setNodes = useSetAtom(nodesAtom);
  const setEdges = useSetAtom(edgesAtom);
  const setCurrentWorkflowId = useSetAtom(currentWorkflowIdAtom);
  const setCurrentWorkflowName = useSetAtom(currentWorkflowNameAtom);
  const setCurrentWorkflowVisibility = useSetAtom(
    currentWorkflowVisibilityAtom
  );
  const setHasSidebarBeenShown = useSetAtom(hasSidebarBeenShownAtom);
  const setIsTransitioningFromHomepage = useSetAtom(
    isTransitioningFromHomepageAtom
  );
  const currentWorkflowName = useAtomValue(currentWorkflowNameAtom);
  const [isCreating, setIsCreating] = useState(false);
  const [recentWorkflows, setRecentWorkflows] = useState<SavedWorkflow[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true);

  // Reset sidebar animation state when on homepage
  useEffect(() => {
    setHasSidebarBeenShown(false);
  }, [setHasSidebarBeenShown]);

  // Update page title when workflow name changes
  useEffect(() => {
    document.title = `${currentWorkflowName} - AI Workflow Builder`;
  }, [currentWorkflowName]);

  // Fetch recent workflows
  useEffect(() => {
    async function fetchRecentWorkflows() {
      if (!session) {
        setIsLoadingWorkflows(false);
        return;
      }
      try {
        const allWorkflows = await api.workflow.getAll();
        const filtered = allWorkflows
          .filter((w) => w.name !== "__current__")
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          .slice(0, 3);
        setRecentWorkflows(filtered);
      } catch (error) {
        console.error("Failed to fetch recent workflows:", error);
      } finally {
        setIsLoadingWorkflows(false);
      }
    }
    fetchRecentWorkflows();
  }, [session]);

  // Require Whop authentication before creating workflows.
  const ensureSession = useCallback(async () => {
    if (!session) {
      await signInWithWhop(window.location.pathname);
      throw new Error("Authentication required");
    }
  }, [session]);

  const handleCreateWorkflow = useCallback(async () => {
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      await ensureSession();

      const initialNode: WorkflowNode = createDefaultTriggerNode();
      const newWorkflow = await api.workflow.create({
        name: "Untitled Workflow",
        description: "",
        nodes: [initialNode],
        edges: [],
      });

      sessionStorage.setItem("animate-sidebar", "true");
      setIsTransitioningFromHomepage(true);
      router.replace(`/app/workflows/${newWorkflow.id}`);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Authentication required"
      ) {
        return;
      }
      console.error("Failed to create workflow:", error);
      toast.error("Failed to create workflow");
    } finally {
      setIsCreating(false);
    }
  }, [ensureSession, isCreating, router, setIsTransitioningFromHomepage]);

  // Initialize a clean canvas state for explicit creation.
  useLayoutEffect(() => {
    setNodes([]);
    setEdges([]);
    setCurrentWorkflowId(null);
    setCurrentWorkflowName("New Workflow");
    setCurrentWorkflowVisibility("private");
  }, [
    setNodes,
    setEdges,
    setCurrentWorkflowId,
    setCurrentWorkflowName,
    setCurrentWorkflowVisibility,
  ]);

  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-center p-6">
      {nodes.length === 0 ? (
        <div className="pointer-events-auto w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-border/50 bg-background/50 shadow-sm backdrop-blur-xl">
              <Plus className="size-6 text-foreground/70" />
            </div>
            <div className="space-y-1.5">
              <h1 className="font-semibold text-xl tracking-tight">
                Start building
              </h1>
              <p className="text-muted-foreground text-sm">
                Create a new workflow or continue where you left off.
              </p>
            </div>
            <Button
              className="mt-2 h-9 rounded-lg px-4 shadow-sm"
              disabled={isCreating}
              onClick={handleCreateWorkflow}
            >
              {isCreating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Create New Workflow
            </Button>
          </div>

          {session && !isLoadingWorkflows && recentWorkflows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  <Clock className="size-3.5" />
                  Recent workflows
                </h2>
                <Link
                  className="group flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
                  href="/app/workflows"
                >
                  See all{" "}
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {recentWorkflows.map((workflow) => (
                  <button
                    className="group flex w-full items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3 text-left shadow-sm backdrop-blur-xl transition-all hover:border-border hover:bg-accent/50"
                    key={workflow.id}
                    onClick={() => router.push(`/app/workflows/${workflow.id}`)}
                    type="button"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5 pr-4">
                      <p className="truncate font-medium text-sm">
                        {workflow.name}
                      </p>
                      <p className="line-clamp-1 text-muted-foreground text-xs">
                        {workflow.description || "No description"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/80 p-1.5 opacity-0 shadow-sm transition-all group-hover:opacity-100">
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {session && !isLoadingWorkflows && recentWorkflows.length === 0 && (
            <div className="flex justify-center pt-2">
              <Link
                className="group flex items-center gap-1.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
                href="/app/workflows"
              >
                See all workflows{" "}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
