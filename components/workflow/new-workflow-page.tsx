"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { nanoid } from "nanoid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
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

  // Reset sidebar animation state when on homepage
  useEffect(() => {
    setHasSidebarBeenShown(false);
  }, [setHasSidebarBeenShown]);

  // Update page title when workflow name changes
  useEffect(() => {
    document.title = `${currentWorkflowName} - AI Workflow Builder`;
  }, [currentWorkflowName]);

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
        <div className="pointer-events-auto w-full max-w-md rounded-xl border bg-background/95 p-6 text-center shadow-lg backdrop-blur">
          <h1 className="font-semibold text-2xl tracking-tight">
            No workflow selected
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Create a new workflow to start building in the canvas.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              disabled={isCreating}
              onClick={handleCreateWorkflow}
              size="sm"
            >
              {isCreating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Create New Workflow
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/app/workflows">All Workflows</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
