import { z } from "zod";

// Node data config — arbitrary key/value map
const WorkflowNodeDataSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  type: z.enum(["trigger", "action"]),
  config: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["idle", "running", "success", "error"]).optional(),
  enabled: z.boolean().optional(),
});

// ReactFlow node with workflow data
export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: WorkflowNodeDataSchema,
});

// ReactFlow edge
export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string().optional(),
  label: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const WorkflowNodesSchema = z.array(WorkflowNodeSchema);
export const WorkflowEdgesSchema = z.array(WorkflowEdgeSchema);

// Request body for the agent compose endpoint
export const AgentComposeWorkflowSchema = z.object({
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().optional(),
  nodes: WorkflowNodesSchema,
  edges: WorkflowEdgesSchema,
});

export type AgentComposeWorkflowInput = z.infer<
  typeof AgentComposeWorkflowSchema
>;
