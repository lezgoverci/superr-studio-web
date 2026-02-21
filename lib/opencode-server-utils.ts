const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const TRAILING_SLASH_REGEX = /\/+$/;
const LEADING_IPV6_BRACKET_REGEX = /^\[/;
const TRAILING_IPV6_BRACKET_REGEX = /\]$/;

export const DEFAULT_OPENCODE_USERNAME = "superr";

export type PromptModel = {
  providerID: string;
  modelID: string;
};

export function parsePromptModel(
  value: string | undefined
): PromptModel | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.includes("::")
    ? trimmed.replace("::", "/")
    : trimmed;
  const separatorIndex = normalized.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }

  const providerID = normalized.slice(0, separatorIndex).trim();
  const modelID = normalized.slice(separatorIndex + 1).trim();

  if (!(providerID && modelID)) {
    return null;
  }

  return { providerID, modelID };
}

export function parseOpencodeUrl(value: string): URL | null {
  try {
    const parsed = new URL(value.trim());
    const normalizedHostname = parsed.hostname
      .replace(LEADING_IPV6_BRACKET_REGEX, "")
      .replace(TRAILING_IPV6_BRACKET_REGEX, "");

    if (parsed.protocol === "https:") {
      return parsed;
    }

    if (
      parsed.protocol === "http:" &&
      LOOPBACK_HOSTNAMES.has(normalizedHostname)
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function normalizeOpencodeBaseUrl(url: URL | string): string {
  const value = typeof url === "string" ? url : url.toString();
  return value.replace(TRAILING_SLASH_REGEX, "");
}

export function createBasicAuthHeader(
  token: string,
  username?: string
): string {
  const normalizedUsername = username?.trim() || DEFAULT_OPENCODE_USERNAME;
  const value = Buffer.from(`${normalizedUsername}:${token}`).toString(
    "base64"
  );
  return `Basic ${value}`;
}
