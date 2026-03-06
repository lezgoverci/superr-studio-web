"use client";

import { useReactFlow } from "@xyflow/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Check,
  Copy,
  FileDown,
  FileUp,
  Globe,
  Loader2,
  Lock,
  Play,
  Plus,
  Redo2,
  Rocket,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { signInWithWhop, useSession } from "@/lib/auth-client";
import { integrationsAtom } from "@/lib/integrations-store";
import type { IntegrationType } from "@/lib/types/integration";
import {
  addNodeAtom,
  canRedoAtom,
  canUndoAtom,
  clearWorkflowAtom,
  currentWorkflowIdAtom,
  currentWorkflowNameAtom,
  currentWorkflowVisibilityAtom,
  deleteEdgeAtom,
  deleteNodeAtom,
  edgesAtom,
  hasUnsavedChangesAtom,
  isExecutingAtom,
  isGeneratingAtom,
  isSavingAtom,
  isWorkflowOwnerAtom,
  nodesAtom,
  type PropertiesPanelTab,
  propertiesPanelActiveTabAtom,
  redoAtom,
  selectedEdgeAtom,
  selectedExecutionIdAtom,
  selectedNodeAtom,
  setExecutionRunIdForExecutionAtom,
  triggerExecuteAtom,
  undoAtom,
  updateNodeDataAtom,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowVisibility,
} from "@/lib/workflow-store";
import {
  actionRequiresIntegration,
  findActionById,
  flattenConfigFields,
  getIntegrationLabels,
} from "@/plugins";
import { ConfigurationOverlay } from "../overlays/configuration-overlay";
import { ConfirmOverlay } from "../overlays/confirm-overlay";
import { ExportWorkflowOverlay } from "../overlays/export-workflow-overlay";
import { MakePublicOverlay } from "../overlays/make-public-overlay";
import { useOverlay } from "../overlays/overlay-provider";
import { PublishWorkflowOverlay } from "../overlays/publish-workflow-overlay";
import { WorkflowIssuesOverlay } from "../overlays/workflow-issues-overlay";

type WorkflowToolbarProps = {
  workflowId?: string;
};

type WorkflowJsonFile = {
  version?: number;
  exportedAt?: string;
  name?: string;
  description?: string;
  visibility?: WorkflowVisibility;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

type WorkflowImportPayload = Parameters<typeof api.workflow.update>[1] & {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

function isWorkflowJsonFile(value: unknown): value is WorkflowJsonFile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  const hasValidVisibility =
    payload.visibility === undefined ||
    payload.visibility === "private" ||
    payload.visibility === "public";

  return (
    Array.isArray(payload.nodes) &&
    Array.isArray(payload.edges) &&
    hasValidVisibility
  );
}

function sanitizeWorkflowFileName(name?: string): string {
  const fallback = "workflow";
  const sanitized = (name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || fallback;
}

const ZIP_BINARY_EXTENSIONS = new Set([
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

const TOOLBAR_GROUP_CLASSNAME =
  "rounded-xl border border-[color:var(--workflow-panel-border)] bg-[var(--workflow-panel-bg)] p-1 shadow-[var(--workflow-panel-shadow)] backdrop-blur-sm";
const TOOLBAR_BUTTON_CLASSNAME =
  "!border-0 !bg-transparent shadow-none transition-colors hover:bg-[var(--workflow-control-hover-bg)] hover:text-[color:var(--workflow-node-text)] disabled:opacity-100 disabled:[&>svg]:text-[color:var(--workflow-node-muted)]";
const TOOLBAR_BUTTON_CLASSNAME_BASIC =
  "!border-0 !bg-transparent shadow-none transition-colors hover:bg-[var(--workflow-control-hover-bg)] hover:text-[color:var(--workflow-node-text)]";
const TOOLBAR_DROPDOWN_CLASSNAME =
  "rounded-xl border border-[color:var(--workflow-menu-border)] bg-[var(--workflow-menu-bg)] p-1.5 shadow-[var(--workflow-menu-shadow)] backdrop-blur-md";
const TOOLBAR_SEPARATOR_CLASSNAME = "bg-[color:var(--workflow-panel-border)]";
const TOOLBAR_BUTTON_STYLE = {
  color: "var(--workflow-node-muted, var(--muted-foreground))",
};

function notifyExportWarnings(warnings?: string[]) {
  const filteredWarnings = warnings?.filter(
    (warning) => warning.trim().length > 0
  );
  if (!filteredWarnings || filteredWarnings.length === 0) {
    return;
  }

  const warningSummary = filteredWarnings.slice(0, 2).join(" ");
  toast.info(`Export warnings: ${warningSummary}`);
}

async function downloadWorkflowZip(
  files: Record<string, string>,
  workflowName: string
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const [path, content] of Object.entries(files)) {
    const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
    const isBinary = ZIP_BINARY_EXTENSIONS.has(ext);
    zip.file(path, content, { base64: isBinary });
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeWorkflowFileName(workflowName)}-workflow.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function parseWorkflowJsonImportFile(
  file: File
): Promise<WorkflowJsonFile> {
  const fileContent = await file.text();
  const parsed = JSON.parse(fileContent) as unknown;

  if (!isWorkflowJsonFile(parsed)) {
    throw new Error("Invalid workflow JSON format");
  }

  return parsed;
}

function buildWorkflowImportPayload(
  parsed: WorkflowJsonFile
): WorkflowImportPayload {
  const payload: WorkflowImportPayload = {
    nodes: parsed.nodes.map((node) => ({
      ...node,
      selected: false,
    })),
    edges: parsed.edges.map((edge) => ({
      ...edge,
      selected: false,
    })),
  };

  const importedName =
    typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (importedName) {
    payload.name = importedName;
  }
  if (typeof parsed.description === "string") {
    payload.description = parsed.description;
  }
  if (parsed.visibility === "private" || parsed.visibility === "public") {
    payload.visibility = parsed.visibility;
  }

  return payload;
}

// Helper functions to reduce complexity
function updateNodesStatus(
  nodes: WorkflowNode[],
  updateNodeData: (update: {
    id: string;
    data: { status?: "idle" | "running" | "success" | "error" };
  }) => void,
  status: "idle" | "running" | "success" | "error"
) {
  for (const node of nodes) {
    updateNodeData({ id: node.id, data: { status } });
  }
}

type MissingIntegrationInfo = {
  integrationType: IntegrationType;
  integrationLabel: string;
  nodeNames: string[];
};

// Built-in actions that require integrations but aren't in the plugin registry
const BUILTIN_ACTION_INTEGRATIONS: Record<string, IntegrationType> = {
  "Database Query": "database",
};

// Labels for built-in integration types that don't have plugins
const BUILTIN_INTEGRATION_LABELS: Record<string, string> = {
  database: "Database",
};

// Type for broken template reference info
type BrokenTemplateReferenceInfo = {
  nodeId: string;
  nodeLabel: string;
  brokenReferences: Array<{
    fieldKey: string;
    fieldLabel: string;
    referencedNodeId: string;
    displayText: string;
  }>;
};

// Extract template variables from a string and check if they reference existing nodes
function extractTemplateReferences(
  value: unknown
): Array<{ nodeId: string; displayText: string }> {
  if (typeof value !== "string") {
    return [];
  }

  const pattern = /\{\{@([^:]+):([^}]+)\}\}/g;
  const matches = value.matchAll(pattern);

  return Array.from(matches).map((match) => ({
    nodeId: match[1],
    displayText: match[2],
  }));
}

// Recursively extract all template references from a config object
function extractAllTemplateReferences(
  config: Record<string, unknown>,
  prefix = ""
): Array<{ field: string; nodeId: string; displayText: string }> {
  const results: Array<{ field: string; nodeId: string; displayText: string }> =
    [];

  for (const [key, value] of Object.entries(config)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "string") {
      const refs = extractTemplateReferences(value);
      for (const ref of refs) {
        results.push({ field: fieldPath, ...ref });
      }
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      results.push(
        ...extractAllTemplateReferences(
          value as Record<string, unknown>,
          fieldPath
        )
      );
    }
  }

  return results;
}

// Get broken template references for workflow nodes
function getBrokenTemplateReferences(
  nodes: WorkflowNode[]
): BrokenTemplateReferenceInfo[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const brokenByNode: BrokenTemplateReferenceInfo[] = [];

  for (const node of nodes) {
    // Skip disabled nodes
    if (node.data.enabled === false) {
      continue;
    }

    const config = node.data.config as Record<string, unknown> | undefined;
    if (!config || typeof config !== "object") {
      continue;
    }

    const allRefs = extractAllTemplateReferences(config);
    const brokenRefs = allRefs.filter((ref) => !nodeIds.has(ref.nodeId));

    if (brokenRefs.length > 0) {
      // Get action for label lookups
      const actionType = config.actionType as string | undefined;
      const action = actionType ? findActionById(actionType) : undefined;
      const flatFields = action ? flattenConfigFields(action.configFields) : [];

      brokenByNode.push({
        nodeId: node.id,
        nodeLabel: node.data.label || action?.label || "Unnamed Step",
        brokenReferences: brokenRefs.map((ref) => {
          // Look up human-readable field label
          const configField = flatFields.find((f) => f.key === ref.field);
          return {
            fieldKey: ref.field,
            fieldLabel: configField?.label || ref.field,
            referencedNodeId: ref.nodeId,
            displayText: ref.displayText,
          };
        }),
      });
    }
  }

  return brokenByNode;
}

// Type for missing required fields info
type MissingRequiredFieldInfo = {
  nodeId: string;
  nodeLabel: string;
  missingFields: Array<{
    fieldKey: string;
    fieldLabel: string;
  }>;
};

// Check if a field value is effectively empty
function isFieldEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  return false;
}

// Check if a conditional field should be shown based on current config
function shouldShowField(
  field: { showWhen?: { field: string; equals: string } },
  config: Record<string, unknown>
): boolean {
  if (!field.showWhen) {
    return true;
  }
  return config[field.showWhen.field] === field.showWhen.equals;
}

// Get missing required fields for a single node
function getNodeMissingFields(
  node: WorkflowNode
): MissingRequiredFieldInfo | null {
  if (node.data.enabled === false) {
    return null;
  }

  const config = node.data.config as Record<string, unknown> | undefined;
  const actionType = config?.actionType as string | undefined;
  if (!actionType) {
    return null;
  }

  const action = findActionById(actionType);
  if (!action) {
    return null;
  }

  // Flatten grouped fields to check all required fields
  const flatFields = flattenConfigFields(action.configFields);

  const missingFields = flatFields
    .filter(
      (field) =>
        field.required &&
        shouldShowField(field, config || {}) &&
        isFieldEmpty(config?.[field.key])
    )
    .map((field) => ({
      fieldKey: field.key,
      fieldLabel: field.label,
    }));

  if (missingFields.length === 0) {
    return null;
  }

  return {
    nodeId: node.id,
    nodeLabel: node.data.label || action.label || "Unnamed Step",
    missingFields,
  };
}

// Get missing required fields for workflow nodes
function getMissingRequiredFields(
  nodes: WorkflowNode[]
): MissingRequiredFieldInfo[] {
  return nodes
    .map(getNodeMissingFields)
    .filter((result): result is MissingRequiredFieldInfo => result !== null);
}

function getRequiredIntegrationTypeForAction(
  actionType: string
): IntegrationType | undefined {
  const action = findActionById(actionType);
  if (action && !actionRequiresIntegration(actionType)) {
    return;
  }

  return (
    (action?.integration as IntegrationType | undefined) ||
    BUILTIN_ACTION_INTEGRATIONS[actionType]
  );
}

function hasValidNodeIntegration(
  node: WorkflowNode,
  userIntegrationIds: Set<string>
): boolean {
  const configuredIntegrationId = node.data.config?.integrationId as
    | string
    | undefined;
  return Boolean(
    configuredIntegrationId && userIntegrationIds.has(configuredIntegrationId)
  );
}

function getWorkflowNodeActionLabel(
  node: WorkflowNode,
  actionType: string
): string {
  const actionInfo = findActionById(actionType);
  return node.data.label || actionInfo?.label || actionType;
}

// Get missing integrations for workflow nodes
// Uses the plugin registry to determine which integrations are required
// Also handles built-in actions that aren't in the plugin registry
function getMissingIntegrations(
  nodes: WorkflowNode[],
  userIntegrations: Array<{ id: string; type: IntegrationType }>
): MissingIntegrationInfo[] {
  const userIntegrationTypes = new Set(userIntegrations.map((i) => i.type));
  const userIntegrationIds = new Set(userIntegrations.map((i) => i.id));
  const missingByType = new Map<IntegrationType, string[]>();
  const integrationLabels = getIntegrationLabels();

  for (const node of nodes) {
    // Skip disabled nodes
    if (node.data.enabled === false) {
      continue;
    }

    const actionType = node.data.config?.actionType as string | undefined;
    if (!actionType) {
      continue;
    }

    const requiredIntegrationType =
      getRequiredIntegrationTypeForAction(actionType);
    if (!requiredIntegrationType) {
      continue;
    }

    if (hasValidNodeIntegration(node, userIntegrationIds)) {
      continue;
    }

    // Check if user has any integration of this type
    if (!userIntegrationTypes.has(requiredIntegrationType)) {
      const existing = missingByType.get(requiredIntegrationType) || [];
      existing.push(getWorkflowNodeActionLabel(node, actionType));
      missingByType.set(requiredIntegrationType, existing);
    }
  }

  return Array.from(missingByType.entries()).map(
    ([integrationType, nodeNames]) => ({
      integrationType,
      integrationLabel:
        integrationLabels[integrationType] ||
        BUILTIN_INTEGRATION_LABELS[integrationType] ||
        integrationType,
      nodeNames,
    })
  );
}

type ExecuteTestWorkflowParams = {
  workflowId: string;
  nodes: WorkflowNode[];
  updateNodeData: (update: {
    id: string;
    data: { status?: "idle" | "running" | "success" | "error" };
  }) => void;
  setIsExecuting: (value: boolean) => void;
  setSelectedExecutionId: (value: string | null) => void;
  setExecutionRunIdForExecution: (payload: {
    executionId: string;
    workflowRunId: string | null;
  }) => void;
};

async function executeTestWorkflow({
  workflowId,
  nodes,
  updateNodeData,
  setIsExecuting,
  setSelectedExecutionId,
  setExecutionRunIdForExecution,
}: ExecuteTestWorkflowParams) {
  // Set all nodes to idle first
  updateNodesStatus(nodes, updateNodeData, "idle");

  // Immediately set trigger nodes to running for instant visual feedback
  for (const node of nodes) {
    if (node.data.type === "trigger") {
      updateNodeData({ id: node.id, data: { status: "running" } });
    }
  }

  try {
    // Start the execution via API
    const response = await fetch(`/api/workflow/${workflowId}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: {} }),
    });

    if (!response.ok) {
      throw new Error("Failed to execute workflow");
    }

    const result = await response.json();

    if (typeof result.executionId === "string") {
      setExecutionRunIdForExecution({
        executionId: result.executionId,
        workflowRunId:
          typeof result.workflowRunId === "string"
            ? result.workflowRunId
            : null,
      });
    }

    // Select the new execution
    setSelectedExecutionId(result.executionId);
  } catch (error) {
    console.error("Failed to execute workflow:", error);
    toast.error(
      error instanceof Error ? error.message : "Failed to execute workflow"
    );
    updateNodesStatus(nodes, updateNodeData, "error");
    setIsExecuting(false);
  }
}

// Hook for workflow handlers
type WorkflowHandlerParams = {
  currentWorkflowId: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  updateNodeData: (update: {
    id: string;
    data: { status?: "idle" | "running" | "success" | "error" };
  }) => void;
  isExecuting: boolean;
  setIsExecuting: (value: boolean) => void;
  setIsSaving: (value: boolean) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  setActiveTab: (value: PropertiesPanelTab) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedExecutionId: (id: string | null) => void;
  setExecutionRunIdForExecution: (payload: {
    executionId: string;
    workflowRunId: string | null;
  }) => void;
  userIntegrations: Array<{ id: string; type: IntegrationType }>;
};

function useWorkflowHandlers({
  currentWorkflowId,
  nodes,
  edges,
  updateNodeData,
  isExecuting,
  setIsExecuting,
  setIsSaving,
  setHasUnsavedChanges,
  setActiveTab,
  setNodes,
  setEdges,
  setSelectedNodeId,
  setSelectedExecutionId,
  setExecutionRunIdForExecution,
  userIntegrations,
}: WorkflowHandlerParams) {
  const { open: openOverlay } = useOverlay();

  const handleSave = async () => {
    if (!currentWorkflowId) {
      return;
    }

    setIsSaving(true);
    try {
      await api.workflow.update(currentWorkflowId, { nodes, edges });
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to save workflow:", error);
      toast.error("Failed to save workflow. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const executeWorkflow = async () => {
    if (!currentWorkflowId) {
      toast.error("Please save the workflow before executing");
      return;
    }

    // Switch to Runs tab when starting a test run
    setActiveTab("runs");

    // Deselect all nodes and edges
    setNodes(nodes.map((node) => ({ ...node, selected: false })));
    setEdges(edges.map((edge) => ({ ...edge, selected: false })));
    setSelectedNodeId(null);

    setIsExecuting(true);
    await executeTestWorkflow({
      workflowId: currentWorkflowId,
      nodes,
      updateNodeData,
      setIsExecuting,
      setSelectedExecutionId,
      setExecutionRunIdForExecution,
    });
    // Don't set executing to false here - page-level stream events handle completion.
  };

  const handleGoToStep = (nodeId: string, fieldKey?: string) => {
    setSelectedNodeId(nodeId);
    setActiveTab("properties");

    // Focus on the specific field after a short delay to allow the panel to render
    if (fieldKey) {
      setTimeout(() => {
        const element = document.getElementById(fieldKey);
        if (element) {
          element.focus();
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    }
  };

  const handleExecute = async () => {
    // Guard against concurrent executions
    if (isExecuting) {
      return;
    }

    // Collect all workflow issues at once
    const brokenRefs = getBrokenTemplateReferences(nodes);
    const missingFields = getMissingRequiredFields(nodes);
    const missingIntegrations = getMissingIntegrations(nodes, userIntegrations);

    // If there are any issues, show the workflow issues overlay
    if (
      brokenRefs.length > 0 ||
      missingFields.length > 0 ||
      missingIntegrations.length > 0
    ) {
      openOverlay(WorkflowIssuesOverlay, {
        issues: {
          brokenReferences: brokenRefs,
          missingRequiredFields: missingFields,
          missingIntegrations,
        },
        onGoToStep: handleGoToStep,
        onRunAnyway: executeWorkflow,
      });
      return;
    }

    await executeWorkflow();
  };

  return {
    handleSave,
    handleExecute,
  };
}

// Hook for workflow state management
function useWorkflowState() {
  const [nodes, setNodes] = useAtom(nodesAtom);
  const [edges, setEdges] = useAtom(edgesAtom);
  const [isExecuting, setIsExecuting] = useAtom(isExecutingAtom);
  const [isGenerating] = useAtom(isGeneratingAtom);
  const clearWorkflow = useSetAtom(clearWorkflowAtom);
  const updateNodeData = useSetAtom(updateNodeDataAtom);
  const [currentWorkflowId] = useAtom(currentWorkflowIdAtom);
  const [workflowName, setCurrentWorkflowName] = useAtom(
    currentWorkflowNameAtom
  );
  const [workflowVisibility, setWorkflowVisibility] = useAtom(
    currentWorkflowVisibilityAtom
  );
  const isOwner = useAtomValue(isWorkflowOwnerAtom);
  const router = useRouter();
  const [isSaving, setIsSaving] = useAtom(isSavingAtom);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useAtom(
    hasUnsavedChangesAtom
  );
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const addNode = useSetAtom(addNodeAtom);
  const [canUndo] = useAtom(canUndoAtom);
  const [canRedo] = useAtom(canRedoAtom);
  const { data: session } = useSession();
  const setActiveTab = useSetAtom(propertiesPanelActiveTabAtom);
  const setSelectedNodeId = useSetAtom(selectedNodeAtom);
  const setSelectedExecutionId = useSetAtom(selectedExecutionIdAtom);
  const setExecutionRunIdForExecution = useSetAtom(
    setExecutionRunIdForExecutionAtom
  );
  const userIntegrations = useAtomValue(integrationsAtom);
  const [triggerExecute, setTriggerExecute] = useAtom(triggerExecuteAtom);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  return {
    nodes,
    edges,
    isExecuting,
    setIsExecuting,
    isGenerating,
    clearWorkflow,
    updateNodeData,
    currentWorkflowId,
    workflowName,
    setCurrentWorkflowName,
    workflowVisibility,
    setWorkflowVisibility,
    isOwner,
    router,
    isSaving,
    setIsSaving,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    undo,
    redo,
    addNode,
    canUndo,
    canRedo,
    session,
    isDownloading,
    setIsDownloading,
    isDuplicating,
    setIsDuplicating,
    setActiveTab,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedExecutionId,
    setExecutionRunIdForExecution,
    userIntegrations,
    triggerExecute,
    setTriggerExecute,
  };
}

// Hook for workflow actions
function useWorkflowActions(state: ReturnType<typeof useWorkflowState>) {
  const { open: openOverlay } = useOverlay();
  const {
    currentWorkflowId,
    workflowName,
    nodes,
    edges,
    updateNodeData,
    isExecuting,
    setIsExecuting,
    setIsSaving,
    setHasUnsavedChanges,
    clearWorkflow,
    setCurrentWorkflowName,
    workflowVisibility,
    setWorkflowVisibility,
    setIsDownloading,
    setIsDuplicating,
    setActiveTab,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedExecutionId,
    setExecutionRunIdForExecution,
    userIntegrations,
    triggerExecute,
    setTriggerExecute,
    router,
    session,
  } = state;

  const { handleSave, handleExecute } = useWorkflowHandlers({
    currentWorkflowId,
    nodes,
    edges,
    updateNodeData,
    isExecuting,
    setIsExecuting,
    setIsSaving,
    setHasUnsavedChanges,
    setActiveTab,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedExecutionId,
    setExecutionRunIdForExecution,
    userIntegrations,
  });

  // Listen for execute trigger from keyboard shortcut
  useEffect(() => {
    if (triggerExecute) {
      setTriggerExecute(false);
      handleExecute();
    }
  }, [triggerExecute, setTriggerExecute, handleExecute]);

  const handleClearWorkflow = () => {
    openOverlay(ConfirmOverlay, {
      title: "Clear Workflow",
      message:
        "Are you sure you want to clear all nodes and connections? This action cannot be undone.",
      confirmLabel: "Clear Workflow",
      confirmVariant: "destructive" as const,
      destructive: true,
      onConfirm: () => {
        clearWorkflow();
      },
    });
  };

  const handleDeleteWorkflow = () => {
    openOverlay(ConfirmOverlay, {
      title: "Delete Workflow",
      message: `Are you sure you want to delete "${workflowName}"? This will permanently delete the workflow. This cannot be undone.`,
      confirmLabel: "Delete Workflow",
      confirmVariant: "destructive" as const,
      destructive: true,
      onConfirm: async () => {
        if (!currentWorkflowId) {
          return;
        }
        try {
          await api.workflow.delete(currentWorkflowId);
          toast.success("Workflow deleted successfully");
          window.location.href = "/";
        } catch (error) {
          console.error("Failed to delete workflow:", error);
          toast.error("Failed to delete workflow. Please try again.");
        }
      },
    });
  };

  const handleDownload = async () => {
    if (!currentWorkflowId) {
      toast.error("Please save the workflow before downloading");
      return;
    }

    setIsDownloading(true);
    toast.info("Preparing workflow files for download...");

    try {
      const result = await api.workflow.download(currentWorkflowId);

      if (!result.success) {
        throw new Error(result.error || "Failed to prepare download");
      }

      if (!result.files) {
        throw new Error("No files to download");
      }

      notifyExportWarnings(result.warnings);
      await downloadWorkflowZip(result.files, workflowName);

      toast.success("Workflow downloaded successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download workflow"
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExportJson = () => {
    if (nodes.length === 0) {
      toast.error("Nothing to export");
      return;
    }

    try {
      const payload: WorkflowJsonFile = {
        version: 1,
        exportedAt: new Date().toISOString(),
        name: workflowName,
        visibility: workflowVisibility,
        nodes,
        edges,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeWorkflowFileName(workflowName)}-workflow.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Workflow JSON exported");
    } catch (error) {
      console.error("Failed to export workflow JSON:", error);
      toast.error("Failed to export workflow JSON");
    }
  };

  const handleImportJson = async (file: File) => {
    if (!currentWorkflowId) {
      toast.error("Please save the workflow before importing");
      return;
    }

    setIsSaving(true);

    try {
      const parsed = await parseWorkflowJsonImportFile(file);
      const updatePayload = buildWorkflowImportPayload(parsed);

      await api.workflow.update(currentWorkflowId, updatePayload);

      setNodes(updatePayload.nodes);
      setEdges(updatePayload.edges);
      setSelectedNodeId(null);
      setSelectedExecutionId(null);

      if (updatePayload.name) {
        setCurrentWorkflowName(updatePayload.name);
      }

      if (updatePayload.visibility) {
        setWorkflowVisibility(updatePayload.visibility);
      }

      setHasUnsavedChanges(false);
      toast.success("Workflow imported from JSON");
    } catch (error) {
      console.error("Failed to import workflow JSON:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to import workflow JSON"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleVisibility = async (newVisibility: WorkflowVisibility) => {
    if (!currentWorkflowId) {
      return;
    }

    // Show confirmation overlay when making public
    if (newVisibility === "public") {
      openOverlay(MakePublicOverlay, {
        onConfirm: async () => {
          try {
            await api.workflow.update(currentWorkflowId, {
              visibility: "public",
            });
            setWorkflowVisibility("public");
            toast.success("Workflow is now public");
          } catch (error) {
            console.error("Failed to update visibility:", error);
            toast.error("Failed to update visibility. Please try again.");
          }
        },
      });
      return;
    }

    // Switch to private immediately (no risks)
    try {
      await api.workflow.update(currentWorkflowId, {
        visibility: newVisibility,
      });
      setWorkflowVisibility(newVisibility);
      toast.success("Workflow is now private");
    } catch (error) {
      console.error("Failed to update visibility:", error);
      toast.error("Failed to update visibility. Please try again.");
    }
  };

  const handleDuplicate = async () => {
    if (!currentWorkflowId) {
      return;
    }

    setIsDuplicating(true);
    try {
      // Require authentication before duplication.
      if (!session?.user) {
        await signInWithWhop(window.location.pathname);
        return;
      }

      const newWorkflow = await api.workflow.duplicate(currentWorkflowId);
      toast.success("Workflow duplicated successfully");
      router.push(`/app/workflows/${newWorkflow.id}`);
    } catch (error) {
      console.error("Failed to duplicate workflow:", error);
      toast.error("Failed to duplicate workflow. Please try again.");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleGenerateUi = async () => {
    if (!currentWorkflowId) {
      return;
    }

    try {
      const result = await api.workflow.composeUiSpec(currentWorkflowId);
      toast.success("Run form generated");
      router.push(result.runUrl);
    } catch (error) {
      console.error("Failed to generate workflow run form:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to generate workflow run form"
      );
    }
  };

  return {
    handleSave,
    handleExecute,
    handleClearWorkflow,
    handleDeleteWorkflow,
    handleDownload,
    handleExportJson,
    handleImportJson,
    handleToggleVisibility,
    handleDuplicate,
    handleGenerateUi,
  };
}

function ToolbarGroupSeparator({
  orientation = "vertical",
}: {
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <ButtonGroupSeparator
      className={TOOLBAR_SEPARATOR_CLASSNAME}
      orientation={orientation}
    />
  );
}

// Toolbar Actions Component - handles add step, undo/redo, save, and run buttons
function ToolbarActions({
  workflowId,
  state,
  actions,
}: {
  workflowId?: string;
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  const { open: openOverlay, push } = useOverlay();
  const [selectedNodeId] = useAtom(selectedNodeAtom);
  const [selectedEdgeId] = useAtom(selectedEdgeAtom);
  const [nodes] = useAtom(nodesAtom);
  const [edges] = useAtom(edgesAtom);
  const deleteNode = useSetAtom(deleteNodeAtom);
  const deleteEdge = useSetAtom(deleteEdgeAtom);
  const { screenToFlowPosition } = useReactFlow();

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const hasSelection = selectedNode || selectedEdge;

  // For non-owners viewing public workflows, don't show toolbar actions
  // (Duplicate button is now in the main toolbar next to Sign In)
  if (workflowId && !state.isOwner) {
    return null;
  }

  if (!workflowId) {
    return null;
  }

  const handleDeleteConfirm = () => {
    const isNode = Boolean(selectedNodeId);
    const itemType = isNode ? "Node" : "Connection";

    push(ConfirmOverlay, {
      title: `Delete ${itemType}`,
      message: `Are you sure you want to delete this ${itemType.toLowerCase()}? This action cannot be undone.`,
      confirmLabel: "Delete",
      confirmVariant: "destructive" as const,
      onConfirm: () => {
        if (selectedNodeId) {
          deleteNode(selectedNodeId);
        } else if (selectedEdgeId) {
          deleteEdge(selectedEdgeId);
        }
      },
    });
  };

  const handleAddStep = () => {
    // Get the ReactFlow wrapper (the visible canvas container)
    const flowWrapper = document.querySelector(".react-flow");
    if (!flowWrapper) {
      return;
    }

    const rect = flowWrapper.getBoundingClientRect();
    // Calculate center in absolute screen coordinates
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Convert to flow coordinates
    const position = screenToFlowPosition({ x: centerX, y: centerY });

    // Adjust for node dimensions to center it properly
    // Action node is 192px wide and 192px tall (w-48 h-48 in Tailwind)
    const nodeWidth = 192;
    const nodeHeight = 192;
    position.x -= nodeWidth / 2;
    position.y -= nodeHeight / 2;

    // Check if there's already a node at this position
    const offset = 20; // Offset distance in pixels
    const threshold = 20; // How close nodes need to be to be considered overlapping

    const finalPosition = { ...position };
    let hasOverlap = true;
    let attempts = 0;
    const maxAttempts = 20; // Prevent infinite loop

    while (hasOverlap && attempts < maxAttempts) {
      hasOverlap = state.nodes.some((node) => {
        const dx = Math.abs(node.position.x - finalPosition.x);
        const dy = Math.abs(node.position.y - finalPosition.y);
        return dx < threshold && dy < threshold;
      });

      if (hasOverlap) {
        // Offset diagonally down-right
        finalPosition.x += offset;
        finalPosition.y += offset;
        attempts += 1;
      }
    }

    // Create new action node
    const newNode: WorkflowNode = {
      id: nanoid(),
      type: "action",
      position: finalPosition,
      data: {
        label: "",
        description: "",
        type: "action",
        config: {},
        status: "idle",
      },
    };

    state.addNode(newNode);
    state.setSelectedNodeId(newNode.id);
    state.setActiveTab("properties");
  };

  return (
    <>
      {/* Mobile: single vertical toolbar group */}
      <ButtonGroup
        className={`${TOOLBAR_GROUP_CLASSNAME} flex lg:hidden`}
        orientation="vertical"
      >
        <Button
          className={TOOLBAR_BUTTON_CLASSNAME}
          disabled={state.isGenerating}
          onClick={handleAddStep}
          size="icon"
          style={TOOLBAR_BUTTON_STYLE}
          title="Add Step"
          variant="secondary"
        >
          <Plus className="size-4" />
        </Button>
        <ToolbarGroupSeparator orientation="horizontal" />
        <Button
          className={TOOLBAR_BUTTON_CLASSNAME_BASIC}
          onClick={() => openOverlay(ConfigurationOverlay, {})}
          size="icon"
          style={TOOLBAR_BUTTON_STYLE}
          title="Configuration"
          variant="secondary"
        >
          <Settings2 className="size-4" />
        </Button>
        {hasSelection && (
          <Button
            className={TOOLBAR_BUTTON_CLASSNAME_BASIC}
            onClick={handleDeleteConfirm}
            size="icon"
            style={TOOLBAR_BUTTON_STYLE}
            title="Delete"
            variant="secondary"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        <ToolbarGroupSeparator orientation="horizontal" />
        <Button
          className={TOOLBAR_BUTTON_CLASSNAME}
          disabled={!state.canUndo || state.isGenerating}
          onClick={() => state.undo()}
          size="icon"
          style={TOOLBAR_BUTTON_STYLE}
          title="Undo"
          variant="secondary"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          className={TOOLBAR_BUTTON_CLASSNAME}
          disabled={!state.canRedo || state.isGenerating}
          onClick={() => state.redo()}
          size="icon"
          style={TOOLBAR_BUTTON_STYLE}
          title="Redo"
          variant="secondary"
        >
          <Redo2 className="size-4" />
        </Button>
        <ToolbarGroupSeparator orientation="horizontal" />
        <SaveButton handleSave={actions.handleSave} state={state} />
        <ExportButton actions={actions} state={state} />
        <PublishButton state={state} />
        <JsonImportButton actions={actions} state={state} />
        <ToolbarGroupSeparator orientation="horizontal" />
        <VisibilityButton actions={actions} state={state} />
        <ToolbarGroupSeparator orientation="horizontal" />
        <GenerateUiButton actions={actions} state={state} />
        <ToolbarGroupSeparator orientation="horizontal" />
        <RunButtonGroup actions={actions} state={state} />
      </ButtonGroup>

      {/* Desktop: single horizontal toolbar group */}
      <ButtonGroup
        className={`${TOOLBAR_GROUP_CLASSNAME} hidden lg:flex`}
        orientation="horizontal"
      >
        <Button
          className={TOOLBAR_BUTTON_CLASSNAME}
          disabled={state.isGenerating}
          onClick={handleAddStep}
          size="icon"
          style={TOOLBAR_BUTTON_STYLE}
          title="Add Step"
          variant="secondary"
        >
          <Plus className="size-4" />
        </Button>
        <ToolbarGroupSeparator />
        <Button
          className={TOOLBAR_BUTTON_CLASSNAME}
          disabled={!state.canUndo || state.isGenerating}
          onClick={() => state.undo()}
          size="icon"
          style={TOOLBAR_BUTTON_STYLE}
          title="Undo"
          variant="secondary"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          className={TOOLBAR_BUTTON_CLASSNAME}
          disabled={!state.canRedo || state.isGenerating}
          onClick={() => state.redo()}
          size="icon"
          style={TOOLBAR_BUTTON_STYLE}
          title="Redo"
          variant="secondary"
        >
          <Redo2 className="size-4" />
        </Button>
        <ToolbarGroupSeparator />
        <SaveButton handleSave={actions.handleSave} state={state} />
        <ExportButton actions={actions} state={state} />
        <PublishButton state={state} />
        <JsonImportButton actions={actions} state={state} />
        <ToolbarGroupSeparator />
        <VisibilityButton actions={actions} state={state} />
        <ToolbarGroupSeparator />
        <GenerateUiButton actions={actions} state={state} />
        <ToolbarGroupSeparator />
        <RunButtonGroup actions={actions} state={state} />
      </ButtonGroup>
    </>
  );
}

// Save Button Component
function SaveButton({
  state,
  handleSave,
}: {
  state: ReturnType<typeof useWorkflowState>;
  handleSave: () => Promise<void>;
}) {
  return (
    <Button
      className={`relative ${TOOLBAR_BUTTON_CLASSNAME}`}
      disabled={
        !state.currentWorkflowId || state.isGenerating || state.isSaving
      }
      onClick={handleSave}
      size="icon"
      style={TOOLBAR_BUTTON_STYLE}
      title={state.isSaving ? "Saving..." : "Save workflow"}
      variant="secondary"
    >
      {state.isSaving ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Save className="size-4" />
      )}
      {state.hasUnsavedChanges && !state.isSaving && (
        <div className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
      )}
    </Button>
  );
}

// Publish Button Component
function PublishButton({
  state,
}: {
  state: ReturnType<typeof useWorkflowState>;
}) {
  const { open: openOverlay } = useOverlay();

  const handleClick = () => {
    if (state.currentWorkflowId) {
      openOverlay(PublishWorkflowOverlay, {
        workflowId: state.currentWorkflowId,
      });
    }
  };

  return (
    <Button
      className={TOOLBAR_BUTTON_CLASSNAME}
      disabled={
        state.nodes.length === 0 ||
        state.isGenerating ||
        !state.currentWorkflowId
      }
      onClick={handleClick}
      size="icon"
      style={TOOLBAR_BUTTON_STYLE}
      title="Publish to Vercel"
      variant="secondary"
    >
      <Rocket className="size-4" />
    </Button>
  );
}

// Export Button Component
function ExportButton({
  state,
  actions,
}: {
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  const { open: openOverlay } = useOverlay();

  const handleClick = () => {
    openOverlay(ExportWorkflowOverlay, {
      onExportCode: actions.handleDownload,
      onExportJson: actions.handleExportJson,
      isExportingCode: state.isDownloading,
    });
  };

  return (
    <Button
      className={TOOLBAR_BUTTON_CLASSNAME}
      disabled={
        state.isDownloading ||
        state.nodes.length === 0 ||
        state.isGenerating ||
        !state.currentWorkflowId
      }
      onClick={handleClick}
      size="icon"
      style={TOOLBAR_BUTTON_STYLE}
      title={state.isDownloading ? "Preparing export..." : "Export"}
      variant="secondary"
    >
      {state.isDownloading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FileDown className="size-4" />
      )}
    </Button>
  );
}

// JSON Import Button Component
function JsonImportButton({
  state,
  actions,
}: {
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const isWorkflowUnavailable =
    !state.currentWorkflowId || state.isGenerating || state.isSaving;

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow selecting the same file again.
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsImporting(true);
    try {
      await actions.handleImportJson(file);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <input
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <Button
        className={TOOLBAR_BUTTON_CLASSNAME}
        disabled={isWorkflowUnavailable || isImporting}
        onClick={handleImportClick}
        size="icon"
        style={TOOLBAR_BUTTON_STYLE}
        title={isImporting ? "Importing JSON..." : "Import JSON"}
        variant="secondary"
      >
        {isImporting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileUp className="size-4" />
        )}
      </Button>
    </>
  );
}

// Visibility Button Component
function VisibilityButton({
  state,
  actions,
}: {
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  const isPublic = state.workflowVisibility === "public";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={TOOLBAR_BUTTON_CLASSNAME_BASIC}
          disabled={!state.currentWorkflowId || state.isGenerating}
          size="icon"
          style={TOOLBAR_BUTTON_STYLE}
          title={isPublic ? "Public workflow" : "Private workflow"}
          variant="secondary"
        >
          {isPublic ? (
            <Globe className="size-4" />
          ) : (
            <Lock className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={TOOLBAR_DROPDOWN_CLASSNAME}>
        <DropdownMenuItem
          className="flex items-center gap-2"
          onClick={() => actions.handleToggleVisibility("private")}
        >
          <Lock className="size-4" />
          Private
          {!isPublic && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center gap-2"
          onClick={() => actions.handleToggleVisibility("public")}
        >
          <Globe className="size-4" />
          Public
          {isPublic && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Run Button Group Component
function RunButtonGroup({
  state,
  actions,
}: {
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  return (
    <Button
      className={TOOLBAR_BUTTON_CLASSNAME}
      disabled={
        state.isExecuting || state.nodes.length === 0 || state.isGenerating
      }
      onClick={() => actions.handleExecute()}
      size="icon"
      style={TOOLBAR_BUTTON_STYLE}
      title="Run Workflow"
      variant="secondary"
    >
      {state.isExecuting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Play className="size-4" />
      )}
    </Button>
  );
}

function GenerateUiButton({
  state,
  actions,
}: {
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  const [isGeneratingUi, setIsGeneratingUi] = useState(false);

  const handleClick = async () => {
    setIsGeneratingUi(true);
    try {
      await actions.handleGenerateUi();
    } finally {
      setIsGeneratingUi(false);
    }
  };

  return (
    <Button
      className={TOOLBAR_BUTTON_CLASSNAME}
      disabled={
        !state.currentWorkflowId ||
        state.isGenerating ||
        state.isExecuting ||
        state.isSaving ||
        isGeneratingUi
      }
      onClick={handleClick}
      size="icon"
      style={TOOLBAR_BUTTON_STYLE}
      title={isGeneratingUi ? "Generating run form..." : "Generate run form"}
      variant="secondary"
    >
      {isGeneratingUi ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
    </Button>
  );
}

// Duplicate Button Component - placed next to Sign In for non-owners
function DuplicateButton({
  isDuplicating,
  onDuplicate,
}: {
  isDuplicating: boolean;
  onDuplicate: () => void;
}) {
  return (
    <Button
      className={`h-9 ${TOOLBAR_BUTTON_CLASSNAME_BASIC}`}
      disabled={isDuplicating}
      onClick={onDuplicate}
      size="sm"
      style={TOOLBAR_BUTTON_STYLE}
      title="Duplicate to your workflows"
      variant="secondary"
    >
      {isDuplicating ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Copy className="mr-2 size-4" />
      )}
      Duplicate
    </Button>
  );
}

export const WorkflowToolbar = ({ workflowId }: WorkflowToolbarProps) => {
  const state = useWorkflowState();
  const actions = useWorkflowActions(state);

  return (
    <div className="workflow-toolbar pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+4.5rem)] right-4 z-10">
      <div className="flex flex-col-reverse items-end gap-2 lg:flex-row lg:items-center">
        {workflowId && !state.isOwner ? (
          <span className="text-[color:var(--workflow-node-muted,var(--muted-foreground))] text-xs uppercase">
            Read-only
          </span>
        ) : null}
        <ToolbarActions
          actions={actions}
          state={state}
          workflowId={workflowId}
        />
        {workflowId && !state.isOwner ? (
          <DuplicateButton
            isDuplicating={state.isDuplicating}
            onDuplicate={actions.handleDuplicate}
          />
        ) : null}
      </div>
    </div>
  );
};
