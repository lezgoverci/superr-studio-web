# Superr Studio Docs

This directory contains **technical documentation** for Superr Studio and for product surfaces that are implemented inside this codebase.

## Start Here

- [Level Up Ta BAI Technical Docs](./level-up-ta-bai/README.md)
- [Adding Plugins, Nodes, and Steps](./adding-plugins-nodes-steps.md)
- [Agent Skills Integration](./agent-skills-integration.md)
- [Agent Skills Usage and Testing](./agent-skills-usage-and-testing.md)
- [One CLI Credential Integration](./one-cli-credential-integration.md)
- [Vercel AI SDK Agentic Workflows](./vercel-ai-sdk-agentic-workflows.md)

## Documentation Layout

- `docs/level-up-ta-bai/`: technical implementation docs for the Level Up Ta BAI Hub
- `docs/*.md`: shared Superr Studio technical docs that are not specific to one product surface
- `docs/todos.md`: short-lived engineering task list, not canonical architecture documentation

## Documentation Rules

1. Technical implementation docs live in this repository.
2. Level Up Ta BAI product vision, brand, curriculum, and stakeholder-facing docs live in the `level-up-ta-bai` repository, not here.
3. Product-specific implementation docs should live under `docs/<product>/`.
4. Plans that only apply to one product surface should live with that product's technical docs, not at the root of `docs/`.
5. Link across repositories instead of copying the same document into two places.
