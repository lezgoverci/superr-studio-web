import { fetchCredentials } from "./credential-helper";

export type VercelSandboxCredentials = {
  token: string;
  teamId: string;
  projectId: string;
};

export async function resolveVercelSandboxCredentials(
  vercelIntegrationId?: string
): Promise<VercelSandboxCredentials> {
  const credentials = await fetchCredentials(vercelIntegrationId || "vercel");
  const token = credentials.VERCEL_TOKEN?.trim();
  const teamId = credentials.VERCEL_TEAM_ID?.trim();
  const projectId = credentials.VERCEL_PROJECT_ID?.trim();

  if (!(token && teamId && projectId)) {
    throw new Error(
      "Vercel Sandbox requires VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID."
    );
  }

  return { token, teamId, projectId };
}
