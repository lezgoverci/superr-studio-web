import "server-only";

import fs from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { getCachedGitRepo } from "./git-cache";
import type {
  ResolvedSkills,
  ResolveSkillsInput,
  SkillSourceConfig,
  ValidatedSkill,
} from "./types";
import { validateSkillsDirectory } from "./validate";

const LEADING_DOT_SLASH_REGEX = /^\.\//;
const NOOP_CLEANUP = async (): Promise<void> => Promise.resolve();

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === "" ||
    !(relativePath.startsWith("..") || path.isAbsolute(relativePath))
  );
}

function normalizeRelativePath(value: string, fieldLabel: string): string {
  const normalized = path.posix.normalize(value.trim().replaceAll("\\", "/"));

  if (!normalized || normalized === ".") {
    return ".";
  }

  if (
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(
      `${fieldLabel} must be a relative path and cannot contain path traversal.`
    );
  }

  return normalized;
}

function getAllowedPreloadedRoots(): string[] {
  const configuredRoots = process.env.AI_AGENT_SKILLS_ALLOWED_ROOTS?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const defaultRoots = [
    process.cwd(),
    path.join(homedir(), ".agents", "skills"),
    path.join(homedir(), ".codex", "skills"),
    path.join(tmpdir(), "superr-preloaded-skills"),
  ];

  const roots =
    configuredRoots && configuredRoots.length > 0
      ? configuredRoots
      : defaultRoots;

  return [...new Set(roots.map((rootPath) => path.resolve(rootPath)))];
}

async function resolvePreloadedSkillsDirectory(
  source: Extract<SkillSourceConfig, { source: "preloaded" }>
): Promise<string> {
  const rawDirectory = source.directory.trim();
  if (!rawDirectory) {
    throw new Error(
      'Skills directory is required when Skill Source is set to "preloaded".'
    );
  }

  const absolutePath = path.resolve(rawDirectory);
  const realPath = await fs.realpath(absolutePath).catch(() => {
    throw new Error(
      `Preloaded skills directory "${absolutePath}" was not found.`
    );
  });

  const allowedRoots = getAllowedPreloadedRoots();
  const isAllowed = allowedRoots.some((rootPath) =>
    isPathWithinRoot(rootPath, realPath)
  );

  if (!isAllowed) {
    throw new Error(
      `Preloaded skills directory "${realPath}" is outside allowed roots (${allowedRoots.join(", ")}).`
    );
  }

  const stats = await fs.stat(realPath);
  if (!stats.isDirectory()) {
    throw new Error(`Preloaded skills path "${realPath}" is not a directory.`);
  }

  return realPath;
}

async function resolveGitSkillsDirectory(
  source: Extract<SkillSourceConfig, { source: "git" }>
): Promise<{ skillsDirectory: string; cacheKey: string }> {
  const { repoPath, cacheKey } = await getCachedGitRepo({
    repoUrl: source.repoUrl,
    repoRef: source.repoRef,
  });

  const repoRealPath = await fs.realpath(repoPath);
  const normalizedSubdir = normalizeRelativePath(
    source.repoSubdir || "skills",
    "Skills repository subdirectory"
  );
  const candidatePath = path.resolve(repoRealPath, normalizedSubdir);

  const candidateRealPath = await fs.realpath(candidatePath).catch(() => {
    throw new Error(
      `Skills repository subdirectory "${normalizedSubdir}" was not found.`
    );
  });

  if (!isPathWithinRoot(repoRealPath, candidateRealPath)) {
    throw new Error(
      "Skills repository subdirectory resolves outside the cloned repository."
    );
  }

  const stats = await fs.stat(candidateRealPath);
  if (!stats.isDirectory()) {
    throw new Error(
      `Skills repository subdirectory "${normalizedSubdir}" is not a directory.`
    );
  }

  return {
    skillsDirectory: candidateRealPath,
    cacheKey,
  };
}

async function stageAllowlistedSkills(
  skillsDirectory: string,
  skills: ValidatedSkill[],
  allowlist: string[]
): Promise<{
  skillsDirectory: string;
  skills: ValidatedSkill[];
  cleanup: () => Promise<void>;
}> {
  if (allowlist.length === 0) {
    const hasSkills = skills.length > 0;
    if (!hasSkills) {
      throw new Error("No validated skills were available to stage.");
    }

    return {
      skillsDirectory,
      skills,
      cleanup: NOOP_CLEANUP,
    };
  }

  const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));
  const selectedSkills: ValidatedSkill[] = [];
  const missingSkills: string[] = [];

  for (const name of allowlist) {
    const skill = skillsByName.get(name);
    if (!skill) {
      missingSkills.push(name);
      continue;
    }
    selectedSkills.push(skill);
  }

  if (missingSkills.length > 0) {
    throw new Error(
      `Allowlisted skills not found: ${missingSkills.join(", ")}.`
    );
  }

  const stagedRoot = await fs.mkdtemp(
    path.join(tmpdir(), "superr-allowlisted-skills-")
  );

  for (const skill of selectedSkills) {
    const destinationPath = path.join(stagedRoot, skill.directoryName);
    await fs.cp(skill.localPath, destinationPath, { recursive: true });
  }

  const stagedSkills = selectedSkills.map((skill) => ({
    ...skill,
    localPath: path.join(stagedRoot, skill.directoryName),
  }));

  return {
    skillsDirectory: stagedRoot,
    skills: stagedSkills,
    cleanup: async () => {
      await fs.rm(stagedRoot, { recursive: true, force: true });
    },
  };
}

export function sanitizeSkillsDestination(
  rawDestination: string | undefined
): string {
  if (!rawDestination || rawDestination.trim() === "") {
    return "skills";
  }

  const normalized = normalizeRelativePath(
    rawDestination,
    "Skill destination path"
  );
  if (normalized === ".") {
    return "skills";
  }

  return normalized.replace(LEADING_DOT_SLASH_REGEX, "");
}

export async function resolveSkills(
  input: ResolveSkillsInput
): Promise<ResolvedSkills> {
  let skillsDirectory: string;
  let cacheKey: string | undefined;
  let resolvedFrom: "preloaded" | "git";

  if (input.source.source === "preloaded") {
    skillsDirectory = await resolvePreloadedSkillsDirectory(input.source);
    resolvedFrom = "preloaded";
  } else {
    const gitResolution = await resolveGitSkillsDirectory(input.source);
    skillsDirectory = gitResolution.skillsDirectory;
    cacheKey = gitResolution.cacheKey;
    resolvedFrom = "git";
  }

  const validatedSkills = await validateSkillsDirectory(skillsDirectory);
  const staged = await stageAllowlistedSkills(
    validatedSkills.skillsDirectory,
    validatedSkills.skills,
    input.allowlist ?? []
  );

  return {
    skillsDirectory: staged.skillsDirectory,
    skills: staged.skills,
    hasExecutableSkills: staged.skills.some(
      (skill) => skill.hasExecutableFiles
    ),
    resolvedFrom,
    cacheKey,
    cleanup: staged.cleanup,
  };
}
