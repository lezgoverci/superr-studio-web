import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artifactPublications, artifacts } from "@/lib/db/schema";

export function getOwnedArtifact(options: {
  artifactId: string;
  userId: string;
}) {
  return db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.id, options.artifactId),
      eq(artifacts.userId, options.userId)
    ),
  });
}

export function getOwnedPublication(options: {
  artifactId: string;
  userId: string;
}) {
  return db.query.artifactPublications.findFirst({
    where: and(
      eq(artifactPublications.artifactId, options.artifactId),
      eq(artifactPublications.userId, options.userId)
    ),
  });
}
