import {
  actionRequiresIntegration,
  findActionById,
  getIntegrationLabels,
} from "@/plugins";
import type { IntegrationType } from "./types/integration";

const SYSTEM_ACTION_INTEGRATIONS: Record<string, IntegrationType> = {
  "Database Query": "database",
};

const VERCEL_SANDBOX_INTEGRATIONS = new Set<IntegrationType>([
  "ai-agent",
  "bash",
  "code",
]);

export type ConnectionFieldKey = "integrationId" | "vercelIntegrationId";

export type ConnectionRequirement = {
  fieldKey: ConnectionFieldKey;
  integrationType: IntegrationType;
  label: string;
};

export function getPrimaryIntegrationTypeForAction(
  actionType: string | undefined | null
): IntegrationType | undefined {
  if (!actionType) {
    return;
  }

  const action = findActionById(actionType);
  if (action && !actionRequiresIntegration(actionType)) {
    return;
  }

  return (
    (action?.integration as IntegrationType | undefined) ||
    SYSTEM_ACTION_INTEGRATIONS[actionType]
  );
}

export function actionUsesVercelSandbox(
  actionType: string | undefined | null,
  config: Record<string, unknown> | undefined
): boolean {
  if (!actionType || config?.sandboxType !== "vercel") {
    return false;
  }

  const action = findActionById(actionType);
  return Boolean(action && VERCEL_SANDBOX_INTEGRATIONS.has(action.integration));
}

export function getConnectionRequirements(params: {
  actionType: string | undefined | null;
  config?: Record<string, unknown>;
}): ConnectionRequirement[] {
  const { actionType, config } = params;
  const requirements: ConnectionRequirement[] = [];
  const primaryIntegrationType = getPrimaryIntegrationTypeForAction(actionType);

  if (primaryIntegrationType) {
    requirements.push({
      fieldKey: "integrationId",
      integrationType: primaryIntegrationType,
      label: "Connection",
    });
  }

  if (actionUsesVercelSandbox(actionType, config)) {
    requirements.push({
      fieldKey: "vercelIntegrationId",
      integrationType: "vercel",
      label: "Vercel Connection",
    });
  }

  return requirements;
}

export function getConnectionLabel(integrationType: IntegrationType): string {
  const labels = getIntegrationLabels();
  return labels[integrationType] || integrationType;
}

export function clearUnusedConnectionFields(
  config: Record<string, unknown>,
  requirements: ConnectionRequirement[]
): Record<string, unknown> {
  const nextConfig = { ...config };
  const requiredFields = new Set(
    requirements.map((requirement) => requirement.fieldKey)
  );

  for (const fieldKey of ["integrationId", "vercelIntegrationId"] as const) {
    if (!requiredFields.has(fieldKey)) {
      delete nextConfig[fieldKey];
    }
  }

  return nextConfig;
}
