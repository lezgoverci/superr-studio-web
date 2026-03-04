"use client";

import { useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
  edgesAtom,
  hasUnsavedChangesAtom,
  nodesAtom,
  selectedNodeAtom,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeData,
} from "@/lib/workflow-store";

type WorkflowOperation =
  | { op: "addNode"; node: WorkflowNode }
  | { op: "addEdge"; edge: WorkflowEdge }
  | { op: "removeNode"; nodeId: string }
  | { op: "removeEdge"; edgeId: string }
  | {
      op: "updateNode";
      nodeId: string;
      updates: {
        position?: { x: number; y: number };
        data?: Partial<WorkflowNodeData>;
      };
    }
  | {
      op: "updateEdge";
      edgeId: string;
      updates: {
        source?: string;
        target?: string;
        sourceHandle?: string | null;
        targetHandle?: string | null;
      };
    }
  | { op: "replaceAll"; nodes: WorkflowNode[]; edges: WorkflowEdge[] };

export function useWorkflowStream(workflowId: string | null) {
  const setNodes = useSetAtom(nodesAtom);
  const setEdges = useSetAtom(edgesAtom);
  const setSelectedNode = useSetAtom(selectedNodeAtom);
  const setHasUnsavedChanges = useSetAtom(hasUnsavedChangesAtom);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Skip the very first replaceAll event (initial state from SSE)
  // since loadExistingWorkflow already loaded the workflow
  const hasReceivedInitialStateRef = useRef(false);

  const applyOperation = useCallback(
    (operation: WorkflowOperation) => {
      // Skip the initial replaceAll sent by the SSE endpoint on connect —
      // loadExistingWorkflow already sets the correct state with idle statuses.
      if (
        operation.op === "replaceAll" &&
        !hasReceivedInitialStateRef.current
      ) {
        hasReceivedInitialStateRef.current = true;
        return;
      }

      switch (operation.op) {
        case "addNode": {
          // Directly update nodesAtom instead of using addNodeAtom,
          // which triggers history snapshots and autosave. Streaming
          // operations should only update the canvas — the user saves manually.
          const node = operation.node as WorkflowNode;
          setNodes((nodes) => {
            // Deselect existing nodes
            const updated = nodes.map((n) => ({ ...n, selected: false }));
            return [...updated, { ...node, selected: true }];
          });
          setSelectedNode(node.id);
          setHasUnsavedChanges(true);
          break;
        }
        case "addEdge": {
          const edge = operation.edge as WorkflowEdge;
          setEdges((edges) => [...edges, edge]);
          setHasUnsavedChanges(true);
          break;
        }
        case "removeNode": {
          const { nodeId } = operation;
          setNodes((nodes) => nodes.filter((n) => n.id !== nodeId));
          setEdges((edges) =>
            edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
          );
          setSelectedNode(null);
          setHasUnsavedChanges(true);
          break;
        }
        case "removeEdge": {
          const { edgeId } = operation;
          setEdges((edges) => edges.filter((e) => e.id !== edgeId));
          setHasUnsavedChanges(true);
          break;
        }
        case "updateNode": {
          const { nodeId, updates } = operation;
          setNodes((nodes) =>
            nodes.map((n) => {
              if (n.id !== nodeId) return n;
              return {
                ...n,
                ...(updates.position ? { position: updates.position } : {}),
                ...(updates.data
                  ? { data: { ...n.data, ...updates.data } }
                  : {}),
              };
            })
          );
          setHasUnsavedChanges(true);
          break;
        }
        case "updateEdge": {
          const { edgeId, updates } = operation;
          setEdges((edges) =>
            edges.map((e) => {
              if (e.id !== edgeId) return e;
              return { ...e, ...updates };
            })
          );
          setHasUnsavedChanges(true);
          break;
        }
        case "replaceAll": {
          setNodes(operation.nodes as WorkflowNode[]);
          setEdges(operation.edges as WorkflowEdge[]);
          setHasUnsavedChanges(true);
          break;
        }
      }
    },
    [setEdges, setNodes, setSelectedNode, setHasUnsavedChanges]
  );

  useEffect(() => {
    console.log("[Workflow Stream] useEffect running, workflowId:", workflowId);
    if (!workflowId) return;

    const MAX_RECONNECT_DELAY = 30_000;
    const BASE_RECONNECT_DELAY = 1000;

    // Reset the initial state flag when the workflow changes
    hasReceivedInitialStateRef.current = false;

    const connect = () => {
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/workflows/${workflowId}/stream`;
      console.log("[Workflow Stream] Creating EventSource to:", url);
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        console.log("[Workflow Stream] Connected for workflow:", workflowId);
        reconnectAttemptsRef.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const operation = JSON.parse(event.data) as WorkflowOperation;
          console.log("[Workflow Stream] Received operation:", operation.op);
          applyOperation(operation);
        } catch (error) {
          console.error("[Workflow Stream] Failed to parse operation:", error);
        }
      };

      es.onerror = (event) => {
        console.error(
          "[Workflow Stream] EventSource error, readyState:",
          es.readyState,
          "event:",
          event
        );
        es.close();
        eventSourceRef.current = null;

        // Exponential backoff reconnection
        const attempts = reconnectAttemptsRef.current;
        const delay = Math.min(
          BASE_RECONNECT_DELAY * 2 ** attempts,
          MAX_RECONNECT_DELAY
        );
        console.log(
          `[Workflow Stream] Reconnecting in ${delay}ms (attempt ${attempts + 1})`
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
  }, [workflowId, applyOperation]);

  return { applyOperation };
}
