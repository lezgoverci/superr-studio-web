import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import dns from "node:dns";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

import postgres from "postgres";
import {
  migrationDatabaseUrlEnvKeys,
  resolveDatabaseUrlSource,
  resolveMigrationDatabaseUrlSource,
} from "../lib/db/resolve-database-url";

const VERCEL_ENV = process.env.VERCEL_ENV;
const SUPABASE_DIRECT_HOST_PATTERN = /^db\.[a-z0-9]+\.supabase\.co$/i;
const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

type JournalEntry = {
  tag: string;
  when: number;
};

type JournalFile = {
  entries: JournalEntry[];
};

type LocalMigrationEntry = JournalEntry & {
  hash: string;
  sql: string;
};

function getDatabaseHost(databaseUrl: string): string | undefined {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return;
  }
}

function isSupabaseDirectHost(host: string | undefined): boolean {
  if (!host) {
    return false;
  }

  return SUPABASE_DIRECT_HOST_PATTERN.test(host);
}

function buildMigrationEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
  };

  // Force IPv4 ordering to avoid ENETUNREACH on IPv6-only resolved addresses in environments without IPv6 routing
  env.NODE_OPTIONS =
    `${env.NODE_OPTIONS || ""} --dns-result-order=ipv4first`.trim();

  return env;
}

function runMigrationsWithUrl(databaseUrl: string): SpawnSyncReturns<string> {
  return spawnSync("pnpm", ["db:migrate"], {
    encoding: "utf8",
    env: buildMigrationEnv(databaseUrl),
  });
}

function printMigrationOutput(result: SpawnSyncReturns<string>): void {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function containsEnetUnreachError(result: SpawnSyncReturns<string>): boolean {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return output.includes("ENETUNREACH");
}

function containsMissingSupabaseMigrationsTableError(
  result: SpawnSyncReturns<string>
): boolean {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return output.includes(
    'relation "supabase_migrations.schema_migrations" does not exist'
  );
}

function getMigrationOutput(result: SpawnSyncReturns<string>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function extractAlreadyExistsRelationName(
  result: SpawnSyncReturns<string>
): string | null {
  const output = getMigrationOutput(result);
  const matches = [...output.matchAll(/relation "([^"]+)" already exists/g)];

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const relationName = matches[index]?.[1];
    if (relationName && relationName !== DRIZZLE_MIGRATIONS_TABLE) {
      return relationName;
    }
  }

  return null;
}

async function loadLocalMigrationEntries(): Promise<LocalMigrationEntry[]> {
  const journalPath = join(process.cwd(), "drizzle", "meta", "_journal.json");
  const journal = JSON.parse(
    await readFile(journalPath, "utf-8")
  ) as JournalFile;
  const entries = Array.isArray(journal.entries) ? journal.entries : [];

  const localMigrations: LocalMigrationEntry[] = [];
  for (const entry of entries) {
    const migrationPath = join(process.cwd(), "drizzle", `${entry.tag}.sql`);
    const sql = await readFile(migrationPath, "utf-8");
    const hash = createHash("sha256").update(sql).digest("hex");
    localMigrations.push({ ...entry, sql, hash });
  }

  return localMigrations;
}

async function withDatabase<T>(
  databaseUrl: string,
  callback: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });

  try {
    return await callback(sql);
  } finally {
    await sql.end({
      timeout: 5,
    });
  }
}

function getAppliedMigrationHashes(databaseUrl: string): Promise<Set<string>> {
  return withDatabase(databaseUrl, async (sql) => {
    const rows = await sql<
      { hash: string }[]
    >`SELECT hash FROM drizzle.__drizzle_migrations`;
    return new Set(rows.map((row) => row.hash));
  });
}

function relationExists(
  databaseUrl: string,
  relationName: string
): Promise<boolean> {
  return withDatabase(databaseUrl, async (sql) => {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT
        (to_regclass(${`public.${relationName}`}) IS NOT NULL) OR
        (to_regclass(${relationName}) IS NOT NULL) AS "exists"
    `;
    return row?.exists === true;
  });
}

async function insertMigrationRecord(
  databaseUrl: string,
  migration: LocalMigrationEntry
): Promise<void> {
  await withDatabase(databaseUrl, async (sql) => {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      SELECT ${migration.hash}, ${String(migration.when)}
      WHERE NOT EXISTS (
        SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = ${migration.hash}
      )
    `;
  });
}

async function backfillMissingMigrationForExistingRelation(
  databaseUrl: string,
  relationName: string,
  sourceLabel: string
): Promise<boolean> {
  const localMigrations = await loadLocalMigrationEntries();
  const appliedHashes = await getAppliedMigrationHashes(databaseUrl);
  const nextPendingMigration = localMigrations.find(
    (migration) => !appliedHashes.has(migration.hash)
  );

  if (!nextPendingMigration) {
    return false;
  }

  const migrationMentionsRelation = nextPendingMigration.sql.includes(
    `"${relationName}"`
  );
  if (!migrationMentionsRelation) {
    return false;
  }

  if (!(await relationExists(databaseUrl, relationName))) {
    return false;
  }

  console.warn(
    `Migration appears partially applied (relation "${relationName}" already exists, source: ${sourceLabel}). Backfilling migration ${nextPendingMigration.tag} and retrying.`
  );
  await insertMigrationRecord(databaseUrl, nextPendingMigration);
  return true;
}

async function attemptRelationAlreadyExistsSelfHealing(
  databaseUrl: string,
  sourceLabel: string,
  migrationResult: SpawnSyncReturns<string>
): Promise<SpawnSyncReturns<string> | null> {
  if (migrationResult.status === 0) {
    return null;
  }

  const relationName = extractAlreadyExistsRelationName(migrationResult);
  if (!relationName) {
    return null;
  }

  const healed = await backfillMissingMigrationForExistingRelation(
    databaseUrl,
    relationName,
    sourceLabel
  );
  if (!healed) {
    return null;
  }

  const retryResult = runMigrationsWithUrl(databaseUrl);
  printMigrationOutput(retryResult);
  return retryResult;
}

function assertMigrationSucceeded(result: SpawnSyncReturns<string>): void {
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `pnpm db:migrate exited with status ${result.status ?? "null"}`
    );
  }
}

async function ensureSupabaseMigrationMetadata(
  databaseUrl: string
): Promise<void> {
  await withDatabase(databaseUrl, async (sql) => {
    await sql`CREATE SCHEMA IF NOT EXISTS supabase_migrations`;
    await sql`CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY)`;
    await sql`ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS statements text[]`;
    await sql`ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS name text`;
  });
}

async function runMigrationsWithSelfHealing(
  databaseUrl: string,
  sourceLabel: string
): Promise<SpawnSyncReturns<string>> {
  const migrationResult = runMigrationsWithUrl(databaseUrl);
  printMigrationOutput(migrationResult);

  const shouldBootstrapSupabaseMigrationsTable =
    migrationResult.status !== 0 &&
    containsMissingSupabaseMigrationsTableError(migrationResult);

  if (!shouldBootstrapSupabaseMigrationsTable) {
    const relationRetryResult = await attemptRelationAlreadyExistsSelfHealing(
      databaseUrl,
      sourceLabel,
      migrationResult
    );
    return relationRetryResult ?? migrationResult;
  }

  console.warn(
    `Migration failed because supabase_migrations.schema_migrations is missing (source: ${sourceLabel}). Bootstrapping that metadata table and retrying.`
  );
  await ensureSupabaseMigrationMetadata(databaseUrl);
  const retryResult = runMigrationsWithUrl(databaseUrl);
  printMigrationOutput(retryResult);
  const relationRetryResult = await attemptRelationAlreadyExistsSelfHealing(
    databaseUrl,
    sourceLabel,
    retryResult
  );
  return relationRetryResult ?? retryResult;
}

async function main(): Promise<void> {
  if (VERCEL_ENV !== "production") {
    console.log(`Skipping migrations (VERCEL_ENV=${VERCEL_ENV ?? "not set"})`);
    return;
  }

  console.log("Running database migrations for production...");

  const databaseUrlSource = resolveMigrationDatabaseUrlSource();
  const runtimeDatabaseUrlSource = resolveDatabaseUrlSource();
  if (!databaseUrlSource) {
    console.error(
      `Migration failed: no database URL found. Set one of: ${migrationDatabaseUrlEnvKeys.join(", ")}`
    );
    process.exit(1);
  }

  const databaseUrl = databaseUrlSource.value;
  const databaseHost = getDatabaseHost(databaseUrl);
  console.log(
    `Using database URL from ${databaseUrlSource.key}${databaseHost ? ` (host: ${databaseHost})` : ""}`
  );

  if (databaseHost?.includes("pooler.supabase.com")) {
    console.warn(
      "Detected Supabase pooler URL. If migrations fail, set DATABASE_MIGRATION_URL (or DIRECT_URL) to the direct database URL on port 5432."
    );
  }

  try {
    const migrationResult = await runMigrationsWithSelfHealing(
      databaseUrl,
      databaseUrlSource.key
    );

    const shouldRetryWithRuntimeDatabaseUrl =
      migrationResult.status !== 0 &&
      containsEnetUnreachError(migrationResult) &&
      isSupabaseDirectHost(databaseHost) &&
      runtimeDatabaseUrlSource &&
      runtimeDatabaseUrlSource.value !== databaseUrl;

    if (shouldRetryWithRuntimeDatabaseUrl && runtimeDatabaseUrlSource) {
      const runtimeDatabaseHost = getDatabaseHost(
        runtimeDatabaseUrlSource.value
      );
      console.warn(
        `Primary migration URL (${databaseHost ?? databaseUrlSource.key}) is unreachable from Vercel (ENETUNREACH). Retrying with ${runtimeDatabaseUrlSource.key}${runtimeDatabaseHost ? ` (host: ${runtimeDatabaseHost})` : ""}.`
      );
      const retryResult = await runMigrationsWithSelfHealing(
        runtimeDatabaseUrlSource.value,
        runtimeDatabaseUrlSource.key
      );
      assertMigrationSucceeded(retryResult);
    } else {
      assertMigrationSucceeded(migrationResult);
    }

    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
