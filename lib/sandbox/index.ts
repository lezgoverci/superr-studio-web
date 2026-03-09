/**
 * Shared sandbox module – barrel export.
 *
 * All sandbox-related logic consumed by plugins and API routes lives here.
 */

export { createSandboxExecutor } from "./executor";
export { getSandboxType, resolveVercelSandboxDestination } from "./resolve";
export { resolveManagedSandbox } from "./managed";
export type {
  CommandExecutionResult,
  CreateSandboxExecutorInput,
  SandboxExecutor,
  SandboxType,
} from "./types";
