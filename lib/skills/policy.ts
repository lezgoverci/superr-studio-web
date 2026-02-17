import "server-only";

import type { CreateBashToolOptions } from "bash-tool";

type BeforeBashHook = NonNullable<CreateBashToolOptions["onBeforeBashCall"]>;
type AfterBashHook = NonNullable<CreateBashToolOptions["onAfterBashCall"]>;

const BLOCKED_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(^|[;&|]\s*)rm\s+-rf\s+\/(\s|$)/i,
    reason: 'destructive root deletion ("rm -rf /")',
  },
  {
    pattern: /\b(shutdown|reboot|poweroff|halt)\b/i,
    reason: "system power control commands",
  },
  {
    pattern: /\bmkfs(\.[a-z0-9]+)?\b/i,
    reason: "filesystem formatting command",
  },
  {
    pattern: /\bdd\s+if=\/dev\/zero\s+of=\/dev\/[a-z]/i,
    reason: "raw block device overwrite command",
  },
  {
    pattern: /169\.254\.169\.254/,
    reason: "instance metadata endpoint access",
  },
];

const OUTPUT_REDACTION_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    replacement: "[REDACTED_SLACK_TOKEN]",
  },
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED_AWS_ACCESS_KEY]",
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi,
    replacement: "Bearer [REDACTED_TOKEN]",
  },
];

function redactSensitiveOutput(output: string): string {
  let redacted = output;
  for (const rule of OUTPUT_REDACTION_PATTERNS) {
    redacted = redacted.replace(rule.pattern, rule.replacement);
  }
  return redacted;
}

export function createSkillPolicyHooks(): {
  onBeforeBashCall: BeforeBashHook;
  onAfterBashCall: AfterBashHook;
} {
  const onBeforeBashCall: BeforeBashHook = ({ command }) => {
    for (const rule of BLOCKED_COMMAND_PATTERNS) {
      if (rule.pattern.test(command)) {
        throw new Error(`Blocked bash command by policy: ${rule.reason}.`);
      }
    }
    return { command };
  };

  const onAfterBashCall: AfterBashHook = ({ result }) => {
    const sanitizedStdout = redactSensitiveOutput(result.stdout);
    const sanitizedStderr = redactSensitiveOutput(result.stderr);

    if (
      sanitizedStdout === result.stdout &&
      sanitizedStderr === result.stderr
    ) {
      return;
    }

    return {
      result: {
        ...result,
        stdout: sanitizedStdout,
        stderr: sanitizedStderr,
      },
    };
  };

  return {
    onBeforeBashCall,
    onAfterBashCall,
  };
}
