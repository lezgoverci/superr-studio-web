import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";

export const AGENT_SCOPES = {
  workflowCompose: "workflow:compose",
  workflowWrite: "workflow:write",
  workflowExecute: "workflow:execute",
  workflowWebhookExecute: "workflow:webhook:execute",
} as const;

export type AgentScope = (typeof AGENT_SCOPES)[keyof typeof AGENT_SCOPES];

const WILDCARD_SCOPE = "*";
const SCOPE_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)*(?::\*)?$/;

function parseAuthorizationHeader(authorizationHeader: string | null): string {
  if (!authorizationHeader) {
    throw new Error("Missing Authorization header");
  }

  const token = authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice(7)
    : authorizationHeader;

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new Error("Missing API key token");
  }

  if (!trimmedToken.startsWith("wfb_")) {
    throw new Error("Invalid API key format");
  }

  return trimmedToken;
}

function normalizeScopes(rawScopes: unknown): string[] {
  if (!Array.isArray(rawScopes)) {
    return [];
  }

  return rawScopes
    .filter((scope): scope is string => typeof scope === "string")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

export function isScopeGranted(
  grantedScopes: Iterable<string>,
  requiredScope: string
): boolean {
  const grantedScopeSet = new Set(grantedScopes);

  if (
    grantedScopeSet.has(WILDCARD_SCOPE) ||
    grantedScopeSet.has(requiredScope)
  ) {
    return true;
  }

  for (const scope of grantedScopeSet) {
    if (!scope.endsWith("*")) {
      continue;
    }

    const prefix = scope.slice(0, -1);
    if (requiredScope.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function hasScope(grantedScopes: Set<string>, requiredScope: string): boolean {
  return isScopeGranted(grantedScopes, requiredScope);
}

export function validateScopeList(rawScopes: unknown): string[] | null {
  if (rawScopes === undefined || rawScopes === null) {
    return null;
  }

  if (!Array.isArray(rawScopes)) {
    throw new Error("Scopes must be an array of strings.");
  }

  const cleanedScopes = rawScopes
    .filter((scope): scope is string => typeof scope === "string")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  if (cleanedScopes.length !== rawScopes.length) {
    throw new Error("Scopes must contain only non-empty strings.");
  }

  for (const scope of cleanedScopes) {
    if (!SCOPE_PATTERN.test(scope) && scope !== WILDCARD_SCOPE) {
      throw new Error(`Invalid scope value "${scope}".`);
    }
  }

  return [...new Set(cleanedScopes)];
}

type AgentAuthSuccess = {
  ok: true;
  keyId: string;
  userId: string;
  scopes: string[];
};

type AgentAuthFailure = {
  ok: false;
  status: number;
  error: string;
};

export type AgentAuthResult = AgentAuthSuccess | AgentAuthFailure;

export async function authenticateAgentRequest(
  request: Request,
  requiredScopes: AgentScope[] = []
): Promise<AgentAuthResult> {
  try {
    const token = parseAuthorizationHeader(
      request.headers.get("Authorization")
    );
    const keyHash = createHash("sha256").update(token).digest("hex");

    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
      columns: {
        id: true,
        userId: true,
        scopes: true,
      },
    });

    if (!keyRecord) {
      return {
        ok: false,
        status: 401,
        error: "Invalid API key",
      };
    }

    const scopes = normalizeScopes(keyRecord.scopes);
    const grantedScopes = new Set(scopes);

    // Backward compatibility: keys without explicit scopes retain full access.
    const hasUnscopedAccess = scopes.length === 0;

    if (!hasUnscopedAccess) {
      for (const requiredScope of requiredScopes) {
        if (!hasScope(grantedScopes, requiredScope)) {
          return {
            ok: false,
            status: 403,
            error: `API key is missing required scope "${requiredScope}".`,
          };
        }
      }
    }

    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyRecord.id))
      .catch(() => {
        // Best effort.
      });

    return {
      ok: true,
      keyId: keyRecord.id,
      userId: keyRecord.userId,
      scopes,
    };
  } catch (error) {
    return {
      ok: false,
      status: 401,
      error: error instanceof Error ? error.message : "Unauthorized",
    };
  }
}
