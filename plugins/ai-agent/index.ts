import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { AiAgentIcon } from "./icon";

const aiAgentPlugin: IntegrationPlugin = {
  type: "ai-agent",
  label: "AI Agent",
  description:
    "AI-powered agent that can write & run code, process data, and call APIs",

  icon: AiAgentIcon,

  formFields: [
    {
      id: "aiGatewayApiKey",
      label: "API Key",
      type: "password",
      placeholder: "Your AI Gateway API key",
      configKey: "apiKey",
      envVar: "AI_GATEWAY_API_KEY",
      helpText: "Uses the same AI Gateway API key. Get yours from ",
      helpLink: {
        text: "vercel.com/ai-gateway",
        url: "https://vercel.com/docs/ai-gateway/getting-started",
      },
    },
  ],

  testConfig: {
    getTestFunction: async () => {
      // Reuse the ai-gateway test since we use the same API key
      const { testAiGateway } = await import("../ai-gateway/test");
      return testAiGateway;
    },
  },

  actions: [
    {
      slug: "run-agent",
      label: "Run Agent",
      description:
        "Execute an AI agent that can write & run code, process data using bash tools",
      category: "AI Agent",
      stepFunction: "runAgentStep",
      stepImportPath: "run-agent",
      outputFields: [
        { field: "text", description: "Agent's text response" },
        { field: "data", description: "Structured data from the agent" },
        {
          field: "stepsUsed",
          description: "Number of tool steps the agent took",
        },
        {
          field: "sandboxTypeResolved",
          description: "Sandbox runtime that executed the task",
        },
        {
          field: "skillsAvailable",
          description: "Skill names discovered for this run",
        },
        {
          field: "skillsUsed",
          description: "Skill names the agent invoked via the skill tool",
        },
      ],
      configFields: [
        {
          key: "aiModel",
          label: "Model",
          type: "select",
          defaultValue: "anthropic/claude-sonnet-4.5",
          options: [
            {
              value: "anthropic/claude-sonnet-4.5",
              label: "Claude Sonnet 4.5",
            },
            {
              value: "anthropic/claude-haiku-4.5",
              label: "Claude Haiku 4.5",
            },
            { value: "openai/gpt-5.2", label: "GPT-5.2" },
            { value: "openai/gpt-5.2-pro", label: "GPT-5.2 Pro" },
            { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
            { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
            { value: "meta/llama-4-scout", label: "Llama 4 Scout" },
            { value: "meta/llama-4-maverick", label: "Llama 4 Maverick" },
          ],
        },
        {
          key: "sandboxType",
          label: "Sandbox",
          type: "select",
          defaultValue: "vercel",
          options: [
            { value: "vercel", label: "Vercel Sandbox (full)" },
            { value: "just-bash", label: "just-bash (simulated)" },
          ],
        },
        {
          key: "vercelSandboxToken",
          label: "Vercel Sandbox Token",
          type: "text",
          placeholder:
            "OIDC token recommended. For access tokens, set VERCEL_TEAM_ID and VERCEL_PROJECT_ID in server env.",
          showWhen: { field: "sandboxType", equals: "vercel" },
        },
        {
          key: "vercelSandboxTeamId",
          label: "Vercel Sandbox Team ID",
          type: "text",
          placeholder:
            "Required for non-OIDC tokens unless VERCEL_TEAM_ID is set on server",
          showWhen: { field: "sandboxType", equals: "vercel" },
        },
        {
          key: "vercelSandboxProjectId",
          label: "Vercel Sandbox Project ID",
          type: "text",
          placeholder:
            "Required for non-OIDC tokens unless VERCEL_PROJECT_ID is set on server",
          showWhen: { field: "sandboxType", equals: "vercel" },
        },
        {
          key: "skillsEnabled",
          label: "Agent Skills",
          type: "select",
          defaultValue: "off",
          options: [
            { value: "off", label: "Off" },
            { value: "on", label: "On (experimental)" },
          ],
        },
        {
          key: "skillsSource",
          label: "Skill Source",
          type: "select",
          defaultValue: "preloaded",
          showWhen: { field: "skillsEnabled", equals: "on" },
          options: [
            { value: "preloaded", label: "Preloaded Directory" },
            { value: "git", label: "Git Repository" },
          ],
        },
        {
          key: "skillsDirectory",
          label: "Preloaded Skills Directory",
          type: "text",
          defaultValue: "skills",
          placeholder: "Example: ./skills",
          showWhen: { field: "skillsSource", equals: "preloaded" },
        },
        {
          key: "skillsRepoUrl",
          label: "Skills Repository URL",
          type: "text",
          placeholder: "https://github.com/your-org/skills-repo",
          showWhen: { field: "skillsSource", equals: "git" },
        },
        {
          key: "skillsRepoRef",
          label: "Skills Repository Ref",
          type: "text",
          defaultValue: "main",
          placeholder: "main",
          showWhen: { field: "skillsSource", equals: "git" },
        },
        {
          key: "skillsRepoSubdir",
          label: "Skills Repository Subdirectory",
          type: "text",
          defaultValue: "skills",
          placeholder: "skills",
          showWhen: { field: "skillsSource", equals: "git" },
        },
        {
          key: "skillsAllowlist",
          label: "Skills Allowlist",
          type: "template-textarea",
          placeholder:
            "Optional list of skill names (one per line or comma-separated). Empty allows all discovered skills.",
          rows: 3,
          showWhen: { field: "skillsEnabled", equals: "on" },
        },
        {
          key: "skillsDestination",
          label: "Skill Path In Sandbox",
          type: "text",
          defaultValue: "skills",
          placeholder: "skills",
          showWhen: { field: "skillsEnabled", equals: "on" },
        },
        {
          key: "agentPrompt",
          label: "Agent Prompt",
          type: "template-textarea",
          placeholder:
            "Describe what the agent should do. Use {{NodeName.field}} to reference previous outputs.",
          rows: 6,
          example:
            'Parse the data in {{Webhook.body}} and extract all email addresses. Return them as a JSON array.',
          required: true,
        },
        {
          key: "agentInstructions",
          label: "System Instructions",
          type: "template-textarea",
          placeholder:
            "Optional: Custom system instructions for how the agent should behave",
          rows: 3,
        },
        {
          key: "maxSteps",
          label: "Max Steps",
          type: "select",
          defaultValue: "10",
          options: [
            { value: "3", label: "3 (quick)" },
            { value: "5", label: "5 (fast)" },
            { value: "10", label: "10 (default)" },
            { value: "20", label: "20 (thorough)" },
          ],
        },
      ],
    },
  ],
};

// Auto-register on import
registerIntegration(aiAgentPlugin);

export default aiAgentPlugin;
