import "server-only";

const BLOB_API_URL = "https://blob.vercel-storage.com";
const KEY_SANITIZE_REGEX = /[^a-zA-Z0-9._/-]/g;
const MULTISLASH_REGEX = /\/+/g;

type BlobPutResponse = {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
};

function sanitizeSegment(value: string): string {
  const sanitized = value.trim().replace(KEY_SANITIZE_REGEX, "-");
  return sanitized.replace(MULTISLASH_REGEX, "/").replace(/^\/|\/$/g, "");
}

export function buildArtifactStorageKey(options: {
  userId: string;
  workflowId: string;
  executionId?: string | null;
  artifactId: string;
  filename: string;
}): string {
  const basePath = sanitizeSegment(
    process.env.ARTIFACT_BLOB_BASE_PATH || "artifacts"
  );
  const executionSegment = options.executionId
    ? sanitizeSegment(options.executionId)
    : "no-execution";

  return [
    basePath,
    sanitizeSegment(options.userId),
    sanitizeSegment(options.workflowId),
    executionSegment,
    sanitizeSegment(options.artifactId),
    sanitizeSegment(options.filename),
  ]
    .filter(Boolean)
    .join("/");
}

export function getArtifactBlobToken(): string | null {
  const token =
    process.env.ARTIFACT_BLOB_READ_WRITE_TOKEN ||
    process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || token.trim() === "") {
    return null;
  }
  return token.trim();
}

export async function uploadArtifactBlob(options: {
  storageKey: string;
  body: string | Uint8Array;
  contentType: string;
}): Promise<{
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
}> {
  const token = getArtifactBlobToken();
  if (!token) {
    throw new Error(
      "Artifact blob storage is not configured. Set ARTIFACT_BLOB_READ_WRITE_TOKEN (or BLOB_READ_WRITE_TOKEN)."
    );
  }

  const url = new URL(`/${options.storageKey}`, BLOB_API_URL);
  url.searchParams.set("addRandomSuffix", "false");
  const requestBody: string | Blob =
    typeof options.body === "string"
      ? options.body
      : new Blob([Uint8Array.from(options.body)], {
          type: options.contentType,
        });

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-version": "7",
      "x-content-type": options.contentType,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Blob upload failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(errorText) as { error?: { message?: string } };
      if (parsed.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      if (errorText.trim()) {
        message = errorText.trim();
      }
    }
    throw new Error(message);
  }

  const data = (await response.json()) as BlobPutResponse;

  return {
    url: data.url,
    downloadUrl: data.downloadUrl,
    pathname: data.pathname,
    contentType: data.contentType || options.contentType,
  };
}
