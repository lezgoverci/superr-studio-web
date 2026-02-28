import "server-only";

import { eq } from "drizzle-orm";
import {
  type OpencodeConnectionMode,
  opencodeConnections,
} from "@/lib/db/schema";
import { normalizeOpencodeBaseUrl } from "@/lib/opencode-server-utils";
import { db } from "./index";
import { decrypt, encrypt } from "./integrations";

export type SavedOpencodeConnection = {
  id: string;
  userId: string;
  name: string | null;
  mode: OpencodeConnectionMode;
  url: string;
  username: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ResolvedOpencodeConnection = SavedOpencodeConnection & {
  password: string;
};

type UpsertOpencodeConnectionInput = {
  userId: string;
  name?: string | null;
  mode?: OpencodeConnectionMode;
  url: string;
  username: string;
  password: string;
};

function mapConnection(
  row: typeof opencodeConnections.$inferSelect
): SavedOpencodeConnection {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    mode: row.mode,
    url: row.baseUrl,
    username: row.username,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function decryptPassword(value: string): string | null {
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

export async function getOpencodeConnectionForUser(
  userId: string
): Promise<SavedOpencodeConnection | null> {
  const row = await db.query.opencodeConnections.findFirst({
    where: eq(opencodeConnections.userId, userId),
    orderBy: (table, { desc }) => [desc(table.isActive)],
  });

  if (!row) {
    return null;
  }

  return mapConnection(row);
}

export async function getAllOpencodeConnectionsForUser(
  userId: string
): Promise<SavedOpencodeConnection[]> {
  const rows = await db.query.opencodeConnections.findMany({
    where: eq(opencodeConnections.userId, userId),
    orderBy: (table, { desc }) => [desc(table.isActive), table.createdAt],
  });

  return rows.map(mapConnection);
}

export async function getActiveOpencodeConnectionForUser(
  userId: string
): Promise<SavedOpencodeConnection | null> {
  const row = await db.query.opencodeConnections.findFirst({
    where: eq(opencodeConnections.userId, userId),
  });

  if (!row) {
    return null;
  }

  const activeRow = row.isActive ? row : null;
  if (activeRow) {
    return mapConnection(activeRow);
  }

  const allRows = await db.query.opencodeConnections.findMany({
    where: eq(opencodeConnections.userId, userId),
    orderBy: (table) => [table.createdAt],
  });

  if (allRows.length > 0) {
    return mapConnection(allRows[0]);
  }

  return null;
}

export async function setActiveOpencodeConnection(
  userId: string,
  connectionId: string
): Promise<SavedOpencodeConnection | null> {
  const connections = await db.query.opencodeConnections.findMany({
    where: eq(opencodeConnections.userId, userId),
  });

  const targetConnection = connections.find((c) => c.id === connectionId);
  if (!targetConnection) {
    return null;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(opencodeConnections)
      .set({ isActive: false })
      .where(eq(opencodeConnections.userId, userId));

    await tx
      .update(opencodeConnections)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(opencodeConnections.id, connectionId));
  });

  return mapConnection(targetConnection);
}

export async function getResolvedOpencodeConnectionForUser(
  userId: string
): Promise<ResolvedOpencodeConnection | null> {
  const connections = await db.query.opencodeConnections.findMany({
    where: eq(opencodeConnections.userId, userId),
    orderBy: (table, { desc }) => [desc(table.isActive), table.createdAt],
  });

  if (connections.length === 0) {
    return null;
  }

  const activeConnection =
    connections.find((c) => c.isActive) ?? connections[0];

  const password = decryptPassword(activeConnection.passwordEncrypted);
  if (!password) {
    return null;
  }

  return {
    ...mapConnection(activeConnection),
    password,
  };
}

export async function deleteOpencodeConnection(
  userId: string,
  connectionId: string
): Promise<boolean> {
  const connection = await db.query.opencodeConnections.findFirst({
    where: eq(opencodeConnections.id, connectionId),
  });

  if (!connection || connection.userId !== userId) {
    return false;
  }

  const wasActive = connection.isActive;

  const deleted = await db
    .delete(opencodeConnections)
    .where(eq(opencodeConnections.id, connectionId))
    .returning({ id: opencodeConnections.id });

  if (deleted.length > 0 && wasActive) {
    const remaining = await db.query.opencodeConnections.findMany({
      where: eq(opencodeConnections.userId, userId),
      orderBy: (table) => [table.createdAt],
    });

    if (remaining.length > 0) {
      await db
        .update(opencodeConnections)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(opencodeConnections.id, remaining[0].id));
    }
  }

  return deleted.length > 0;
}

export async function upsertOpencodeConnectionForUser(
  input: UpsertOpencodeConnectionInput
): Promise<SavedOpencodeConnection> {
  const normalizedUrl = normalizeOpencodeBaseUrl(input.url);
  const mode = input.mode ?? "self_hosted";
  const encryptedPassword = encrypt(input.password);
  const now = new Date();
  const name = input.name ?? null;

  const allConnections = await db.query.opencodeConnections.findMany({
    where: eq(opencodeConnections.userId, input.userId),
  });
  const isFirstConnection = allConnections.length === 0;

  const [created] = await db
    .insert(opencodeConnections)
    .values({
      userId: input.userId,
      name,
      mode,
      baseUrl: normalizedUrl,
      username: input.username,
      passwordEncrypted: encryptedPassword,
      isActive: isFirstConnection,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapConnection(created);
}

export async function deleteOpencodeConnectionForUser(
  userId: string,
  connectionId?: string
): Promise<boolean> {
  if (connectionId) {
    return deleteOpencodeConnection(userId, connectionId);
  }

  const deleted = await db
    .delete(opencodeConnections)
    .where(eq(opencodeConnections.userId, userId))
    .returning({ id: opencodeConnections.id });

  return deleted.length > 0;
}
