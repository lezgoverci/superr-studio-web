import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { CodeIcon } from "./icon";

const codePlugin: IntegrationPlugin = {
  type: "code",
  label: "Code",
  description: "Run inline JavaScript code in a sandbox",
  icon: CodeIcon,
  formFields: [],
  actions: [
    {
      slug: "execute",
      label: "Run Custom Code",
      description: "Run inline JavaScript code in a selected sandbox runtime",
      category: "Code",
      stepFunction: "executeCodeNodeStep",
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
            { value: "opencode", label: "OpenCode (remote/local agent)" },
          ],
        },
        {
          key: "sandboxId",
          label: "Managed Sandbox",
          type: "sandbox-picker",
          showWhen: { field: "sandboxType", equals: "vercel" },
        },
      ],
    },
  ],
};

registerIntegration(codePlugin);

export default codePlugin;
