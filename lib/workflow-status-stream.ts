export const EXECUTION_STATUS_STREAM_NAMESPACE = "execution-status" as const;

export type NodeExecutionStatus = "running" | "success" | "error";
export type TerminalExecutionStatus = "success" | "error" | "cancelled";

export type NodeStatusStreamEvent = {
  type: "node_status";
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: NodeExecutionStatus;
  timestamp: string;
  output?: unknown;
  error?: string;
};

export type ExecutionStatusStreamEvent = {
  type: "execution_status";
  executionId: string;
  status: TerminalExecutionStatus;
  timestamp: string;
  output?: unknown;
  error?: string;
};

export type WorkflowStatusStreamEvent =
  | NodeStatusStreamEvent
  | ExecutionStatusStreamEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isWorkflowStatusStreamEvent(
  value: unknown
): value is WorkflowStatusStreamEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "node_status") {
    return (
      typeof value.executionId === "string" &&
      typeof value.nodeId === "string" &&
      typeof value.nodeName === "string" &&
      typeof value.nodeType === "string" &&
      (value.status === "running" ||
        value.status === "success" ||
        value.status === "error") &&
      typeof value.timestamp === "string"
    );
  }

  if (value.type === "execution_status") {
    return (
      typeof value.executionId === "string" &&
      (value.status === "success" ||
        value.status === "error" ||
        value.status === "cancelled") &&
      typeof value.timestamp === "string"
    );
  }

  return false;
}
