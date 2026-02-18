import type { ArtifactKind } from "@/lib/db/schema";

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const WHITESPACE_SPLIT_PATTERN = /\s+/;

const EXTENSION_TO_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".html": "text/html",
  ".htm": "text/html",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

function normalizeMimeType(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function getFileExtension(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  const withoutQuery = trimmed.split("?")[0].split("#")[0];
  const lastSlash = withoutQuery.lastIndexOf("/");
  const filename =
    lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery;
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0) {
    return "";
  }
  return filename.slice(dotIndex).toLowerCase();
}

export function inferMimeTypeFromPath(pathOrUrl: string): string | null {
  const extension = getFileExtension(pathOrUrl);
  return EXTENSION_TO_MIME[extension] ?? null;
}

export function inferKindFromMimeType(
  mimeType: string | undefined
): ArtifactKind {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) {
    return "unknown";
  }

  if (normalized.startsWith("image/")) {
    return "image";
  }
  if (normalized.startsWith("video/")) {
    return "video";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  if (normalized === "application/json") {
    return "json";
  }
  if (normalized === "text/html") {
    return "web_page";
  }
  if (normalized.startsWith("text/")) {
    return "text";
  }

  return "file";
}

export function inferKindFromPath(pathOrUrl: string): ArtifactKind {
  const mimeType = inferMimeTypeFromPath(pathOrUrl);
  if (mimeType) {
    return inferKindFromMimeType(mimeType);
  }
  return "file";
}

export function normalizeArtifactKind(
  rawKind: string | undefined,
  fallbackPathOrUrl?: string,
  fallbackMimeType?: string
): ArtifactKind {
  const normalized = rawKind?.trim().toLowerCase();

  switch (normalized) {
    case "file":
    case "image":
    case "video":
    case "audio":
    case "web_page":
    case "url":
    case "json":
    case "text":
    case "unknown":
      return normalized;
    case "webpage":
    case "web-page":
    case "html":
      return "web_page";
    default:
      break;
  }

  if (fallbackMimeType) {
    const fromMime = inferKindFromMimeType(fallbackMimeType);
    if (fromMime !== "unknown") {
      return fromMime;
    }
  }

  if (fallbackPathOrUrl) {
    return inferKindFromPath(fallbackPathOrUrl);
  }

  return "unknown";
}

export function deriveTitleFromPath(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  const withoutQuery = trimmed.split("?")[0].split("#")[0];
  const lastSlash = withoutQuery.lastIndexOf("/");
  const filename =
    lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery;
  return filename || "artifact";
}

export function buildPreview(options: {
  kind: ArtifactKind;
  url?: string | null;
  mimeType?: string | null;
  sizeBytes?: number;
  inlineContent?: string | null;
}): Record<string, unknown> {
  const preview: Record<string, unknown> = {
    kind: options.kind,
  };

  if (options.url) {
    preview.url = options.url;
  }
  if (options.mimeType) {
    preview.mimeType = options.mimeType;
  }
  if (typeof options.sizeBytes === "number") {
    preview.sizeBytes = options.sizeBytes;
  }

  if (options.inlineContent) {
    const trimmed = options.inlineContent.trim();
    if (trimmed.length > 0) {
      preview.excerpt = trimmed
        .split(WHITESPACE_SPLIT_PATTERN)
        .slice(0, 40)
        .join(" ");
    }
  }

  return preview;
}

function addUrlCandidate(rawValue: string, urls: Set<string>) {
  for (const match of rawValue.matchAll(URL_PATTERN)) {
    if (match[0]) {
      urls.add(match[0]);
    }
  }
}

function collectUrls(value: unknown, urls: Set<string>, depth: number) {
  if (depth > 8 || value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    addUrlCandidate(value, urls);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectUrls(item, urls, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    for (const child of Object.values(value)) {
      collectUrls(child, urls, depth + 1);
    }
  }
}

export function extractUrlsFromAgentOutput(options: {
  text: string;
  data: unknown;
}): string[] {
  const urls = new Set<string>();
  collectUrls(options.text, urls, 0);
  collectUrls(options.data, urls, 0);
  return [...urls];
}
