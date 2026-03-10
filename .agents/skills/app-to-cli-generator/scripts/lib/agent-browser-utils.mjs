import os from "node:os";
import path from "node:path";
import { runProcess } from "./process-utils.mjs";

const JSON_LINE_PATTERN = /^[[{]/;
const NEWLINE_PATTERN = /\r?\n/;

export function getAgentBrowserBinary() {
  return process.env.APP_TO_CLI_GENERATOR_AGENT_BROWSER_BIN || "agent-browser";
}

function getAgentBrowserEnvironment() {
  const nodeBinDir = path.dirname(process.execPath);
  return {
    ...process.env,
    AGENT_BROWSER_SOCKET_DIR:
      process.env.AGENT_BROWSER_SOCKET_DIR ||
      (process.platform === "win32" ? path.join(os.tmpdir(), "ab") : "/tmp/ab"),
    PATH: [nodeBinDir, process.env.PATH || ""]
      .filter(Boolean)
      .join(path.delimiter),
  };
}

export function makeSessionName(value) {
  return String(value || "app-cli")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function runAgentBrowser(
  args,
  {
    sessionName,
    json = false,
    input,
    allowFailure = false,
    headed = false,
  } = {}
) {
  const finalArgs = [];

  if (sessionName) {
    finalArgs.push("--session", sessionName);
  }
  if (json) {
    finalArgs.push("--json");
  }
  if (headed) {
    finalArgs.push("--headed");
  }
  finalArgs.push(...args);

  return await runProcess(getAgentBrowserBinary(), finalArgs, {
    allowFailure,
    env: getAgentBrowserEnvironment(),
    input,
  });
}

export function extractJsonPayload(output) {
  const lines = String(output || "")
    .split(NEWLINE_PATTERN)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!JSON_LINE_PATTERN.test(lines[index])) {
      continue;
    }

    try {
      return JSON.parse(lines[index]);
    } catch {
      // ignore parse errors, continue to next line
    }
  }

  throw new Error(`Unable to parse JSON output: ${output}`);
}

export function unwrapAgentBrowserPayload(payload) {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload
  ) {
    if (payload.success === false) {
      throw new Error(payload.error || "agent-browser reported an error.");
    }
    return payload.data;
  }

  return payload;
}

export async function runAgentBrowserJson(args, options = {}) {
  const result = await runAgentBrowser(args, {
    ...options,
    json: true,
  });

  return unwrapAgentBrowserPayload(extractJsonPayload(result.stdout));
}

export async function runAgentBrowserEval(script, options = {}) {
  const result = await runAgentBrowserJson(["eval", "--stdin"], {
    ...options,
    input: script,
  });

  return result.result ?? "";
}
