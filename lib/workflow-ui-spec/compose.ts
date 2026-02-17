import "server-only";

import {
  applySpecStreamPatch,
  compileSpecStream,
  nestedToFlat,
  parseSpecStreamLine,
} from "@json-render/core";
import { streamText } from "ai";
import { workflowRunCatalog } from "@/lib/workflow-run/catalog";

const FENCED_JSON_PREFIX_PATTERN = /^```json\s*/i;
const FENCED_PREFIX_PATTERN = /^```\s*/i;
const FENCED_SUFFIX_PATTERN = /```$/i;
const NEW_LINE_PATTERN = /\r?\n/;

export const DEFAULT_UI_SPEC_PROMPT =
  "Generate a workflow run form that captures the most important trigger inputs and exposes a submit action.";

type ComposeWorkflowUiSpecInput = {
  prompt: string;
  workflowSummary?: string;
  currentSpec?: unknown;
  model?: string;
  temperature?: number;
};

export type ComposeWorkflowUiSpecResult = {
  spec: Record<string, unknown>;
  modelUsed: string;
  rawText: string;
};

type NestedElementLike = Record<string, unknown> & {
  type: string;
};

type WorkflowSummaryInput = {
  name?: string | null;
  description?: string | null;
  nodes?: unknown;
  edges?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveModel(requestedModel: string | undefined): string {
  if (requestedModel?.trim()) {
    return requestedModel.trim();
  }

  if (process.env.AI_GENERATION_MODEL?.trim()) {
    return process.env.AI_GENERATION_MODEL.trim();
  }

  return "openai/gpt-5.1-instant";
}

function assertAiKeyConfigured() {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI API key not configured on server. Please contact support."
    );
  }
}

function buildUserPrompt(input: {
  prompt: string;
  workflowSummary?: string;
  currentSpec?: unknown;
}): string {
  return [
    "Generate a json-render workflow run form.",
    input.workflowSummary ? `Workflow summary:\n${input.workflowSummary}` : "",
    `Task:\n${input.prompt}`,
    input.currentSpec
      ? `Current spec (update in-place if possible):\n${JSON.stringify(input.currentSpec, null, 2)}`
      : "",
    "Follow the catalog output format exactly.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectCharPositions(text: string, target: "{" | "}"): number[] {
  const positions: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === target) {
      positions.push(i);
    }
  }
  return positions;
}

function parseFirstJsonObject(text: string): unknown {
  const starts = collectCharPositions(text, "{");
  const ends = collectCharPositions(text, "}");

  for (const start of starts) {
    for (let i = ends.length - 1; i >= 0; i -= 1) {
      const end = ends[i];
      if (end <= start) {
        continue;
      }

      const parsed = tryParseJson(text.slice(start, end + 1));
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  throw new Error("Model did not return valid JSON.");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const directCandidates = [
    trimmed,
    trimmed
      .replace(FENCED_JSON_PREFIX_PATTERN, "")
      .replace(FENCED_PREFIX_PATTERN, "")
      .replace(FENCED_SUFFIX_PATTERN, "")
      .trim(),
  ];

  for (const candidate of directCandidates) {
    const parsed = tryParseJson(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return parseFirstJsonObject(trimmed);
}

export function isSpecLike(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.root === "string" &&
    value.elements !== null &&
    typeof value.elements === "object" &&
    !Array.isArray(value.elements)
  );
}

function isNestedElementLike(value: unknown): value is NestedElementLike {
  return isRecord(value) && typeof value.type === "string";
}

function isPatchLike(value: unknown): value is { op: string; path: string } {
  return (
    isRecord(value) &&
    typeof value.op === "string" &&
    typeof value.path === "string"
  );
}

function findSpecContainers(value: unknown): unknown[] {
  const queue: unknown[] = [value];
  const containers: unknown[] = [];
  const visited = new Set<unknown>();
  const containerKeys = [
    "spec",
    "uiSpec",
    "workflowUiSpec",
    "result",
    "output",
    "response",
    "data",
    "payload",
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    containers.push(current);

    if (!isRecord(current)) {
      continue;
    }

    for (const key of containerKeys) {
      if (current[key] !== undefined) {
        queue.push(current[key]);
      }
    }
  }

  return containers;
}

function compileFromPatchLines(text: string): Record<string, unknown> | null {
  const lines = text.split(NEW_LINE_PATTERN);
  let patchCount = 0;
  let result: Record<string, unknown> = {};

  for (const line of lines) {
    const patch = parseSpecStreamLine(line);
    if (!patch) {
      continue;
    }

    applySpecStreamPatch(result, patch);
    patchCount += 1;
  }

  if (patchCount === 0) {
    return null;
  }

  if (isSpecLike(result)) {
    return result;
  }

  // Fallback to library stream compiler in case incremental apply missed edge cases.
  result = compileSpecStream<Record<string, unknown>>(text);
  return isSpecLike(result) ? result : null;
}

function compileFromPatchArray(
  patches: unknown[]
): Record<string, unknown> | null {
  if (!patches.every(isPatchLike)) {
    return null;
  }

  const patchLines = patches.map((patch) => JSON.stringify(patch)).join("\n");
  return compileFromPatchLines(patchLines);
}

function toCandidateSpec(value: unknown): Record<string, unknown> | null {
  if (isSpecLike(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return compileFromPatchArray(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  if (isNestedElementLike(value)) {
    const flattened = nestedToFlat(value);
    return isSpecLike(flattened) ? flattened : null;
  }

  if (isNestedElementLike(value.root)) {
    const nestedRoot = value.root;
    const nestedWithState = isRecord(value.state)
      ? { ...nestedRoot, state: value.state }
      : nestedRoot;
    const flattened = nestedToFlat(nestedWithState);
    return isSpecLike(flattened) ? flattened : null;
  }

  return null;
}

function resolveSpec(rawText: string): Record<string, unknown> | null {
  const candidates: unknown[] = [];

  const fromPatches = compileFromPatchLines(rawText);
  if (fromPatches) {
    candidates.push(fromPatches);
  }

  try {
    const extracted = extractJson(rawText);
    candidates.push(extracted, ...findSpecContainers(extracted));
  } catch {
    // Raw output might be JSONL-only patches.
  }

  for (const candidate of candidates) {
    const normalized = toCandidateSpec(candidate);
    if (!normalized) {
      continue;
    }

    const validation = workflowRunCatalog.validate(normalized);
    if (validation.success) {
      return normalized;
    }
  }

  return null;
}

function asNodeList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function nodeLabel(node: Record<string, unknown>, index: number): string {
  const fallback = `Node ${index + 1}`;
  if (!isRecord(node.data)) {
    return fallback;
  }

  const label = asTrimmedString(node.data.label);
  return label || fallback;
}

function describeNode(node: Record<string, unknown>, index: number): string {
  const id = asTrimmedString(node.id) || `node-${index + 1}`;
  const type = asTrimmedString(node.type) || "unknown";
  return `- ${id}: ${nodeLabel(node, index)} [${type}]`;
}

function describeEdge(edge: Record<string, unknown>): string {
  const source = asTrimmedString(edge.source) || "unknown";
  const target = asTrimmedString(edge.target) || "unknown";
  return `- ${source} -> ${target}`;
}

export function buildWorkflowSummary(workflow: WorkflowSummaryInput): string {
  const sections: string[] = [];
  const name = asTrimmedString(workflow.name);
  const description = asTrimmedString(workflow.description);
  const nodes = asNodeList(workflow.nodes);
  const edges = asNodeList(workflow.edges);

  if (name) {
    sections.push(`Name: ${name}`);
  }

  if (description) {
    sections.push(`Description: ${description}`);
  }

  if (nodes.length > 0) {
    sections.push(`Nodes:\n${nodes.slice(0, 40).map(describeNode).join("\n")}`);
  }

  if (edges.length > 0) {
    sections.push(`Edges:\n${edges.slice(0, 60).map(describeEdge).join("\n")}`);
  }

  return sections.join("\n\n");
}

export async function composeWorkflowUiSpec(
  input: ComposeWorkflowUiSpecInput
): Promise<ComposeWorkflowUiSpecResult> {
  const prompt = asTrimmedString(input.prompt);
  if (!prompt) {
    throw new Error("Prompt is required");
  }

  assertAiKeyConfigured();
  const model = resolveModel(input.model);

  const result = streamText({
    model,
    system: workflowRunCatalog.prompt(),
    prompt: buildUserPrompt({
      prompt,
      workflowSummary: input.workflowSummary,
      currentSpec: input.currentSpec,
    }),
    temperature: input.temperature ?? 0.2,
  });

  const rawText = await result.text;
  const specCandidate = resolveSpec(rawText);

  if (!specCandidate) {
    console.error("Failed to resolve workflow UI spec from model output", {
      model,
      rawTextPreview: rawText.slice(0, 500),
    });
    throw new Error("Generated output is not a valid spec object.");
  }

  return {
    spec: specCandidate,
    modelUsed: model,
    rawText,
  };
}
