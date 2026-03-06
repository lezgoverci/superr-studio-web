import "server-only";

import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { createBashTool } from "bash-tool";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { getErrorMessageAsync } from "@/lib/utils";

const RUNNER_PATH = "/tmp/superr-scaffold-runner.mjs";
const DEFAULT_TIMEOUT_MS = 30_000;

type SandboxType = "vercel" | "just-bash";

type BashSandbox = Awaited<ReturnType<typeof createBashTool>>["sandbox"];

type VercelSandboxCredentials = {
  token: string;
  teamId: string;
  projectId: string;
};

type ExecuteScaffoldResult =
  | {
      success: true;
      data: {
        output: unknown;
        sandboxType: SandboxType;
        stdout: string;
      };
    }
  | {
      success: false;
      error: {
        message: string;
        sandboxType?: SandboxType;
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
    };

export type ExecuteScaffoldCoreInput = {
  code?: string;
  payloadJson?: string;
  sandboxType?: string;
  oidcToken?: string;
  vercelSandboxToken?: string;
};

export type ExecuteScaffoldInput = StepInput & ExecuteScaffoldCoreInput;

// ── Sandbox helpers (shared with bash plugin pattern) ──

function getSandboxType(rawSandboxType: string | undefined): SandboxType {
  return rawSandboxType === "vercel" ? "vercel" : "just-bash";
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
    return { token, teamId, projectId };
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
    const { sandbox } = await createBashTool();
    return {
      sandboxType,
      sandbox,
      workingDirectory: "/workspace",
      cleanup: async () => {},
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

// ── Runner script ──

function getRunnerScript(): string {
  return `
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function fail(message) {
  throw new Error(message);
}

async function main() {
  const encodedPayload = process.argv[2];
  if (!encodedPayload) {
    fail("Missing scaffold payload.");
  }

  const decoded = Buffer.from(encodedPayload, "base64").toString("utf8");
  const input = JSON.parse(decoded);

  const code = typeof input.code === "string" ? input.code : "";
  if (!code.trim()) {
    fail("Code is empty.");
  }

  const payload =
    input.payload && typeof input.payload === "object" ? input.payload : {};
  const timeoutMs =
    typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
      ? Math.max(1000, Math.floor(input.timeoutMs))
      : 30000;

  const module = { exports: {} };
  const exports = module.exports;

  const wrapped = new AsyncFunction(
    "payload",
    "module",
    "exports",
    \`"use strict";\\n\${code}\\n\\nconst __candidate =\\n  (typeof handler === "function" && handler) ||\\n  (typeof module.exports === "function" && module.exports) ||\\n  (module.exports && typeof module.exports.default === "function" && module.exports.default) ||\\n  (exports && typeof exports.default === "function" && exports.default) ||\\n  null;\\n\\nif (!__candidate) {\\n  throw new Error("Code must expose a function via 'handler', 'module.exports', or 'module.exports.default'.");\\n}\\n\\nreturn await __candidate(payload);\`
  );

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(\`Code timed out after \${timeoutMs}ms.\`));
    }, timeoutMs);
  });

  const result = await Promise.race([
    wrapped(payload, module, exports),
    timeoutPromise,
  ]);

  if (!(result && typeof result === "object" && "success" in result)) {
    fail(
      "Code must return standardized output: { success: boolean, data?: unknown, error?: { message: string } }."
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

// ── Payload & output helpers ──

function parsePayload(payloadJson: string | undefined):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!payloadJson?.trim()) {
    return { ok: true, payload: {} };
  }

  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
      return { ok: false, error: "Payload JSON must be a JSON object." };
    }
    return { ok: true, payload: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Payload JSON is invalid." };
  }
}

function parseRuntimeOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Code produced no output.");
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

  throw new Error("Failed to parse code output JSON.");
}

// ── Step handler ──

async function stepHandler(
  input: ExecuteScaffoldCoreInput
): Promise<ExecuteScaffoldResult> {
  const code = input.code?.trim();
  if (!code) {
    return {
      success: false,
      error: { message: "Code is required." },
    };
  }

  const payloadResult = parsePayload(input.payloadJson);
  if (!payloadResult.ok) {
    return {
      success: false,
      error: { message: payloadResult.error },
    };
  }

  let cleanup = async () => {};
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
        code,
        payload: payloadResult.payload,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }),
      "utf8"
    ).toString("base64");

    const escapedDir = runtime.workingDirectory.replace(/"/g, '\\"');
    const command = [
      "set -e",
      `cd "${escapedDir}"`,
      `cat <<'EOF_RUNNER' > ${RUNNER_PATH}`,
      getRunnerScript(),
      "EOF_RUNNER",
      `node ${RUNNER_PATH} '${payloadBase64}'`,
    ].join("\n");

    const result = await runtime.sandbox.executeCommand(command);

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: {
          message:
            result.stderr.trim() ||
            `Code exited with code ${result.exitCode}.`,
          sandboxType: sandboxTypeResolved,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
      };
    }

    const parsed = parseRuntimeOutput(result.stdout);

    return {
      success: true,
      data: {
        output: parsed,
        sandboxType: sandboxTypeResolved,
        stdout: result.stdout,
      },
    };
  } catch (error) {
    const message = await getErrorMessageAsync(error);
    return {
      success: false,
      error: {
        message: `Failed to execute code: ${message}`,
        sandboxType: sandboxTypeResolved,
      },
    };
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("[scaffold] Failed to cleanup sandbox:", cleanupError);
    }
  }
}

export async function executeScaffoldNodeStep(
  input: ExecuteScaffoldInput
): Promise<ExecuteScaffoldResult> {
  "use step";

  return withStepLogging(input, () => stepHandler(input));
}

executeScaffoldNodeStep.maxRetries = 0;

export const _integrationType = "scaffold";
