# Agent Skills Integration (Implementation Guide)

This guide describes exactly how to add agent skills support to the existing `ai-agent` node in this repository.

## Goal

Implement a skill-aware AI agent node that can:

1. Load skills from either a preloaded directory or a GitHub repository.
2. Expose skills to the model through a dedicated `skill` tool.
3. Execute skill scripts/resources inside the sandbox used by the agent.
4. Prefer Vercel Sandbox for script-heavy skills and keep `just-bash` for lightweight cases.

## Scope

In scope:

1. `ai-agent` action config and step runtime updates.
2. Skill source resolution and validation on the server.
3. Wiring `experimental_createSkillTool` from `bash-tool`.
4. Guardrails for command execution and skill source safety.

Out of scope:

1. New workflow node types. This stays inside the existing `ai-agent/run-agent` action.
2. Frontend redesign. Only add required config fields.

## Current Integration Points

Use these existing files as integration anchors:

1. `plugins/ai-agent/index.ts` for action config fields.
2. `plugins/ai-agent/steps/run-agent.ts` for runtime/tool creation and sandbox selection.
3. `components/workflow/config/action-config.tsx` for rendering plugin config fields.
4. `lib/steps/step-handler.ts` for standardized logging behavior.

## Required Behavior

1. Skills can be sourced from:
   - A server-local directory (`preloaded`).
   - A GitHub repository (`git`) with ref support.
2. Skill metadata is discovered from `SKILL.md` frontmatter (`name`, `description` required).
3. Agent receives:
   - `skill` tool for on-demand skill loading.
   - `bash`, `readFile`, `writeFile` tools.
4. Skill files are available in the sandbox filesystem (for scripts/resources).
5. Runtime policy:
   - If skills are enabled and include executable scripts, run on `vercel` sandbox.
   - `just-bash` is only allowed for text-only skills.

## Implementation Plan

### 1. Extend AI Agent Action Config

Update `plugins/ai-agent/index.ts` action `configFields` with:

1. `skillsEnabled` (`select`: `off` | `on`, default `off`)
2. `skillsSource` (`select`: `preloaded` | `git`, show when `skillsEnabled=on`)
3. `skillsDirectory` (`text`, show when `skillsSource=preloaded`)
4. `skillsRepoUrl` (`text`, show when `skillsSource=git`)
5. `skillsRepoRef` (`text`, default `main`, show when `skillsSource=git`)
6. `skillsRepoSubdir` (`text`, default `skills`, show when `skillsSource=git`)
7. `skillsAllowlist` (`template-textarea`, optional list of allowed skill names)
8. `skillsDestination` (`text`, default `skills`)

Notes:

1. Keep existing `sandboxType` field.
2. Add field descriptions that clearly state Vercel sandbox is required for script-heavy skills.

### 2. Add Server Skill Modules

Create `lib/skills/` modules:

1. `lib/skills/types.ts`
2. `lib/skills/resolve.ts`
3. `lib/skills/validate.ts`
4. `lib/skills/git-cache.ts`

Suggested contracts:

```ts
// lib/skills/types.ts
export type SkillSourceConfig =
  | { source: "preloaded"; directory: string }
  | {
      source: "git";
      repoUrl: string;
      repoRef: string;
      repoSubdir: string;
    };

export type ResolvedSkills = {
  skillsDirectory: string; // local server path passed to createSkillTool
  resolvedFrom: "preloaded" | "git";
  cacheKey?: string;
};
```

`resolve.ts` responsibilities:

1. Resolve source config into a local directory on server disk.
2. Enforce root path boundaries.
3. For git source, call `git-cache.ts` and return repo subdir path.

`validate.ts` responsibilities:

1. Verify `SKILL.md` exists in each skill folder.
2. Parse frontmatter and enforce:
   - `name`, `description` required.
   - `name` regex: `^[a-z0-9]+(-[a-z0-9]+)*$`.
   - `name` matches folder name.
3. Reject path traversal or symlink escape cases.

`git-cache.ts` responsibilities:

1. Cache checkout under `/tmp/superr-skill-cache/<hash>`.
2. Key by `repoUrl + repoRef`.
3. Perform clone/fetch/checkout and return local repo path.
4. Support pull/refresh TTL.

### 3. Build Skill Toolkit for Agent Runtime

In `plugins/ai-agent/steps/run-agent.ts`:

1. Resolve skill source config before creating the agent tools.
2. Create skill toolkit using:

```ts
import { experimental_createSkillTool } from "bash-tool";
```

3. Build bash toolkit with skill files/instructions:

```ts
const skillToolkit = await experimental_createSkillTool({
  skillsDirectory,
  destination: input.skillsDestination || "skills",
});

const { tools: bashTools } = await createBashTool({
  sandbox,
  destination,
  files: skillToolkit.files,
  extraInstructions: skillToolkit.instructions,
  onBeforeBashCall,
});

const tools = {
  skill: skillToolkit.skill,
  ...bashTools,
};
```

4. Pass `tools` into `ToolLoopAgent`.

### 4. Runtime Selection Rules

Add a runtime decision function in `run-agent.ts`:

1. If `skillsEnabled !== "on"`, keep current behavior.
2. If skills are enabled and any skill contains executable scripts, force `sandboxType="vercel"`.
3. If user selected `just-bash` but policy requires `vercel`, return a clear actionable error.

Script detection rule:

1. Treat files under `scripts/` or extensions like `.sh`, `.py`, `.js`, `.ts` as executable.

### 5. Command Guardrails

Use `createBashTool` hooks for enforcement:

1. `onBeforeBashCall` to block dangerous commands (example: `rm -rf /`, credential exfiltration patterns).
2. `onAfterBashCall` to truncate/redact sensitive output before returning to model.

Keep enforcement code in a dedicated helper:

1. `lib/skills/policy.ts`

### 6. Source Security Rules

For git sources, enforce:

1. Host allowlist (`github.com` by default).
2. Optional organization/repo allowlist.
3. Reject local file URLs and non-HTTPS protocols.
4. Limit max repository size and max files loaded as skills.

For all sources:

1. Reject nested `SKILL.md` recursion if outside expected skill root.
2. Resolve all paths with `path.resolve` and verify they stay under root.

### 7. Logging and Output

Use existing step logging wrapper (`withStepLogging`) and return standardized result shape:

```ts
type RunAgentResult =
  | { success: true; data: { text: string; stepsUsed: number; data?: unknown } }
  | { success: false; error: { message: string } };
```

Include in success data:

1. `skillsUsed` (names loaded through tool if available).
2. `sandboxTypeResolved` (`vercel` or `just-bash`).

## Test Plan

### Unit Tests

Add tests for:

1. Frontmatter/name validation.
2. Path boundary and symlink rejection.
3. Git cache keying and refresh behavior.
4. Runtime selection logic (`just-bash` vs `vercel`).

### Integration Tests

Add step-level tests for:

1. Preloaded skill source: load skill and run script.
2. Git skill source: clone/pull and load skill.
3. Policy block behavior for denied commands.
4. Error when `vercel` required but token missing.

## Rollout Sequence

1. Add server-side skill modules (`lib/skills/*`).
2. Extend `ai-agent` config fields.
3. Wire skill toolkit in `run-agent.ts`.
4. Add runtime policy enforcement.
5. Add tests.
6. Validate with `pnpm type-check` and `pnpm fix`.

## Acceptance Criteria

1. User can configure skill source in the AI Agent action.
2. Agent can call `skill` tool and receive skill instructions.
3. Skill files are present in sandbox for script execution.
4. Script-heavy skills run in Vercel Sandbox.
5. Unsafe skill sources/paths are rejected with clear errors.
6. All checks pass: `pnpm type-check` and `pnpm fix`.

## References

1. [Agent Skills Home](https://agentskills.io/home)  
High-level overview of Agent Skills and core concepts for reusable skill packages.

2. [OpenCode Skills Docs](https://opencode.ai/docs/skills/)  
Practical `SKILL.md` conventions, discovery behavior, naming rules, and permission patterns that are useful when defining validation rules.

3. [Claude Code Skills Docs](https://code.claude.com/docs/en/skills)  
Canonical behavior for how coding agents discover and load skills from filesystem locations.

4. [AI SDK Agent Skills Guide](https://ai-sdk.dev/cookbook/guides/agent-skills#skills)  
Reference integration pattern for AI SDK agents: discover skills, load skill content on demand, and wire tools.

5. [bash-tool Repository](https://github.com/vercel-labs/bash-tool)  
Source of the `createBashTool` and experimental skill toolkit used by this implementation plan.
