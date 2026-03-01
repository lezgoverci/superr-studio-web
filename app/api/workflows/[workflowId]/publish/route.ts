import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getIntegrations } from "@/lib/db/integrations";
import { workflows } from "@/lib/db/schema";
import { generateId } from "@/lib/utils/id";
import { buildExportPayload } from "@/lib/workflow-export-utils";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";
import { getIntegration } from "@/plugins";

/**
 * Set environment variables on a Vercel project via the project env API.
 * Uses POST /v10/projects/{projectId}/env to create encrypted env vars
 * for production, preview, and development targets.
 */
async function setProjectEnvVars(params: {
  projectName: string;
  envVars: Record<string, string>;
  vercelToken: string;
  teamParam: string;
}): Promise<void> {
  const { projectName, envVars, vercelToken, teamParam } = params;

  const envPayload = Object.entries(envVars).map(([key, value]) => ({
    key,
    value,
    type: "encrypted",
    target: ["production", "preview", "development"],
  }));

  if (envPayload.length === 0) {
    return;
  }

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/env${teamParam}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envPayload),
    }
  );

  if (!response.ok) {
    const result = await response.json();
    throw new Error(
      result.error?.message || "Failed to set environment variables on Vercel project"
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await context.params;
    const body = await request.json();
    const { vercelToken, vercelTeamId } = body;

    if (!vercelToken) {
      return NextResponse.json(
        { error: "Vercel Token is required" },
        { status: 400 }
      );
    }

    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Get workflow
    const workflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.id, workflowId),
        eq(workflows.userId, session.user.id)
      ),
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
    const userIntegrations = await getIntegrations(session.user.id);
    const envVars: Record<string, string> = {};

    for (const integrationType of usedIntegrationTypes) {
      const integration = userIntegrations.find(
        (i) => i.type === integrationType
      );
      const plugin = getIntegration(integrationType);

      if (integration && plugin) {
        for (const field of plugin.formFields) {
          if (field.envVar && integration.config[field.configKey]) {
            envVars[field.envVar] = String(
              integration.config[field.configKey]
            );
          }
        }
      }
    }

    // 4. Add Workflow API Key
    const workflowApiKey = `wfb_${generateId()}`;
    envVars["WORKFLOW_API_KEY"] = workflowApiKey;

    // 5. Deploy to Vercel
    const vercelFiles = Object.entries(files).map(([path, data]) => ({
      file: path,
      data: data,
    }));

    const projectName = `workflow-${workflowId.toLowerCase()}`;
    const teamParam = vercelTeamId ? `?teamId=${vercelTeamId}` : "";

    const deploymentPayload = {
      name: projectName,
      files: vercelFiles,
      projectSettings: {
        framework: "nextjs",
        installCommand: "pnpm install --no-frozen-lockfile",
      },
    };

    const response = await fetch(
      `https://api.vercel.com/v13/deployments${teamParam}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deploymentPayload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message || "Failed to deploy to Vercel"
      );
    }

    // 6. Set env vars on the project (separate API call)
    //    The deployment creates/uses the project; now we configure its env vars.
    await setProjectEnvVars({
      projectName,
      envVars,
      vercelToken,
      teamParam,
    });

    // 7. Trigger a redeployment so environment variables take effect
    const redeployResponse = await fetch(
      `https://api.vercel.com/v13/deployments${teamParam}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          deploymentId: result.id,
          target: "production",
        }),
      }
    );

    const redeployResult = await redeployResponse.json();
    const finalUrl = redeployResponse.ok ? redeployResult.url : result.url;

    return NextResponse.json({
      success: true,
      url: finalUrl,
      deploymentId: redeployResponse.ok ? redeployResult.id : result.id,
      projectName,
      workflowApiKey,
    });
  } catch (error) {
    console.error("Failed to publish workflow:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to publish workflow",
      },
      { status: 500 }
    );
  }
}
