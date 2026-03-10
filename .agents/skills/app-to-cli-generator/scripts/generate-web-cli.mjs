#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSessionName } from "./lib/agent-browser-utils.mjs";
import { slugify, writeJsonFile } from "./lib/manifest-utils.mjs";
import { commandExists, runProcess } from "./lib/process-utils.mjs";
import { captureWebTarget } from "./lib/web-capture.mjs";
import { synthesizeWebManifest } from "./lib/web-manifest.mjs";
import { renderCliProject } from "./render-cli.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const NODE_BIN_DIR = path.dirname(process.execPath);

function printUsage() {
  console.error(`Usage:
  node ${path.basename(SCRIPT_PATH)} --name <app> --target <url> [options]

Options:
  --output <dir>              Output directory (default: ./<slug>-cli)
  --auth <none|state-file>    Authentication strategy (default: none)
  --login-url <url>           Login URL for authenticated targets
  --headed                    Show a visible browser window during capture
`);
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument "${token}".`);
    }

    const key = token.slice(2);
    const nextValue = argv[index + 1];

    if (nextValue === undefined || nextValue.startsWith("--")) {
      result[key] = true;
      continue;
    }

    result[key] = nextValue;
    index += 1;
  }

  return result;
}

async function validateGeneratedCli(outputDirectory) {
  const cliDirectory = path.join(outputDirectory, "cli");
  const processEnv = {
    ...process.env,
    PATH: [NODE_BIN_DIR, process.env.PATH || ""]
      .filter(Boolean)
      .join(path.delimiter),
  };
  const validation = {
    pnpmAvailable: await commandExists("pnpm"),
    install: {
      attempted: false,
      success: false,
      output: "",
    },
    typeCheck: {
      attempted: false,
      success: false,
      output: "",
    },
    build: {
      attempted: false,
      success: false,
      output: "",
    },
    inspect: {
      attempted: false,
      success: false,
      output: "",
    },
  };

  if (!validation.pnpmAvailable) {
    return validation;
  }

  await runInstallValidation(validation, cliDirectory, processEnv);
  if (!validation.install.success) {
    return validation;
  }

  await runTypeCheckValidation(validation, cliDirectory, processEnv);
  if (!validation.typeCheck.success) {
    return validation;
  }

  await runBuildValidation(validation, cliDirectory, processEnv);
  if (!validation.build.success) {
    return validation;
  }

  await runInspectValidation(validation, cliDirectory);
  return validation;
}

async function runInstallValidation(validation, cliDirectory, processEnv) {
  try {
    validation.install.attempted = true;
    const installResult = await runProcess(
      "pnpm",
      [
        "--dir",
        cliDirectory,
        "install",
        "--ignore-workspace",
        "--prefer-offline",
      ],
      {
        allowFailure: true,
        env: processEnv,
      }
    );
    validation.install.success = installResult.exitCode === 0;
    validation.install.output =
      installResult.stdout || installResult.stderr || "";
  } catch (error) {
    validation.install.output =
      error instanceof Error ? error.message : String(error);
  }
}

async function runTypeCheckValidation(validation, cliDirectory, processEnv) {
  try {
    validation.typeCheck.attempted = true;
    const typeCheckResult = await runProcess(
      "pnpm",
      ["--dir", cliDirectory, "type-check"],
      {
        allowFailure: true,
        env: processEnv,
      }
    );
    validation.typeCheck.success = typeCheckResult.exitCode === 0;
    validation.typeCheck.output =
      typeCheckResult.stdout || typeCheckResult.stderr || "";
  } catch (error) {
    validation.typeCheck.output =
      error instanceof Error ? error.message : String(error);
  }
}

async function runBuildValidation(validation, cliDirectory, processEnv) {
  try {
    validation.build.attempted = true;
    const buildResult = await runProcess(
      "pnpm",
      ["--dir", cliDirectory, "build"],
      {
        allowFailure: true,
        env: processEnv,
      }
    );
    validation.build.success = buildResult.exitCode === 0;
    validation.build.output = buildResult.stdout || buildResult.stderr || "";
  } catch (error) {
    validation.build.output =
      error instanceof Error ? error.message : String(error);
  }
}

async function runInspectValidation(validation, cliDirectory) {
  const distIndexPath = path.join(cliDirectory, "dist/index.js");
  const inspectPath = path.join(cliDirectory, "manifest.json");

  try {
    validation.inspect.attempted = true;
    const inspectResult = await runProcess(
      process.execPath,
      [distIndexPath, "inspect", "--json"],
      {
        allowFailure: true,
      }
    );
    validation.inspect.success =
      inspectResult.exitCode === 0 &&
      Boolean(await fs.stat(inspectPath).catch(() => null));
    validation.inspect.output =
      inspectResult.stdout || inspectResult.stderr || "";
  } catch (error) {
    validation.inspect.output =
      error instanceof Error ? error.message : String(error);
  }

  return validation;
}

function buildReport({
  outputDirectory,
  manifest,
  captureSummary,
  validation,
}) {
  return {
    generatedAt: new Date().toISOString(),
    capturesPath: path.join(outputDirectory, "captures"),
    manifestPath: path.join(outputDirectory, "manifest/app-cli.manifest.json"),
    cliPath: path.join(outputDirectory, "cli"),
    commandTree: manifest.commands.map((command) => ({
      id: command.id,
      path: command.path.join(" "),
      mode: command.mode,
      hasFlow: Boolean(command.flowId),
      hasRequestRecipe: Boolean(command.requestRecipeId),
    })),
    captureSummary: {
      totalPages: captureSummary.pages.length,
      listPages: captureSummary.stats.listPages,
      detailPages: captureSummary.stats.detailPages,
      shopifyDetected: captureSummary.stats.shopifyDetected,
      capturedUrls: captureSummary.pages.map((page) => page.url),
    },
    validation,
  };
}

function createCaptureSessionName(slug) {
  return makeSessionName(`${slug.slice(0, 16)}-${Date.now().toString(36)}`);
}

function formatValidationStatus(validation) {
  if (!validation.attempted) {
    return "skipped";
  }
  return validation.success ? "passed" : "failed";
}

async function writeMarkdownReport(report, outputDirectory) {
  const lines = [
    `# ${report.commandTree.length > 0 ? "Generated" : "Empty"} CLI Report`,
    "",
    `- Manifest: ${report.manifestPath}`,
    `- CLI: ${report.cliPath}`,
    `- Captures: ${report.capturesPath}`,
    `- Pages captured: ${report.captureSummary.totalPages}`,
    `- Shopify detected: ${report.captureSummary.shopifyDetected ? "yes" : "no"}`,
    "",
    "## Commands",
    "",
    ...(report.commandTree.length === 0
      ? ["- No commands were inferred."]
      : report.commandTree.map(
          (command) =>
            `- \`${command.path}\` (${command.mode})${command.hasRequestRecipe ? " api" : ""}${command.hasFlow ? " ui" : ""}`
        )),
    "",
    "## Validation",
    "",
    `- pnpm available: ${report.validation.pnpmAvailable ? "yes" : "no"}`,
    `- install: ${formatValidationStatus(report.validation.install)}`,
    `- type-check: ${formatValidationStatus(report.validation.typeCheck)}`,
    `- build: ${formatValidationStatus(report.validation.build)}`,
    `- inspect: ${formatValidationStatus(report.validation.inspect)}`,
    "",
  ];

  await fs.writeFile(
    path.join(outputDirectory, "report.md"),
    `${lines.join("\n")}\n`
  );
}

async function main() {
  try {
    const flags = parseArgs(process.argv.slice(2));
    if (!(flags.name && flags.target)) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const slug = slugify(flags.name);
    const outputDirectory = path.resolve(
      process.cwd(),
      flags.output || `./${slug}-cli`
    );
    const manifestDirectory = path.join(outputDirectory, "manifest");
    const manifestPath = path.join(manifestDirectory, "app-cli.manifest.json");
    const cliDirectory = path.join(outputDirectory, "cli");
    const sessionName = createCaptureSessionName(slug);

    await fs.mkdir(manifestDirectory, { recursive: true });
    await fs.mkdir(cliDirectory, { recursive: true });

    const captureSummary = await captureWebTarget({
      appName: flags.name,
      targetUrl: flags.target,
      outputRoot: outputDirectory,
      sessionName,
      headed: Boolean(flags.headed),
    });

    const manifest = synthesizeWebManifest({
      appName: flags.name,
      targetUrl: flags.target,
      captureSummary,
      authStrategy: flags.auth === "state-file" ? "state-file" : "none",
      loginUrl:
        typeof flags["login-url"] === "string" ? flags["login-url"] : undefined,
    });

    await writeJsonFile(manifestPath, manifest);
    await renderCliProject({
      manifest,
      manifestPath,
      outputDirectory: cliDirectory,
    });

    const validation = await validateGeneratedCli(outputDirectory);
    const report = buildReport({
      outputDirectory,
      manifest,
      captureSummary,
      validation,
    });

    await writeJsonFile(path.join(outputDirectory, "report.json"), report);
    await writeMarkdownReport(report, outputDirectory);

    console.log(`Generated manifest: ${manifestPath}`);
    console.log(`Generated CLI: ${cliDirectory}`);
    console.log("Commands:");
    for (const command of report.commandTree) {
      console.log(`- ${command.path} (${command.mode})`);
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Failed to generate the CLI."
    );
    printUsage();
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  await main();
}
