import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { ScaffoldIcon } from "./icon";

const scaffoldPlugin: IntegrationPlugin = {
  type: "scaffold",
  label: "Scaffold",
  description: "Run reusable custom nodes at runtime",
  icon: ScaffoldIcon,
  formFields: [],
  actions: [
    {
      slug: "execute",
      label: "Execute Custom Node",
      description: "Execute user-authored custom node code at runtime",
      category: "Scaffold",
      stepFunction: "executeScaffoldNodeStep",
      stepImportPath: "execute",
      requiresConnection: false,
      outputFields: [
        { field: "customNodeId", description: "Executed custom node ID" },
        { field: "version", description: "Executed custom node version" },
        { field: "output", description: "Custom node execution output" },
        { field: "sandboxType", description: "Sandbox used for execution" },
      ],
      configFields: [
        {
          key: "customNodeId",
          label: "Custom Node ID",
          type: "template-input",
          placeholder: "cn_xxxxxxxx",
          example: "cn_abcd1234",
          required: true,
        },
        {
          key: "customNodeVersion",
          label: "Version",
          type: "text",
          placeholder: "Leave blank for latest",
          example: "1",
        },
        {
          key: "payloadJson",
          label: "Payload JSON",
          type: "template-textarea",
          placeholder: '{"text":"hello", "source": "{{@node:Step.value}}"}',
          defaultValue: "{}",
          rows: 8,
        },
        {
          key: "sandboxType",
          label: "Sandbox",
          type: "select",
          defaultValue: "just-bash",
          options: [
            { value: "just-bash", label: "Just Bash (Default)" },
            { value: "vercel", label: "Vercel Sandbox" },
          ],
        },
        {
          key: "oidcToken",
          label: "OIDC Token",
          type: "template-input",
          placeholder: "eyJ...",
          showWhen: { field: "sandboxType", equals: "vercel" },
        },
      ],
    },
  ],
};

registerIntegration(scaffoldPlugin);

export default scaffoldPlugin;
