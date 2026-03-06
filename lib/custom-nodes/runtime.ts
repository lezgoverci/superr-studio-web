import "server-only";

import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { createBashTool } from "bash-tool";
import {
  getCustomNodeSecretsForUser,
  getCustomNodeWithVersionForUser,
} from "@/lib/db/custom-nodes";

const RUNNER_PATH = "/tmp/superr-custom-node-runner.mjs";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const noopCleanup = async () => {
  // No cleanup needed for local just-bash sandbox.
};

type SandboxType = "vercel" | "just-bash";

type SandboxCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type BashSandbox = Awaited<ReturnType<typeof createBashTool>>["sandbox"];

type VercelSandboxCredentials = {
  token: string;
  teamId: string;
  projectId: string;
};

export type CustomNodeRuntimeInput = {
  userId: string;
  customNodeId: string;
  version?: number;
  payload: Record<string, unknown>;
  timeoutMs?: number;
  sandboxType?: string;
  oidcToken?: string;
  vercelSandboxToken?: string;
};

export type CustomNodeRuntimeResult =
  | {
      success: true;
      data: {
        output: unknown;
        version: number;
        customNodeId: string;
        sandboxType: SandboxType;
        stdout: string;
      };
    }
  | {
      success: false;
      error: {
        message: string;
        customNodeId?: string;
        version?: number;
        sandboxType?: SandboxType;
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
    };

function getSandboxType(rawSandboxType: string | undefined): SandboxType {
  if (rawSandboxType === "vercel") {
    return "vercel";
  }
  return "just-bash";
}

function decodeBase64Url(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (base64.length % 4)) % 4;
  const padded = `${base64}${"=".repeat(paddingLength)}`;
  return Buffer.from(padded, "base64").toString("utf-8");
}

function parseOidcTokenCredentials(
  token: string
): VercelSandboxCredentials | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as {
      owner_id?: unknown;
      project_id?: unknown;
    };

    if (
      typeof payload.owner_id !== "string" ||
      typeof payload.project_id !== "string" ||
      payload.owner_id.trim() === "" ||
      payload.project_id.trim() === ""
    ) {
      return null;
    }

    return {
      token,
      teamId: payload.owner_id,
      projectId: payload.project_id,
    };
  } catch {
    return null;
  }
}

function resolveVercelSandboxCredentials(
  token: string
): VercelSandboxCredentials {
  const parsed = parseOidcTokenCredentials(token);
  if (parsed) {
    return parsed;
  }

  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();

  if (teamId && projectId) {
    return {
      token,
      teamId,
      projectId,
    };
  }

  if (teamId || projectId) {
    throw new Error(
      "Both VERCEL_TEAM_ID and VERCEL_PROJECT_ID must be set together when using a non-OIDC Vercel token."
    );
  }

  throw new Error(
    "Invalid Vercel Sandbox token configuration. Provide an OIDC token or set VERCEL_TEAM_ID and VERCEL_PROJECT_ID in server environment variables."
  );
}

function resolveOidcToken(
  inputOidcToken: string | undefined,
  legacySandboxToken: string | undefined
): string {
  const tokenFromInput = inputOidcToken?.trim() || legacySandboxToken?.trim();
  if (tokenFromInput) {
    return tokenFromInput;
  }

  throw new Error(
    "OIDC token is required when Sandbox is set to Vercel Sandbox."
  );
}

async function resolveVercelSandboxDestination(
  sandbox: VercelSandbox
): Promise<string> {
  const probeCommand = [
    "if [ -d /vercel/sandbox/workspace ]; then",
    "  printf '/vercel/sandbox/workspace'",
    "elif mkdir -p /vercel/sandbox/workspace >/dev/null 2>&1; then",
    "  printf '/vercel/sandbox/workspace'",
    "elif [ -d /workspace ]; then",
    "  printf '/workspace'",
    "elif [ -d /vercel/sandbox ]; then",
    "  printf '/vercel/sandbox'",
    "else",
    "  printf '/'",
    "fi",
  ].join("\n");

  const probeResult = await sandbox.runCommand("bash", ["-lc", probeCommand]);

  if (probeResult.exitCode !== 0) {
    const stderr = (await probeResult.stderr()).trim();
    throw new Error(
      `Failed to determine Vercel sandbox working directory${stderr ? `: ${stderr}` : "."}`
    );
  }

  const destination = (await probeResult.stdout()).trim();
  if (!destination) {
    throw new Error(
      "Failed to determine Vercel sandbox working directory: no destination returned."
    );
  }

  return destination;
}

async function createSandboxExecutor(input: {
  sandboxType?: string;
  oidcToken?: string;
  vercelSandboxToken?: string;
}): Promise<{
  sandboxType: SandboxType;
  sandbox: BashSandbox;
  workingDirectory: string;
  cleanup: () => Promise<void>;
}> {
  const sandboxType = getSandboxType(input.sandboxType);

  if (sandboxType === "just-bash") {
    const { sandbox: localSandbox } = await createBashTool();
    return {
      sandboxType,
      sandbox: localSandbox,
      workingDirectory: "/workspace",
      cleanup: noopCleanup,
    };
  }

  const token = resolveOidcToken(input.oidcToken, input.vercelSandboxToken);
  const credentials = resolveVercelSandboxCredentials(token);
  const sandbox = await VercelSandbox.create(credentials);
  const destination = await resolveVercelSandboxDestination(sandbox);
  const { sandbox: wrappedSandbox } = await createBashTool({
    sandbox,
    destination,
  });

  return {
    sandboxType,
    sandbox: wrappedSandbox,
    workingDirectory: destination,
    cleanup: async () => {
      await sandbox.stop();
    },
  };
}

function clampTimeout(rawTimeoutMs: number | undefined): number {
  if (!(typeof rawTimeoutMs === "number" && Number.isFinite(rawTimeoutMs))) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(MAX_TIMEOUT_MS, Math.max(1000, Math.floor(rawTimeoutMs)));
}

function getRunnerScript(): string {
  return `
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function fail(message) {
  throw new Error(message);
}

async function main() {
  const encodedPayload = process.argv[2];
  if (!encodedPayload) {
    fail("Missing custom node payload.");
  }

  const decoded = Buffer.from(encodedPayload, "base64").toString("utf8");
  const input = JSON.parse(decoded);

  const code = typeof input.code === "string" ? input.code : "";
  if (!code.trim()) {
    fail("Custom node code is empty.");
  }

  const payload =
    input.payload && typeof input.payload === "object" ? input.payload : {};
  const secrets =
    input.secrets && typeof input.secrets === "object" ? input.secrets : {};
  const context =
    input.context && typeof input.context === "object" ? input.context : {};
  const timeoutMs =
    typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
      ? Math.max(1000, Math.floor(input.timeoutMs))
      : 30000;

  const module = { exports: {} };
  const exports = module.exports;

  const wrapped = new AsyncFunction(
    "payload",
    "secrets",
    "context",
    "module",
    "exports",
    \`"use strict";\\n\${code}\\n\\nconst __candidate =\\n  (typeof handler === "function" && handler) ||\\n  (typeof module.exports === "function" && module.exports) ||\\n  (module.exports && typeof module.exports.default === "function" && module.exports.default) ||\\n  (exports && typeof exports.default === "function" && exports.default) ||\\n  null;\\n\\nif (!__candidate) {\\n  throw new Error("Custom node code must expose a function via 'handler', 'module.exports', or 'module.exports.default'.");\\n}\\n\\nreturn await __candidate(payload, secrets, context);\`
  );

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(\`Custom node timed out after \${timeoutMs}ms.\`));
    }, timeoutMs);
  });

  const result = await Promise.race([
    wrapped(payload, secrets, context, module, exports),
    timeoutPromise,
  ]);

  if (!(result && typeof result === "object" && "success" in result)) {
    fail(
      "Custom node must return standardized output: { success: boolean, data?: unknown, error?: { message: string } }."
    );
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  process.stderr.write(message);
  process.exit(1);
});
`.trim();
}

function parseRuntimeOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Custom node produced no output.");
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Keep scanning backwards until a JSON line is found.
    }
  }

  throw new Error("Failed to parse custom node output JSON.");
}

async function runCommandInSandbox(options: {
  sandbox: BashSandbox;
  runnerScript: string;
  payloadBase64: string;
  workingDirectory: string;
}): Promise<SandboxCommandResult> {
  const escapedDir = options.workingDirectory.replace(/"/g, '\\"');
  const command = [
    "set -euo pipefail",
    `cd "${escapedDir}"`,
    `cat <<'EOF_RUNNER' > ${RUNNER_PATH}`,
    options.runnerScript,
    "EOF_RUNNER",
    `node ${RUNNER_PATH} '${options.payloadBase64}'`,
  ].join("\n");

  const result = await options.sandbox.executeCommand(command);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

export async function executeCustomNodeRuntime(
  input: CustomNodeRuntimeInput
): Promise<CustomNodeRuntimeResult> {
  const customNode = await getCustomNodeWithVersionForUser(
    input.userId,
    input.customNodeId,
    input.version
  );

  if (!customNode) {
    return {
      success: false,
      error: {
        message: "Custom node or version not found.",
        customNodeId: input.customNodeId,
        ...(input.version !== undefined ? { version: input.version } : {}),
      },
    };
  }

  const secrets = await getCustomNodeSecretsForUser({
    userId: input.userId,
    customNodeId: input.customNodeId,
  });

  let cleanup = noopCleanup;
  let sandboxTypeResolved = getSandboxType(input.sandboxType);

  try {
    const runtime = await createSandboxExecutor({
      sandboxType: input.sandboxType,
      oidcToken: input.oidcToken,
      vercelSandboxToken: input.vercelSandboxToken,
    });
    cleanup = runtime.cleanup;
    sandboxTypeResolved = runtime.sandboxType;

    const payloadBase64 = Buffer.from(
      JSON.stringify({
        code: customNode.version.code,
        payload: input.payload,
        secrets,
        context: {
          customNodeId: input.customNodeId,
          version: customNode.version.version,
        },
        timeoutMs: clampTimeout(input.timeoutMs),
      }),
      "utf8"
    ).toString("base64");

    const commandResult = await runCommandInSandbox({
      sandbox: runtime.sandbox,
      runnerScript: getRunnerScript(),
      payloadBase64,
      workingDirectory: runtime.workingDirectory,
    });

    if (commandResult.exitCode !== 0) {
      return {
        success: false,
        error: {
          message:
            commandResult.stderr.trim() ||
            `Custom node runtime exited with code ${commandResult.exitCode}.`,
          customNodeId: input.customNodeId,
          version: customNode.version.version,
          sandboxType: sandboxTypeResolved,
          stdout: commandResult.stdout,
          stderr: commandResult.stderr,
          exitCode: commandResult.exitCode,
        },
      };
    }

    const parsed = parseRuntimeOutput(commandResult.stdout);

    return {
      success: true,
      data: {
        output: parsed,
        version: customNode.version.version,
        customNodeId: input.customNodeId,
        sandboxType: sandboxTypeResolved,
        stdout: commandResult.stdout,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        customNodeId: input.customNodeId,
        version: customNode.version.version,
        sandboxType: sandboxTypeResolved,
      },
    };
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error(
        "[custom-node-runtime] Failed to cleanup sandbox:",
        cleanupError
      );
    }
  }
}
