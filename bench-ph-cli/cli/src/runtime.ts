import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AppCliManifest,
  CliMode,
  ManifestCommand,
  ManifestFlow,
  ManifestRequestRecipe,
  ResponseType,
} from "./manifest-types.js";
import { validateManifestShape } from "./manifest-types.js";

type StorageStateCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
};

type StorageState = {
  cookies?: StorageStateCookie[];
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
};

export type GlobalOptions = {
  mode?: CliMode;
  sessionName?: string;
  json?: boolean;
  headed?: boolean;
};

type CommandArgs = Record<string, string | number | boolean | undefined>;

type TemplateContext = {
  app: AppCliManifest["app"];
  auth: AppCliManifest["auth"];
  args: CommandArgs;
  captures: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
  state: {
    cookies: Record<string, string>;
    localStorage: Record<string, string>;
  };
};

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

function getAgentBrowserCommand(): string {
  return process.env.APP_TO_CLI_GENERATOR_AGENT_BROWSER_BIN || "agent-browser";
}

function getAgentBrowserEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AGENT_BROWSER_SOCKET_DIR:
      process.env.AGENT_BROWSER_SOCKET_DIR ??
      (process.platform === "win32" ? path.join(os.tmpdir(), "ab") : "/tmp/ab"),
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveProjectManifestPath(projectRoot: string): string {
  return path.join(projectRoot, "manifest.json");
}

function readPath(target: unknown, pathExpression: string): unknown {
  const segments = pathExpression.split(".");
  let current = target;

  for (const segment of segments) {
    if (!(current && typeof current === "object")) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function normalizeTemplateValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function renderTemplateString(template: string, context: TemplateContext): unknown {
  const exactMatch = template.match(/^\{\{\s*([^}]+)\s*\}\}$/);
  if (exactMatch) {
    const expression = exactMatch[1];
    return readPath(context, expression?.trim() ?? "") ?? "";
  }

  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key) => {
    return normalizeTemplateValue(readPath(context, key.trim()));
  });
}

function renderValue<T>(value: T, context: TemplateContext): T {
  if (typeof value === "string") {
    return renderTemplateString(value, context) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => renderValue(entry, context)) as T;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, entry]) => [
      key,
      renderValue(entry, context),
    ]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

async function runProcess(
  command: string,
  args: string[],
  options: { stdin?: string; capture?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<ProcessResult> {
  const capture = options.capture ?? true;

  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: capture ? "pipe" : "inherit",
      env: options.env ?? process.env,
    });

    let stdout = "";
    let stderr = "";

    child.on("error", (error: Error) => {
      reject(
        new Error(
          `Failed to run "${command}". Make sure it is installed and on PATH. ${error.message}`,
        ),
      );
    });

    if (capture) {
      const stdoutStream = child.stdout;
      const stderrStream = child.stderr;
      if (!(stdoutStream && stderrStream)) {
        reject(new Error(`Failed to attach output streams for "${command}".`));
        return;
      }

      stdoutStream.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      stderrStream.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
    }

    child.on("close", (exitCode: number | null) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    if (capture && child.stdin) {
      if (options.stdin) {
        child.stdin.write(options.stdin);
      }
      child.stdin.end();
    }
  });
}

async function runAgentBrowser(
  manifest: AppCliManifest,
  globals: GlobalOptions,
  args: string[],
  options: { stdin?: string } = {},
): Promise<string> {
  const sessionName = globals.sessionName ?? manifest.app.defaultSessionName;
  const finalArgs = sessionName ? ["--session", sessionName, ...args] : args;
  const result = await runProcess(getAgentBrowserCommand(), finalArgs, {
    env: getAgentBrowserEnvironment(),
    stdin: options.stdin,
  });

  if (result.exitCode !== 0) {
    const output = result.stderr.trim() || result.stdout.trim();
    throw new Error(output || `agent-browser failed with exit code ${result.exitCode}.`);
  }

  return result.stdout.trimEnd();
}

export async function executeRawAgentBrowser(
  manifest: AppCliManifest,
  globals: GlobalOptions,
  args: string[],
): Promise<number> {
  const hasSessionOverride = args.includes("--session");
  const finalArgs = [...args];

  if (!hasSessionOverride) {
    finalArgs.unshift(manifest.app.defaultSessionName);
    finalArgs.unshift("--session");
  }

  if (globals.sessionName && !hasSessionOverride) {
    finalArgs[1] = globals.sessionName;
  }

  if (globals.headed && finalArgs[2] === "open" && !finalArgs.includes("--headed")) {
    finalArgs.push("--headed");
  }

  const result = await runProcess(getAgentBrowserCommand(), finalArgs, {
    capture: false,
    env: getAgentBrowserEnvironment(),
  });
  return result.exitCode;
}

export async function readManifestFromProject(
  projectRoot: string,
): Promise<AppCliManifest> {
  const manifestPath = resolveProjectManifestPath(projectRoot);
  const raw = await fs.readFile(manifestPath, "utf8");
  return validateManifestShape(JSON.parse(raw));
}

export async function writeManifestToProject(
  projectRoot: string,
  manifest: AppCliManifest,
): Promise<void> {
  const manifestPath = resolveProjectManifestPath(projectRoot);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function getStateDirectory(manifest: AppCliManifest): string {
  return path.join(os.homedir(), manifest.app.homeDir);
}

export function getStateFilePath(manifest: AppCliManifest): string {
  return path.join(getStateDirectory(manifest), manifest.auth.stateFile);
}

export async function deleteStateFile(manifest: AppCliManifest): Promise<boolean> {
  try {
    await fs.unlink(getStateFilePath(manifest));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export function assertAuthEnvironment(manifest: AppCliManifest): void {
  if (manifest.auth.strategy !== "state-file") {
    return;
  }

  const missing = manifest.auth.env
    .filter((entry) => !process.env[entry.name])
    .map((entry) => entry.name);

  assert(
    missing.length === 0,
    `Missing required auth environment variables: ${missing.join(", ")}`,
  );
}

async function loadStorageState(manifest: AppCliManifest): Promise<StorageState | null> {
  try {
    const raw = await fs.readFile(getStateFilePath(manifest), "utf8");
    return JSON.parse(raw) as StorageState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function saveStorageState(
  manifest: AppCliManifest,
  storageState: StorageState,
): Promise<void> {
  const stateFilePath = getStateFilePath(manifest);
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
  await fs.writeFile(stateFilePath, JSON.stringify(storageState, null, 2), "utf8");
}

function flattenStorageState(storageState: StorageState | null): {
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
} {
  const cookies = Object.fromEntries(
    (storageState?.cookies ?? []).map((entry) => [entry.name, entry.value]),
  );

  const localStorageEntries: Array<[string, string]> = [];
  for (const origin of storageState?.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      localStorageEntries.push([entry.name, entry.value]);
    }
  }

  return {
    cookies,
    localStorage: Object.fromEntries(localStorageEntries),
  };
}

function matchesCookie(cookie: StorageStateCookie, requestUrl: URL): boolean {
  const requestHost = requestUrl.hostname;
  const cookieDomain = cookie.domain.replace(/^\./, "");
  const domainMatches =
    requestHost === cookieDomain || requestHost.endsWith(`.${cookieDomain}`);
  const pathMatches = requestUrl.pathname.startsWith(cookie.path || "/");
  const secureMatches = !cookie.secure || requestUrl.protocol === "https:";
  const notExpired =
    cookie.expires === undefined ||
    cookie.expires === -1 ||
    cookie.expires > Math.floor(Date.now() / 1000);

  return domainMatches && pathMatches && secureMatches && notExpired;
}

function buildCookieHeader(
  storageState: StorageState | null,
  requestUrl: URL,
): string | null {
  const matches = (storageState?.cookies ?? [])
    .filter((entry) => matchesCookie(entry, requestUrl))
    .map((entry) => `${entry.name}=${entry.value}`);

  return matches.length > 0 ? matches.join("; ") : null;
}

function resolveUrl(manifest: AppCliManifest, value: unknown): string {
  const url = typeof value === "string" ? value : "";
  assert(url, "A URL value is required.");

  if (/^https?:\/\//.test(url)) {
    return url;
  }

  assert(manifest.app.baseUrl, "Relative URLs require app.baseUrl in the manifest.");
  return new URL(url, manifest.app.baseUrl).toString();
}

function buildTemplateContext(
  manifest: AppCliManifest,
  args: CommandArgs,
  captures: Record<string, unknown>,
  storageState: StorageState | null,
): TemplateContext {
  return {
    app: manifest.app,
    auth: manifest.auth,
    args,
    captures,
    env: process.env,
    state: flattenStorageState(storageState),
  };
}

async function runFlowStep(
  manifest: AppCliManifest,
  flow: ManifestFlow,
  step: Record<string, unknown>,
  globals: GlobalOptions,
  args: CommandArgs,
  captures: Record<string, unknown>,
  storageState: StorageState | null,
): Promise<{ output?: unknown; storageState: StorageState | null }> {
  const context = buildTemplateContext(manifest, args, captures, storageState);
  const renderedStep = renderValue(step, context) as Record<string, unknown>;
  const action = typeof renderedStep.action === "string" ? renderedStep.action : "";
  const stateFilePath = getStateFilePath(manifest);

  switch (action) {
    case "loadState": {
      try {
        await fs.access(stateFilePath);
      } catch {
        if (renderedStep.optional) {
          return { storageState };
        }
        throw new Error(
          `No saved auth state found at ${stateFilePath}. Run "${manifest.app.bin} auth login" first.`,
        );
      }

      await runAgentBrowser(manifest, globals, ["state", "load", stateFilePath]);
      return { storageState: await loadStorageState(manifest) };
    }

    case "saveState": {
      await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
      await runAgentBrowser(manifest, globals, ["state", "save", stateFilePath]);
      return { storageState: await loadStorageState(manifest) };
    }

    case "open": {
      const url = resolveUrl(manifest, renderedStep.url);
      const openArgs = ["open", url, "--waitUntil", "domcontentloaded"];
      if (globals.headed) {
        openArgs.push("--headed");
      }

      const output = await runAgentBrowser(manifest, globals, openArgs);
      return { output, storageState };
    }

    case "connect": {
      const port =
        typeof renderedStep.port === "number"
          ? renderedStep.port
          : Number(renderedStep.port ?? manifest.app.electron?.cdpPort ?? 9222);
      const output = await runAgentBrowser(manifest, globals, [
        "connect",
        String(port),
      ]);
      return { output, storageState };
    }

    case "waitForLoad": {
      const loadState =
        typeof renderedStep.state === "string" ? renderedStep.state : "networkidle";
      const output = await runAgentBrowser(manifest, globals, [
        "wait",
        "--load",
        loadState,
      ]);
      return { output, storageState };
    }

    case "wait": {
      if (typeof renderedStep.ms === "number") {
        const output = await runAgentBrowser(manifest, globals, [
          "wait",
          String(renderedStep.ms),
        ]);
        return { output, storageState };
      }

      const target =
        typeof renderedStep.target === "string"
          ? renderedStep.target
          : typeof renderedStep.selector === "string"
            ? renderedStep.selector
            : "";

      if (target) {
        const output = await runAgentBrowser(manifest, globals, ["wait", target]);
        return { output, storageState };
      }

      if (typeof renderedStep.text === "string") {
        const output = await runAgentBrowser(manifest, globals, [
          "wait",
          "--text",
          renderedStep.text,
        ]);
        return { output, storageState };
      }

      if (typeof renderedStep.url === "string") {
        const output = await runAgentBrowser(manifest, globals, [
          "wait",
          "--url",
          renderedStep.url,
        ]);
        return { output, storageState };
      }

      if (typeof renderedStep.fn === "string") {
        const output = await runAgentBrowser(manifest, globals, [
          "wait",
          "--fn",
          renderedStep.fn,
        ]);
        return { output, storageState };
      }

      throw new Error(`Flow "${flow.id}" has a wait step without a supported condition.`);
    }

    case "snapshot": {
      const snapshotArgs = ["snapshot"];
      if (renderedStep.interactive) {
        snapshotArgs.push("-i");
      }
      if (renderedStep.json) {
        snapshotArgs.push("--json");
      }
      const output = await runAgentBrowser(manifest, globals, snapshotArgs);
      return {
        output:
          renderedStep.json && output
            ? JSON.parse(output)
            : output,
        storageState,
      };
    }

    case "click": {
      const target =
        typeof renderedStep.target === "string"
          ? renderedStep.target
          : typeof renderedStep.selector === "string"
            ? renderedStep.selector
            : "";
      assert(target, `Flow "${flow.id}" click step requires target.`);
      const output = await runAgentBrowser(manifest, globals, ["click", target]);
      return { output, storageState };
    }

    case "fill":
    case "type":
    case "select": {
      const target =
        typeof renderedStep.target === "string"
          ? renderedStep.target
          : typeof renderedStep.selector === "string"
            ? renderedStep.selector
            : "";
      assert(target, `Flow "${flow.id}" ${action} step requires target.`);
      const value = String(renderedStep.value ?? "");
      const output = await runAgentBrowser(manifest, globals, [action, target, value]);
      return { output, storageState };
    }

    case "press": {
      const key = String(renderedStep.key ?? "");
      assert(key, `Flow "${flow.id}" press step requires key.`);
      const output = await runAgentBrowser(manifest, globals, ["press", key]);
      return { output, storageState };
    }

    case "getText": {
      const target =
        typeof renderedStep.target === "string"
          ? renderedStep.target
          : typeof renderedStep.selector === "string"
            ? renderedStep.selector
            : "";
      assert(target, `Flow "${flow.id}" getText step requires target.`);
      const output = await runAgentBrowser(manifest, globals, ["get", "text", target]);
      return { output, storageState };
    }

    case "getUrl": {
      const output = await runAgentBrowser(manifest, globals, ["get", "url"]);
      return { output, storageState };
    }

    case "getTitle": {
      const output = await runAgentBrowser(manifest, globals, ["get", "title"]);
      return { output, storageState };
    }

    case "eval": {
      const script = String(renderedStep.script ?? "");
      assert(script, `Flow "${flow.id}" eval step requires script.`);
      const output = await runAgentBrowser(
        manifest,
        globals,
        ["eval", "--stdin"],
        { stdin: script },
      );
      return { output, storageState };
    }

    case "screenshot": {
      const screenshotArgs = ["screenshot"];
      if (renderedStep.full) {
        screenshotArgs.push("--full");
      }
      if (renderedStep.annotate) {
        screenshotArgs.push("--annotate");
      }
      if (typeof renderedStep.path === "string" && renderedStep.path) {
        screenshotArgs.push(renderedStep.path);
      }
      const output = await runAgentBrowser(manifest, globals, screenshotArgs);
      return { output, storageState };
    }

    case "close": {
      const output = await runAgentBrowser(manifest, globals, ["close"]);
      return { output, storageState };
    }

    default:
      throw new Error(`Flow "${flow.id}" uses unsupported action "${action}".`);
  }
}

function resolveFlowResult(
  flow: ManifestFlow,
  manifest: AppCliManifest,
  args: CommandArgs,
  captures: Record<string, unknown>,
  lastOutput: unknown,
  storageState: StorageState | null,
): unknown {
  const context = buildTemplateContext(manifest, args, captures, storageState);
  const result = flow.result;

  if (result) {
    if (typeof result.capture === "string") {
      return captures[result.capture];
    }

    if (result.template !== undefined) {
      return renderValue(result.template, context);
    }

    return renderValue(result, context);
  }

  if (lastOutput !== undefined) {
    return lastOutput;
  }

  return captures;
}

async function executeFlow(
  manifest: AppCliManifest,
  flow: ManifestFlow,
  globals: GlobalOptions,
  args: CommandArgs,
): Promise<unknown> {
  const captures: Record<string, unknown> = {};
  let storageState = await loadStorageState(manifest);
  let lastOutput: unknown;

  for (const step of flow.steps) {
    const result = await runFlowStep(
      manifest,
      flow,
      step,
      globals,
      args,
      captures,
      storageState,
    );

    storageState = result.storageState;
    lastOutput = result.output;

    const saveAs = typeof step.saveAs === "string" ? step.saveAs : undefined;
    if (saveAs) {
      captures[saveAs] = result.output;
    }
  }

  return resolveFlowResult(flow, manifest, args, captures, lastOutput, storageState);
}

async function executeRequestRecipe(
  manifest: AppCliManifest,
  recipe: ManifestRequestRecipe,
  args: CommandArgs,
): Promise<unknown> {
  const storageState = await loadStorageState(manifest);
  const context = buildTemplateContext(manifest, args, {}, storageState);
  const renderedRecipe = renderValue(recipe, context);
  const requestUrl = new URL(resolveUrl(manifest, renderedRecipe.url));
  const headers = new Headers();

  if (isRecord(renderedRecipe.query)) {
    for (const [key, value] of Object.entries(renderedRecipe.query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      requestUrl.searchParams.set(key, String(value));
    }
  }

  if (isRecord(renderedRecipe.headers)) {
    for (const [key, value] of Object.entries(renderedRecipe.headers)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      headers.set(key, String(value));
    }
  }

  if (renderedRecipe.useCookies) {
    const cookieHeader = buildCookieHeader(storageState, requestUrl);
    if (cookieHeader && !headers.has("cookie")) {
      headers.set("cookie", cookieHeader);
    }
  }

  let body: BodyInit | undefined;
  if (renderedRecipe.body !== undefined) {
    if (typeof renderedRecipe.body === "string") {
      body = renderedRecipe.body;
    } else {
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      body = JSON.stringify(renderedRecipe.body);
    }
  }

  const response = await fetch(requestUrl, {
    method: renderedRecipe.method,
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(
      `${renderedRecipe.method} ${requestUrl.toString()} failed with ${response.status} ${response.statusText}.`,
    );
  }

  if (renderedRecipe.useCookies) {
    const setCookies = (response.headers as any).getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      const storageState = (await loadStorageState(manifest)) || { cookies: [] };
      for (const cookieStr of setCookies) {
        const [nameValue, ...attrs] = cookieStr.split(";").map((s: string) => s.trim());
        const splitIdx = nameValue.indexOf("=");
        if (splitIdx === -1) continue;
        const name = nameValue.slice(0, splitIdx);
        const value = nameValue.slice(splitIdx + 1);

        if (name && value !== undefined) {
          const cookie: StorageStateCookie = {
            name,
            value,
            domain: requestUrl.hostname.replace(/^www\./, ""),
            path: "/",
          };

          for (const attr of attrs) {
            const [attrName, attrValue] = attr.split("=").map((s: string) => s.trim());
            const lowerAttrName = attrName.toLowerCase();
            if (lowerAttrName === "domain" && attrValue) {
              cookie.domain = attrValue.replace(/^\./, "");
            } else if (lowerAttrName === "path" && attrValue) {
              cookie.path = attrValue;
            } else if (lowerAttrName === "expires" && attrValue) {
              cookie.expires = Math.floor(new Date(attrValue).getTime() / 1000);
            } else if (lowerAttrName === "secure") {
              cookie.secure = true;
            } else if (lowerAttrName === "httponly") {
              cookie.httpOnly = true;
            }
          }

          storageState.cookies = storageState.cookies || [];
          const existingIdx = storageState.cookies.findIndex(
            (c) => c.name === name && c.domain === cookie.domain && c.path === cookie.path,
          );
          if (existingIdx !== -1) {
            storageState.cookies[existingIdx] = cookie;
          } else {
            storageState.cookies.push(cookie);
          }
        }
      }
      await saveStorageState(manifest, storageState);
    }
  }

  switch (renderedRecipe.responseType as ResponseType) {
    case "bytes":
      return new Uint8Array(await response.arrayBuffer());
    case "text":
      return await response.text();
    case "json":
    default:
      return await response.json();
  }
}

function resolveFlow(manifest: AppCliManifest, command: ManifestCommand): ManifestFlow | undefined {
  return manifest.flows.find((entry) => entry.id === command.flowId);
}

function resolveRecipe(
  manifest: AppCliManifest,
  command: ManifestCommand,
): ManifestRequestRecipe | undefined {
  return manifest.requestRecipes.find(
    (entry) => entry.id === command.requestRecipeId,
  );
}

function resolveExecutionMode(
  manifest: AppCliManifest,
  command: ManifestCommand,
  globals: GlobalOptions,
): CliMode {
  const requestedMode = globals.mode ?? command.mode ?? manifest.app.defaultMode;
  const hasRecipe = Boolean(command.requestRecipeId);
  const hasFlow = Boolean(command.flowId);

  if (requestedMode === "api") {
    assert(hasRecipe, `Command "${command.id}" does not support api mode.`);
    return "api";
  }

  if (requestedMode === "ui") {
    assert(hasFlow, `Command "${command.id}" does not support ui mode.`);
    return "ui";
  }

  if (hasRecipe) {
    return "api";
  }

  assert(hasFlow, `Command "${command.id}" does not define an executable path.`);
  return "ui";
}

export async function runManifestCommand(
  manifest: AppCliManifest,
  command: ManifestCommand,
  globals: GlobalOptions,
  args: CommandArgs,
): Promise<{ modeUsed: "api" | "ui"; result: unknown }> {
  const recipe = resolveRecipe(manifest, command);
  const flow = resolveFlow(manifest, command);
  const preferredMode = resolveExecutionMode(manifest, command, globals);

  if (preferredMode === "api") {
    try {
      assert(recipe, `Command "${command.id}" does not have a request recipe.`);
      const result = await executeRequestRecipe(manifest, recipe, args);
      return { modeUsed: "api", result };
    } catch (error) {
      if (globals.mode === "auto" || globals.mode === undefined) {
        if (flow && command.mode === "auto") {
          const result = await executeFlow(manifest, flow, globals, args);
          return { modeUsed: "ui", result };
        }
      }
      throw error;
    }
  }

  assert(flow, `Command "${command.id}" does not have a UI flow.`);
  const result = await executeFlow(manifest, flow, globals, args);
  return { modeUsed: "ui", result };
}

export function buildInspectReport(manifest: AppCliManifest): Record<string, unknown> {
  return {
    app: {
      name: manifest.app.name,
      slug: manifest.app.slug,
      bin: manifest.app.bin,
      platform: manifest.app.platform,
      defaultMode: manifest.app.defaultMode,
      baseUrl: manifest.app.baseUrl ?? null,
      electron: manifest.app.electron ?? null,
    },
    auth: {
      strategy: manifest.auth.strategy,
      loginUrl: manifest.auth.loginUrl ?? null,
      stateFile: getStateFilePath(manifest),
      env: manifest.auth.env.map((entry) => ({
        name: entry.name,
        description: entry.description,
        secret: entry.secret,
      })),
    },
    commands: manifest.commands.map((command) => ({
      path: command.path.join(" "),
      description: command.description,
      mode: command.mode,
      hasRequestRecipe: Boolean(command.requestRecipeId),
      hasFlow: Boolean(command.flowId),
      inputs: command.inputs,
    })),
    entities: manifest.entities,
    selectors: manifest.selectors,
    regeneration: manifest.regeneration,
  };
}
