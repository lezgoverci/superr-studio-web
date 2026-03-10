import "server-only";

import { createSandboxExecutor } from "@/lib/sandbox/executor";
import { getSandboxType } from "@/lib/sandbox/resolve";
import type { SandboxType } from "@/lib/sandbox/types";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { getErrorMessageAsync } from "@/lib/utils";

type RunBashError = {
  message: string;
  command?: string;
  sandboxType?: SandboxType;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};

type RunBashResult =
  | {
      success: true;
      data: {
        command: string;
        sandboxType: SandboxType;
        stdout: string;
        stderr: string;
        exitCode: number;
      };
    }
  | {
      success: false;
      error: RunBashError;
    };

export type RunBashCoreInput = {
  sandboxType?: string;
  vercelIntegrationId?: string;
  sandboxId?: string;
  command?: string;
};

export type RunBashInput = StepInput & RunBashCoreInput;

async function noopCleanup(): Promise<void> {
  // Intentionally empty: lifecycle is managed elsewhere.
}

async function stepHandler(input: RunBashCoreInput): Promise<RunBashResult> {
  const command = input.command?.trim();
  if (!command) {
    return {
      success: false,
      error: {
        message: "Bash command is required.",
      },
    };
  }

  let cleanup = noopCleanup;
  let sandboxType = getSandboxType(input.sandboxType);

  try {
    const runtime = await createSandboxExecutor({
      sandboxType: input.sandboxType,
      vercelIntegrationId: input.vercelIntegrationId,
      sandboxId: input.sandboxId,
    });
    cleanup = runtime.cleanup;
    sandboxType = runtime.sandboxType;

    const escapedWorkingDirectory = runtime.workingDirectory.replace(/"/g, '\\"');
    const result = await runtime.executeCommand(
      `cd "${escapedWorkingDirectory}" && ${command}`
    );

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: {
          message: `Command exited with code ${result.exitCode}.`,
          command,
          sandboxType,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
      };
    }

    return {
      success: true,
      data: {
        command,
        sandboxType,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
    };
  } catch (error) {
    const message = await getErrorMessageAsync(error);
    return {
      success: false,
      error: {
        message: `Failed to execute command: ${message}`,
        command,
        sandboxType,
      },
    };
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("[bash] Failed to cleanup sandbox:", cleanupError);
    }
  }
}

export async function runBashCommandStep(
  input: RunBashInput
): Promise<RunBashResult> {
  "use step";

  return withStepLogging(input, () => stepHandler(input));
}
runBashCommandStep.maxRetries = 0;

export const _integrationType = "bash";
