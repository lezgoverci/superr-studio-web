/**
 * Managed sandbox helpers — resolves a managed sandbox DB record
 * so the executor can reconnect to the Vercel sandbox instance.
 */
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sandboxes } from "@/lib/db/schema";

export type ManagedSandboxInfo = {
  vercelSandboxId: string;
  integrationId: string | null;
};

/**
 * Look up a managed sandbox by its DB primary key and ensure it's usable.
 */
export async function resolveManagedSandbox(
  sandboxId: string,
): Promise<ManagedSandboxInfo> {
  const record = await db.query.sandboxes.findFirst({
    where: eq(sandboxes.id, sandboxId),
    columns: {
      vercelSandboxId: true,
      integrationId: true,
      status: true,
    },
  });

  if (!record) {
    throw new Error(
      `Managed sandbox "${sandboxId}" not found. Create one from the Sandboxes dashboard.`,
    );
  }

  if (!record.vercelSandboxId) {
    throw new Error(
      `Managed sandbox "${sandboxId}" has no Vercel sandbox ID. It may not have been started yet.`,
    );
  }

  if (record.status !== "running") {
    throw new Error(
      `Managed sandbox "${sandboxId}" is not running (status: ${record.status}). Start it from the Sandboxes dashboard.`,
    );
  }

  return {
    vercelSandboxId: record.vercelSandboxId,
    integrationId: record.integrationId,
  };
}
