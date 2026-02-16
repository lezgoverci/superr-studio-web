
import { findActionById } from "./plugins/registry";
import { AUTO_GENERATED_TEMPLATES } from "./lib/codegen-registry";
import { computeActionId } from "./plugins/registry";

async function debug() {
  console.log("--- Debugging Export Logic ---");

  const actionTypesToTest = ["bash/run-command", "run-command", "Run Command"];

  for (const actionType of actionTypesToTest) {
    console.log(`\nTesting actionType: "${actionType}"`);
    const action = findActionById(actionType);
    
    if (!action) {
      console.log(`❌ Action not found for "${actionType}"`);
      continue;
    }

    console.log(`✅ Action found:`);
    console.log(`   ID: ${action.id}`);
    console.log(`   Slug: ${action.slug}`);
    console.log(`   Integration: ${action.integration}`);
    console.log(`   StepImportPath: ${action.stepImportPath}`);

    const fullActionId = action.id;
    const template = AUTO_GENERATED_TEMPLATES[fullActionId];

    if (template) {
      console.log(`✅ Template found in registry for "${fullActionId}"`);
      console.log(`   Template length: ${template.length}`);
      console.log(`   Target file: lib/steps/${action.stepImportPath}-step.ts`);
    } else {
      console.log(`❌ Template NOT found in registry for "${fullActionId}"`);
      const availableKeys = Object.keys(AUTO_GENERATED_TEMPLATES).filter(k => k.includes("bash"));
      console.log(`   Available bash keys: ${availableKeys.join(", ")}`);
    }
  }
}

debug().catch(console.error);
