import "server-only";

import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  type ArtifactKind,
  type ArtifactPublicationVisibility,
  type ArtifactSource,
  type ArtifactStatus,
  type ArtifactStorageProvider,
  type ArtifactVisibility,
  artifactPublications,
  artifacts,
} from "@/lib/db/schema";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const SLUG_NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const SLUG_MULTIPLE_DASHES_REGEX = /-+/g;

type ArtifactBaseRecord = typeof artifacts.$inferSelect;
type ArtifactPublicationRecord = typeof artifactPublications.$inferSelect;

function parsePagination(
  cursor: string | undefined,
  limit: number | undefined
): { offset: number; pageSize: number } {
  const offset = Number.parseInt(cursor || "0", 10);
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const requestedLimit =
    typeof limit === "number" && Number.isFinite(limit)
      ? limit
      : DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(requestedLimit))
  );
  return { offset: safeOffset, pageSize };
}

function sanitizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(SLUG_NON_ALPHANUMERIC_REGEX, "-")
    .replace(SLUG_MULTIPLE_DASHES_REGEX, "-")
    .replace(/^-|-$/g, "");
}

export function makePublicationSlug(input: string, fallbackId: string): string {
  const cleaned = sanitizeSlug(input);
  if (cleaned) {
    return cleaned;
  }
  return `artifact-${fallbackId.slice(0, 8).toLowerCase()}`;
}

export type ArtifactWithPublication = ArtifactBaseRecord & {
  publication: ArtifactPublicationRecord | null;
};

export async function listArtifactsForUser(input: {
  userId: string;
  workflowId?: string;
  executionId?: string;
  kind?: ArtifactKind;
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<{
  items: ArtifactWithPublication[];
  nextCursor: string | null;
}> {
  const { offset, pageSize } = parsePagination(input.cursor, input.limit);

  const filters = [eq(artifacts.userId, input.userId)];
  if (input.workflowId) {
    filters.push(eq(artifacts.workflowId, input.workflowId));
  }
  if (input.executionId) {
    filters.push(eq(artifacts.executionId, input.executionId));
  }
  if (input.kind) {
    filters.push(eq(artifacts.kind, input.kind));
  }
  if (input.q?.trim()) {
    const query = `%${input.q.trim()}%`;
    const searchFilter = or(
      ilike(artifacts.title, query),
      ilike(artifacts.mimeType, query)
    );
    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  const rows = await db.query.artifacts.findMany({
    where: and(...filters),
    orderBy: [desc(artifacts.pinned), desc(artifacts.createdAt)],
    offset,
    limit: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? String(offset + pageSize) : null;

  const artifactIds = items.map((item) => item.id);
  let publications: ArtifactPublicationRecord[] = [];
  if (artifactIds.length > 0) {
    publications = await db.query.artifactPublications.findMany({
      where: inArray(artifactPublications.artifactId, artifactIds),
    });
  }

  const publicationByArtifactId = new Map(
    publications.map((publication) => [publication.artifactId, publication])
  );

  return {
    items: items.map((item) => ({
      ...item,
      publication: publicationByArtifactId.get(item.id) ?? null,
    })),
    nextCursor,
  };
}

export async function getArtifactForUser(input: {
  artifactId: string;
  userId: string;
}): Promise<ArtifactWithPublication | null> {
  const artifact = await db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.id, input.artifactId),
      eq(artifacts.userId, input.userId)
    ),
  });

  if (!artifact) {
    return null;
  }

  const publication = await db.query.artifactPublications.findFirst({
    where: eq(artifactPublications.artifactId, artifact.id),
  });

  return {
    ...artifact,
    publication: publication ?? null,
  };
}

export async function createArtifactRecord(input: {
  id?: string;
  userId: string;
  workflowId: string;
  executionId?: string | null;
  executionLogId?: string | null;
  nodeId: string;
  nodeType: string;
  actionType?: string | null;
  source: ArtifactSource;
  kind: ArtifactKind;
  title: string;
  mimeType?: string | null;
  extension?: string | null;
  sizeBytes?: number;
  storageProvider: ArtifactStorageProvider;
  storageKey?: string | null;
  blobUrl?: string | null;
  inlineContent?: string | null;
  preview?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  status: ArtifactStatus;
  visibility?: ArtifactVisibility;
  pinned?: boolean;
}) {
  const [created] = await db
    .insert(artifacts)
    .values({
      ...(input.id ? { id: input.id } : {}),
      userId: input.userId,
      workflowId: input.workflowId,
      executionId: input.executionId ?? null,
      executionLogId: input.executionLogId ?? null,
      nodeId: input.nodeId,
      nodeType: input.nodeType,
      actionType: input.actionType ?? null,
      source: input.source,
      kind: input.kind,
      title: input.title,
      mimeType: input.mimeType ?? null,
      extension: input.extension ?? null,
      sizeBytes: input.sizeBytes ?? 0,
      storageProvider: input.storageProvider,
      storageKey: input.storageKey ?? null,
      blobUrl: input.blobUrl ?? null,
      inlineContent: input.inlineContent ?? null,
      preview: input.preview ?? null,
      metadata: input.metadata ?? null,
      status: input.status,
      visibility: input.visibility ?? "private",
      pinned: input.pinned ?? false,
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function updateArtifactForUser(input: {
  artifactId: string;
  userId: string;
  title?: string;
  pinned?: boolean;
  visibility?: ArtifactVisibility;
  metadata?: Record<string, unknown> | null;
}) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof input.title === "string") {
    updateData.title = input.title;
  }
  if (typeof input.pinned === "boolean") {
    updateData.pinned = input.pinned;
  }
  if (input.visibility === "private" || input.visibility === "public") {
    updateData.visibility = input.visibility;
  }
  if (input.metadata !== undefined) {
    updateData.metadata = input.metadata;
  }

  const [updated] = await db
    .update(artifacts)
    .set(updateData)
    .where(
      and(
        eq(artifacts.id, input.artifactId),
        eq(artifacts.userId, input.userId)
      )
    )
    .returning();

  return updated ?? null;
}

export async function deleteArtifactForUser(input: {
  artifactId: string;
  userId: string;
}) {
  const deleted = await db
    .delete(artifacts)
    .where(
      and(
        eq(artifacts.id, input.artifactId),
        eq(artifacts.userId, input.userId)
      )
    )
    .returning({ id: artifacts.id });

  return deleted.length > 0;
}

export async function upsertArtifactPublicationForUser(input: {
  artifactId: string;
  userId: string;
  slug: string;
  title: string;
  description?: string | null;
  visibility: ArtifactPublicationVisibility;
  uiSpec?: Record<string, unknown> | null;
  uiSpecVersion?: string | null;
  uiMetadata?: Record<string, unknown> | null;
}) {
  const [upserted] = await db
    .insert(artifactPublications)
    .values({
      artifactId: input.artifactId,
      userId: input.userId,
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      visibility: input.visibility,
      uiSpec: input.uiSpec ?? null,
      uiSpecVersion: input.uiSpecVersion ?? null,
      uiMetadata: input.uiMetadata ?? null,
      updatedAt: new Date(),
      publishedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: artifactPublications.artifactId,
      set: {
        slug: input.slug,
        title: input.title,
        description: input.description ?? null,
        visibility: input.visibility,
        uiSpec: input.uiSpec ?? null,
        uiSpecVersion: input.uiSpecVersion ?? null,
        uiMetadata: input.uiMetadata ?? null,
        updatedAt: new Date(),
        publishedAt: new Date(),
      },
    })
    .returning();

  return upserted;
}

export async function getPublicArtifactBySlug(slug: string): Promise<{
  artifact: ArtifactBaseRecord;
  publication: ArtifactPublicationRecord;
} | null> {
  const visibilityFilter = or(
    eq(artifactPublications.visibility, "public"),
    eq(artifactPublications.visibility, "unlisted")
  );

  const publication = await db.query.artifactPublications.findFirst({
    where: visibilityFilter
      ? and(eq(artifactPublications.slug, slug), visibilityFilter)
      : eq(artifactPublications.slug, slug),
  });

  if (!publication) {
    return null;
  }

  const artifact = await db.query.artifacts.findFirst({
    where: eq(artifacts.id, publication.artifactId),
  });

  if (!artifact) {
    return null;
  }

  return {
    artifact,
    publication,
  };
}

export async function detachArtifactsForWorkflowExecutions(input: {
  workflowId: string;
  userId: string;
}) {
  await db
    .update(artifacts)
    .set({
      executionId: null,
      executionLogId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(artifacts.workflowId, input.workflowId),
        eq(artifacts.userId, input.userId)
      )
    );
}

export async function detachArtifactsForExecutionIds(executionIds: string[]) {
  if (executionIds.length === 0) {
    return;
  }

  await db
    .update(artifacts)
    .set({
      executionId: null,
      executionLogId: null,
      updatedAt: new Date(),
    })
    .where(inArray(artifacts.executionId, executionIds));
}

export async function clearExecutionLogReferences(input: {
  executionLogIds: string[];
}) {
  if (input.executionLogIds.length === 0) {
    return;
  }

  await db
    .update(artifacts)
    .set({
      executionLogId: null,
      updatedAt: new Date(),
    })
    .where(inArray(artifacts.executionLogId, input.executionLogIds));
}

export async function countArtifactsForExecutionIds(input: {
  userId: string;
  workflowId: string;
  executionIds: string[];
}): Promise<Record<string, number>> {
  if (input.executionIds.length === 0) {
    return {};
  }

  const rows = await db.query.artifacts.findMany({
    where: and(
      eq(artifacts.userId, input.userId),
      eq(artifacts.workflowId, input.workflowId),
      inArray(artifacts.executionId, input.executionIds)
    ),
    columns: {
      executionId: true,
    },
  });

  const counts: Record<string, number> = {};
  for (const row of rows) {
    const executionId = row.executionId;
    if (!executionId) {
      continue;
    }
    counts[executionId] = (counts[executionId] ?? 0) + 1;
  }
  return counts;
}

export async function countArtifactsForExecution(input: {
  userId: string;
  executionId: string;
}) {
  const rows = await db.query.artifacts.findMany({
    where: and(
      eq(artifacts.userId, input.userId),
      eq(artifacts.executionId, input.executionId)
    ),
    columns: {
      id: true,
    },
  });
  return rows.length;
}

export async function deleteOrphanedPublicationByArtifactId(
  artifactId: string
) {
  await db
    .delete(artifactPublications)
    .where(
      and(
        eq(artifactPublications.artifactId, artifactId),
        isNull(artifactPublications.publishedAt)
      )
    );
}
