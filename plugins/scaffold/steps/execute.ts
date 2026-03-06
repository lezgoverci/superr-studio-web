import "server-only";

import { eq } from "drizzle-orm";
import { executeCustomNodeRuntime } from "@/lib/custom-nodes/runtime";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";

type ExecuteScaffoldNodeResult =
  | {
      success: true;
      data: {
        customNodeId: string;
        version: number;
        output: unknown;
        sandboxType: "vercel" | "just-bash";
      };
    }
  | {
      success: false;
      error: {
        message: string;
        customNodeId?: string;
        version?: number;
        sandboxType?: "vercel" | "just-bash";
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
    };

export type ExecuteScaffoldNodeCoreInput = {
  customNodeId: string;
  customNodeVersion?: string;
  payloadJson?: string;
  sandboxType?: string;
  oidcToken?: string;
  vercelSandboxToken?: string;
  timeoutMs?: string;
  ownerUserId?: string;
};

export type ExecuteScaffoldNodeInput = StepInput &
  ExecuteScaffoldNodeCoreInput & {
    integrationId?: string;
  };

async function resolveWorkflowOwnerUserId(
  workflowId: string | undefined
): Promise<string | null> {
  if (!workflowId) {
    return null;
  }

  const [workflow] = await db
    .select({ userId: workflows.userId })
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  return workflow?.userId ?? null;
}

function parsePayload(payloadJson: string | undefined):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!payloadJson?.trim()) {
    return { ok: true, payload: {} };
  }

  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
      return {
        ok: false,
        error: "Payload JSON must be a JSON object.",
      };
    }

    return { ok: true, payload: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      error: "Payload JSON is invalid.",
    };
  }
}

async function stepHandler(
  input: ExecuteScaffoldNodeCoreInput,
  workflowId: string | undefined
): Promise<ExecuteScaffoldNodeResult> {
  const customNodeId = input.customNodeId?.trim();
  if (!customNodeId) {
    return {
      success: false,
      error: {
        message: "Custom Node ID is required.",
      },
    };
  }

  const ownerUserId =
    input.ownerUserId?.trim() || (await resolveWorkflowOwnerUserId(workflowId));

  if (!ownerUserId) {
    return {
      success: false,
      error: {
        message:
          "Unable to resolve workflow owner for scaffold execution. Provide ownerUserId or run inside a workflow.",
      },
    };
  }

  const payloadResult = parsePayload(input.payloadJson);
  if (!payloadResult.ok) {
    return {
      success: false,
      error: {
        message: payloadResult.error,
      },
    };
  }

  const parsedVersion = input.customNodeVersion?.trim();
  const version =
    parsedVersion && /^\d+$/.test(parsedVersion)
      ? Number(parsedVersion)
      : undefined;

  const timeoutMs =
    input.timeoutMs && /^\d+$/.test(input.timeoutMs)
      ? Number(input.timeoutMs)
      : undefined;

  const runtimeResult = await executeCustomNodeRuntime({
    userId: ownerUserId,
    customNodeId,
    version,
    payload: payloadResult.payload,
    timeoutMs,
    sandboxType: input.sandboxType,
    oidcToken: input.oidcToken,
    vercelSandboxToken: input.vercelSandboxToken,
  });

  if (!runtimeResult.success) {
    return {
      success: false,
      error: runtimeResult.error,
    };
  }

  return {
    success: true,
    data: {
      customNodeId: runtimeResult.data.customNodeId,
      version: runtimeResult.data.version,
      output: runtimeResult.data.output,
      sandboxType: runtimeResult.data.sandboxType,
    },
  };
}

export async function executeScaffoldNodeStep(
  input: ExecuteScaffoldNodeInput
): Promise<ExecuteScaffoldNodeResult> {
  "use step";

  return withStepLogging(input, () =>
    stepHandler(input, input._context?.workflowId)
  );
}

executeScaffoldNodeStep.maxRetries = 0;

export const _integrationType = "scaffold";
