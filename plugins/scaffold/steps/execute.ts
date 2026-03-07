import "server-only";

import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2/client";
import type { PermissionRuleset } from "@opencode-ai/sdk/v2";
import { eq } from "drizzle-orm";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { createBashTool } from "bash-tool";
import { db } from "@/lib/db";
import {
  getResolvedOpencodeConnectionForUser,
  type ResolvedOpencodeConnection,
} from "@/lib/db/opencode-connections";
import { workflows } from "@/lib/db/schema";
import {
  createBasicAuthHeader,
  normalizeOpencodeBaseUrl,
  parseOpencodeUrl,
} from "@/lib/opencode-server-utils";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { getErrorMessageAsync } from "@/lib/utils";

const RUNNER_PATH = "/tmp/superr-scaffold-runner.mjs";
const DEFAULT_TIMEOUT_MS = 30_000;
const OPENCODE_DEFAULT_AGENT = "build";

type SandboxType = "vercel" | "just-bash" | "opencode";

type CommandExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

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
  if (rawSandboxType === "vercel") {
    return "vercel";
  }

  if (rawSandboxType === "opencode") {
    return "opencode";
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
  workflowId?: string;
}): Promise<{
  sandboxType: SandboxType;
  workingDirectory: string;
  executeCommand: (command: string) => Promise<CommandExecutionResult>;
  cleanup: () => Promise<void>;
}> {
  const sandboxType = getSandboxType(input.sandboxType);

  if (sandboxType === "just-bash") {
    const { sandbox } = await createBashTool();
    return {
      sandboxType,
      workingDirectory: "/workspace",
      executeCommand: (command) => sandbox.executeCommand(command),
      cleanup: async () => {},
    };
  }

  if (sandboxType === "opencode") {
    const workflowId = input.workflowId?.trim();
    if (!workflowId) {
      throw new Error(
        "Workflow context is required when Sandbox is set to OpenCode."
      );
    }

    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
      columns: {
        id: true,
        userId: true,
      },
    });

    if (!workflow?.userId) {
      throw new Error("Workflow not found for OpenCode execution.");
    }

    const connection = await getResolvedOpencodeConnectionForUser(workflow.userId);
    if (!connection) {
      throw new Error(
        "No active OpenCode connection found for the workflow owner."
      );
    }

    if (!parseOpencodeUrl(connection.url)) {
      throw new Error(
        "Invalid OpenCode URL. Use HTTPS for remote hosts or HTTP only for localhost/127.0.0.1/::1."
      );
    }

    return {
      sandboxType,
      workingDirectory: connection.directory?.trim() || "/",
      executeCommand: (command) =>
        executeOpenCodeCommand({
          connection,
          command,
        }),
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
    workingDirectory: destination,
    executeCommand: (command) => wrappedSandbox.executeCommand(command),
    cleanup: async () => {
      await sandbox.stop();
    },
  };
}

type OpenCodeAssistantMessage = {
  id?: string;
  error?: {
    message?: string;
  } | null;
};

type OpenCodeSessionShellMessage = {
  id?: string;
  info?: OpenCodeAssistantMessage;
  data?: OpenCodeAssistantMessage;
  parts?: unknown[];
  error?: {
    message?: string;
  } | null;
};

type OpenCodeToolPart = {
  type?: string;
  tool?: string;
  state?: {
    status?: string;
    error?: string;
    metadata?: {
      output?: string;
      stdout?: string;
      stderr?: string;
      response?: string;
      result?: string;
      exit?: number;
      exitCode?: number;
    };
    output?: string;
    stderr?: string;
  };
};

type ParsedRuntimeOutput =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      error: string;
    };

function createServerOpenCodeClient(
  connection: ResolvedOpencodeConnection,
): OpencodeClient {
  const baseUrl = parseOpencodeUrl(connection.url);
  if (!baseUrl) {
    throw new Error(
      "Invalid OpenCode URL. Use HTTPS for remote hosts or HTTP only for localhost/127.0.0.1/::1."
    );
  }

  return createOpencodeClient({
    baseUrl: normalizeOpencodeBaseUrl(baseUrl),
    headers: {
      Authorization: createBasicAuthHeader(
        connection.password,
        connection.username
      ),
      "Accept-Encoding": "identity",
    },
    ...(connection.directory?.trim()
      ? { directory: connection.directory.trim() }
      : {}),
  });
}

function describeOpenCodeResponseShape(value: unknown): string {
  if (!(value && typeof value === "object")) {
    return typeof value;
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  return keys.length > 0 ? keys.join(", ") : "(empty object)";
}

function resolveOpenCodeMessageId(
  message: OpenCodeSessionShellMessage
): string | null {
  const candidates = [message.id, message.info?.id, message.data?.id];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

function parseOpenCodeToolResult(parts: unknown[]): CommandExecutionResult {
  const bashPart = parts.find((part) => {
    if (!(part && typeof part === "object")) {
      return false;
    }

    const candidate = part as OpenCodeToolPart;
    return candidate.type === "tool" && candidate.tool === "bash";
  }) as OpenCodeToolPart | undefined;

  if (!bashPart?.state) {
    throw new Error("OpenCode shell response did not include a bash tool result.");
  }

  const metadata = bashPart.state.metadata;
  const stdout =
    metadata?.output ??
    metadata?.stdout ??
    metadata?.response ??
    metadata?.result ??
    (typeof bashPart.state.output === "string" ? bashPart.state.output : "");
  const stderr =
    metadata?.stderr ??
    (typeof bashPart.state.stderr === "string" ? bashPart.state.stderr : "") ??
    "";
  const exitCode =
    typeof metadata?.exit === "number"
      ? metadata.exit
      : typeof metadata?.exitCode === "number"
        ? metadata.exitCode
        : bashPart.state.status === "error"
          ? 1
          : 0;

  if (bashPart.state.status === "error") {
    return {
      stdout,
      stderr: bashPart.state.error || stderr || "OpenCode bash command failed.",
      exitCode,
    };
  }

  return {
    stdout,
    stderr,
    exitCode,
  };
}

async function executeOpenCodeCommand(input: {
  connection: ResolvedOpencodeConnection;
  command: string;
}): Promise<CommandExecutionResult> {
  const permission: PermissionRuleset = [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "external_directory", pattern: "*", action: "allow" },
  ];
  const client = createServerOpenCodeClient(input.connection);

  const session = await client.session.create({
    title: "Superr Scaffold Execution",
    permission,
  });

  const sessionID = session.data?.id;
  if (!sessionID) {
    throw new Error("Failed to create OpenCode session.");
  }

  try {
    const message = await client.session.shell({
      sessionID,
      agent: OPENCODE_DEFAULT_AGENT,
      command: input.command,
    });
    const messageData = message.data as OpenCodeSessionShellMessage;

    const messageError =
      messageData.error?.message ||
      messageData.info?.error?.message ||
      messageData.data?.error?.message;
    if (messageError) {
      throw new Error(messageError);
    }

    if (
      Array.isArray(messageData.parts) &&
      messageData.parts.length > 0
    ) {
      return parseOpenCodeToolResult(messageData.parts);
    }

    const messageID = resolveOpenCodeMessageId(messageData);
    if (!messageID) {
      throw new Error(
        `Unsupported OpenCode shell response shape: ${describeOpenCodeResponseShape(messageData)}.`
      );
    }

    const details = await client.session.message({
      sessionID,
      messageID,
    });

    return parseOpenCodeToolResult(details.data?.parts ?? []);
  } finally {
    try {
      await client.session.delete({ sessionID });
    } catch {
      // Ignore session cleanup failures.
    }
  }
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

function quoteForPosixShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stripAnsiAndControl(text: string): string {
  return text
    .replace(/\u001B\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function getUsefulRuntimeError(stdout: string, stderr: string): string | null {
  const sanitizedStderr = stripAnsiAndControl(stderr).trim();
  if (sanitizedStderr) {
    return sanitizedStderr;
  }

  const sanitizedStdout = stripAnsiAndControl(stdout).trim();
  if (!sanitizedStdout) {
    return null;
  }

  const errorLikeLines = sanitizedStdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) =>
      /(^|\s)(zsh|bash|sh|node):|parse error|syntax error|command substitution|unexpected token|unexpected EOF|is not defined/i.test(
        line
      )
    );

  if (errorLikeLines.length === 0) {
    return null;
  }

  return errorLikeLines.slice(0, 4).join("\n");
}

function tryParseJsonSegment(candidate: string): unknown | null {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function isJsonBoundaryCharacter(character: string | undefined): boolean {
  if (!character) {
    return true;
  }

  return /[\s\]\}\),]/.test(character);
}

function extractTrailingJsonValue(stdout: string): unknown | null {
  const sanitized = stripAnsiAndControl(stdout).trim();
  if (!sanitized) {
    return null;
  }

  const fullParse = tryParseJsonSegment(sanitized);
  if (fullParse !== null) {
    return fullParse;
  }

  for (let index = sanitized.length - 1; index >= 0; index -= 1) {
    const character = sanitized[index];
    if (character !== "}" && character !== "]") {
      continue;
    }

    for (let start = index; start >= 0; start -= 1) {
      const startCharacter = sanitized[start];
      const isObject = startCharacter === "{";
      const isArray = startCharacter === "[";

      if (!isObject && !isArray) {
        continue;
      }

      if (start > 0 && !isJsonBoundaryCharacter(sanitized[start - 1])) {
        continue;
      }

      const candidate = sanitized.slice(start, index + 1);
      const parsed = tryParseJsonSegment(candidate);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
}

function parseRuntimeOutput(stdout: string, stderr: string): ParsedRuntimeOutput {
  const sanitized = stripAnsiAndControl(stdout).trim();
  if (!sanitized) {
    return {
      ok: false,
      error: getUsefulRuntimeError(stdout, stderr) || "Code produced no output.",
    };
  }

  const parsed = extractTrailingJsonValue(stdout);
  if (parsed === null) {
    return {
      ok: false,
      error:
        getUsefulRuntimeError(stdout, stderr) ||
        "Failed to parse code output JSON.",
    };
  }

  if (!(parsed && typeof parsed === "object" && "success" in parsed)) {
    return {
      ok: false,
      error:
        "Code must return standardized output: { success: boolean, data?: unknown, error?: { message: string } }.",
    };
  }

  return {
    ok: true,
    value: parsed,
  };
}

// ── Step handler ──

async function stepHandler(
  input: ExecuteScaffoldInput
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
      workflowId: input._context?.workflowId,
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
    const runnerBase64 = Buffer.from(getRunnerScript(), "utf8").toString(
      "base64"
    );
    const bootstrap = [
      "const fs = require('fs');",
      "const { spawnSync } = require('child_process');",
      "const runnerBase64 = process.argv[2];",
      "const payloadBase64 = process.argv[3];",
      "const workingDirectory = process.argv[4];",
      "if (!runnerBase64 || !payloadBase64 || !workingDirectory) {",
      "  throw new Error('Missing scaffold bootstrap payload.');",
      "}",
      `const runnerPath = ${JSON.stringify(RUNNER_PATH)};`,
      "fs.writeFileSync(runnerPath, Buffer.from(runnerBase64, 'base64').toString('utf8'));",
      "const result = spawnSync('node', [runnerPath, payloadBase64], {",
      "  cwd: workingDirectory,",
      "  stdio: 'inherit',",
      "});",
      "if (typeof result.status === 'number') {",
      "  process.exit(result.status);",
      "}",
      "if (result.error) {",
      "  throw result.error;",
      "}",
      "process.exit(1);",
    ].join("\n");
    const bootstrapBase64 = Buffer.from(bootstrap, "utf8").toString("base64");
    const bootstrapEntry = [
      "eval(Buffer.from(process.argv[1], 'base64').toString('utf8'));",
    ].join("\n");

    const command = [
      // Transport the runner as base64 to avoid shell parsing issues.
      `node -e ${quoteForPosixShell(bootstrapEntry)} ${quoteForPosixShell(bootstrapBase64)} ${quoteForPosixShell(runnerBase64)} ${quoteForPosixShell(payloadBase64)} ${quoteForPosixShell(runtime.workingDirectory)}`,
    ].join("\n");

    const result = await runtime.executeCommand(command);

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

    const parsed = parseRuntimeOutput(result.stdout, result.stderr);
    if (!parsed.ok) {
      return {
        success: false,
        error: {
          message: parsed.error,
          sandboxType: sandboxTypeResolved,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
      };
    }

    return {
      success: true,
      data: {
        output: parsed.value,
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
