/**
 * Sandbox helpers – pure functions with no DB or SDK side-effects.
 *
 * Extracted from the three plugin step files that previously
 * copy-pasted these helpers.
 */
import "server-only";

import type { Sandbox as VercelSandbox } from "@vercel/sandbox";
import type { SandboxType } from "./types";

/**
 * Normalise a raw config value to a `SandboxType`.
 *
 * Each plugin had its own version of this with slightly different
 * defaults.  The shared version defaults to `"just-bash"` (the safest
 * choice) and lets callers override.
 */
export function getSandboxType(
  raw: string | undefined,
  fallback: SandboxType = "just-bash",
): SandboxType {
  if (raw === "vercel") return "vercel";
  if (raw === "just-bash") return "just-bash";
  if (raw === "opencode") return "opencode";
  return fallback;
}

/**
 * Probe a Vercel Sandbox VM to determine the best working directory.
 *
 * `bash-tool` defaults to `/vercel/sandbox/workspace` but some VM
 * images lack that path.  This probe creates or falls back to the
 * next-best candidate.
 */
export async function resolveVercelSandboxDestination(
  sandbox: VercelSandbox,
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
      `Failed to determine Vercel sandbox working directory${stderr ? `: ${stderr}` : "."}`,
    );
  }

  const destination = (await probeResult.stdout()).trim();
  if (!destination) {
    throw new Error(
      "Failed to determine Vercel sandbox working directory: no destination returned.",
    );
  }

  return destination;
}
