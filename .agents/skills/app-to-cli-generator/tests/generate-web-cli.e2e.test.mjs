import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startFixtureServer } from "./fixture-server.mjs";
import { writeAgentBrowserStub } from "./helpers/agent-browser-stub.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(TEST_DIRECTORY, "..");
const GENERATOR_SCRIPT = path.join(SKILL_ROOT, "scripts/generate-web-cli.mjs");
const NODE_PATH = process.execPath;

const REGEX_MODE_UI = /mode: ui/;
const REGEX_MODE_API = /mode: api/;
const REGEX_PUBLIC_STORE = /Public Store/;
const REGEX_WIDGET_ONE = /Widget One/;

function runCommand(command, args, options = {}) {
  const { cwd = process.cwd(), env = process.env } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.on("error", reject);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

test("generate-web-cli creates a working CLI from the local fixture", async () => {
  const server = await startFixtureServer();

  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "app-to-cli-e2e-")
  );
  try {
    const binDirectory = path.join(tempDirectory, "bin");
    await fs.mkdir(binDirectory, { recursive: true });
    const stubPath = await writeAgentBrowserStub({
      directory: binDirectory,
      baseUrl: server.baseUrl,
    });

    const outputDirectory = path.join(tempDirectory, "generated-cli");
    const env = {
      ...process.env,
      APP_TO_CLI_GENERATOR_AGENT_BROWSER_BIN: stubPath,
      PATH: [
        path.dirname(process.execPath),
        binDirectory,
        process.env.PATH || "",
      ]
        .filter(Boolean)
        .join(path.delimiter),
    };

    const generationResult = await runCommand(
      NODE_PATH,
      [
        GENERATOR_SCRIPT,
        "--name",
        "Public Store",
        "--target",
        server.baseUrl,
        "--output",
        outputDirectory,
      ],
      { env }
    );

    assert.equal(
      generationResult.exitCode,
      0,
      generationResult.stderr || generationResult.stdout
    );

    const report = JSON.parse(
      await fs.readFile(path.join(outputDirectory, "report.json"), "utf8")
    );
    assert.deepEqual(
      report.commandTree.map((command) => command.path),
      ["home title", "collections list", "products get"]
    );
    assert.equal(
      report.validation.install.success,
      true,
      report.validation.install.output
    );
    assert.equal(
      report.validation.typeCheck.success,
      true,
      report.validation.typeCheck.output
    );
    assert.equal(
      report.validation.build.success,
      true,
      report.validation.build.output
    );
    assert.equal(
      report.validation.inspect.success,
      true,
      report.validation.inspect.output
    );

    const cliDirectory = path.join(outputDirectory, "cli");
    const manifest = JSON.parse(
      await fs.readFile(path.join(cliDirectory, "manifest.json"), "utf8")
    );
    assert.deepEqual(
      manifest.commands.map((command) => command.path.join(" ")),
      ["home title", "collections list", "products get"]
    );

    const distIndexPath = path.join(cliDirectory, "dist/index.js");
    const inspectResult = await runCommand(
      NODE_PATH,
      [distIndexPath, "inspect", "--json"],
      { env }
    );
    assert.equal(
      inspectResult.exitCode,
      0,
      inspectResult.stderr || inspectResult.stdout
    );
    const inspectReport = JSON.parse(inspectResult.stdout);
    assert.equal(inspectReport.app.baseUrl, server.baseUrl);

    const homeResult = await runCommand(
      NODE_PATH,
      [distIndexPath, "home", "title"],
      {
        env,
      }
    );
    assert.equal(
      homeResult.exitCode,
      0,
      homeResult.stderr || homeResult.stdout
    );
    assert.match(homeResult.stderr, REGEX_MODE_UI);
    assert.match(homeResult.stdout, REGEX_PUBLIC_STORE);

    const listResult = await runCommand(
      NODE_PATH,
      [distIndexPath, "collections", "list"],
      { env }
    );
    assert.equal(
      listResult.exitCode,
      0,
      listResult.stderr || listResult.stdout
    );
    assert.match(listResult.stderr, REGEX_MODE_UI);
    assert.match(listResult.stdout, REGEX_WIDGET_ONE);

    const apiResult = await runCommand(
      NODE_PATH,
      [distIndexPath, "products", "get", "--handle", "widget-one"],
      { env }
    );
    assert.equal(apiResult.exitCode, 0, apiResult.stderr || apiResult.stdout);
    assert.match(apiResult.stderr, REGEX_MODE_API);
    assert.equal(JSON.parse(apiResult.stdout).product.handle, "widget-one");

    const fallbackResult = await runCommand(
      NODE_PATH,
      [distIndexPath, "products", "get", "--handle", "missing-widget"],
      { env }
    );
    assert.equal(
      fallbackResult.exitCode,
      0,
      fallbackResult.stderr || fallbackResult.stdout
    );
    assert.match(fallbackResult.stderr, REGEX_MODE_UI);
    assert.deepEqual(JSON.parse(fallbackResult.stdout), {
      title: "404 | Public Store",
      url: `${server.baseUrl}/products/missing-widget`,
    });
  } finally {
    await server.close();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
