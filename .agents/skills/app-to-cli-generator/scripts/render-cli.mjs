#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readJsonFile,
  validateManifest,
  writeJsonFile,
} from "./lib/manifest-utils.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const TEMPLATE_DIR = path.resolve(SCRIPT_DIR, "../templates/generated-cli");

function printUsage() {
  console.error(`Usage:
  node ${path.basename(SCRIPT_PATH)} --manifest <manifest.json> --output <dir>
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
      throw new Error(`Missing value for flag "${token}".`);
    }

    result[key] = nextValue;
    index += 1;
  }

  return result;
}

async function listTemplateFiles(rootDirectory) {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTemplateFiles(absolutePath)));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function toOutputRelativePath(templatePath) {
  const relativePath = path.relative(TEMPLATE_DIR, templatePath);
  return relativePath.endsWith(".template")
    ? relativePath.slice(0, -".template".length)
    : relativePath;
}

function applyReplacements(content, replacements) {
  return content.replace(
    /\{\{([A-Z_]+)\}\}/g,
    (_match, key) => replacements[key] ?? ""
  );
}

async function copyTemplates(outputDirectory, replacements) {
  const templateFiles = await listTemplateFiles(TEMPLATE_DIR);
  const generatedFiles = [];

  for (const templatePath of templateFiles) {
    const outputRelativePath = toOutputRelativePath(templatePath);
    const outputPath = path.join(outputDirectory, outputRelativePath);
    const templateContent = await fs.readFile(templatePath, "utf8");
    const finalContent = applyReplacements(templateContent, replacements);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, finalContent, "utf8");
    generatedFiles.push(outputRelativePath);
  }

  return generatedFiles.sort((left, right) => left.localeCompare(right));
}

async function main() {
  try {
    const flags = parseArgs(process.argv.slice(2));
    if (!(flags.manifest && flags.output)) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const manifestPath = path.resolve(process.cwd(), flags.manifest);
    const outputDirectory = path.resolve(process.cwd(), flags.output);

    const manifest = validateManifest(await readJsonFile(manifestPath));
    const packageName = `${manifest.app.slug}-cli`;
    const generatedFiles = await copyTemplates(outputDirectory, {
      APP_NAME: manifest.app.name,
      CLI_BIN: manifest.app.bin,
      PACKAGE_NAME: packageName,
      PACKAGE_DESCRIPTION: `CLI wrapper for ${manifest.app.name}`,
    });

    await writeJsonFile(path.join(outputDirectory, "manifest.json"), manifest);
    generatedFiles.push("manifest.json");

    await writeJsonFile(
      path.join(outputDirectory, ".generated/app-to-cli-generator.json"),
      {
        generatedAt: new Date().toISOString(),
        manifestSource: manifestPath,
        packageName,
        generatedFiles: [...generatedFiles].sort((left, right) =>
          left.localeCompare(right)
        ),
      }
    );

    console.log(`Rendered CLI project: ${outputDirectory}`);
    console.log(`Package name: ${packageName}`);
    console.log(`CLI bin: ${manifest.app.bin}`);
    console.log(`Commands: ${manifest.commands.length}`);
    console.log("Generated files:");
    for (const file of [...generatedFiles].sort((left, right) =>
      left.localeCompare(right)
    )) {
      console.log(`- ${file}`);
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Failed to render CLI project."
    );
    printUsage();
    process.exitCode = 1;
  }
}

await main();
