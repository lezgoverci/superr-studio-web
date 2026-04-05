# Level Up Ta BAI — Technical Implementation Docs

This directory contains **technical implementation documentation** for the Level Up Ta BAI (LUTB) Hub, which is built as a first-class product surface inside `superr-workflow-builder` (Superr Studio).

For product vision, brand, curriculum, member experience, and storytelling, see the product docs repo: [`level-up-ta-bai/docs/`](https://github.com/lezgoverci/level-up-ta-bai/tree/main/docs)

For rough product ideas, planning drafts, and non-canonical working notes, use [`level-up-ta-bai/notes/`](https://github.com/lezgoverci/level-up-ta-bai/tree/main/notes).

## What Lives Here

| Document | Covers |
|----------|--------|
| [Implementation Plan](./implementation-plan.md) | Technical rollout plan, repository contract, page map, and phased delivery |
| [Hub Architecture](./hub-architecture.md) | Component map, data flow, route table, shell context |
| [Member Level Schema](./member-level-schema.md) | DB tables, level-up criteria in code terms, type definitions |
| [Whop Integration](./whop-integration.md) | Affiliate API, `ensureAffiliate` flow, env vars |
| [NotebookLM Integration](./notebooklm-integration.md) | Brain provisioning, notebook service, starter source seeding |

## What Lives in the Product Repo

| Document | Location |
|----------|----------|
| Member Levels (product definition) | `level-up-ta-bai/docs/member-levels.md` |
| Member Experience | `level-up-ta-bai/docs/member-experience.md` |
| Xponent Brain Architecture (product) | `level-up-ta-bai/docs/xponent-brain-architecture.md` |
| Distribution Mechanics | `level-up-ta-bai/docs/distribution-mechanics.md` |
| Brand and Messaging | `level-up-ta-bai/docs/brand-and-messaging.md` |

## Rules

1. **Product decisions** (what a level means, who the audience is, brand voice) update in `level-up-ta-bai/docs/` only.
2. **Technical decisions** (how levels are stored, how the gate works, which API endpoint does what) update here only.
3. **Member level criteria** are defined in human terms in `level-up-ta-bai/docs/member-levels.md` and reflected in code terms in `member-level-schema.md`. If criteria change, update both.
4. **Working product notes** belong in `level-up-ta-bai/notes/`, not in this folder.
5. **Never copy prose between repos.** Link, don't duplicate.
