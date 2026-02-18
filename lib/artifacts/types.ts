import type {
  ArtifactKind,
  ArtifactPublicationVisibility,
  ArtifactSource,
  ArtifactStatus,
  ArtifactStorageProvider,
  ArtifactVisibility,
} from "@/lib/db/schema";

export type ArtifactRecord = {
  id: string;
  userId: string;
  workflowId: string;
  executionId: string | null;
  executionLogId: string | null;
  nodeId: string;
  nodeType: string;
  actionType: string | null;
  source: ArtifactSource;
  kind: ArtifactKind;
  title: string;
  mimeType: string | null;
  extension: string | null;
  sizeBytes: number;
  storageProvider: ArtifactStorageProvider;
  storageKey: string | null;
  blobUrl: string | null;
  inlineContent: string | null;
  preview: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  status: ArtifactStatus;
  visibility: ArtifactVisibility;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactPublicationRecord = {
  id: string;
  artifactId: string;
  userId: string;
  slug: string;
  title: string;
  description: string | null;
  uiSpec: Record<string, unknown> | null;
  uiSpecVersion: string | null;
  uiMetadata: Record<string, unknown> | null;
  visibility: ArtifactPublicationVisibility;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ArtifactWithPublicationRecord = ArtifactRecord & {
  publication: ArtifactPublicationRecord | null;
};
