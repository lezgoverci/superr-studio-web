export type WorkflowOperation =
  | {
      op: "addNode";
      node: unknown;
    }
  | {
      op: "addEdge";
      edge: unknown;
    }
  | {
      op: "removeNode";
      nodeId: string;
    }
  | {
      op: "removeEdge";
      edgeId: string;
    }
  | {
      op: "updateNode";
      nodeId: string;
      updates: {
        position?: { x: number; y: number };
        data?: unknown;
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
  | {
      op: "replaceAll";
      nodes: unknown[];
      edges: unknown[];
    };

type Subscriber = (operation: WorkflowOperation) => void;

type WorkflowSubscriptions = {
  subscriptions: Map<string, Set<Subscriber>>;
  latestOperations: Map<string, WorkflowOperation>;
};

// Use globalThis to ensure a single instance survives HMR / module reload
// in Next.js dev mode. Without this, the PATCH route and stream route may
// import separate copies of this module and operate on different Maps.
const GLOBAL_KEY = "__workflow_subscriptions__" as const;

function getGlobalState(): WorkflowSubscriptions {
  const g = globalThis as unknown as Record<string, WorkflowSubscriptions>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      subscriptions: new Map(),
      latestOperations: new Map(),
    };
  }
  return g[GLOBAL_KEY];
}

export function getLatestOperation(
  workflowId: string
): WorkflowOperation | undefined {
  return getGlobalState().latestOperations.get(workflowId.toLowerCase());
}

export function subscribe(
  workflowId: string,
  subscriber: Subscriber
): () => void {
  const state = getGlobalState();
  const normalizedId = workflowId.toLowerCase();

  if (!state.subscriptions.has(normalizedId)) {
    state.subscriptions.set(normalizedId, new Set());
  }

  const subs = state.subscriptions.get(normalizedId);
  if (!subs) return () => {};

  subs.add(subscriber);

  console.log(
    `[Workflow Subscriptions] Subscriber added for ${normalizedId}, total: ${subs.size}`
  );

  return () => {
    subs.delete(subscriber);
    console.log(
      `[Workflow Subscriptions] Subscriber removed for ${normalizedId}, remaining: ${subs.size}`
    );
    if (subs.size === 0) {
      state.subscriptions.delete(normalizedId);
    }
  };
}

export function broadcast(
  workflowId: string,
  operation: WorkflowOperation
): void {
  const state = getGlobalState();
  const normalizedId = workflowId.toLowerCase();

  state.latestOperations.set(normalizedId, operation);

  const subs = state.subscriptions.get(normalizedId);
  console.log(
    `[Workflow Subscriptions] Broadcasting ${operation.op} for ${normalizedId}, subscribers: ${subs?.size ?? 0}`
  );

  if (!subs) return;

  for (const subscriber of subs) {
    try {
      subscriber(operation);
    } catch (error) {
      console.error("Error in workflow subscriber:", error);
    }
  }
}

export function broadcastBatch(
  workflowId: string,
  operations: WorkflowOperation[]
): void {
  for (const operation of operations) {
    broadcast(workflowId, operation);
  }
}
