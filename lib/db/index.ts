import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolveDatabaseUrlWithFallback } from "./resolve-database-url";
import {
  accounts,
  apiKeys,
  artifactPublications,
  artifacts,
  integrations,
  memberProfiles,
  memberProgress,
  opencodeConnections,
  sandboxes,
  sessions,
  userPreferences,
  userSkills,
  users,
  verifications,
  workflowExecutionLogs,
  workflowExecutions,
  workflowExecutionsRelations,
  workflows,
} from "./schema";

// Construct schema object for drizzle
const schema = {
  users,
  sessions,
  accounts,
  verifications,
  workflows,
  workflowExecutions,
  workflowExecutionLogs,
  workflowExecutionsRelations,
  artifacts,
  artifactPublications,
  apiKeys,
  integrations,
  memberProfiles,
  memberProgress,
  opencodeConnections,
  sandboxes,
  userPreferences,
  userSkills,
};

const connectionString = resolveDatabaseUrlWithFallback();
const SUPABASE_POOLER_HOST_PATTERN = /pooler\.supabase\.com$/i;
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function getDatabaseHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return;
  }
}

function buildPostgresOptions(maxConnections: number) {
  const host = getDatabaseHost(connectionString);
  const isLocalHost = host ? LOCAL_DB_HOSTS.has(host) : false;
  const isSupabasePooler = host
    ? SUPABASE_POOLER_HOST_PATTERN.test(host)
    : false;

  return {
    max: maxConnections,
    connect_timeout: 10,
    idle_timeout: 20,
    // Supabase pooler/pgbouncer endpoints can break with prepared statements.
    ...(isSupabasePooler ? { prepare: false } : {}),
    ...(isLocalHost ? {} : { ssl: "require" as const }),
  };
}

// For migrations
export const migrationClient = postgres(
  connectionString,
  buildPostgresOptions(1)
);

// Use global singleton to prevent connection exhaustion during HMR
const globalForDb = globalThis as unknown as {
  dbClient: postgres.Sql | undefined;
  db: PostgresJsDatabase<typeof schema> | undefined;
};

const dbClient =
  globalForDb.dbClient ?? postgres(connectionString, buildPostgresOptions(10));

// For queries - reuse DB instance in development
export const db = globalForDb.db ?? drizzle(dbClient, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.dbClient = dbClient;
  globalForDb.db = db;
}
