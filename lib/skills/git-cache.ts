import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type GetCachedGitRepoInput = {
  repoUrl: string;
  repoRef: string;
};

export type CachedGitRepo = {
  repoPath: string;
  cacheKey: string;
};

function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

const DEFAULT_CACHE_ROOT = path.join(tmpdir(), "superr-skill-cache");
const DEFAULT_REFRESH_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_REPOSITORY_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_GIT_TIMEOUT_MS = 2 * 60 * 1000;
const CACHE_STAMP_FILENAME = ".superr-skill-cache-stamp";
const OWNER_REPOSITORY_PATH_REGEX = /^\/[^/]+\/[^/]+/;
const TRAILING_SLASH_REGEX = /\/+$/;

function getAllowedGitHosts(): string[] {
  const configured = process.env.AI_AGENT_SKILLS_GIT_ALLOWED_HOSTS;
  if (!configured) {
    return ["github.com"];
  }

  const parsedHosts = configured
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);

  return parsedHosts.length > 0 ? parsedHosts : ["github.com"];
}

function normalizeAndValidateRepoUrl(repoUrl: string): string {
  const trimmedUrl = repoUrl.trim();
  if (!trimmedUrl) {
    throw new Error("Skills repository URL is required.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error("Skills repository URL must be a valid HTTPS URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Skills repository URL must use HTTPS.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Skills repository URL must not include credentials.");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const allowedHosts = getAllowedGitHosts();
  if (!allowedHosts.includes(hostname)) {
    throw new Error(
      `Skills repository host "${hostname}" is not allowed. Allowed hosts: ${allowedHosts.join(", ")}.`
    );
  }

  if (!OWNER_REPOSITORY_PATH_REGEX.test(parsedUrl.pathname)) {
    throw new Error(
      "Skills repository URL must include an owner and repository path."
    );
  }

  parsedUrl.search = "";
  parsedUrl.hash = "";
  parsedUrl.pathname = parsedUrl.pathname.replace(TRAILING_SLASH_REGEX, "");
  if (!parsedUrl.pathname.endsWith(".git")) {
    parsedUrl.pathname = `${parsedUrl.pathname}.git`;
  }

  return parsedUrl.toString();
}

function normalizeRepoRef(repoRef: string): string {
  const trimmedRef = repoRef.trim();
  if (!trimmedRef) {
    return "main";
  }

  if (trimmedRef.includes("\n") || trimmedRef.includes("\r")) {
    throw new Error("Skills repository ref must be a single line value.");
  }

  return trimmedRef;
}

function createCacheKey(repoUrl: string, repoRef: string): string {
  return createHash("sha256")
    .update(`${repoUrl}#${repoRef}`, "utf-8")
    .digest("hex")
    .slice(0, 24);
}

function getCacheRoot(): string {
  const configured = process.env.AI_AGENT_SKILLS_GIT_CACHE_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return DEFAULT_CACHE_ROOT;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runGitCommand(args: string[]): Promise<void> {
  const timeout = parsePositiveInteger(
    process.env.AI_AGENT_SKILLS_GIT_TIMEOUT_MS,
    DEFAULT_GIT_TIMEOUT_MS
  );

  try {
    await execFileAsync("git", args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const stderr =
      error &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr.trim()
        : "";

    const fallbackMessage =
      error instanceof Error ? error.message : "Unknown git error";
    throw new Error(
      `Git command failed: git ${args.join(" ")}.${stderr ? ` ${stderr}` : ` ${fallbackMessage}`}`
    );
  }
}

async function writeCacheStamp(repoPath: string): Promise<void> {
  const stampPath = path.join(repoPath, CACHE_STAMP_FILENAME);
  await fs.writeFile(stampPath, new Date().toISOString(), "utf-8");
}

async function isCacheFresh(repoPath: string, ttlMs: number): Promise<boolean> {
  if (!(await pathExists(repoPath))) {
    return false;
  }

  const stampPath = path.join(repoPath, CACHE_STAMP_FILENAME);
  if (!(await pathExists(stampPath))) {
    return false;
  }

  const stampStats = await fs.stat(stampPath);
  return Date.now() - stampStats.mtimeMs <= ttlMs;
}

async function cloneRepositoryAtRef(
  destinationPath: string,
  repoUrl: string,
  repoRef: string
): Promise<void> {
  await runGitCommand([
    "clone",
    "--depth",
    "1",
    "--no-tags",
    repoUrl,
    destinationPath,
  ]);
  await runGitCommand([
    "-C",
    destinationPath,
    "fetch",
    "--depth",
    "1",
    "--no-tags",
    "origin",
    repoRef,
  ]);
  await runGitCommand([
    "-C",
    destinationPath,
    "checkout",
    "--force",
    "FETCH_HEAD",
  ]);
}

async function refreshRepositoryAtRef(
  repositoryPath: string,
  repoRef: string
): Promise<void> {
  await runGitCommand([
    "-C",
    repositoryPath,
    "fetch",
    "--depth",
    "1",
    "--no-tags",
    "origin",
    repoRef,
  ]);
  await runGitCommand([
    "-C",
    repositoryPath,
    "checkout",
    "--force",
    "FETCH_HEAD",
  ]);
  await runGitCommand(["-C", repositoryPath, "reset", "--hard", "FETCH_HEAD"]);
  await runGitCommand(["-C", repositoryPath, "clean", "-fd"]);
}

async function ensureRepositorySizeWithinLimit(
  repoPath: string,
  maxRepositorySizeBytes: number
): Promise<void> {
  let totalBytes = 0;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Recursive filesystem walking requires branch-heavy control flow.
  async function walkDirectory(currentDirectory: string): Promise<void> {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === ".git") {
        continue;
      }

      const absolutePath = path.join(currentDirectory, entry.name);
      const stats = await fs.lstat(absolutePath);

      if (stats.isSymbolicLink()) {
        continue;
      }

      if (stats.isDirectory()) {
        await walkDirectory(absolutePath);
        continue;
      }

      if (!stats.isFile()) {
        continue;
      }

      totalBytes += stats.size;
      if (totalBytes > maxRepositorySizeBytes) {
        throw new Error(
          `Skills repository exceeds the ${maxRepositorySizeBytes} bytes limit.`
        );
      }
    }
  }

  await walkDirectory(repoPath);
}

export async function getCachedGitRepo(
  input: GetCachedGitRepoInput
): Promise<CachedGitRepo> {
  const normalizedRepoUrl = normalizeAndValidateRepoUrl(input.repoUrl);
  const normalizedRepoRef = normalizeRepoRef(input.repoRef);

  const cacheRoot = getCacheRoot();
  const cacheKey = createCacheKey(normalizedRepoUrl, normalizedRepoRef);
  const repoPath = path.join(cacheRoot, cacheKey);

  const refreshTtlMs = parsePositiveInteger(
    process.env.AI_AGENT_SKILLS_GIT_REFRESH_TTL_MS,
    DEFAULT_REFRESH_TTL_MS
  );
  const maxRepositorySizeBytes = parsePositiveInteger(
    process.env.AI_AGENT_SKILLS_GIT_MAX_BYTES,
    DEFAULT_MAX_REPOSITORY_SIZE_BYTES
  );

  await fs.mkdir(cacheRoot, { recursive: true });

  if (!(await isCacheFresh(repoPath, refreshTtlMs))) {
    if (await pathExists(repoPath)) {
      await refreshRepositoryAtRef(repoPath, normalizedRepoRef);
    } else {
      const tempPath = `${repoPath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await cloneRepositoryAtRef(
        tempPath,
        normalizedRepoUrl,
        normalizedRepoRef
      );
      try {
        await fs.rename(tempPath, repoPath);
      } catch (error) {
        await fs.rm(tempPath, { recursive: true, force: true });
        if (!(await pathExists(repoPath))) {
          throw error;
        }
      }
    }
    await writeCacheStamp(repoPath);
  }

  await ensureRepositorySizeWithinLimit(repoPath, maxRepositorySizeBytes);

  return { repoPath, cacheKey };
}
