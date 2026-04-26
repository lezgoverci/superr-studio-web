import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { writeJsonFile } from "../scripts/lib/manifest-utils.mjs";
import { synthesizeWebManifest } from "../scripts/lib/web-manifest.mjs";
import { renderCliProject } from "../scripts/render-cli.mjs";

const FIXTURE_CAPTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/public-store.capture.json"
);

async function loadCaptureSummary() {
  return JSON.parse(await fs.readFile(FIXTURE_CAPTURE_PATH, "utf8"));
}

test("renderCliProject keeps custom files across regeneration", async () => {
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "app-to-cli-render-")
  );
  try {
    const manifest = synthesizeWebManifest({
      appName: "Public Store",
      targetUrl: "https://fixture.example",
      captureSummary: await loadCaptureSummary(),
    });
    const manifestPath = path.join(tempDirectory, "app-cli.manifest.json");
    const outputDirectory = path.join(tempDirectory, "cli");

    await writeJsonFile(manifestPath, manifest);
    await renderCliProject({
      manifest,
      manifestPath,
      outputDirectory,
    });

    const customFilePath = path.join(outputDirectory, "src/custom-note.ts");
    await fs.writeFile(
      customFilePath,
      'export const customNote = "keep me";\n'
    );

    await renderCliProject({
      manifest,
      manifestPath,
      outputDirectory,
    });

    assert.equal(
      await fs.readFile(customFilePath, "utf8"),
      'export const customNote = "keep me";\n'
    );

    const metadataPath = path.join(
      outputDirectory,
      ".generated/app-to-cli-generator.json"
    );
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    assert.equal(metadata.manifestSource, manifestPath);
    assert.ok(metadata.generatedFiles.includes("manifest.json"));
    assert.ok(metadata.generatedFiles.includes("src/index.ts"));
    assert.ok(metadata.generatedFiles.includes("src/runtime.ts"));
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
