import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getIntegrations } from "@/lib/db/integrations";
import { workflows } from "@/lib/db/schema";
import type { IntegrationType } from "@/lib/types/integration";
import { generateId } from "@/lib/utils/id";
import { getWhopAccessGuardResponse } from "@/lib/whop-access-guard";
import { buildExportPayload } from "@/lib/workflow-export-utils";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";
import { getIntegration } from "@/plugins";

/**
 * Set environment variables on a Vercel project via the project env API.
 * Fetches existing env vars first, then:
 *  - PATCHes env vars that already exist (by key)
 *  - POSTs env vars that are new
 * This avoids the "duplicate environment variable" error on redeployment.
 */
async function setProjectEnvVars(params: {
  projectName: string;
  envVars: Record<string, string>;
  vercelToken: string;
  teamParam: string;
}): Promise<void> {
  const { projectName, envVars, vercelToken, teamParam } = params;

  const entries = Object.entries(envVars);
  if (entries.length === 0) {
    return;
  }

  const encodedProject = encodeURIComponent(projectName);
  const authHeaders = {
    Authorization: `Bearer ${vercelToken}`,
    "Content-Type": "application/json",
  };

  // 1. Fetch existing env vars for this project
  const existingRes = await fetch(
    `https://api.vercel.com/v9/projects/${encodedProject}/env${teamParam}`,
    { headers: authHeaders }
  );

  const existingByKey = new Map<string, string>(); // key → env id
  if (existingRes.ok) {
    const existingData = await existingRes.json();
    for (const env of existingData.envs ?? []) {
      existingByKey.set(env.key, env.id);
    }
  }

  // 2. Separate into updates (PATCH) vs creates (POST)
  const toCreate: Array<{
    key: string;
    value: string;
    type: string;
    target: string[];
  }> = [];
  const toUpdate: Array<{ id: string; key: string; value: string }> = [];

  for (const [key, value] of entries) {
    const existingId = existingByKey.get(key);
    if (existingId) {
      toUpdate.push({ id: existingId, key, value });
    } else {
      toCreate.push({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"],
      });
    }
  }

  // 3. PATCH existing env vars
  await Promise.all(
    toUpdate.map(async ({ id, key, value }) => {
      const res = await fetch(
        `https://api.vercel.com/v9/projects/${encodedProject}/env/${id}${teamParam}`,
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({
            value,
            type: "encrypted",
            target: ["production", "preview", "development"],
          }),
        }
      );
      if (!res.ok) {
        const result = await res.json();
        throw new Error(
          result.error?.message ||
            `Failed to update env var "${key}" on Vercel project`
        );
      }
    })
  );

  // 4. POST new env vars (batch)
  if (toCreate.length > 0) {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${encodedProject}/env${teamParam}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(toCreate),
      }
    );
    if (!res.ok) {
      const result = await res.json();
      throw new Error(
        result.error?.message ||
          "Failed to set environment variables on Vercel project"
      );
    }
  }
}

type PublishRequestBody = {
  vercelToken?: string;
  vercelTeamId?: string;
};

function getTeamQueryParam(vercelTeamId?: string): string {
  return vercelTeamId ? `?teamId=${vercelTeamId}` : "";
}

function buildDeploymentPayload(params: {
  projectName: string;
  files: Record<string, string>;
}) {
  const { projectName, files } = params;
  return {
    name: projectName,
    files: Object.entries(files).map(([path, data]) => ({
      file: path,
      data,
    })),
    projectSettings: {
      framework: "nextjs",
      installCommand: "pnpm install --no-frozen-lockfile",
    },
  };
}

function assertVercelApiSuccess(
  ok: boolean,
  result: { error?: { message?: string } },
  fallbackMessage: string
): void {
  if (ok) {
    return;
  }

  throw new Error(result.error?.message || fallbackMessage);
}

async function createVercelDeployment(params: {
  vercelToken: string;
  teamParam: string;
  payload: ReturnType<typeof buildDeploymentPayload>;
}): Promise<{ id: string; url: string }> {
  const response = await fetch(
    `https://api.vercel.com/v13/deployments${params.teamParam}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.payload),
    }
  );

  const result = await response.json();
  assertVercelApiSuccess(response.ok, result, "Failed to deploy to Vercel");
  return result as { id: string; url: string };
}

async function triggerVercelRedeploy(params: {
  vercelToken: string;
  teamParam: string;
  projectName: string;
  deploymentId: string;
}): Promise<{ id: string; url: string } | null> {
  const response = await fetch(
    `https://api.vercel.com/v13/deployments${params.teamParam}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.projectName,
        deploymentId: params.deploymentId,
        target: "production",
      }),
    }
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as { id: string; url: string };
}

function collectWorkflowEnvVars(params: {
  usedIntegrationTypes: Set<IntegrationType>;
  userIntegrations: Awaited<ReturnType<typeof getIntegrations>>;
  workflowApiKey: string;
}): Record<string, string> {
  const envVars: Record<string, string> = {};

  for (const integrationType of params.usedIntegrationTypes) {
    const integration = params.userIntegrations.find(
      (record) => record.type === integrationType
    );
    const plugin = getIntegration(integrationType);
    if (!(integration && plugin)) {
      continue;
    }

    for (const field of plugin.formFields) {
      if (field.envVar && integration.config[field.configKey]) {
        envVars[field.envVar] = String(integration.config[field.configKey]);
      }
    }
  }

  envVars.WORKFLOW_API_KEY = params.workflowApiKey;
  return envVars;
}

async function getAuthenticatedUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  return session?.user ?? null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await context.params;
    const body = (await request.json()) as PublishRequestBody;
    const { vercelToken, vercelTeamId } = body;

    if (!vercelToken) {
      return NextResponse.json(
        { error: "Vercel Token is required" },
        { status: 400 }
      );
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const whopAccessGuard = await getWhopAccessGuardResponse(user.id);
    if (whopAccessGuard) {
      return whopAccessGuard;
    }

    // 1. Get workflow
    const workflow = await db.query.workflows.findFirst({
      where: and(eq(workflows.id, workflowId), eq(workflows.userId, user.id)),
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // 2. Build export payload
    const { files, usedIntegrationTypes } = await buildExportPayload({
      name: workflow.name,
      nodes: workflow.nodes as WorkflowNode[],
      edges: workflow.edges as WorkflowEdge[],
    });

    // 3. Gather integration credentials using plugin formFields
    //    to correctly map configKey → envVar
    const userIntegrations = await getIntegrations(user.id);

    // 4. Add Workflow API Key
    const workflowApiKey = `wfb_${generateId()}`;
    const envVars = collectWorkflowEnvVars({
      usedIntegrationTypes,
      userIntegrations,
      workflowApiKey,
    });

    // 5. Deploy to Vercel
    const projectName = `workflow-${workflowId.toLowerCase()}`;
    const teamParam = getTeamQueryParam(vercelTeamId);
    const deployment = await createVercelDeployment({
      vercelToken,
      teamParam,
      payload: buildDeploymentPayload({ projectName, files }),
    });

    // 6. Set env vars on the project (separate API call)
    //    The deployment creates/uses the project; now we configure its env vars.
    await setProjectEnvVars({
      projectName,
      envVars,
      vercelToken,
      teamParam,
    });

    // 7. Trigger a redeployment so environment variables take effect
    const redeployment = await triggerVercelRedeploy({
      vercelToken,
      teamParam,
      projectName,
      deploymentId: deployment.id,
    });
    const finalUrl = redeployment?.url ?? deployment.url;

    return NextResponse.json({
      success: true,
      url: finalUrl,
      deploymentId: redeployment?.id ?? deployment.id,
      projectName,
      workflowApiKey,
    });
  } catch (error) {
    console.error("Failed to publish workflow:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to publish workflow",
      },
      { status: 500 }
    );
  }
}
