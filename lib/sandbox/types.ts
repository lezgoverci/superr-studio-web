/**
 * Shared sandbox type definitions.
 *
 * Centralises the sandbox vocabulary so every plugin and API route
 * speaks the same language.
 */

export type SandboxType = "vercel" | "just-bash" | "opencode";

/**
 * Lightweight result from executing a single command inside any sandbox.
 */
export type CommandExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Uniform facade returned by `createSandboxExecutor`.
 *
 * Plugins call `executeCommand` and, when finished, `cleanup`.
 * For *managed* sandboxes the cleanup is a no-op (the sandbox keeps running).
 */
export type SandboxExecutor = {
  sandboxType: SandboxType;
  workingDirectory: string;
  executeCommand: (command: string) => Promise<CommandExecutionResult>;
  cleanup: () => Promise<void>;
};

/**
 * Input accepted by the shared `createSandboxExecutor`.
 */
export type CreateSandboxExecutorInput = {
  /** Raw string from the node config (may be undefined). */
  sandboxType?: string;
  /** Vercel integration credentials reference. */
  vercelIntegrationId?: string;
  /** Managed-sandbox DB id – when set, reconnects instead of creating. */
  sandboxId?: string;
  /** Workflow ID (needed for OpenCode sandbox). */
  workflowId?: string;
};
