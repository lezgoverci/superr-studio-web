import "server-only";

import JSZip from "jszip";
import {
  buildPreview,
  deriveTitleFromPath,
  extractUrlsFromAgentOutput,
  inferKindFromPath,
  inferMimeTypeFromPath,
  normalizeArtifactKind,
} from "@/lib/artifacts/infer";
import { createArtifactRecord } from "@/lib/artifacts/service";
import {
  buildArtifactStorageKey,
  getArtifactBlobToken,
  uploadArtifactBlob,
} from "@/lib/artifacts/storage";
import type {
  ArtifactKind,
  ArtifactSource,
  ArtifactStorageProvider,
  ArtifactVisibility,
} from "@/lib/db/schema";
import { generateId } from "@/lib/utils/id";

const MANIFEST_PATH = "artifacts/manifest.json";
const MAX_CAPTURE_BYTES =
  Number.parseInt(process.env.ARTIFACT_CAPTURE_MAX_BYTES || "", 10) ||
  10 * 1024 * 1024;
const MAX_INLINE_BYTES =
  Number.parseInt(process.env.ARTIFACT_INLINE_MAX_BYTES || "", 10) || 64 * 1024;
const MAX_MANIFEST_ITEMS =
  Number.parseInt(process.env.ARTIFACT_MAX_MANIFEST_ITEMS || "", 10) || 100;
const MAX_DIRECTORY_FILES =
  Number.parseInt(process.env.ARTIFACT_MAX_DIRECTORY_FILES || "", 10) || 200;
const MAX_INFERRED_URLS =
  Number.parseInt(process.env.ARTIFACT_MAX_INFERRED_URLS || "", 10) || 20;
const LEADING_DOT_SLASH_REGEX = /^\.\/+/;

type SandboxCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type SandboxExecutor = {
  executeCommand: (command: string) => Promise<SandboxCommandResult>;
};

export type AgentSandboxRuntime = {
  sandbox: SandboxExecutor;
  workingDirectory: string;
};

type ManifestArtifactItem = {
  path: string;
  kind?: string;
  title?: string;
  mimeType?: string;
  description?: string;
  publishHint?: string;
};

type CapturedArtifactSummary = {
  id: string;
  title: string;
  kind: ArtifactKind;
  storageProvider: ArtifactStorageProvider;
  url?: string | null;
};

type CaptureWarning = {
  message: string;
  path?: string;
};

export type AgentCaptureResult = {
  artifacts: CapturedArtifactSummary[];
  warnings: CaptureWarning[];
};

function shQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runInSandbox(
  runtime: AgentSandboxRuntime,
  command: string
): Promise<SandboxCommandResult> {
  return runtime.sandbox.executeCommand(
    `cd ${shQuote(runtime.workingDirectory)} && ${command}`
  );
}

function normalizeManifestPath(rawPath: string): string {
  const normalized = rawPath.trim().replaceAll("\\", "/");
  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("../")
  ) {
    throw new Error(`Invalid artifact path "${rawPath}" in manifest.`);
  }
  return normalized.replace(LEADING_DOT_SLASH_REGEX, "");
}

function isUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Manifest parsing validates schema and normalizes optional fields.
function parseManifest(content: string): ManifestArtifactItem[] {
  const parsed = JSON.parse(content) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Artifact manifest must be a JSON array.");
  }

  const items: ManifestArtifactItem[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const asRecord = item as Record<string, unknown>;
    const path = typeof asRecord.path === "string" ? asRecord.path.trim() : "";
    if (!path) {
      continue;
    }

    items.push({
      path,
      kind: typeof asRecord.kind === "string" ? asRecord.kind : undefined,
      title: typeof asRecord.title === "string" ? asRecord.title : undefined,
      mimeType:
        typeof asRecord.mimeType === "string" ? asRecord.mimeType : undefined,
      description:
        typeof asRecord.description === "string"
          ? asRecord.description
          : undefined,
      publishHint:
        typeof asRecord.publishHint === "string"
          ? asRecord.publishHint
          : undefined,
    });
  }

  if (items.length > MAX_MANIFEST_ITEMS) {
    throw new Error(
      `Artifact manifest contains too many entries (${items.length}). Maximum is ${MAX_MANIFEST_ITEMS}.`
    );
  }

  return items;
}

function getExtension(path: string): string | null {
  const normalized = path.trim();
  const lastDotIndex = normalized.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === normalized.length - 1) {
    return null;
  }
  return normalized.slice(lastDotIndex + 1).toLowerCase();
}

async function fileExists(
  runtime: AgentSandboxRuntime,
  relativePath: string
): Promise<boolean> {
  const result = await runInSandbox(
    runtime,
    `[ -e ${shQuote(relativePath)} ] && printf "1" || printf "0"`
  );
  return result.exitCode === 0 && result.stdout.trim() === "1";
}

async function isDirectory(
  runtime: AgentSandboxRuntime,
  relativePath: string
): Promise<boolean> {
  const result = await runInSandbox(
    runtime,
    `[ -d ${shQuote(relativePath)} ] && printf "1" || printf "0"`
  );
  return result.exitCode === 0 && result.stdout.trim() === "1";
}

async function readTextFile(
  runtime: AgentSandboxRuntime,
  relativePath: string
): Promise<string> {
  const result = await runInSandbox(runtime, `cat ${shQuote(relativePath)}`);
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to read file "${relativePath}": ${result.stderr.trim() || "unknown error"}`
    );
  }
  return result.stdout;
}

async function getFileSizeBytes(
  runtime: AgentSandboxRuntime,
  relativePath: string
): Promise<number> {
  const result = await runInSandbox(
    runtime,
    `wc -c < ${shQuote(relativePath)} | tr -d '[:space:]'`
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to get size for "${relativePath}": ${result.stderr.trim() || "unknown error"}`
    );
  }
  const parsed = Number.parseInt(result.stdout.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid size for "${relativePath}".`);
  }
  return parsed;
}

async function readFileBuffer(
  runtime: AgentSandboxRuntime,
  relativePath: string
): Promise<Buffer> {
  const result = await runInSandbox(
    runtime,
    `base64 < ${shQuote(relativePath)} | tr -d '\\n'`
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to read binary content for "${relativePath}": ${result.stderr.trim() || "unknown error"}`
    );
  }
  const base64 = result.stdout.trim();
  return Buffer.from(base64, "base64");
}

async function listDirectoryFiles(
  runtime: AgentSandboxRuntime,
  relativePath: string
): Promise<string[]> {
  const result = await runInSandbox(
    runtime,
    `find ${shQuote(relativePath)} -type f -print`
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to list files in "${relativePath}": ${result.stderr.trim() || "unknown error"}`
    );
  }

  const files = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (files.length > MAX_DIRECTORY_FILES) {
    throw new Error(
      `Directory "${relativePath}" contains too many files (${files.length}). Maximum is ${MAX_DIRECTORY_FILES}.`
    );
  }

  return files;
}

function isInlineCompatible(mimeType: string | null): boolean {
  if (!mimeType) {
    return false;
  }
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "text/html"
  );
}

async function persistUrlArtifact(input: {
  userId: string;
  workflowId: string;
  executionId?: string | null;
  nodeId: string;
  nodeType: string;
  actionType?: string | null;
  title: string;
  url: string;
  kind: ArtifactKind;
  source: ArtifactSource;
  metadata?: Record<string, unknown>;
}): Promise<CapturedArtifactSummary> {
  const created = await createArtifactRecord({
    userId: input.userId,
    workflowId: input.workflowId,
    executionId: input.executionId ?? null,
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    actionType: input.actionType ?? null,
    source: input.source,
    kind: input.kind,
    title: input.title,
    mimeType: inferMimeTypeFromPath(input.url),
    sizeBytes: 0,
    storageProvider: "external",
    blobUrl: input.url,
    preview: buildPreview({
      kind: input.kind,
      url: input.url,
      sizeBytes: 0,
      mimeType: inferMimeTypeFromPath(input.url),
    }),
    metadata: input.metadata ?? null,
    status: "ready",
    visibility: "private",
  });

  return {
    id: created.id,
    title: created.title,
    kind: created.kind,
    storageProvider: created.storageProvider,
    url: created.blobUrl,
  };
}

async function persistFileArtifact(input: {
  runtime: AgentSandboxRuntime;
  userId: string;
  workflowId: string;
  executionId?: string | null;
  nodeId: string;
  nodeType: string;
  actionType?: string | null;
  source: ArtifactSource;
  path: string;
  title: string;
  kind: ArtifactKind;
  mimeType: string | null;
  metadata?: Record<string, unknown>;
}): Promise<CapturedArtifactSummary> {
  const sizeBytes = await getFileSizeBytes(input.runtime, input.path);
  if (sizeBytes > MAX_CAPTURE_BYTES) {
    throw new Error(
      `Artifact "${input.path}" exceeds max size (${sizeBytes} bytes > ${MAX_CAPTURE_BYTES} bytes).`
    );
  }

  if (isInlineCompatible(input.mimeType) && sizeBytes <= MAX_INLINE_BYTES) {
    const content = await readTextFile(input.runtime, input.path);
    const created = await createArtifactRecord({
      userId: input.userId,
      workflowId: input.workflowId,
      executionId: input.executionId ?? null,
      nodeId: input.nodeId,
      nodeType: input.nodeType,
      actionType: input.actionType ?? null,
      source: input.source,
      kind: input.kind,
      title: input.title,
      mimeType: input.mimeType,
      extension: getExtension(input.path),
      sizeBytes,
      storageProvider: "inline",
      inlineContent: content,
      preview: buildPreview({
        kind: input.kind,
        mimeType: input.mimeType,
        sizeBytes,
        inlineContent: content,
      }),
      metadata: input.metadata ?? null,
      status: "ready",
      visibility: "private",
    });

    return {
      id: created.id,
      title: created.title,
      kind: created.kind,
      storageProvider: created.storageProvider,
      url: created.blobUrl,
    };
  }

  if (!getArtifactBlobToken()) {
    throw new Error(
      `Artifact blob storage token is not configured and "${input.path}" is not eligible for inline storage.`
    );
  }

  const body = await readFileBuffer(input.runtime, input.path);
  const extension = getExtension(input.path);
  const artifactId = generateId();

  const filename = deriveTitleFromPath(input.path);
  const storageKey = buildArtifactStorageKey({
    userId: input.userId,
    workflowId: input.workflowId,
    executionId: input.executionId ?? null,
    artifactId,
    filename,
  });

  const uploaded = await uploadArtifactBlob({
    storageKey,
    body,
    contentType: input.mimeType || "application/octet-stream",
  });

  const created = await createArtifactRecord({
    id: artifactId,
    userId: input.userId,
    workflowId: input.workflowId,
    executionId: input.executionId ?? null,
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    actionType: input.actionType ?? null,
    source: input.source,
    kind: input.kind,
    title: input.title,
    mimeType: uploaded.contentType || input.mimeType,
    extension,
    sizeBytes,
    storageProvider: "blob",
    storageKey,
    blobUrl: uploaded.url,
    preview: buildPreview({
      kind: input.kind,
      url: uploaded.url,
      mimeType: uploaded.contentType || input.mimeType,
      sizeBytes,
    }),
    metadata: input.metadata ?? null,
    status: "ready",
    visibility: "private",
  });

  return {
    id: created.id,
    title: created.title,
    kind: created.kind,
    storageProvider: created.storageProvider,
    url: created.blobUrl,
  };
}

async function persistDirectoryArtifact(input: {
  runtime: AgentSandboxRuntime;
  userId: string;
  workflowId: string;
  executionId?: string | null;
  nodeId: string;
  nodeType: string;
  actionType?: string | null;
  source: ArtifactSource;
  path: string;
  title: string;
  metadata?: Record<string, unknown>;
}): Promise<CapturedArtifactSummary> {
  if (!getArtifactBlobToken()) {
    throw new Error(
      `Artifact blob storage token is not configured and directory "${input.path}" cannot be stored inline.`
    );
  }

  const files = await listDirectoryFiles(input.runtime, input.path);
  const zip = new JSZip();
  let totalBytes = 0;

  for (const absolutePath of files) {
    const relativePath = absolutePath.startsWith(`${input.path}/`)
      ? absolutePath.slice(input.path.length + 1)
      : absolutePath;
    const fileSize = await getFileSizeBytes(input.runtime, absolutePath);
    totalBytes += fileSize;
    if (totalBytes > MAX_CAPTURE_BYTES) {
      throw new Error(
        `Directory "${input.path}" exceeds max total size (${totalBytes} bytes > ${MAX_CAPTURE_BYTES} bytes).`
      );
    }

    const content = await readFileBuffer(input.runtime, absolutePath);
    zip.file(relativePath, content);
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const artifactId = generateId();

  const storageKey = buildArtifactStorageKey({
    userId: input.userId,
    workflowId: input.workflowId,
    executionId: input.executionId ?? null,
    artifactId,
    filename: `${deriveTitleFromPath(input.path)}.zip`,
  });

  const uploaded = await uploadArtifactBlob({
    storageKey,
    body: new Uint8Array(zipBuffer),
    contentType: "application/zip",
  });

  const created = await createArtifactRecord({
    id: artifactId,
    userId: input.userId,
    workflowId: input.workflowId,
    executionId: input.executionId ?? null,
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    actionType: input.actionType ?? null,
    source: input.source,
    kind: "file",
    title: input.title,
    mimeType: "application/zip",
    extension: "zip",
    sizeBytes: zipBuffer.length,
    storageProvider: "blob",
    storageKey,
    blobUrl: uploaded.url,
    preview: buildPreview({
      kind: "file",
      url: uploaded.url,
      mimeType: "application/zip",
      sizeBytes: zipBuffer.length,
    }),
    metadata: input.metadata ?? null,
    status: "ready",
    visibility: "private",
  });

  return {
    id: created.id,
    title: created.title,
    kind: created.kind,
    storageProvider: created.storageProvider,
    url: created.blobUrl,
  };
}

function parseVisibilityFromPublishHint(
  publishHint: string | undefined
): ArtifactVisibility | null {
  if (!publishHint) {
    return null;
  }
  const normalized = publishHint.trim().toLowerCase();
  if (normalized === "public") {
    return "public";
  }
  if (normalized === "private") {
    return "private";
  }
  return null;
}

async function loadManifestFromSandbox(
  runtime: AgentSandboxRuntime
): Promise<ManifestArtifactItem[] | null> {
  const hasManifest = await fileExists(runtime, MANIFEST_PATH);
  if (!hasManifest) {
    return null;
  }

  const content = await readTextFile(runtime, MANIFEST_PATH);
  return parseManifest(content);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Capture flow handles manifest parsing, upload strategies, and URL fallback.
export async function captureAgentArtifacts(input: {
  runtime: AgentSandboxRuntime;
  userId: string;
  workflowId: string;
  executionId?: string | null;
  nodeId: string;
  nodeType: string;
  actionType?: string | null;
  text: string;
  data: unknown;
}): Promise<AgentCaptureResult> {
  const artifacts: CapturedArtifactSummary[] = [];
  const warnings: CaptureWarning[] = [];
  const createdUrls = new Set<string>();

  try {
    const manifest = await loadManifestFromSandbox(input.runtime);
    if (manifest && manifest.length > 0) {
      for (const item of manifest) {
        try {
          if (isUrl(item.path)) {
            const kind = normalizeArtifactKind(item.kind, item.path);
            const summary = await persistUrlArtifact({
              userId: input.userId,
              workflowId: input.workflowId,
              executionId: input.executionId,
              nodeId: input.nodeId,
              nodeType: input.nodeType,
              actionType: input.actionType,
              title: item.title?.trim() || deriveTitleFromPath(item.path),
              url: item.path,
              kind: kind === "unknown" ? "url" : kind,
              source: "agent_manifest",
              metadata: {
                description: item.description || null,
                publishHint: item.publishHint || null,
              },
            });
            artifacts.push(summary);
            createdUrls.add(item.path);
            continue;
          }

          const relativePath = normalizeManifestPath(item.path);
          const exists = await fileExists(input.runtime, relativePath);
          if (!exists) {
            warnings.push({
              path: relativePath,
              message: "Manifest artifact path does not exist in sandbox.",
            });
            continue;
          }

          const directory = await isDirectory(input.runtime, relativePath);
          const title = item.title?.trim() || deriveTitleFromPath(relativePath);
          const metadata = {
            description: item.description || null,
            publishHint: item.publishHint || null,
            requestedVisibility: parseVisibilityFromPublishHint(
              item.publishHint
            ),
          };

          if (directory) {
            const summary = await persistDirectoryArtifact({
              runtime: input.runtime,
              userId: input.userId,
              workflowId: input.workflowId,
              executionId: input.executionId,
              nodeId: input.nodeId,
              nodeType: input.nodeType,
              actionType: input.actionType,
              source: "agent_manifest",
              path: relativePath,
              title,
              metadata,
            });
            artifacts.push(summary);
            continue;
          }

          const inferredMime =
            item.mimeType || inferMimeTypeFromPath(relativePath);
          const kind = normalizeArtifactKind(
            item.kind,
            relativePath,
            inferredMime || undefined
          );
          const summary = await persistFileArtifact({
            runtime: input.runtime,
            userId: input.userId,
            workflowId: input.workflowId,
            executionId: input.executionId,
            nodeId: input.nodeId,
            nodeType: input.nodeType,
            actionType: input.actionType,
            source: "agent_manifest",
            path: relativePath,
            title,
            kind,
            mimeType: inferredMime,
            metadata,
          });
          artifacts.push(summary);
        } catch (error) {
          warnings.push({
            path: item.path,
            message:
              error instanceof Error
                ? error.message
                : "Failed to capture manifest artifact.",
          });
        }
      }
    }
  } catch (error) {
    warnings.push({
      path: MANIFEST_PATH,
      message:
        error instanceof Error
          ? `Failed to parse artifact manifest: ${error.message}`
          : "Failed to parse artifact manifest.",
    });
  }

  const inferredUrls = extractUrlsFromAgentOutput({
    text: input.text,
    data: input.data,
  }).slice(0, MAX_INFERRED_URLS);

  for (const url of inferredUrls) {
    if (createdUrls.has(url)) {
      continue;
    }
    try {
      const inferredKind = inferKindFromPath(url);
      const kind = inferredKind === "unknown" ? "url" : inferredKind;
      const summary = await persistUrlArtifact({
        userId: input.userId,
        workflowId: input.workflowId,
        executionId: input.executionId,
        nodeId: input.nodeId,
        nodeType: input.nodeType,
        actionType: input.actionType,
        title: deriveTitleFromPath(url),
        url,
        kind,
        source: "agent_inferred",
        metadata: {
          inferred: true,
        },
      });
      artifacts.push(summary);
    } catch (error) {
      warnings.push({
        path: url,
        message:
          error instanceof Error
            ? error.message
            : "Failed to persist inferred URL artifact.",
      });
    }
  }

  return {
    artifacts,
    warnings,
  };
}
