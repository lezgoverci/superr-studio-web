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
  mode: OpencodeConnectionMode;
  url: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ResolvedOpencodeConnection = SavedOpencodeConnection & {
  password: string;
};

type UpsertOpencodeConnectionInput = {
  userId: string;
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
    mode: row.mode,
    url: row.baseUrl,
    username: row.username,
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
  });

  if (!row) {
    return null;
  }

  return mapConnection(row);
}

export async function getResolvedOpencodeConnectionForUser(
  userId: string
): Promise<ResolvedOpencodeConnection | null> {
  const row = await db.query.opencodeConnections.findFirst({
    where: eq(opencodeConnections.userId, userId),
  });

  if (!row) {
    return null;
  }

  const password = decryptPassword(row.passwordEncrypted);
  if (!password) {
    return null;
  }

  return {
    ...mapConnection(row),
    password,
  };
}

export async function upsertOpencodeConnectionForUser(
  input: UpsertOpencodeConnectionInput
): Promise<SavedOpencodeConnection> {
  const normalizedUrl = normalizeOpencodeBaseUrl(input.url);
  const mode = input.mode ?? "self_hosted";
  const encryptedPassword = encrypt(input.password);
  const now = new Date();

  const existing = await db.query.opencodeConnections.findFirst({
    where: eq(opencodeConnections.userId, input.userId),
  });

  if (existing) {
    const [updated] = await db
      .update(opencodeConnections)
      .set({
        mode,
        baseUrl: normalizedUrl,
        username: input.username,
        passwordEncrypted: encryptedPassword,
        updatedAt: now,
      })
      .where(eq(opencodeConnections.id, existing.id))
      .returning();

    return mapConnection(updated);
  }

  const [created] = await db
    .insert(opencodeConnections)
    .values({
      userId: input.userId,
      mode,
      baseUrl: normalizedUrl,
      username: input.username,
      passwordEncrypted: encryptedPassword,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapConnection(created);
}

export async function deleteOpencodeConnectionForUser(
  userId: string
): Promise<boolean> {
  const deleted = await db
    .delete(opencodeConnections)
    .where(eq(opencodeConnections.userId, userId))
    .returning({ id: opencodeConnections.id });

  return deleted.length > 0;
}
