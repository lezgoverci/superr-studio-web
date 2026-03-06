import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { ScaffoldIcon } from "./icon";

const scaffoldPlugin: IntegrationPlugin = {
  type: "scaffold",
  label: "Scaffold",
  description: "Execute inline JavaScript code in a sandbox",
  icon: ScaffoldIcon,
  formFields: [],
  actions: [
    {
      slug: "execute",
      label: "Execute Custom Node",
      description:
        "Execute inline JavaScript code in a selected sandbox runtime",
      category: "Scaffold",
      stepFunction: "executeScaffoldNodeStep",
      stepImportPath: "execute",
      requiresConnection: false,
      outputFields: [
        { field: "output", description: "Code execution output" },
        { field: "sandboxType", description: "Sandbox used for execution" },
        { field: "stdout", description: "Standard output from execution" },
      ],
      configFields: [
        {
          key: "code",
          label: "Code",
          type: "template-textarea",
          defaultValue: `async function handler(payload) {\n  // Your code here\n  return { success: true, data: { result: "hello" } };\n}`,
          rows: 12,
          required: true,
        },
        {
          key: "payloadJson",
          label: "Payload JSON",
          type: "template-textarea",
          placeholder:
            '{"text":"hello", "source": "{{@node:PreviousStep.value}}"}',
          defaultValue: "{}",
          rows: 6,
        },
        {
          key: "sandboxType",
          label: "Sandbox",
          type: "select",
          defaultValue: "just-bash",
          options: [
            { value: "just-bash", label: "just-bash (local)" },
            { value: "vercel", label: "Vercel Sandbox (remote)" },
          ],
        },
        {
          key: "oidcToken",
          label: "OIDC Token",
          type: "text",
          placeholder:
            "OIDC token recommended. For access tokens, set VERCEL_TEAM_ID and VERCEL_PROJECT_ID in server env.",
          showWhen: { field: "sandboxType", equals: "vercel" },
        },
      ],
    },
  ],
};

registerIntegration(scaffoldPlugin);

export default scaffoldPlugin;
