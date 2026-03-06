import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { decrypt, encrypt } from "./integrations";
import {
  customNodeDefinitions,
  customNodeSecretValues,
  customNodeVersions,
} from "./schema";

export type JsonSchemaLike = Record<string, unknown> | null;

export type CustomNodeDefinitionRecord = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  runtime: string;
  configSchema: JsonSchemaLike;
  outputSchema: JsonSchemaLike;
  secretSchema: JsonSchemaLike;
  latestVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomNodeVersionRecord = {
  id: string;
  customNodeId: string;
  version: number;
  code: string;
  changelog: string | null;
  createdAt: Date;
};

export type CustomNodeWithLatestVersion = CustomNodeDefinitionRecord & {
  latestCode: string;
  latestChangelog: string | null;
};

export async function listCustomNodesForUser(
  userId: string
): Promise<CustomNodeWithLatestVersion[]> {
  const rows = await db
    .select({
      id: customNodeDefinitions.id,
      userId: customNodeDefinitions.userId,
      name: customNodeDefinitions.name,
      description: customNodeDefinitions.description,
      runtime: customNodeDefinitions.runtime,
      configSchema: customNodeDefinitions.configSchema,
      outputSchema: customNodeDefinitions.outputSchema,
      secretSchema: customNodeDefinitions.secretSchema,
      latestVersion: customNodeDefinitions.latestVersion,
      createdAt: customNodeDefinitions.createdAt,
      updatedAt: customNodeDefinitions.updatedAt,
      latestCode: customNodeVersions.code,
      latestChangelog: customNodeVersions.changelog,
    })
    .from(customNodeDefinitions)
    .innerJoin(
      customNodeVersions,
      and(
        eq(customNodeVersions.customNodeId, customNodeDefinitions.id),
        eq(customNodeVersions.version, customNodeDefinitions.latestVersion)
      )
    )
    .where(eq(customNodeDefinitions.userId, userId))
    .orderBy(desc(customNodeDefinitions.updatedAt));

  return rows.map((row) => ({
    ...row,
    configSchema: (row.configSchema as JsonSchemaLike) ?? null,
    outputSchema: (row.outputSchema as JsonSchemaLike) ?? null,
    secretSchema: (row.secretSchema as JsonSchemaLike) ?? null,
  }));
}

export async function getCustomNodeDefinitionForUser(
  userId: string,
  customNodeId: string
): Promise<CustomNodeDefinitionRecord | null> {
  const [row] = await db
    .select()
    .from(customNodeDefinitions)
    .where(
      and(
        eq(customNodeDefinitions.id, customNodeId),
        eq(customNodeDefinitions.userId, userId)
      )
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row,
    configSchema: (row.configSchema as JsonSchemaLike) ?? null,
    outputSchema: (row.outputSchema as JsonSchemaLike) ?? null,
    secretSchema: (row.secretSchema as JsonSchemaLike) ?? null,
  };
}

export async function getCustomNodeWithVersionForUser(
  userId: string,
  customNodeId: string,
  version?: number
): Promise<{
  definition: CustomNodeDefinitionRecord;
  version: CustomNodeVersionRecord;
} | null> {
  const definition = await getCustomNodeDefinitionForUser(userId, customNodeId);
  if (!definition) {
    return null;
  }

  const targetVersion = version ?? definition.latestVersion;

  const [versionRow] = await db
    .select()
    .from(customNodeVersions)
    .where(
      and(
        eq(customNodeVersions.customNodeId, customNodeId),
        eq(customNodeVersions.version, targetVersion)
      )
    )
    .limit(1);

  if (!versionRow) {
    return null;
  }

  return {
    definition,
    version: versionRow,
  };
}

export async function listCustomNodeVersionsForUser(
  userId: string,
  customNodeId: string
): Promise<CustomNodeVersionRecord[]> {
  const definition = await getCustomNodeDefinitionForUser(userId, customNodeId);
  if (!definition) {
    return [];
  }

  return db
    .select()
    .from(customNodeVersions)
    .where(eq(customNodeVersions.customNodeId, customNodeId))
    .orderBy(desc(customNodeVersions.version));
}

export async function createCustomNodeDefinition(options: {
  userId: string;
  name: string;
  description?: string;
  runtime?: string;
  configSchema?: JsonSchemaLike;
  outputSchema?: JsonSchemaLike;
  secretSchema?: JsonSchemaLike;
  code: string;
  changelog?: string;
}): Promise<CustomNodeWithLatestVersion> {
  return await db.transaction(async (tx) => {
    const [definition] = await tx
      .insert(customNodeDefinitions)
      .values({
        userId: options.userId,
        name: options.name,
        description: options.description?.trim() || null,
        runtime: options.runtime?.trim() || "javascript",
        configSchema: options.configSchema ?? null,
        outputSchema: options.outputSchema ?? null,
        secretSchema: options.secretSchema ?? null,
        latestVersion: 1,
      })
      .returning();

    const [createdVersion] = await tx
      .insert(customNodeVersions)
      .values({
        customNodeId: definition.id,
        version: 1,
        code: options.code,
        changelog: options.changelog?.trim() || null,
      })
      .returning();

    return {
      ...definition,
      configSchema: (definition.configSchema as JsonSchemaLike) ?? null,
      outputSchema: (definition.outputSchema as JsonSchemaLike) ?? null,
      secretSchema: (definition.secretSchema as JsonSchemaLike) ?? null,
      latestCode: createdVersion.code,
      latestChangelog: createdVersion.changelog,
    };
  });
}

export async function updateCustomNodeDefinition(options: {
  userId: string;
  customNodeId: string;
  name?: string;
  description?: string;
  runtime?: string;
  configSchema?: JsonSchemaLike;
  outputSchema?: JsonSchemaLike;
  secretSchema?: JsonSchemaLike;
}): Promise<CustomNodeDefinitionRecord | null> {
  const [updated] = await db
    .update(customNodeDefinitions)
    .set({
      ...(options.name !== undefined ? { name: options.name.trim() } : {}),
      ...(options.description !== undefined
        ? { description: options.description.trim() || null }
        : {}),
      ...(options.runtime !== undefined
        ? { runtime: options.runtime.trim() || "javascript" }
        : {}),
      ...(options.configSchema !== undefined
        ? { configSchema: options.configSchema }
        : {}),
      ...(options.outputSchema !== undefined
        ? { outputSchema: options.outputSchema }
        : {}),
      ...(options.secretSchema !== undefined
        ? { secretSchema: options.secretSchema }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customNodeDefinitions.id, options.customNodeId),
        eq(customNodeDefinitions.userId, options.userId)
      )
    )
    .returning();

  if (!updated) {
    return null;
  }

  return {
    ...updated,
    configSchema: (updated.configSchema as JsonSchemaLike) ?? null,
    outputSchema: (updated.outputSchema as JsonSchemaLike) ?? null,
    secretSchema: (updated.secretSchema as JsonSchemaLike) ?? null,
  };
}

export async function createCustomNodeVersion(options: {
  userId: string;
  customNodeId: string;
  code: string;
  changelog?: string;
}): Promise<CustomNodeVersionRecord | null> {
  return await db.transaction(async (tx) => {
    const [definition] = await tx
      .select({
        id: customNodeDefinitions.id,
        latestVersion: customNodeDefinitions.latestVersion,
      })
      .from(customNodeDefinitions)
      .where(
        and(
          eq(customNodeDefinitions.id, options.customNodeId),
          eq(customNodeDefinitions.userId, options.userId)
        )
      )
      .limit(1)
      .for("update");

    if (!definition) {
      return null;
    }

    const nextVersion = definition.latestVersion + 1;

    const [newVersion] = await tx
      .insert(customNodeVersions)
      .values({
        customNodeId: options.customNodeId,
        version: nextVersion,
        code: options.code,
        changelog: options.changelog?.trim() || null,
      })
      .returning();

    await tx
      .update(customNodeDefinitions)
      .set({ latestVersion: nextVersion, updatedAt: new Date() })
      .where(eq(customNodeDefinitions.id, options.customNodeId));

    return newVersion;
  });
}

export async function setCustomNodeSecrets(options: {
  userId: string;
  customNodeId: string;
  secrets: Record<string, string>;
}): Promise<boolean> {
  const definition = await getCustomNodeDefinitionForUser(
    options.userId,
    options.customNodeId
  );

  if (!definition) {
    return false;
  }

  const entries = Object.entries(options.secrets).filter(
    ([key, value]) => key.trim().length > 0 && value.trim().length > 0
  );

  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    const encryptedValue = encrypt(rawValue);

    await db
      .insert(customNodeSecretValues)
      .values({
        customNodeId: options.customNodeId,
        userId: options.userId,
        key,
        encryptedValue,
      })
      .onConflictDoUpdate({
        target: [
          customNodeSecretValues.customNodeId,
          customNodeSecretValues.userId,
          customNodeSecretValues.key,
        ],
        set: {
          encryptedValue,
          updatedAt: new Date(),
        },
      });
  }

  return true;
}

export async function getCustomNodeSecretsForUser(options: {
  userId: string;
  customNodeId: string;
}): Promise<Record<string, string>> {
  const definition = await getCustomNodeDefinitionForUser(
    options.userId,
    options.customNodeId
  );

  if (!definition) {
    return {};
  }

  const rows = await db
    .select({
      key: customNodeSecretValues.key,
      encryptedValue: customNodeSecretValues.encryptedValue,
    })
    .from(customNodeSecretValues)
    .where(
      and(
        eq(customNodeSecretValues.customNodeId, options.customNodeId),
        eq(customNodeSecretValues.userId, options.userId)
      )
    )
    .orderBy(asc(customNodeSecretValues.key));

  const secrets: Record<string, string> = {};
  for (const row of rows) {
    try {
      secrets[row.key] = decrypt(row.encryptedValue);
    } catch {
      // Skip values that can no longer be decrypted
    }
  }

  return secrets;
}

export async function deleteCustomNodeForUser(options: {
  userId: string;
  customNodeId: string;
}): Promise<boolean> {
  const result = await db
    .delete(customNodeDefinitions)
    .where(
      and(
        eq(customNodeDefinitions.id, options.customNodeId),
        eq(customNodeDefinitions.userId, options.userId)
      )
    )
    .returning({ id: customNodeDefinitions.id });

  return result.length > 0;
}

export async function countCustomNodesForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customNodeDefinitions)
    .where(eq(customNodeDefinitions.userId, userId));

  return row?.count ?? 0;
}
