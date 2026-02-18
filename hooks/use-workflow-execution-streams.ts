"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  type ExecutionStatusStreamEvent,
  isWorkflowStatusStreamEvent,
  type NodeStatusStreamEvent,
  type WorkflowStatusStreamEvent,
} from "@/lib/workflow-status-stream";
import {
  executionRunIdByExecutionIdAtom,
  isExecutingAtom,
  removeTrackedExecutionIdAtom,
  trackedExecutionIdsAtom,
  updateNodeStatusesAtom,
  upsertExecutionLiveNodeEventAtom,
  upsertExecutionLiveTerminalEventAtom,
} from "@/lib/workflow-store";

const TERMINAL_EXECUTION_STATUSES = new Set(["success", "error", "cancelled"]);

type UseWorkflowExecutionStreamsOptions = {
  selectedExecutionId: string | null;
  workflowId: string;
};

type StreamSubscription = {
  source: EventSource;
  handleMessage: (event: MessageEvent<string>) => void;
  handleNamedMessage: (event: Event) => void;
  handleError: (event: Event) => void;
};

function parseWorkflowStatusStreamMessage(
  messageData: string
): WorkflowStatusStreamEvent | null {
  try {
    const parsedData = JSON.parse(messageData);
    if (isWorkflowStatusStreamEvent(parsedData)) {
      return parsedData;
    }
  } catch (error) {
    console.error("Failed to parse workflow stream message:", error);
  }

  return null;
}

function hasWorkflowRunId(
  executionId: string,
  executionRunIdByExecutionId: Record<string, string | null>
): boolean {
  const workflowRunId = executionRunIdByExecutionId[executionId];
  return typeof workflowRunId === "string" && workflowRunId.length > 0;
}

function applyNodeStatusEvent(options: {
  executionId: string;
  streamEvent: NodeStatusStreamEvent;
  selectedExecutionIdRef: { current: string | null };
  updateNodeStatuses: (
    updates: Array<{
      nodeId: string;
      status: "idle" | "running" | "success" | "error";
    }>
  ) => void;
  setIsExecuting: (value: boolean) => void;
  upsertExecutionLiveNodeEvent: (event: NodeStatusStreamEvent) => void;
}): void {
  const {
    executionId,
    selectedExecutionIdRef,
    setIsExecuting,
    streamEvent,
    updateNodeStatuses,
    upsertExecutionLiveNodeEvent,
  } = options;

  upsertExecutionLiveNodeEvent(streamEvent);

  if (selectedExecutionIdRef.current !== executionId) {
    return;
  }

  updateNodeStatuses([
    {
      nodeId: streamEvent.nodeId,
      status: streamEvent.status,
    },
  ]);

  if (streamEvent.status === "running") {
    setIsExecuting(true);
  }
}

function applyExecutionStatusEvent(options: {
  executionId: string;
  streamEvent: ExecutionStatusStreamEvent;
  selectedExecutionIdRef: { current: string | null };
  removeTrackedExecutionId: (executionId: string) => void;
  setIsExecuting: (value: boolean) => void;
  upsertExecutionLiveTerminalEvent: (event: ExecutionStatusStreamEvent) => void;
}): void {
  const {
    executionId,
    removeTrackedExecutionId,
    selectedExecutionIdRef,
    setIsExecuting,
    streamEvent,
    upsertExecutionLiveTerminalEvent,
  } = options;

  upsertExecutionLiveTerminalEvent(streamEvent);
  removeTrackedExecutionId(streamEvent.executionId);

  if (
    selectedExecutionIdRef.current === executionId &&
    TERMINAL_EXECUTION_STATUSES.has(streamEvent.status)
  ) {
    setIsExecuting(false);
  }
}

export function useWorkflowExecutionStreams({
  selectedExecutionId,
  workflowId,
}: UseWorkflowExecutionStreamsOptions): void {
  const trackedExecutionIds = useAtomValue(trackedExecutionIdsAtom);
  const executionRunIdByExecutionId = useAtomValue(
    executionRunIdByExecutionIdAtom
  );

  const setIsExecuting = useSetAtom(isExecutingAtom);
  const updateNodeStatuses = useSetAtom(updateNodeStatusesAtom);
  const upsertExecutionLiveNodeEvent = useSetAtom(
    upsertExecutionLiveNodeEventAtom
  );
  const upsertExecutionLiveTerminalEvent = useSetAtom(
    upsertExecutionLiveTerminalEventAtom
  );
  const removeTrackedExecutionId = useSetAtom(removeTrackedExecutionIdAtom);

  const selectedExecutionIdRef = useRef(selectedExecutionId);
  const workflowIdRef = useRef(workflowId);
  const subscriptionsRef = useRef<Map<string, StreamSubscription>>(new Map());

  useEffect(() => {
    selectedExecutionIdRef.current = selectedExecutionId;
  }, [selectedExecutionId]);

  const closeSubscription = useCallback((executionId: string) => {
    const subscription = subscriptionsRef.current.get(executionId);
    if (!subscription) {
      return;
    }

    subscription.source.onmessage = null;
    subscription.source.onerror = null;
    subscription.source.removeEventListener(
      "node_status",
      subscription.handleNamedMessage
    );
    subscription.source.removeEventListener(
      "execution_status",
      subscription.handleNamedMessage
    );
    subscription.source.close();
    subscriptionsRef.current.delete(executionId);
  }, []);

  const closeAllSubscriptions = useCallback(() => {
    for (const executionId of subscriptionsRef.current.keys()) {
      closeSubscription(executionId);
    }
  }, [closeSubscription]);

  const watchedExecutionIds = useMemo(() => {
    const watched = new Set<string>();

    for (const executionId of trackedExecutionIds) {
      if (hasWorkflowRunId(executionId, executionRunIdByExecutionId)) {
        watched.add(executionId);
      }
    }

    if (
      selectedExecutionId &&
      hasWorkflowRunId(selectedExecutionId, executionRunIdByExecutionId)
    ) {
      watched.add(selectedExecutionId);
    }

    return watched;
  }, [executionRunIdByExecutionId, selectedExecutionId, trackedExecutionIds]);

  useEffect(() => {
    for (const executionId of subscriptionsRef.current.keys()) {
      if (!watchedExecutionIds.has(executionId)) {
        closeSubscription(executionId);
      }
    }

    for (const executionId of watchedExecutionIds) {
      if (subscriptionsRef.current.has(executionId)) {
        continue;
      }

      const source = new EventSource(
        `/api/workflows/executions/${executionId}/stream`
      );

      const handleMessage = (event: MessageEvent<string>) => {
        const streamEvent = parseWorkflowStatusStreamMessage(event.data);
        if (!streamEvent || streamEvent.executionId !== executionId) {
          return;
        }

        if (streamEvent.type === "node_status") {
          applyNodeStatusEvent({
            executionId,
            selectedExecutionIdRef,
            setIsExecuting,
            streamEvent,
            updateNodeStatuses,
            upsertExecutionLiveNodeEvent,
          });
          return;
        }

        applyExecutionStatusEvent({
          executionId,
          removeTrackedExecutionId,
          selectedExecutionIdRef,
          setIsExecuting,
          streamEvent,
          upsertExecutionLiveTerminalEvent,
        });
        closeSubscription(executionId);
      };

      const handleNamedMessage = (event: Event) => {
        handleMessage(event as MessageEvent<string>);
      };

      const handleError = (event: Event) => {
        // EventSource reconnects automatically for transient errors.
        console.error(
          `Workflow execution stream error for execution ${executionId}:`,
          event
        );
      };

      source.onmessage = handleMessage;
      source.onerror = handleError;
      source.addEventListener("node_status", handleNamedMessage);
      source.addEventListener("execution_status", handleNamedMessage);

      subscriptionsRef.current.set(executionId, {
        source,
        handleMessage,
        handleNamedMessage,
        handleError,
      });
    }
  }, [
    closeSubscription,
    removeTrackedExecutionId,
    setIsExecuting,
    updateNodeStatuses,
    upsertExecutionLiveNodeEvent,
    upsertExecutionLiveTerminalEvent,
    watchedExecutionIds,
  ]);

  useEffect(() => {
    if (workflowIdRef.current === workflowId) {
      return;
    }

    closeAllSubscriptions();
    workflowIdRef.current = workflowId;
  }, [closeAllSubscriptions, workflowId]);

  useEffect(() => () => closeAllSubscriptions(), [closeAllSubscriptions]);
}
