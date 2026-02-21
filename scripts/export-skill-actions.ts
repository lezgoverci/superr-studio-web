/**
 * Export Skill Actions
 *
 * Reads the plugin registry and writes a JSON resource file listing all available
 * workflow action types, their IDs, labels, descriptions, categories, and config fields.
 *
 * This resource is embedded in the AI agent skill so agents know what actions
 * they can use when generating workflow JSON.
 *
 * Usage: pnpm skill:update-actions
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import "@/plugins";
import { flattenConfigFields, getAllActions } from "@/plugins";

const OUTPUT_DIR = join(
  process.cwd(),
  ".agent",
  "skills",
  "superr-workflow-generator",
  "resources"
);
const OUTPUT_FILE = join(OUTPUT_DIR, "actions.json");

async function main() {
  const actions = getAllActions();

  const exported = actions.map((action) => ({
    id: action.id,
    label: action.label,
    description: action.description,
    category: action.category,
    integration: action.integration,
    configFields: flattenConfigFields(action.configFields).map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required ?? false,
      placeholder: field.placeholder,
      defaultValue: field.defaultValue,
      example: field.example,
      options: "options" in field ? field.options : undefined,
    })),
    outputFields: action.outputFields ?? [],
  }));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(exported, null, 2), "utf-8");

  console.log(`Exported ${exported.length} actions to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("Failed to export skill actions:", error);
  process.exit(1);
});
