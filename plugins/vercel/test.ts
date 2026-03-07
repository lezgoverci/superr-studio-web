type VercelCredentials = {
  VERCEL_TOKEN?: string;
  VERCEL_TEAM_ID?: string;
  VERCEL_PROJECT_ID?: string;
};

export async function testVercelConnection(
  credentials: VercelCredentials
): Promise<{ success: boolean; error?: string }> {
  const token = credentials.VERCEL_TOKEN?.trim();
  const teamId = credentials.VERCEL_TEAM_ID?.trim();
  const projectId = credentials.VERCEL_PROJECT_ID?.trim();

  if (!(token && teamId && projectId)) {
    return {
      success: false,
      error: "Token, team ID, and project ID are required.",
    };
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}?teamId=${encodeURIComponent(teamId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    if (response.ok) {
      return { success: true };
    }

    const body = await response
      .json()
      .catch(async () => ({ error: { message: await response.text() } }));
    const message =
      body?.error?.message ||
      body?.message ||
      "The Vercel connection could not access that project.";

    return { success: false, error: message };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to reach the Vercel API.",
    };
  }
}
