import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { VercelIcon } from "./icon";

const vercelPlugin: IntegrationPlugin = {
  type: "vercel",
  label: "Vercel",
  description: "Bring your own Vercel project credentials for Sandbox runs",
  icon: VercelIcon,
  formFields: [
    {
      id: "vercelToken",
      label: "Access Token",
      type: "password",
      placeholder: "Your Vercel access token",
      configKey: "token",
      envVar: "VERCEL_TOKEN",
      helpText: "Create a personal or team-scoped Vercel token from ",
      helpLink: {
        text: "your Vercel account settings",
        url: "https://vercel.com/account/tokens",
      },
    },
    {
      id: "vercelTeamId",
      label: "Team ID",
      type: "text",
      placeholder: "team_xxxxx or your personal owner ID",
      configKey: "teamId",
      envVar: "VERCEL_TEAM_ID",
      helpText: "The Vercel team/owner ID that owns the target project.",
    },
    {
      id: "vercelProjectId",
      label: "Project ID",
      type: "text",
      placeholder: "prj_xxxxx",
      configKey: "projectId",
      envVar: "VERCEL_PROJECT_ID",
      helpText: "The Vercel project ID Sandbox runs should be billed to.",
    },
  ],
  testConfig: {
    getTestFunction: async () => {
      const { testVercelConnection } = await import("./test");
      return testVercelConnection;
    },
  },
  actions: [],
};

registerIntegration(vercelPlugin);

export default vercelPlugin;
