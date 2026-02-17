import { nanoid } from "nanoid";

export type WorkflowRouteBody = {
  name?: string;
  description?: string | null;
  nodes?: unknown[];
  edges?: unknown[];
  visibility?: unknown;
  uiSpec?: unknown;
  uiSpecVersion?: unknown;
  uiMetadata?: unknown;
};

export function createDefaultTriggerNode() {
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

export function normalizeWorkflowVisibility(
  value: unknown
): "private" | "public" {
  return value === "public" ? "public" : "private";
}

export function serializeWorkflowDates<
  T extends { createdAt: Date; updatedAt: Date },
>(workflow: T) {
  return {
    ...workflow,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
  };
}
