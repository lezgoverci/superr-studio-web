/**
 * AI Agent Step - Run Agent
 *
 * Uses AI SDK's ToolLoopAgent with bash-tool tools (bash, readFile, writeFile)
 * so the model can iteratively reason and execute commands.
 */
import "server-only";

import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { createGateway, stepCountIs, ToolLoopAgent } from "ai";
import { createBashTool, experimental_createSkillTool } from "bash-tool";
import { createSkillPolicyHooks } from "@/lib/skills/policy";
import { resolveSkills, sanitizeSkillsDestination } from "@/lib/skills/resolve";
import type { SkillSourceConfig } from "@/lib/skills/types";
import { parseSkillsAllowlist } from "@/lib/skills/validate";
import { fetchCredentials } from "@/lib/credential-fetcher";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { getErrorMessageAsync } from "@/lib/utils";
import type { AiAgentCredentials } from "../credentials";

type SandboxType = "vercel" | "just-bash";

type RunAgentResult =
  | {
      success: true;
      text: string;
      stepsUsed: number;
      data?: unknown;
      sandboxTypeResolved: SandboxType;
      skillsAvailable: string[];
      skillsUsed: string[];
    }
  | {
      success: false;
      error: {
        message: string;
      };
    };

export type RunAgentCoreInput = {
  aiModel?: string;
  sandboxType?: string;
  vercelSandboxToken?: string;
  agentPrompt?: string;
  agentInstructions?: string;
  maxSteps?: string;
  skillsEnabled?: string;
  skillsSource?: string;
  skillsDirectory?: string;
  skillsRepoUrl?: string;
  skillsRepoRef?: string;
  skillsRepoSubdir?: string;
  skillsAllowlist?: string;
  skillsDestination?: string;
};

export type RunAgentInput = StepInput &
  RunAgentCoreInput & {
    integrationId?: string;
  };

/**
 * Gets the full model string in provider/model format.
 */
function getModelString(modelId: string): string {
  if (modelId.includes("/")) {
    return modelId;
  }

  if (modelId.startsWith("claude-")) {
    return `anthropic/${modelId}`;
  }
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1-")) {
    return `openai/${modelId}`;
  }
  return `openai/${modelId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/**
 * Attempt to parse stdout as JSON for structured output.
 * Falls back to raw text if parsing fails.
 */
function parseAgentOutput(
  text: string,
  steps: Array<{ toolCalls?: unknown }>
): unknown {
  const trimmed = text.trim();

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Not valid JSON, return as text
    }
  }

  return { text: trimmed, stepsUsed: steps.length };
}

function extractSkillsUsed(steps: Array<{ toolCalls?: unknown }>): string[] {
  const names = new Set<string>();

  for (const step of steps) {
    if (!Array.isArray(step.toolCalls)) {
      continue;
    }

    for (const rawCall of step.toolCalls) {
      if (!isRecord(rawCall)) {
        continue;
      }

      if (rawCall.toolName !== "skill") {
        continue;
      }

      const input = isRecord(rawCall.input)
        ? rawCall.input
        : isRecord(rawCall.args)
          ? rawCall.args
          : undefined;

      const skillName =
        input && typeof input.skillName === "string"
          ? input.skillName.trim()
          : "";

      if (skillName) {
        names.add(skillName);
      }
    }
  }

  return [...names];
}

type VercelSandboxCredentials = {
  token: string;
  teamId: string;
  projectId: string;
};

type SandboxTools = Awaited<ReturnType<typeof createBashTool>>["tools"];
type SkillTool = Awaited<
  ReturnType<typeof experimental_createSkillTool>
>["skill"];

type AgentTools = SandboxTools & {
  skill?: SkillTool;
};

type PreparedSkillToolkit = {
  skill: SkillTool;
  files: Record<string, string>;
  instructions: string;
  skills: string[];
  hasExecutableSkills: boolean;
  cleanup: () => Promise<void>;
};

function getSandboxType(sandboxType: string | undefined): SandboxType {
  if (sandboxType === "just-bash") {
    return "just-bash";
  }

  return "vercel";
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

function buildSkillSourceConfig(input: RunAgentCoreInput): SkillSourceConfig {
  const source = input.skillsSource === "git" ? "git" : "preloaded";

  if (source === "preloaded") {
    const directory = input.skillsDirectory?.trim();
    if (!directory) {
      throw new Error(
        "Skills directory is required when Skill Source is set to Preloaded Directory."
      );
    }

    return {
      source,
      directory,
    };
  }

  const repoUrl = input.skillsRepoUrl?.trim();
  if (!repoUrl) {
    throw new Error(
      "Skills repository URL is required when Skill Source is set to Git Repository."
    );
  }

  return {
    source,
    repoUrl,
    repoRef: input.skillsRepoRef?.trim() || "main",
    repoSubdir: input.skillsRepoSubdir?.trim() || "skills",
  };
}

async function createSkillToolkit(
  input: RunAgentCoreInput
): Promise<PreparedSkillToolkit | null> {
  if (input.skillsEnabled !== "on") {
    return null;
  }

  const source = buildSkillSourceConfig(input);
  const allowlist = parseSkillsAllowlist(input.skillsAllowlist);
  const destination = sanitizeSkillsDestination(input.skillsDestination);

  const resolvedSkills = await resolveSkills({
    source,
    allowlist,
  });

  try {
    const toolkit = await experimental_createSkillTool({
      skillsDirectory: resolvedSkills.skillsDirectory,
      destination,
    });

    if (toolkit.skills.length === 0) {
      throw new Error(
        "Skills are enabled but no valid skills were discovered from the configured source."
      );
    }

    return {
      skill: toolkit.skill,
      files: toolkit.files,
      instructions: toolkit.instructions,
      skills: toolkit.skills.map((skill) => skill.name),
      hasExecutableSkills: resolvedSkills.hasExecutableSkills,
      cleanup: resolvedSkills.cleanup,
    };
  } catch (error) {
    await resolvedSkills.cleanup();
    throw error;
  }
}

async function createSandboxTools(
  input: RunAgentCoreInput,
  skillToolkit: PreparedSkillToolkit | null
): Promise<{
  tools: AgentTools;
  sandboxType: SandboxType;
  cleanup: () => Promise<void>;
}> {
  const requestedSandboxType = getSandboxType(input.sandboxType);

  if (skillToolkit?.hasExecutableSkills && requestedSandboxType !== "vercel") {
    throw new Error(
      'Selected sandbox is "just-bash", but one or more loaded skills include scripts. Use "Vercel Sandbox (full)" for script-capable skills.'
    );
  }

  const policyHooks = createSkillPolicyHooks();

  if (requestedSandboxType === "just-bash") {
    const { tools } = await createBashTool({
      files: skillToolkit?.files,
      extraInstructions: skillToolkit?.instructions,
      onBeforeBashCall: policyHooks.onBeforeBashCall,
      onAfterBashCall: policyHooks.onAfterBashCall,
    });

    return {
      tools: skillToolkit ? { ...tools, skill: skillToolkit.skill } : tools,
      sandboxType: requestedSandboxType,
      cleanup: async () => {},
    };
  }

  const token = input.vercelSandboxToken?.trim();
  if (!token) {
    throw new Error(
      "Vercel Sandbox token is required when Sandbox is set to Vercel Sandbox."
    );
  }

  const credentials = resolveVercelSandboxCredentials(token);
  const sandbox = await VercelSandbox.create(credentials);
  const destination = await resolveVercelSandboxDestination(sandbox);

  const { tools } = await createBashTool({
    sandbox,
    destination,
    files: skillToolkit?.files,
    extraInstructions: skillToolkit?.instructions,
    onBeforeBashCall: policyHooks.onBeforeBashCall,
    onAfterBashCall: policyHooks.onAfterBashCall,
  });

  return {
    tools: skillToolkit ? { ...tools, skill: skillToolkit.skill } : tools,
    sandboxType: requestedSandboxType,
    cleanup: async () => {
      await sandbox.stop();
    },
  };
}

const DEFAULT_INSTRUCTIONS = `You are a helpful AI agent that can execute bash commands to accomplish tasks.
You have access to tools for running bash commands, reading files, and writing files in a sandboxed environment.
The sandbox has common utilities like jq, grep, sed, awk, sort, base64, and more.

When processing data:
- Write data to files, process with bash commands, read results
- Use jq for JSON processing
- Use standard unix tools for text processing
- Output your final result clearly

Always explain what you're doing briefly before executing commands.`;

/**
 * Core agent logic
 */
async function stepHandler(
  input: RunAgentCoreInput,
  credentials: AiAgentCredentials
): Promise<RunAgentResult> {
  const apiKey = credentials.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: {
        message:
          "AI_GATEWAY_API_KEY is not configured. Please add it in Project Integrations.",
      },
    };
  }

  const modelId = input.aiModel || "anthropic/claude-sonnet-4.5";
  const promptText = input.agentPrompt || "";

  if (!promptText || promptText.trim() === "") {
    return {
      success: false,
      error: {
        message: "Agent prompt is required.",
      },
    };
  }

  const maxSteps = Math.min(
    Math.max(Number.parseInt(input.maxSteps || "10", 10) || 10, 1),
    50
  );
  const modelString = getModelString(modelId);

  let sandboxCleanup = async () => {};
  let skillCleanup = async () => {};
  let sandboxTypeResolved = getSandboxType(input.sandboxType);
  let skillToolkit: PreparedSkillToolkit | null = null;

  try {
    const gateway = createGateway({ apiKey });

    skillToolkit = await createSkillToolkit(input);
    if (skillToolkit) {
      skillCleanup = skillToolkit.cleanup;
    }

    const sandboxRuntime = await createSandboxTools(input, skillToolkit);
    sandboxCleanup = sandboxRuntime.cleanup;
    sandboxTypeResolved = sandboxRuntime.sandboxType;

    const agent = new ToolLoopAgent({
      model: gateway(modelString),
      tools: sandboxRuntime.tools,
      instructions: input.agentInstructions || DEFAULT_INSTRUCTIONS,
      stopWhen: stepCountIs(maxSteps),
    });

    const result = await agent.generate({
      prompt: promptText,
    });

    const steps = Array.isArray(result.steps)
      ? (result.steps as Array<{ toolCalls?: unknown }>)
      : [];

    const data = parseAgentOutput(result.text, steps);

    return {
      success: true,
      text: result.text,
      stepsUsed: steps.length,
      data,
      sandboxTypeResolved,
      skillsAvailable: skillToolkit?.skills ?? [],
      skillsUsed: skillToolkit ? extractSkillsUsed(steps) : [],
    };
  } catch (error) {
    const message = await getErrorMessageAsync(error);
    return {
      success: false,
      error: {
        message: `Agent execution failed: ${message}`,
      },
    };
  } finally {
    try {
      await sandboxCleanup();
    } catch (cleanupError) {
      console.error("[ai-agent] Failed to cleanup sandbox:", cleanupError);
    }

    try {
      await skillCleanup();
    } catch (cleanupError) {
      console.error("[ai-agent] Failed to cleanup skill staging:", cleanupError);
    }
  }
}

/**
 * App entry point - fetches credentials and wraps with logging
 */
export async function runAgentStep(
  input: RunAgentInput
): Promise<RunAgentResult> {
  "use step";

  const credentials = input.integrationId
    ? await fetchCredentials(input.integrationId)
    : {};

  return withStepLogging(input, () => stepHandler(input, credentials));
}
runAgentStep.maxRetries = 0;

export const _integrationType = "ai-agent";
