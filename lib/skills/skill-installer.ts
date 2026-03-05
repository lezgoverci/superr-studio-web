import "server-only";

import matter from "gray-matter";
import { readdir, readFile, stat } from "fs/promises";
import { join, dirname, basename, normalize, resolve, sep } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm, mkdir, copyFile } from "fs/promises";
import simpleGit from "simple-git";

// ---------- Types ----------

export type ParsedSkill = {
  name: string;
  description: string;
  path: string;
  rawContent: string;
  metadata?: Record<string, unknown>;
};

export type ParsedSource =
  | { type: "github"; owner: string; repo: string; ref?: string; subpath?: string; skillName?: string }
  | { type: "local"; path: string }
  | { type: "well-known"; url: string };

export type MarketplaceSkill = {
  name: string;
  slug: string;
  source: string;
  installs: number;
};

// ---------- SKILL.md parsing (modeled on vercel skills source) ----------

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", "__pycache__"];

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const skillPath = join(dir, "SKILL.md");
    const stats = await stat(skillPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function parseSkillMd(
  skillMdPath: string
): Promise<ParsedSkill | null> {
  try {
    const content = await readFile(skillMdPath, "utf-8");
    const { data } = matter(content);

    if (!data.name || !data.description) {
      return null;
    }

    if (typeof data.name !== "string" || typeof data.description !== "string") {
      return null;
    }

    return {
      name: data.name,
      description: data.description,
      path: dirname(skillMdPath),
      rawContent: content,
      metadata: data.metadata,
    };
  } catch {
    return null;
  }
}

async function findSkillDirs(
  dir: string,
  depth = 0,
  maxDepth = 5
): Promise<string[]> {
  if (depth > maxDepth) return [];

  try {
    const [hasSkill, entries] = await Promise.all([
      hasSkillMd(dir),
      readdir(dir, { withFileTypes: true }).catch(() => []),
    ]);

    const currentDir = hasSkill ? [dir] : [];

    const subDirResults = await Promise.all(
      entries
        .filter(
          (entry) => entry.isDirectory() && !SKIP_DIRS.includes(entry.name)
        )
        .map((entry) =>
          findSkillDirs(join(dir, entry.name), depth + 1, maxDepth)
        )
    );

    return [...currentDir, ...subDirResults.flat()];
  } catch {
    return [];
  }
}

export async function discoverSkills(
  basePath: string,
  subpath?: string
): Promise<ParsedSkill[]> {
  const skills: ParsedSkill[] = [];
  const seenNames = new Set<string>();
  const searchPath = subpath ? join(basePath, subpath) : basePath;

  // If pointing directly at a skill, add it
  if (await hasSkillMd(searchPath)) {
    const skill = await parseSkillMd(join(searchPath, "SKILL.md"));
    if (skill) {
      skills.push(skill);
      seenNames.add(skill.name);
      return skills;
    }
  }

  // Search common skill locations
  const prioritySearchDirs = [
    searchPath,
    join(searchPath, "skills"),
    join(searchPath, "skills/.curated"),
    join(searchPath, "skills/.experimental"),
    join(searchPath, ".agents/skills"),
    join(searchPath, ".opencode/skills"),
  ];

  for (const dir of prioritySearchDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = join(dir, entry.name);
          if (await hasSkillMd(skillDir)) {
            const skill = await parseSkillMd(join(skillDir, "SKILL.md"));
            if (skill && !seenNames.has(skill.name)) {
              skills.push(skill);
              seenNames.add(skill.name);
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  // Fall back to recursive search if nothing found
  if (skills.length === 0) {
    const allSkillDirs = await findSkillDirs(searchPath);

    for (const skillDir of allSkillDirs) {
      const skill = await parseSkillMd(join(skillDir, "SKILL.md"));
      if (skill && !seenNames.has(skill.name)) {
        skills.push(skill);
        seenNames.add(skill.name);
      }
    }
  }

  return skills;
}

// ---------- Source parsing (modeled on vercel skills source-parser) ----------

const GITHUB_SHORTHAND = /^([^/\s@]+)\/([^/\s@]+?)(?:@([^/\s]+))?$/;
const GITHUB_URL =
  /^(?:https?:\/\/)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/tree\/([^/\s]+)(?:\/(.+))?)?$/;

export function parseSource(input: string): ParsedSource {
  const trimmed = input.trim();

  // Local paths
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("~")
  ) {
    return { type: "local", path: resolve(trimmed) };
  }

  // GitHub URL
  const githubUrlMatch = trimmed.match(GITHUB_URL);
  if (githubUrlMatch) {
    return {
      type: "github",
      owner: githubUrlMatch[1],
      repo: githubUrlMatch[2],
      ref: githubUrlMatch[3],
      subpath: githubUrlMatch[4],
    };
  }

  // GitHub shorthand: owner/repo or owner/repo@ref
  const shorthandMatch = trimmed.match(GITHUB_SHORTHAND);
  if (shorthandMatch) {
    return {
      type: "github",
      owner: shorthandMatch[1],
      repo: shorthandMatch[2],
      ref: shorthandMatch[3],
    };
  }

  // Well-known URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { type: "well-known", url: trimmed };
  }

  // Default: treat as GitHub shorthand without slash
  return { type: "local", path: resolve(trimmed) };
}

// ---------- Git cloning (modeled on vercel skills git.ts) ----------

const CLONE_TIMEOUT_MS = 60_000;

export async function cloneRepo(
  url: string,
  ref?: string
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "skills-"));
  const git = simpleGit({
    timeout: { block: CLONE_TIMEOUT_MS },
  });
  const cloneOptions = ref
    ? ["--depth", "1", "--branch", ref]
    : ["--depth", "1"];

  try {
    await git.clone(url, tempDir, cloneOptions);
    return tempDir;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to clone ${url}: ${errorMessage}`);
  }
}

export async function cleanupTempDir(dir: string): Promise<void> {
  const normalizedDir = normalize(resolve(dir));
  const normalizedTmpDir = normalize(resolve(tmpdir()));

  if (
    !normalizedDir.startsWith(normalizedTmpDir + sep) &&
    normalizedDir !== normalizedTmpDir
  ) {
    throw new Error(
      "Attempted to clean up directory outside of temp directory"
    );
  }

  await rm(dir, { recursive: true, force: true });
}

// ---------- Skill installation to filesystem ----------

async function copyRecursive(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) {
        await copyRecursive(srcPath, destPath);
      }
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

export async function installSkillToDirectory(
  skill: ParsedSkill,
  destinationBase: string
): Promise<string> {
  const skillDest = join(destinationBase, ".agents", "skills", basename(skill.path));
  await copyRecursive(skill.path, skillDest);
  return skillDest;
}

function resolveInstallBaseDirectory(agentCwd?: string): string {
  const requestedDirectory = agentCwd?.trim();
  if (requestedDirectory) {
    return resolve(requestedDirectory);
  }

  const configuredDirectory =
    process.env.AI_AGENT_SKILLS_INSTALL_BASE_DIR?.trim();
  if (configuredDirectory) {
    return resolve(configuredDirectory);
  }

  return process.cwd();
}

// ---------- skills.sh marketplace search API ----------

const SEARCH_API_BASE = "https://skills.sh";

export async function searchMarketplace(
  query: string,
  limit = 10
): Promise<MarketplaceSkill[]> {
  try {
    const url = `${SEARCH_API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);

    if (!res.ok) return [];

    const data = (await res.json()) as {
      skills: Array<{
        id: string;
        name: string;
        installs: number;
        source: string;
      }>;
    };

    return data.skills.map((skill) => ({
      name: skill.name,
      slug: skill.id,
      source: skill.source || "",
      installs: skill.installs,
    }));
  } catch {
    return [];
  }
}

// ---------- Full install pipeline ----------

import {
  getUserSkill,
  upsertUserSkill,
  deleteUserSkill as dbDeleteUserSkill,
  getUserSkillById,
  updateSkillStatus,
} from "@/lib/db/user-skills";

export type InstallResult = {
  success: true;
  skillId: string;
  skillName: string;
  description: string | null;
  source: string;
  sourceType: "github" | "local" | "well-known";
};

export type InstallError = {
  success: false;
  error: string;
};

export async function installSkillFromSource(
  userId: string,
  sourceInput: string,
  options?: { skillName?: string; agentCwd?: string }
): Promise<InstallResult | InstallError> {
  const source = parseSource(sourceInput);
  let tempDir: string | null = null;

  try {
    let skills: ParsedSkill[] = [];

    switch (source.type) {
      case "github": {
        const repoUrl = `https://github.com/${source.owner}/${source.repo}.git`;
        tempDir = await cloneRepo(repoUrl, source.ref);
        skills = await discoverSkills(tempDir, source.subpath);
        break;
      }
      case "local": {
        skills = await discoverSkills(source.path);
        break;
      }
      case "well-known": {
        return { success: false, error: "Well-known URL sources are not yet supported." };
      }
    }

    if (skills.length === 0) {
      return {
        success: false,
        error: "No skills found in the specified source.",
      };
    }

    // If a specific skill name is requested, filter
    let skill: ParsedSkill | undefined;
    if (options?.skillName) {
      skill = skills.find(
        (s) => s.name.toLowerCase() === options.skillName!.toLowerCase()
      );
      if (!skill) {
        const available = skills.map((s) => s.name).join(", ");
        return {
          success: false,
          error: `Skill "${options.skillName}" not found. Available skills: ${available}`,
        };
      }
    } else {
      // Use the first skill if only one found, otherwise require a name
      if (skills.length === 1) {
        skill = skills[0];
      } else {
        const available = skills.map((s) => s.name).join(", ");
        return {
          success: false,
          error: `Multiple skills found. Please specify a skill name. Available: ${available}`,
        };
      }
    }

    // Check for existing install
    const existing = await getUserSkill(userId, skill.name);
    if (existing && existing.status === "installed") {
      return {
        success: false,
        error: `Skill "${skill.name}" is already installed.`,
      };
    }

    // Save to DB
    const sourceString =
      source.type === "github"
        ? `${source.owner}/${source.repo}`
        : source.path;

    const dbSkill = await upsertUserSkill({
      userId,
      skillName: skill.name,
      description: skill.description,
      source: sourceString,
      sourceType: source.type,
      version: source.type === "github" ? source.ref || "main" : undefined,
      status: "installing",
      metadata: skill.metadata ?? null,
    });

    const installBaseDirectory = resolveInstallBaseDirectory(options?.agentCwd);

    try {
      await installSkillToDirectory(skill, installBaseDirectory);
      await updateSkillStatus(dbSkill.id, "installed");
    } catch (fsError) {
      await updateSkillStatus(dbSkill.id, "failed");
      const msg =
        fsError instanceof Error ? fsError.message : "Unknown error";
      return {
        success: false,
        error: `Skill saved to DB but failed to write to agent filesystem at "${installBaseDirectory}": ${msg}`,
      };
    }

    return {
      success: true,
      skillId: dbSkill.id,
      skillName: dbSkill.skillName,
      description: dbSkill.description,
      source: dbSkill.source,
      sourceType: dbSkill.sourceType,
    };
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir).catch(() => {});
    }
  }
}

export async function uninstallSkill(
  userId: string,
  skillId: string,
  options?: { agentCwd?: string }
): Promise<{ success: boolean; error?: string }> {
  const skill = await getUserSkillById(userId, skillId);
  if (!skill) {
    return { success: false, error: "Skill not found." };
  }

  const deleted = await dbDeleteUserSkill(userId, skillId);
  if (!deleted) {
    return { success: false, error: "Failed to delete skill." };
  }

  // Find and remove the skill from the filesystem
  try {
    const installBaseDirectory = resolveInstallBaseDirectory(options?.agentCwd);
    const agentsSkillsDir = join(installBaseDirectory, ".agents", "skills");
    
    // We use discoverSkills to find exactly where it installed
    const installedSkills = await discoverSkills(agentsSkillsDir);
    const skillToRemove = installedSkills.find((s) => s.name === skill.skillName);

    if (skillToRemove) {
      await rm(skillToRemove.path, { recursive: true, force: true });
    }
  } catch (fsError) {
    console.error(`[skills] Failed to remove skill directory for ${skill.skillName}:`, fsError);
    // Continue even if fs deletion fails, as the DB entry was removed
  }

  return { success: true };
}
