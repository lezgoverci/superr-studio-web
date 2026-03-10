import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { synthesizeWebManifest } from "../scripts/lib/web-manifest.mjs";

const FIXTURE_CAPTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/public-store.capture.json"
);

async function loadCaptureSummary() {
  return JSON.parse(await fs.readFile(FIXTURE_CAPTURE_PATH, "utf8"));
}

test("synthesizeWebManifest infers home, list, and Shopify detail commands", async () => {
  const captureSummary = await loadCaptureSummary();
  const manifest = synthesizeWebManifest({
    appName: "Public Store",
    targetUrl: "https://fixture.example",
    captureSummary,
  });

  assert.deepEqual(
    manifest.commands.map((command) => command.path.join(" ")),
    ["home title", "collections list", "products get"]
  );

  const homeCommand = manifest.commands.find(
    (command) => command.id === "home-title"
  );
  assert.equal(homeCommand?.mode, "ui");
  assert.equal(homeCommand?.flowId, "home-title-ui");

  const listCommand = manifest.commands.find(
    (command) => command.id === "collections-list"
  );
  assert.equal(listCommand?.mode, "ui");
  assert.equal(listCommand?.flowId, "collections-list-ui");

  const detailCommand = manifest.commands.find(
    (command) => command.id === "products-get"
  );
  assert.equal(detailCommand?.mode, "auto");
  assert.equal(detailCommand?.requestRecipeId, "products-get-api");
  assert.equal(detailCommand?.flowId, "products-get-ui");
  assert.deepEqual(detailCommand?.inputs, [
    {
      name: "handle",
      flag: "--handle",
      type: "string",
      description: "product handle",
      required: true,
    },
  ]);

  assert.deepEqual(manifest.requestRecipes, [
    {
      id: "products-get-api",
      method: "GET",
      url: "/products/{{args.handle}}.js",
      headers: {
        accept: "application/json",
      },
      query: {},
      responseType: "json",
      useCookies: false,
    },
  ]);
});
