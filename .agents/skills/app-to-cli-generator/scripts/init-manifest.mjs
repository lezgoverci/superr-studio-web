#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifestSkeleton, writeJsonFile } from "./lib/manifest-utils.mjs";

function printUsage() {
  console.error(`Usage:
  node ${path.basename(fileURLToPath(import.meta.url))} --name <app> --platform <web|electron> --target <url-or-app> --output <path> [options]

Options:
  --bin <name>              Override the generated CLI binary name
  --auth <none|state-file>  Authentication strategy (default: none)
  --login-url <url>         Login URL for web targets
  --cdp-port <port>         Electron CDP port (default: 9222)
  --launch-command <cmd>    Optional Electron launch command hint
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

async function main() {
  try {
    const flags = parseArgs(process.argv.slice(2));
    const outputPath = flags.output
      ? path.resolve(process.cwd(), flags.output)
      : null;

    if (!(flags.name && flags.platform && flags.target && outputPath)) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const manifest = buildManifestSkeleton({
      appName: flags.name,
      platform: flags.platform,
      target: flags.target,
      authStrategy: flags.auth,
      loginUrl: flags["login-url"],
      binName: flags.bin,
      cdpPort: flags["cdp-port"],
      launchCommand: flags["launch-command"],
    });

    await writeJsonFile(outputPath, manifest);

    console.log(`Initialized manifest: ${outputPath}`);
    console.log(`App: ${manifest.app.name}`);
    console.log(`Platform: ${manifest.app.platform}`);
    console.log(`CLI bin: ${manifest.app.bin}`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Failed to initialize manifest."
    );
    printUsage();
    process.exitCode = 1;
  }
}

await main();
