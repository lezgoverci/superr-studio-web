import type { WorkflowOperation } from "./workflow-subscriptions";

type NodeLike = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type EdgeLike = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  [key: string]: unknown;
};

type ValidatedWorkflowState = {
  oldNodes: NodeLike[];
  oldEdges: EdgeLike[];
  newNodes: NodeLike[];
  newEdges: EdgeLike[];
};

function isNodeLike(value: unknown): value is NodeLike {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as NodeLike).id === "string"
  );
}

function isEdgeLike(value: unknown): value is EdgeLike {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as EdgeLike).id === "string" &&
    typeof (value as EdgeLike).source === "string" &&
    typeof (value as EdgeLike).target === "string"
  );
}

/**
 * Compare two values for shallow equality.
 * Works for primitives, arrays, and plain objects (one level deep).
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a !== "object") {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => v === b[i]);
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => aObj[key] === bObj[key]);
}

/**
 * Deep equality check using JSON serialization.
 * Suitable for comparing node data/config objects.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateWorkflowState(
  oldNodes: unknown[],
  oldEdges: unknown[],
  newNodes: unknown[],
  newEdges: unknown[]
): ValidatedWorkflowState | null {
  const validOldNodes = oldNodes.filter(isNodeLike);
  const validNewNodes = newNodes.filter(isNodeLike);
  const validOldEdges = oldEdges.filter(isEdgeLike);
  const validNewEdges = newEdges.filter(isEdgeLike);

  const hasInvalidShape =
    validOldNodes.length !== oldNodes.length ||
    validNewNodes.length !== newNodes.length ||
    validOldEdges.length !== oldEdges.length ||
    validNewEdges.length !== newEdges.length;

  if (hasInvalidShape) {
    return null;
  }

  return {
    oldNodes: validOldNodes,
    oldEdges: validOldEdges,
    newNodes: validNewNodes,
    newEdges: validNewEdges,
  };
}

function createNodeUpdate(
  oldNode: NodeLike,
  newNode: NodeLike
): { position?: { x: number; y: number }; data?: unknown } | null {
  const updates: { position?: { x: number; y: number }; data?: unknown } = {};
  let hasUpdates = false;

  const hasPositionChange =
    !!newNode.position &&
    !(oldNode.position && shallowEqual(oldNode.position, newNode.position));
  if (hasPositionChange) {
    updates.position = newNode.position;
    hasUpdates = true;
  }

  if (newNode.data && !deepEqual(oldNode.data, newNode.data)) {
    updates.data = newNode.data;
    hasUpdates = true;
  }

  return hasUpdates ? updates : null;
}

function createEdgeUpdate(
  oldEdge: EdgeLike,
  newEdge: EdgeLike
): Record<string, unknown> | null {
  const updates: Record<string, unknown> = {};
  let hasUpdates = false;

  if (newEdge.source !== oldEdge.source) {
    updates.source = newEdge.source;
    hasUpdates = true;
  }
  if (newEdge.target !== oldEdge.target) {
    updates.target = newEdge.target;
    hasUpdates = true;
  }
  if (newEdge.sourceHandle !== oldEdge.sourceHandle) {
    updates.sourceHandle = newEdge.sourceHandle;
    hasUpdates = true;
  }
  if (newEdge.targetHandle !== oldEdge.targetHandle) {
    updates.targetHandle = newEdge.targetHandle;
    hasUpdates = true;
  }

  return hasUpdates ? updates : null;
}

function collectNodeOperations(
  oldNodes: NodeLike[],
  newNodes: NodeLike[]
): WorkflowOperation[] {
  const operations: WorkflowOperation[] = [];
  const oldNodeMap = new Map(oldNodes.map((node) => [node.id, node]));
  const newNodeMap = new Map(newNodes.map((node) => [node.id, node]));

  for (const [id] of oldNodeMap) {
    if (!newNodeMap.has(id)) {
      operations.push({ op: "removeNode", nodeId: id });
    }
  }

  for (const [id, node] of newNodeMap) {
    if (!oldNodeMap.has(id)) {
      operations.push({ op: "addNode", node });
    }
  }

  for (const [id, newNode] of newNodeMap) {
    const oldNode = oldNodeMap.get(id);
    if (!oldNode) {
      continue;
    }

    const updates = createNodeUpdate(oldNode, newNode);
    if (updates) {
      operations.push({ op: "updateNode", nodeId: id, updates });
    }
  }

  return operations;
}

function collectEdgeOperations(
  oldEdges: EdgeLike[],
  newEdges: EdgeLike[]
): WorkflowOperation[] {
  const operations: WorkflowOperation[] = [];
  const oldEdgeMap = new Map(oldEdges.map((edge) => [edge.id, edge]));
  const newEdgeMap = new Map(newEdges.map((edge) => [edge.id, edge]));

  for (const [id] of oldEdgeMap) {
    if (!newEdgeMap.has(id)) {
      operations.push({ op: "removeEdge", edgeId: id });
    }
  }

  for (const [id, edge] of newEdgeMap) {
    if (!oldEdgeMap.has(id)) {
      operations.push({ op: "addEdge", edge });
    }
  }

  for (const [id, newEdge] of newEdgeMap) {
    const oldEdge = oldEdgeMap.get(id);
    if (!oldEdge) {
      continue;
    }

    const updates = createEdgeUpdate(oldEdge, newEdge);
    if (updates) {
      operations.push({ op: "updateEdge", edgeId: id, updates });
    }
  }

  return operations;
}

/**
 * Compute fine-grained WorkflowOperations by diffing old and new workflow state.
 *
 * Returns individual addNode, removeNode, updateNode, addEdge, removeEdge,
 * updateEdge operations. Falls back to replaceAll if the inputs are not
 * valid node/edge arrays.
 */
export function diffWorkflow(
  oldNodes: unknown[],
  oldEdges: unknown[],
  newNodes: unknown[],
  newEdges: unknown[]
): WorkflowOperation[] {
  const validatedState = validateWorkflowState(
    oldNodes,
    oldEdges,
    newNodes,
    newEdges
  );
  if (!validatedState) {
    return [{ op: "replaceAll", nodes: newNodes, edges: newEdges }];
  }

  const operations = [
    ...collectNodeOperations(validatedState.oldNodes, validatedState.newNodes),
    ...collectEdgeOperations(validatedState.oldEdges, validatedState.newEdges),
  ];

  // If no differences found, skip broadcast
  if (operations.length === 0) {
    return [];
  }

  return operations;
}
