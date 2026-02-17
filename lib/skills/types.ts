export type SkillSourceConfig =
  | {
      source: "preloaded";
      directory: string;
    }
  | {
      source: "git";
      repoUrl: string;
      repoRef: string;
      repoSubdir: string;
    };

export type ValidatedSkill = {
  name: string;
  description: string;
  directoryName: string;
  localPath: string;
  files: string[];
  hasExecutableFiles: boolean;
};

export type ValidatedSkillsDirectory = {
  skillsDirectory: string;
  skills: ValidatedSkill[];
  hasExecutableSkills: boolean;
};

export type ResolveSkillsInput = {
  source: SkillSourceConfig;
  allowlist?: string[];
};

export type ResolvedSkills = {
  skillsDirectory: string;
  skills: ValidatedSkill[];
  hasExecutableSkills: boolean;
  resolvedFrom: "preloaded" | "git";
  cacheKey?: string;
  cleanup: () => Promise<void>;
};
