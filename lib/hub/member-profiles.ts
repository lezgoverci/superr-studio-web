import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  memberProfiles,
  memberProgress,
  users,
} from "@/lib/db/schema";
import {
  HUB_MIGRATION_REQUIRED_MESSAGE,
  isMissingRelationError,
} from "./errors";
import type {
  HubMemberProfile,
  HubProgressItem,
  MemberAiFamiliarity,
  MemberCareerPressure,
  MemberLevel,
  MemberSkillLevel,
} from "./types";
import { clampMemberLevel } from "./types";

type ProfileBootstrapDefaults = {
  name?: string | null;
  image?: string | null;
};

type MemberProfileIdentity = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type MemberProfileUpdateData = {
  level?: MemberLevel;
  displayName?: string | null;
  bio?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  isPublic?: boolean;
  currentRole?: string | null;
  targetRole?: string | null;
  skillLevel?: MemberSkillLevel | null;
  aiFamiliarity?: MemberAiFamiliarity | null;
  careerPressure?: MemberCareerPressure | null;
  firstGoal?: string | null;
  whopAffiliateId?: string | null;
  notebooklmNotebookId?: string | null;
  onboardingCompletedAt?: Date | null;
};

type WhopAccountIdentity = {
  accountId: string;
};

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getDevLevelOverride(): MemberLevel | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const raw = process.env.DEV_MEMBER_LEVEL?.trim();

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  if (parsed >= 1 && parsed <= 4) {
    return parsed as MemberLevel;
  }

  return null;
}

function serializeMemberProfileRecord(
  profile: typeof memberProfiles.$inferSelect,
  identity: MemberProfileIdentity,
  providerId: string | null
): HubMemberProfile {
  const devLevel = getDevLevelOverride();

  return {
    id: profile.id,
    userId: profile.userId,
    level: devLevel ?? clampMemberLevel(profile.level),
    role: null,
    displayName: profile.displayName,
    bio: profile.bio,
    location: profile.location,
    avatarUrl: profile.avatarUrl,
    isPublic: profile.isPublic,
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    skillLevel: profile.skillLevel ?? null,
    aiFamiliarity: profile.aiFamiliarity ?? null,
    careerPressure: profile.careerPressure ?? null,
    firstGoal: profile.firstGoal,
    whopAffiliateId: profile.whopAffiliateId,
    notebooklmNotebookId: profile.notebooklmNotebookId,
    onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    userName: identity.name,
    userEmail: identity.email,
    userImage: identity.image,
    providerId,
  };
}

function buildFallbackMemberProfile(
  userId: string,
  identity: MemberProfileIdentity,
  providerId: string | null,
  defaults?: ProfileBootstrapDefaults
): HubMemberProfile {
  const now = new Date().toISOString();

  return {
    id: `hub-fallback-${userId}`,
    userId,
    level: getDevLevelOverride() ?? 1,
    role: null,
    displayName: normalizeOptionalText(defaults?.name ?? identity.name),
    bio: null,
    location: null,
    avatarUrl: normalizeOptionalText(defaults?.image ?? identity.image),
    isPublic: false,
    currentRole: null,
    targetRole: null,
    skillLevel: null,
    aiFamiliarity: null,
    careerPressure: null,
    firstGoal: null,
    whopAffiliateId: null,
    notebooklmNotebookId: null,
    onboardingCompletedAt: now,
    createdAt: now,
    updatedAt: now,
    userName: identity.name,
    userEmail: identity.email,
    userImage: identity.image,
    providerId,
  };
}

export async function getOrCreateMemberProfile(
  userId: string,
  defaults?: ProfileBootstrapDefaults
) {
  let profile = await db.query.memberProfiles.findFirst({
    where: eq(memberProfiles.userId, userId),
  });

  if (!profile) {
    await db
      .insert(memberProfiles)
      .values({
        userId,
        displayName: normalizeOptionalText(defaults?.name),
        avatarUrl: normalizeOptionalText(defaults?.image),
      })
      .onConflictDoNothing();

    profile = await db.query.memberProfiles.findFirst({
      where: eq(memberProfiles.userId, userId),
    });
  }

  if (!profile) {
    throw new Error("Failed to bootstrap member profile");
  }

  return profile;
}

export async function getMemberIdentity(userId: string) {
  const identity = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  });

  if (!identity) {
    throw new Error("User not found");
  }

  return identity;
}

export async function getWhopAccountIdentity(
  userId: string
): Promise<WhopAccountIdentity | null> {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.providerId, "whop")),
    columns: {
      accountId: true,
    },
  });

  if (!account?.accountId) {
    return null;
  }

  return { accountId: account.accountId };
}

export async function getHubMemberProfile(
  userId: string,
  defaults?: ProfileBootstrapDefaults
): Promise<HubMemberProfile> {
  const [identity, providerAccount] = await Promise.all([
    getMemberIdentity(userId),
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.providerId, "whop")),
      columns: {
        providerId: true,
      },
    }),
  ]);

  try {
    const profile = await getOrCreateMemberProfile(userId, defaults);

    return serializeMemberProfileRecord(
      profile,
      identity,
      providerAccount?.providerId ?? null
    );
  } catch (error) {
    if (isMissingRelationError(error, "member_profiles")) {
      console.warn(
        "[hub] member_profiles table is missing; using fallback profile."
      );
      return buildFallbackMemberProfile(
        userId,
        identity,
        providerAccount?.providerId ?? null,
        defaults
      );
    }

    throw error;
  }
}

export async function updateMemberProfile(
  userId: string,
  updates: MemberProfileUpdateData
): Promise<HubMemberProfile> {
  let existing: Awaited<ReturnType<typeof getOrCreateMemberProfile>>;

  try {
    existing = await getOrCreateMemberProfile(userId);
  } catch (error) {
    if (isMissingRelationError(error, "member_profiles")) {
      throw new Error(HUB_MIGRATION_REQUIRED_MESSAGE);
    }
    throw error;
  }

  const [updated] = await db
    .update(memberProfiles)
    .set({
      level: updates.level ?? existing.level,
      displayName:
        updates.displayName === undefined
          ? existing.displayName
          : normalizeOptionalText(updates.displayName),
      bio:
        updates.bio === undefined
          ? existing.bio
          : normalizeOptionalText(updates.bio),
      location:
        updates.location === undefined
          ? existing.location
          : normalizeOptionalText(updates.location),
      avatarUrl:
        updates.avatarUrl === undefined
          ? existing.avatarUrl
          : normalizeOptionalText(updates.avatarUrl),
      isPublic: updates.isPublic ?? existing.isPublic,
      currentRole:
        updates.currentRole === undefined
          ? existing.currentRole
          : normalizeOptionalText(updates.currentRole),
      targetRole:
        updates.targetRole === undefined
          ? existing.targetRole
          : normalizeOptionalText(updates.targetRole),
      skillLevel:
        updates.skillLevel === undefined
          ? existing.skillLevel
          : updates.skillLevel,
      aiFamiliarity:
        updates.aiFamiliarity === undefined
          ? existing.aiFamiliarity
          : updates.aiFamiliarity,
      careerPressure:
        updates.careerPressure === undefined
          ? existing.careerPressure
          : updates.careerPressure,
      firstGoal:
        updates.firstGoal === undefined
          ? existing.firstGoal
          : normalizeOptionalText(updates.firstGoal),
      whopAffiliateId:
        updates.whopAffiliateId === undefined
          ? existing.whopAffiliateId
          : normalizeOptionalText(updates.whopAffiliateId),
      notebooklmNotebookId:
        updates.notebooklmNotebookId === undefined
          ? existing.notebooklmNotebookId
          : normalizeOptionalText(updates.notebooklmNotebookId),
      onboardingCompletedAt:
        updates.onboardingCompletedAt === undefined
          ? existing.onboardingCompletedAt
          : updates.onboardingCompletedAt,
      updatedAt: new Date(),
    })
    .where(eq(memberProfiles.userId, userId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update member profile");
  }

  const [identity, providerAccount] = await Promise.all([
    getMemberIdentity(userId),
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.providerId, "whop")),
      columns: {
        providerId: true,
      },
    }),
  ]);

  return serializeMemberProfileRecord(
    updated,
    identity,
    providerAccount?.providerId ?? null
  );
}

export async function listMemberProgress(
  userId: string
): Promise<HubProgressItem[]> {
  let items: Array<{
    id: string;
    trackId: string;
    taskId: string;
    completedAt: Date | null;
  }>;

  try {
    items = await db.query.memberProgress.findMany({
      where: eq(memberProgress.userId, userId),
      columns: {
        id: true,
        trackId: true,
        taskId: true,
        completedAt: true,
      },
    });
  } catch (error) {
    if (isMissingRelationError(error, "member_progress")) {
      console.warn(
        "[hub] member_progress table is missing; returning empty progress."
      );
      return [];
    }
    throw error;
  }

  return items.map((item) => ({
    id: item.id,
    trackId: item.trackId,
    taskId: item.taskId,
    completedAt: item.completedAt?.toISOString() ?? null,
  }));
}

export async function upsertMemberProgressItem(input: {
  userId: string;
  trackId: string;
  taskId: string;
  completedAt: Date | null;
}) {
  let item:
    | {
        id: string;
        trackId: string;
        taskId: string;
        completedAt: Date | null;
      }
    | undefined;

  try {
    [item] = await db
      .insert(memberProgress)
      .values({
        userId: input.userId,
        trackId: input.trackId,
        taskId: input.taskId,
        completedAt: input.completedAt,
      })
      .onConflictDoUpdate({
        target: [
          memberProgress.userId,
          memberProgress.trackId,
          memberProgress.taskId,
        ],
        set: {
          completedAt: input.completedAt,
          updatedAt: new Date(),
        },
      })
      .returning();
  } catch (error) {
    if (isMissingRelationError(error, "member_progress")) {
      throw new Error(HUB_MIGRATION_REQUIRED_MESSAGE);
    }
    throw error;
  }

  if (!item) {
    throw new Error("Failed to update member progress");
  }

  return {
    id: item.id,
    trackId: item.trackId,
    taskId: item.taskId,
    completedAt: item.completedAt?.toISOString() ?? null,
  } satisfies HubProgressItem;
}
