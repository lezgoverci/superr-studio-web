/**
 * Unified sandbox executor factory.
 *
 * Replaces the three local `createSandboxExecutor` implementations
 * that were duplicated across ai-agent, bash, and code plugins.
 *
 * Key enhancement: when `input.sandboxId` is provided the executor
 * reconnects to an existing managed sandbox via `Sandbox.get()` instead
 * of creating a fresh one.  The cleanup callback is a no-op in that
 * case because the sandbox is user-owned.
 */
import "server-only";

import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { createBashTool } from "bash-tool";

import { resolveVercelSandboxCredentials } from "@/lib/vercel-sandbox-credentials";
import type { CreateSandboxExecutorInput, SandboxExecutor } from "./types";
import { getSandboxType, resolveVercelSandboxDestination } from "./resolve";
import { resolveManagedSandbox } from "./managed";

// ── Public API ──────────────────────────────────────────────────────

/**
 * Create a `SandboxExecutor` based on the supplied input.
 *
 * Supports three modes:
 *   1. `just-bash`  – local simulated shell (no VM)
 *   2. `vercel`     – remote Vercel Sandbox VM
 *     a. *ephemeral* (no `sandboxId`) → `Sandbox.create()` + stop on cleanup
 *     b. *managed*  (`sandboxId`)     → `Sandbox.get()`   + no-op cleanup
 *   3. `opencode`   – delegated to an OpenCode agent connection
 *     ↳ Not handled here; the code plugin retains its own OpenCode logic.
 */
export async function createSandboxExecutor(
  input: CreateSandboxExecutorInput,
): Promise<SandboxExecutor> {
  const sandboxType = getSandboxType(input.sandboxType);

  // ── just-bash ─────────────────────────────────────────────────────
  if (sandboxType === "just-bash") {
    const { sandbox } = await createBashTool();
    return {
      sandboxType,
      workingDirectory: "/workspace",
      executeCommand: (command) => sandbox.executeCommand(command),
      cleanup: async () => {},
    };
  }

  // ── opencode (not handled centrally) ──────────────────────────────
  if (sandboxType === "opencode") {
    throw new Error(
      "OpenCode sandbox type must be resolved by the code plugin directly.",
    );
  }

  // ── vercel (managed OR ephemeral) ─────────────────────────────────
  if (input.sandboxId) {
    return connectToManagedSandbox(input.sandboxId, input.vercelIntegrationId);
  }

  return createEphemeralSandbox(input.vercelIntegrationId);
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Reconnect to an existing managed sandbox.
 * Does NOT stop the sandbox on cleanup.
 */
async function connectToManagedSandbox(
  sandboxId: string,
  vercelIntegrationId: string | undefined,
): Promise<SandboxExecutor> {
  const managed = await resolveManagedSandbox(sandboxId);
  const credentials = await resolveVercelSandboxCredentials(
    managed.integrationId || vercelIntegrationId,
  );

  const sandbox = await VercelSandbox.get({
    sandboxId: managed.vercelSandboxId,
    ...credentials,
  });

  const destination = await resolveVercelSandboxDestination(sandbox);
  const { sandbox: wrappedSandbox } = await createBashTool({
    sandbox,
    destination,
  });

  return {
    sandboxType: "vercel",
    workingDirectory: destination,
    executeCommand: (command) => wrappedSandbox.executeCommand(command),
    // Managed sandbox: do NOT stop — the user controls the lifecycle.
    cleanup: async () => {},
  };
}

/**
 * Create a brand-new ephemeral sandbox.
 * Stops the sandbox on cleanup.
 */
async function createEphemeralSandbox(
  vercelIntegrationId: string | undefined,
): Promise<SandboxExecutor> {
  const credentials = await resolveVercelSandboxCredentials(
    vercelIntegrationId,
  );
  const sandbox = await VercelSandbox.create(credentials);
  const destination = await resolveVercelSandboxDestination(sandbox);
  const { sandbox: wrappedSandbox } = await createBashTool({
    sandbox,
    destination,
  });

  return {
    sandboxType: "vercel",
    workingDirectory: destination,
    executeCommand: (command) => wrappedSandbox.executeCommand(command),
    cleanup: async () => {
      await sandbox.stop();
    },
  };
}
