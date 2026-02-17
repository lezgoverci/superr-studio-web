"use client";

import { getByPath, type Spec, setByPath } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { workflowRunRegistry } from "@/lib/workflow-run/registry";

type WorkflowRunnerProps = {
  workflowId: string;
  spec: Spec;
  isOwner: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveExecutionInput(
  params: Record<string, unknown> | undefined,
  state: Record<string, unknown>
): Record<string, unknown> {
  if (isRecord(params?.input)) {
    return params.input;
  }

  if (isRecord(params) && Object.keys(params).length > 0) {
    return params;
  }

  const formInput = getByPath(state, "/form");
  if (isRecord(formInput)) {
    return formInput;
  }

  return state;
}

type ExecuteWorkflowResponse = {
  executionId?: string;
  error?: string;
};

async function executeWorkflow(
  workflowId: string,
  input: Record<string, unknown>
): Promise<string | null> {
  const response = await fetch(`/api/workflow/${workflowId}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  const result = (await response
    .json()
    .catch(() => ({}))) as ExecuteWorkflowResponse;
  if (!response.ok) {
    throw new Error(result.error || "Failed to execute workflow");
  }

  return result.executionId ?? null;
}

function notifyExecutionError(
  error: unknown,
  setErrorMessage: (value: string | null) => void
) {
  const message =
    error instanceof Error ? error.message : "Failed to execute workflow";
  setErrorMessage(message);
  toast.error(message);
}

export function WorkflowRunner({
  workflowId,
  spec,
  isOwner,
}: WorkflowRunnerProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initialState = useMemo(() => {
    if (isRecord(spec.state)) {
      return spec.state;
    }
    return {};
  }, [spec.state]);

  const stateRef = useRef<Record<string, unknown>>(initialState);

  useEffect(() => {
    stateRef.current = initialState;
  }, [initialState]);

  const handleStateChange = useCallback((path: string, value: unknown) => {
    const nextState = { ...stateRef.current };
    setByPath(nextState, path, value);
    stateRef.current = nextState;
  }, []);

  const actionHandlers = useMemo(
    () => ({
      submitWorkflow: async (params: Record<string, unknown>) => {
        if (!isOwner) {
          const message =
            "Only the workflow owner can execute runs from this page.";
          setErrorMessage(message);
          toast.error(message);
          return;
        }

        setIsExecuting(true);
        setErrorMessage(null);

        try {
          const input = resolveExecutionInput(params, stateRef.current);
          const nextExecutionId = await executeWorkflow(workflowId, input);
          setExecutionId(nextExecutionId);
          toast.success("Workflow execution started");
        } catch (error) {
          notifyExecutionError(error, setErrorMessage);
        } finally {
          setIsExecuting(false);
        }
      },
    }),
    [isOwner, workflowId]
  );

  return (
    <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border bg-background p-6 shadow-sm">
      <StateProvider
        initialState={initialState}
        onStateChange={handleStateChange}
      >
        <VisibilityProvider>
          <ActionProvider handlers={actionHandlers}>
            <Renderer
              loading={isExecuting}
              registry={workflowRunRegistry}
              spec={spec}
            />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>

      {executionId ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          Execution started. Execution ID: <code>{executionId}</code>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
