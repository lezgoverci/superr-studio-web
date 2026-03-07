import "server-only";

import { fetchCredentials } from "./credential-fetcher";

export type VercelSandboxCredentials = {
  token: string;
  teamId: string;
  projectId: string;
};

export async function resolveVercelSandboxCredentials(
  vercelIntegrationId: string | undefined
): Promise<VercelSandboxCredentials> {
  const integrationId = vercelIntegrationId?.trim();
  if (!integrationId) {
    throw new Error(
      "A Vercel connection is required when Sandbox is set to Vercel Sandbox."
    );
  }

  const credentials = await fetchCredentials(integrationId);
  const token = credentials.VERCEL_TOKEN?.trim();
  const teamId = credentials.VERCEL_TEAM_ID?.trim();
  const projectId = credentials.VERCEL_PROJECT_ID?.trim();

  if (!(token && teamId && projectId)) {
    throw new Error(
      "The selected Vercel connection is incomplete. Add token, team ID, and project ID."
    );
  }

  return { token, teamId, projectId };
}
