---
name: app-to-cli-generator
description: Generate a standalone CLI for a website, internal web app, or Chromium-based Electron app by observing the live product at runtime. Use this whenever the user asks to turn a website into a CLI, build a terminal client for a SaaS or internal tool, mirror a web app with commands, automate an Electron app behind a CLI, or create a command-line wrapper for a product when source code is unavailable.
---

# App to CLI Generator

Generate a manifest-driven CLI from a live product using runtime observation only. Do not rely on source code. The web path is the primary automated flow in this version. Electron remains supported as a manual/CDP-assisted path.

Always use `agent-browser` directly. Do not use `npx agent-browser`.

## Default Web Workflow

For web targets, use the single orchestrator script first:

```bash
node .agents/skills/app-to-cli-generator/scripts/generate-web-cli.mjs \
  --name "Target App" \
  --target https://example.com \
  --output ./target-app-cli
```

Optional flags:

```bash
--auth state-file
--login-url https://example.com/login
--headed
```

This script does the default v1 flow end to end:

- creates `captures/`, `manifest/`, and `cli/`
- captures the live site with `agent-browser`
- infers a small command tree
- writes `manifest/app-cli.manifest.json`
- renders the generated CLI
- writes `report.json` and `report.md`

## What the Generated CLI Contains

- Explicit subcommands for the captured app
- A `raw` passthrough command
- Hybrid execution modes: `auto`, `api`, `ui`
- A manifest describing commands, flows, request recipes, selectors, auth, and regeneration metadata

The generated CLI stays manifest-driven. Updating `manifest.json` does not require hand-editing the runtime.

## Required Inputs

- Target platform: `web` or `electron`
- Web target URL, or Electron app name plus CDP details
- Output directory if the default `./<slug>-cli/` is not wanted
- Authentication notes when login is required

## Web Decision Rules

- Start with the orchestrator script unless you are debugging capture internals.
- Use `auto` only when both a request recipe and a UI flow exist.
- Prefer request recipes only when the captured evidence is stable enough to replay.
- Keep commands read-only unless the user explicitly asks for mutating operations.
- If command inference is ambiguous, surface the assumption in the report instead of inventing extra commands.

## Fallback / Debugging Tools

Use these only when you need to inspect or repair part of the workflow manually:

- [templates/capture-web-session.sh](templates/capture-web-session.sh)
- [templates/auth-login.sh](templates/auth-login.sh)
- [scripts/init-manifest.mjs](scripts/init-manifest.mjs)
- [scripts/render-cli.mjs](scripts/render-cli.mjs)

Read [references/capture-playbook.md](references/capture-playbook.md) when the default run needs manual intervention.

## Electron Scope in This Version

Electron is still limited to Chromium-based apps reachable through CDP. The skill package keeps the Electron helper and manifest/runtime support, but the automated end-to-end generator is web-first in this version.

For Electron targets, use:

- [templates/capture-electron-session.sh](templates/capture-electron-session.sh)
- `agent-browser connect <port>`
- `agent-browser tab` or `agent-browser tab list`

If CDP access is unavailable, stop and report that the target is unsupported.

## Smoke Check

The generated CLI is standalone, but the reliable validation path is:

```bash
pnpm --dir ./target-app-cli/cli install --ignore-workspace
pnpm --dir ./target-app-cli/cli type-check
pnpm --dir ./target-app-cli/cli build
node ./target-app-cli/cli/dist/index.js inspect --json
```

If install or build is not possible in the current environment, still validate the manifest and report which checks were skipped.

## Output Contract

At the end, report:

- where captures live
- where the manifest lives
- where the generated CLI lives
- the command tree that was created
- which commands are `auto`, `api`, or `ui`
- any known gaps, unstable heuristics, or risky selectors

## References

- [references/capture-playbook.md](references/capture-playbook.md)
- [references/manifest-schema.md](references/manifest-schema.md)
- [references/runtime-modes.md](references/runtime-modes.md)
