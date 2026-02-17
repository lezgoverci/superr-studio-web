import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { ValidatedSkill, ValidatedSkillsDirectory } from "./types";

export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EXECUTABLE_FILE_EXTENSIONS = new Set([
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".mts",
  ".cts",
]);
const FRONTMATTER_FIELD_REGEX = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/;
const ALLOWLIST_SPLIT_REGEX = /[\n,]/;

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

const MAX_SKILLS = parsePositiveInteger(
  process.env.AI_AGENT_SKILLS_MAX_SKILLS,
  100
);
const MAX_FILES = parsePositiveInteger(
  process.env.AI_AGENT_SKILLS_MAX_FILES,
  3000
);
const MAX_TOTAL_BYTES = parsePositiveInteger(
  process.env.AI_AGENT_SKILLS_MAX_BYTES,
  20 * 1024 * 1024
);
const MAX_FILE_BYTES = parsePositiveInteger(
  process.env.AI_AGENT_SKILLS_MAX_FILE_BYTES,
  2 * 1024 * 1024
);

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === "" ||
    !(relativePath.startsWith("..") || path.isAbsolute(relativePath))
  );
}

function assertPathWithinRoot(
  rootPath: string,
  targetPath: string,
  context: string
): void {
  if (!isPathWithinRoot(rootPath, targetPath)) {
    throw new Error(`${context} resolves outside the allowed root directory.`);
  }
}

function unwrapQuotedValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value.trim();
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const normalized = content.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") {
    return null;
  }

  let endIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) {
    return null;
  }

  const metadata: Record<string, string> = {};
  for (const line of lines.slice(1, endIndex)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(FRONTMATTER_FIELD_REGEX);
    if (!match) {
      continue;
    }

    metadata[match[1]] = unwrapQuotedValue(match[2]);
  }

  return metadata;
}

function isExecutableSkillFile(relativePath: string): boolean {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  if (normalizedPath.startsWith("scripts/")) {
    return true;
  }

  const extension = path.extname(normalizedPath).toLowerCase();
  return EXECUTABLE_FILE_EXTENSIONS.has(extension);
}

async function scanSkillFiles(options: {
  skillName: string;
  skillDirectory: string;
  rootRealPath: string;
}): Promise<{
  files: string[];
  hasExecutableFiles: boolean;
  totalBytes: number;
}> {
  const files: string[] = [];
  let hasExecutableFiles = false;
  let totalBytes = 0;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Recursive traversal needs branch-heavy checks for safety and limits.
  async function walkDirectory(
    currentDirectory: string,
    currentPrefix: string
  ): Promise<void> {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = currentPrefix
        ? `${currentPrefix}/${entry.name}`
        : entry.name;

      const stats = await fs.lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        throw new Error(
          `Skill "${options.skillName}" contains unsupported symbolic links at "${relativePath}".`
        );
      }

      const realEntryPath = await fs.realpath(absolutePath);
      assertPathWithinRoot(
        options.rootRealPath,
        realEntryPath,
        `Skill "${options.skillName}"`
      );

      if (stats.isDirectory()) {
        await walkDirectory(absolutePath, relativePath);
        continue;
      }

      if (!stats.isFile()) {
        continue;
      }

      if (stats.size > MAX_FILE_BYTES) {
        throw new Error(
          `Skill "${options.skillName}" file "${relativePath}" exceeds the ${MAX_FILE_BYTES} bytes limit.`
        );
      }

      totalBytes += stats.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          `Skill "${options.skillName}" exceeds the ${MAX_TOTAL_BYTES} bytes limit.`
        );
      }

      files.push(relativePath);
      if (isExecutableSkillFile(relativePath)) {
        hasExecutableFiles = true;
      }
    }
  }

  await walkDirectory(options.skillDirectory, "");
  files.sort((left, right) => left.localeCompare(right));

  return {
    files,
    hasExecutableFiles,
    totalBytes,
  };
}

export function parseSkillsAllowlist(
  rawAllowlist: string | undefined
): string[] {
  if (!rawAllowlist) {
    return [];
  }

  const uniqueNames = new Set(
    rawAllowlist
      .split(ALLOWLIST_SPLIT_REGEX)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );

  for (const name of uniqueNames) {
    if (!SKILL_NAME_PATTERN.test(name)) {
      throw new Error(
        `Invalid skill name "${name}" in allowlist. Skill names must match ${SKILL_NAME_PATTERN.source}.`
      );
    }
  }

  return [...uniqueNames];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Validation combines path safety, metadata checks, and size/file limits in one pass.
export async function validateSkillsDirectory(
  skillsDirectory: string
): Promise<ValidatedSkillsDirectory> {
  const resolvedSkillsDirectory = path.resolve(skillsDirectory);
  let directoryStats: Awaited<ReturnType<typeof fs.stat>>;

  try {
    directoryStats = await fs.stat(resolvedSkillsDirectory);
  } catch {
    throw new Error(
      `Skills directory "${resolvedSkillsDirectory}" does not exist.`
    );
  }

  if (!directoryStats.isDirectory()) {
    throw new Error(
      `Skills directory "${resolvedSkillsDirectory}" is not a directory.`
    );
  }

  const rootRealPath = await fs.realpath(resolvedSkillsDirectory);
  const entries = await fs.readdir(rootRealPath, { withFileTypes: true });
  const skills: ValidatedSkill[] = [];

  let totalFileCount = 0;
  let totalByteCount = 0;

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Skill entry "${entry.name}" cannot be a symbolic link.`);
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const skillDirectory = path.join(rootRealPath, entry.name);
    const directoryLstat = await fs.lstat(skillDirectory);
    if (directoryLstat.isSymbolicLink()) {
      throw new Error(
        `Skill directory "${entry.name}" cannot be a symbolic link.`
      );
    }

    const skillRealPath = await fs.realpath(skillDirectory);
    assertPathWithinRoot(rootRealPath, skillRealPath, `Skill "${entry.name}"`);

    const skillMdPath = path.join(skillDirectory, "SKILL.md");
    let skillMdContent: string;
    try {
      skillMdContent = await fs.readFile(skillMdPath, "utf-8");
    } catch {
      continue;
    }

    const frontmatter = parseFrontmatter(skillMdContent);
    if (!frontmatter) {
      throw new Error(
        `Skill "${entry.name}" must include YAML frontmatter in SKILL.md with "name" and "description".`
      );
    }

    const name = frontmatter.name?.trim();
    const description = frontmatter.description?.trim();

    if (!(name && description)) {
      throw new Error(
        `Skill "${entry.name}" is missing required frontmatter fields: "name" and "description".`
      );
    }

    if (!SKILL_NAME_PATTERN.test(name)) {
      throw new Error(
        `Skill "${name}" has an invalid name. Names must match ${SKILL_NAME_PATTERN.source}.`
      );
    }

    if (name !== entry.name) {
      throw new Error(
        `Skill "${entry.name}" is invalid: frontmatter name "${name}" must match the folder name.`
      );
    }

    const scannedFiles = await scanSkillFiles({
      skillName: name,
      skillDirectory,
      rootRealPath,
    });

    totalFileCount += scannedFiles.files.length;
    totalByteCount += scannedFiles.totalBytes;

    if (totalFileCount > MAX_FILES) {
      throw new Error(`Skill set exceeds the ${MAX_FILES} files limit.`);
    }

    if (totalByteCount > MAX_TOTAL_BYTES) {
      throw new Error(`Skill set exceeds the ${MAX_TOTAL_BYTES} bytes limit.`);
    }

    skills.push({
      name,
      description,
      directoryName: entry.name,
      localPath: skillRealPath,
      files: scannedFiles.files,
      hasExecutableFiles: scannedFiles.hasExecutableFiles,
    });

    if (skills.length > MAX_SKILLS) {
      throw new Error(`Skill count exceeds the ${MAX_SKILLS} skills limit.`);
    }
  }

  if (skills.length === 0) {
    throw new Error(
      `No valid skills were discovered in "${resolvedSkillsDirectory}".`
    );
  }

  return {
    skillsDirectory: rootRealPath,
    skills,
    hasExecutableSkills: skills.some((skill) => skill.hasExecutableFiles),
  };
}
