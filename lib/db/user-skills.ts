import "server-only";

import { and, eq } from "drizzle-orm";
import { type SkillStatus, userSkills } from "@/lib/db/schema";
import { db } from "./index";

export type SavedUserSkill = {
  id: string;
  userId: string;
  skillName: string;
  description: string | null;
  source: string;
  sourceType: "github" | "local" | "well-known";
  version: string | null;
  status: SkillStatus;
  metadata: Record<string, unknown> | null;
  installedAt: Date;
  updatedAt: Date;
};

type UpsertUserSkillInput = {
  userId: string;
  skillName: string;
  description?: string | null;
  source: string;
  sourceType: "github" | "local" | "well-known";
  version?: string | null;
  status?: SkillStatus;
  metadata?: Record<string, unknown> | null;
};

function mapSkill(row: typeof userSkills.$inferSelect): SavedUserSkill {
  return {
    id: row.id,
    userId: row.userId,
    skillName: row.skillName,
    description: row.description,
    source: row.source,
    sourceType: row.sourceType as "github" | "local" | "well-known",
    version: row.version,
    status: row.status as SkillStatus,
    metadata: row.metadata as Record<string, unknown> | null,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

export async function getUserSkills(userId: string): Promise<SavedUserSkill[]> {
  const rows = await db.query.userSkills.findMany({
    where: eq(userSkills.userId, userId),
    orderBy: (table, { desc }) => [desc(table.installedAt)],
  });

  return rows.map(mapSkill);
}

export async function getUserSkill(
  userId: string,
  skillName: string
): Promise<SavedUserSkill | null> {
  const row = await db.query.userSkills.findFirst({
    where: and(
      eq(userSkills.userId, userId),
      eq(userSkills.skillName, skillName)
    ),
  });

  return row ? mapSkill(row) : null;
}

export async function getUserSkillById(
  userId: string,
  skillId: string
): Promise<SavedUserSkill | null> {
  const row = await db.query.userSkills.findFirst({
    where: and(eq(userSkills.id, skillId), eq(userSkills.userId, userId)),
  });

  return row ? mapSkill(row) : null;
}

export async function upsertUserSkill(
  input: UpsertUserSkillInput
): Promise<SavedUserSkill> {
  const now = new Date();

  const [created] = await db
    .insert(userSkills)
    .values({
      userId: input.userId,
      skillName: input.skillName,
      description: input.description ?? null,
      source: input.source,
      sourceType: input.sourceType,
      version: input.version ?? null,
      status: input.status ?? "installed",
      metadata: input.metadata ?? null,
      installedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userSkills.userId, userSkills.skillName],
      set: {
        description: input.description ?? null,
        source: input.source,
        sourceType: input.sourceType,
        version: input.version ?? null,
        status: input.status ?? "installed",
        metadata: input.metadata ?? null,
        updatedAt: now,
      },
    })
    .returning();

  return mapSkill(created);
}

export async function deleteUserSkill(
  userId: string,
  skillId: string
): Promise<boolean> {
  const deleted = await db
    .delete(userSkills)
    .where(and(eq(userSkills.id, skillId), eq(userSkills.userId, userId)))
    .returning({ id: userSkills.id });

  return deleted.length > 0;
}

export async function updateSkillStatus(
  skillId: string,
  status: SkillStatus
): Promise<void> {
  await db
    .update(userSkills)
    .set({ status, updatedAt: new Date() })
    .where(eq(userSkills.id, skillId));
}
