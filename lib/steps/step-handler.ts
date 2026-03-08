/**
 * Step Handler - Logging utilities for workflow builder UI
 * These functions are called FROM INSIDE steps (within "use step" context)
 * Uses direct database calls for security (no HTTP endpoint)
 */
import "server-only";

import { getWritable } from "workflow";
import { redactSensitiveData } from "../utils/redact";
import {
  logStepCompleteDb,
  logStepStartDb,
  logWorkflowCompleteDb,
} from "../workflow-logging";
import {
  EXECUTION_STATUS_STREAM_NAMESPACE,
  type NodeExecutionStatus,
  type WorkflowStatusStreamEvent,
} from "../workflow-status-stream";

export type StepContext = {
  executionId?: string;
  workflowId?: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
};

/**
 * Base input type that all steps should extend
 * Adds optional _context for logging
 */
export type StepInput = {
  _context?: StepContext;
};

type LogInfo = {
  logId: string;
  startTime: number;
};

async function writeStatusStreamEvent(
  event: WorkflowStatusStreamEvent,
  closeStream = false
): Promise<void> {
  try {
    const writable = getWritable<WorkflowStatusStreamEvent>({
      namespace: EXECUTION_STATUS_STREAM_NAMESPACE,
    });
    const writer = writable.getWriter();

    try {
      await writer.write(event);
      if (closeStream) {
        await writer.close();
      }
    } finally {
      writer.releaseLock();
    }
  } catch (error) {
    console.error("[stepHandler] Failed to write status stream event:", error);
  }
}

async function emitNodeStatusEvent(options: {
  context: StepContext | undefined;
  status: NodeExecutionStatus;
  output?: unknown;
  error?: string;
}): Promise<void> {
  const { context, status, output, error } = options;
  if (!context?.executionId) {
    return;
  }

  await writeStatusStreamEvent({
    type: "node_status",
    executionId: context.executionId,
    nodeId: context.nodeId,
    nodeName: context.nodeName,
    nodeType: context.nodeType,
    status,
    timestamp: new Date().toISOString(),
    output,
    error,
  });
}

/**
 * Log the start of a step execution
 */
async function logStepStart(
  context: StepContext | undefined,
  input: unknown
): Promise<LogInfo> {
  if (!context?.executionId) {
    return { logId: "", startTime: Date.now() };
  }

  try {
    const redactedInput = redactSensitiveData(input);

    const result = await logStepStartDb({
      executionId: context.executionId,
      nodeId: context.nodeId,
      nodeName: context.nodeName,
      nodeType: context.nodeType,
      input: redactedInput,
    });

    await emitNodeStatusEvent({
      context,
      status: "running",
    });

    return result;
  } catch (error) {
    console.error("[stepHandler] Failed to log start:", error);
    await emitNodeStatusEvent({
      context,
      status: "running",
    });
    return { logId: "", startTime: Date.now() };
  }
}

/**
 * Log the completion of a step execution
 */
async function logStepComplete(options: {
  context: StepContext | undefined;
  logInfo: LogInfo;
  status: "success" | "error";
  output?: unknown;
  error?: string;
}): Promise<void> {
  const { context, logInfo, status, output, error } = options;
  const redactedOutput = redactSensitiveData(output);

  try {
    if (logInfo.logId) {
      await logStepCompleteDb({
        logId: logInfo.logId,
        startTime: logInfo.startTime,
        status,
        output: redactedOutput,
        error,
      });
    }
  } catch (err) {
    console.error("[stepHandler] Failed to log completion:", err);
  }

  await emitNodeStatusEvent({
    context,
    status,
    output: redactedOutput,
    error,
  });
}

/**
 * Internal fields to strip from logged input
 */
const INTERNAL_FIELDS = [
  "_context",
  "actionType",
  "integrationId",
  "vercelIntegrationId",
] as const;

/**
 * Strip internal fields from input for logging (we don't want to log internal metadata)
 */
function stripInternalFields<T extends StepInput>(
  input: T
): Omit<
  T,
  "_context" | "actionType" | "integrationId" | "vercelIntegrationId"
> {
  const result = { ...input };
  for (const field of INTERNAL_FIELDS) {
    delete (result as Record<string, unknown>)[field];
  }
  return result as Omit<
    T,
    "_context" | "actionType" | "integrationId" | "vercelIntegrationId"
  >;
}

/**
 * Log workflow execution completion
 * Call this from within a step context to update the overall workflow status
 */
export async function logWorkflowComplete(options: {
  executionId: string;
  status: "success" | "error";
  output?: unknown;
  error?: string;
  startTime: number;
}): Promise<void> {
  const redactedOutput = redactSensitiveData(options.output);

  try {
    await logWorkflowCompleteDb({
      executionId: options.executionId,
      status: options.status,
      output: redactedOutput,
      error: options.error,
      startTime: options.startTime,
    });
  } catch (err) {
    console.error("[stepHandler] Failed to log workflow completion:", err);
  }

  await writeStatusStreamEvent(
    {
      type: "execution_status",
      executionId: options.executionId,
      status: options.status,
      timestamp: new Date().toISOString(),
      output: redactedOutput,
      error: options.error,
    },
    true
  );
}

/**
 * Extended context that includes workflow completion info
 */
export type StepContextWithWorkflow = StepContext & {
  _workflowComplete?: {
    status: "success" | "error";
    output?: unknown;
    error?: string;
    startTime: number;
  };
};

/**
 * Extended input type for steps that may handle workflow completion
 */
export type StepInputWithWorkflow = {
  _context?: StepContextWithWorkflow;
};

/**
 * Wrap step logic with logging
 * Call this from inside your step function (within "use step" context)
 * If _context._workflowComplete is set, also logs workflow completion
 *
 * @example
 * export async function myStep(input: MyInput & StepInput) {
 *   "use step";
 *   return withStepLogging(input, async () => {
 *     // your step logic here
 *     return { success: true, data: ... };
 *   });
 * }
 */
export async function withStepLogging<TInput extends StepInput, TOutput>(
  input: TInput,
  stepLogic: () => Promise<TOutput>
): Promise<TOutput> {
  // Extract context and log input without internal fields
  const context = input._context as StepContextWithWorkflow | undefined;
  const loggedInput = stripInternalFields(input);
  const logInfo = await logStepStart(context, loggedInput);

  try {
    const result = await stepLogic();

    // Check if result has standardized format { success, data } or { success, error }
    const isStandardizedResult =
      result &&
      typeof result === "object" &&
      "success" in result &&
      typeof (result as { success: unknown }).success === "boolean";

    // Check if result indicates an error
    const isErrorResult =
      isStandardizedResult &&
      (result as { success: boolean }).success === false;

    if (isErrorResult) {
      const errorResult = result as {
        success: false;
        error?: string | { message: string };
      };
      // Support both old format (error: string) and new format (error: { message: string })
      const errorMessage =
        typeof errorResult.error === "string"
          ? errorResult.error
          : errorResult.error?.message || "Step execution failed";
      // Log just the error object, not the full result
      const loggedOutput = errorResult.error ?? { message: errorMessage };
      await logStepComplete({
        context,
        logInfo,
        status: "error",
        output: loggedOutput,
        error: errorMessage,
      });
    } else if (isStandardizedResult) {
      // For standardized success results, log just the data
      const successResult = result as { success: true; data?: unknown };
      await logStepComplete({
        context,
        logInfo,
        status: "success",
        output: successResult.data ?? result,
      });
    } else {
      // For non-standardized results, log as-is
      await logStepComplete({
        context,
        logInfo,
        status: "success",
        output: result,
      });
    }

    // If this step should also log workflow completion, do it now
    if (context?._workflowComplete && context.executionId) {
      await logWorkflowComplete({
        executionId: context.executionId,
        ...context._workflowComplete,
      });
    }

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await logStepComplete({
      context,
      logInfo,
      status: "error",
      error: errorMessage,
    });
    throw error;
  }
}
