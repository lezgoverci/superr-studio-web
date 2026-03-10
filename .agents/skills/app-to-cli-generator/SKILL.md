---
name: app-to-cli-generator
description: Generate a standalone CLI for a website, internal web app, or Chromium-based Electron app by observing the live product at runtime. Use this whenever the user asks to turn a website into a CLI, build a terminal client for a SaaS or internal tool, mirror a web app with commands, automate an Electron app behind a CLI, or create a command-line wrapper for a product when source code is unavailable.
---

# App to CLI Generator

Build a manifest-driven CLI for a live website or Chromium-based Electron app using runtime observation only. Do not rely on source code. Capture the UI, network requests, and login flow from the running target, synthesize a command tree, then scaffold a standalone TypeScript CLI.

Always use `agent-browser` directly. Do not use `npx agent-browser`.

## What This Skill Produces

The output is a standalone CLI project with:

- Explicit subcommands for the target app's high-value workflows
- A `raw` passthrough command for unsupported low-level browser actions
- Hybrid execution modes: `auto`, `api`, and `ui`
- A manifest file that describes commands, flows, request recipes, selectors, auth, and regeneration metadata

The generated CLI is intentionally manifest-driven. Updating `manifest.json` does not require rewriting the runtime by hand.

## Required Inputs

You need:

- The target platform: `web` or `electron`
- A target URL for web apps, or an Electron app name plus CDP connection details
- An output directory
- Authentication notes if login is required

If the user does not specify an output directory, default to `./<slug>-cli/`.

## Workflow

### 1. Prepare the workspace

Create these working directories inside the chosen output root:

- `captures/`
- `manifest/`
- `cli/`

Use the init script to create a manifest skeleton:

```bash
node .agents/skills/app-to-cli-generator/scripts/init-manifest.mjs \
  --name "Target App" \
  --platform web \
  --target https://example.com \
  --output ./target-app-cli/manifest/app-cli.manifest.json
```

For Electron apps, use:

```bash
node .agents/skills/app-to-cli-generator/scripts/init-manifest.mjs \
  --name "Target App" \
  --platform electron \
  --target "Slack" \
  --cdp-port 9222 \
  --output ./target-app-cli/manifest/app-cli.manifest.json
```

### 2. Capture the live target

Read [references/capture-playbook.md](references/capture-playbook.md).

Use the shell templates when they help:

- [templates/capture-web-session.sh](templates/capture-web-session.sh)
- [templates/capture-electron-session.sh](templates/capture-electron-session.sh)
- [templates/auth-login.sh](templates/auth-login.sh)

Capture enough evidence to support a stable command tree:

- Top-level navigation
- Primary list and detail views
- Create, update, or destructive actions if the user wants them
- Authentication flow and saved state behavior
- Network requests for repeatable reads and mutations

Prefer semantic locators and saved request recipes over fragile pixel-driven behavior.

### 3. Synthesize the command tree

Read [references/manifest-schema.md](references/manifest-schema.md) and [references/runtime-modes.md](references/runtime-modes.md).

Default command-tree heuristics:

- Turn primary navigation areas into top-level nouns
- Turn visible user actions and observed HTTP mutations into verbs
- Prefer `list`, `get`, `create`, `update`, `delete`, `search`, `open`, `run`, `publish`, and `status` when the evidence supports them

Ask the user to confirm the command tree only when the mapping is ambiguous or high-impact. Otherwise, proceed with the best default tree and note the assumption.

### 4. Author the manifest

Fill the initialized manifest with:

- `commands`
- `flows`
- `requestRecipes`
- `selectors`
- `auth`
- `regeneration`

Rules:

- If a request recipe is stable and can reuse saved auth state, wire both `requestRecipeId` and `flowId`, then default the command to `auto`.
- If API replay is not stable, make the command UI-only.
- Do not invent commands that were not observed in the product.
- Keep destructive commands out unless the user wants them.

### 5. Render the CLI

Run:

```bash
node .agents/skills/app-to-cli-generator/scripts/render-cli.mjs \
  --manifest ./target-app-cli/manifest/app-cli.manifest.json \
  --output ./target-app-cli/cli
```

The renderer only rewrites generated files. It should not delete custom files in the output directory.

### 6. Smoke check

The generated CLI runtime is dependency-light so you can smoke-check it with an existing TypeScript toolchain when one is available:

```bash
pnpm exec tsx ./target-app-cli/cli/src/index.ts inspect --json
pnpm exec tsc --noEmit --project ./target-app-cli/cli/tsconfig.json
```

If the environment does not have `pnpm` or a TypeScript toolchain, still validate the manifest and report which checks were skipped.

## Decision Rules

- Use `auto` only when the command has both a viable request recipe and a viable UI flow.
- Use `api` first in `auto` mode. Fall back to `ui` only if API execution fails and a UI flow exists.
- For Electron apps, assume Chromium plus CDP. If CDP access is unavailable, stop and report that the target is unsupported for this skill.
- Preserve auth state in the generated CLI under the app-specific home directory. Never hardcode credentials into the manifest.

## Output Contract

At the end, report:

- Where the manifest lives
- Where the generated CLI lives
- The command tree that was created
- Which commands are `auto`, `api`, or `ui`
- Any known gaps, risky selectors, or unsupported flows

## References

- [references/capture-playbook.md](references/capture-playbook.md)
- [references/manifest-schema.md](references/manifest-schema.md)
- [references/runtime-modes.md](references/runtime-modes.md)
