# Level Up Ta BAI Hub — Implementation Plan
**Target codebase:** `superr-workflow-builder`
**Document status:** Living reference — update as phases complete
**Last updated:** 2026-03-29

---

## Background and Framing

Level Up Ta BAI (LUTB) is a community platform for Filipino BPO workers, VAs, and freelancers to upskill with AI. Rather than building a separate platform, the LUTB Hub will be implemented as a first-class product surface inside `superr-workflow-builder` (Superr Studio). The existing Workspace / Builder toggle in the app header becomes the primary navigation mechanism: **Workspace = LUTB Hub** (all members), **Builder = Superr Studio workflow canvas** (Level 3+ members only).

The `level-up-ta-bai` repository remains a **product docs repo only** — vision, brand, curriculum, member experience. All code lives in `superr-workflow-builder`. Neither repo duplicates the other's content; they cross-reference.

---

## Repository Roles (Permanent Split)

| Repo | Role | Who Reads It |
|------|------|--------------|
| `level-up-ta-bai/docs/` | Product vision, brand, member levels, curriculum, storytelling framework, community distribution, roadmap | Community managers, content people, non-technical stakeholders, product decisions |
| `superr-workflow-builder/docs/level-up-ta-bai/` | Technical implementation docs — hub architecture, DB schema, integration specs, API contracts | Developers only |

**Rule:** Each doc lives in exactly one place. The other place links to it, never copies it.

The `level-up-ta-bai/docs/README.md` must be updated to declare it a product docs repo and point to `superr-workflow-builder` for all implementation detail. `superr-workflow-builder/docs/level-up-ta-bai/README.md` must link back to the product repo for all product context.

---

## Full Page Structure

### Public Routes (no auth required) — unchanged

| Route | What It Is | Status |
|-------|-----------|--------|
| `/` | Landing page | Existing |
| `/login` | Login page | Existing |
| `/signup` | Signup page | Existing |
| `/artifacts` | Public artifact gallery | Existing |
| `/a/[slug]` | Public artifact viewer | Existing |
| `/workflows/[workflowId]` | Public workflow view | Existing |
| `/workflows/[workflowId]/run` | Public workflow runner | Existing |

### Authenticated Routes — AppShell with Workspace / Builder toggle

#### Workspace Mode (LUTB Hub) — side nav visible

| Route | Page | Nav Label | Member Level |
|-------|------|-----------|-------------|
| `/app` | Hub Home — level-aware "what to do next" | Home | All |
| `/app/welcome` | First-time onboarding wizard (3-step) | — (one-time) | All |
| `/app/journey` | Level progress, skills checklist, task queue | My Journey | All |
| `/app/brain` | Xponent Brain — NotebookLM context library | Brain | All |
| `/app/earn` | Affiliate dashboard, smart split balance, payout history | Earn | All |
| `/app/me` | Public profile card, account settings, onboarding state | Profile | All |
| `/app/studio` | Builder gate — upgrade prompt for Level 1–2 | — (no nav entry) | L1–L2 only |

#### Builder Mode (Superr Studio) — side nav hidden, canvas takes over

| Route | Page | Nav Label | Member Level |
|-------|------|-----------|-------------|
| `/app/workflows` | Workflow list + picker | Workflows | L3+ |
| `/app/workflows/new` | New workflow canvas | — | L3+ |
| `/app/workflows/[workflowId]` | Workflow editor (full-screen canvas) | Canvas | L3+ |
| `/app/sandboxes` | Managed sandbox environments | Sandboxes | L3+ |
| `/app/library` | Artifacts and outputs from workflows | Library | L3+ |

#### Universal — accessed via user menu in header, both modes

| Route | Page | Access |
|-------|------|--------|
| `/app/settings` | Settings — account, AI keys, connections, skills, appearance | All |

### What Moved and Why

| Before | After | Reason |
|--------|-------|--------|
| `/app` → AI agent chat full-page | `/app` → LUTB Hub Home | Workspace is now the Hub, not a standalone chat page |
| Chat / AI agent in Workspace side nav | Floating panel inside Builder mode | The agent exists to help build workflows, not to be a general Hub feature |
| Sandboxes and Library in Workspace side nav | Builder side nav | Both are workflow output/execution tools, not member growth tools |
| Settings in Workspace side nav | User menu in header | Settings is a header-level concern; frees the side nav for destination pages only |

Nothing is deleted. Every existing route keeps its URL. Only nav wiring changes.

---

## Member Level System

### Levels

| Level | Name | Unlock Criteria | Builder Access |
|-------|------|----------------|---------------|
| 1 | Explorer | Joined and completed onboarding | No |
| 2 | Creator | Completed Level 1 skill tracks, published first content | No |
| 3 | Shadow Operator | Completed Level 2 tracks, active in distribution | Yes — full Builder |
| 4 | Founder | Completed Level 3 tracks, running independent campaigns | Yes — full Builder |

### Level-Aware Rendering

The same URL renders different content based on the member's level. This is not route-level gating (except for Builder) — it is component-level conditional rendering driven by the member's level stored in context.

Examples:
- `/app` (Home): Explorer sees "set up your Brain." Creator sees "3 shares pending." Shadow Operator sees "12 new creator joins."
- `/app/earn`: Explorer sees teaser of affiliate mechanics. Creator sees live affiliate dashboard.
- `/app/journey`: Explorer sees Level 1 skill checklist. Creator sees Level 2 tasks.

The Builder toggle for Level 1–2 members slides visually but routes to `/app/studio` (the gate page) instead of `/app/workflows/new`.

---

## Schema Changes Required

Two new tables need to be added to `lib/db/schema.ts` and migrated via Drizzle.

### `member_profiles` table

```ts
export const memberProfiles = pgTable("member_profiles", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  userId: text("user_id").notNull().references(() => users.id).unique(),
  level: integer("level").notNull().default(1),           // 1–4
  displayName: text("display_name"),
  bio: text("bio"),
  location: text("location"),
  currentRole: text("current_role"),                      // "BPO Agent", "VA", etc.
  targetRole: text("target_role"),
  avatarUrl: text("avatar_url"),
  isPublic: boolean("is_public").notNull().default(false),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  whopAffiliateId: text("whop_affiliate_id"),             // from Whop OAuth profile
  notebooklmNotebookId: text("notebooklm_notebook_id"),   // linked Brain notebook
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});
```

### `member_progress` table

```ts
export const memberProgress = pgTable("member_progress", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  userId: text("user_id").notNull().references(() => users.id),
  trackId: text("track_id").notNull(),                    // e.g. "explorer-ai-basics"
  taskId: text("task_id").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull(),
});
```

---

## Shell Context Changes

The `AppShellContextValue` in `components/app-shell/shell-context.tsx` needs a `memberLevel` field so every Hub component can read the current member's level without a separate data fetch.

```ts
// shell-context.tsx — add to AppShellContextValue
export type AppShellContextValue = {
  user: ShellUser;
  isAuthPending: boolean;
  permissions: Set<string>;
  hasPermission: (permission: string) => boolean;
  navItems: ShellNavItem[];
  memberLevel: 1 | 2 | 3 | 4;         // add this
  isBuilderUnlocked: boolean;           // add this — derived: memberLevel >= 3
};
```

`app-shell.tsx` loads the member profile on mount (after session resolves) and populates these values. Default to `memberLevel: 1` while loading to prevent flicker.

### Workspace Nav Items (new, replaces current NAV_ITEMS for Workspace mode)

```ts
const WORKSPACE_NAV_ITEMS: ShellNavItem[] = [
  { id: "home",    label: "Home",       href: "/app",          icon: Home,       requiredPermissions: [] },
  { id: "journey", label: "My Journey", href: "/app/journey",  icon: TrendingUp, requiredPermissions: [] },
  { id: "brain",   label: "Brain",      href: "/app/brain",    icon: Brain,      requiredPermissions: [] },
  { id: "earn",    label: "Earn",       href: "/app/earn",     icon: DollarSign, requiredPermissions: [] },
  { id: "me",      label: "Profile",    href: "/app/me",       icon: User,       requiredPermissions: [] },
];
```

### Builder Nav Items (existing items, now scoped to Builder mode)

```ts
const BUILDER_NAV_ITEMS: ShellNavItem[] = [
  { id: "workflows", label: "Workflows", href: "/app/workflows",  icon: GitBranch,    requiredPermissions: ["route:workflows:view"] },
  { id: "sandboxes", label: "Sandboxes", href: "/app/sandboxes",  icon: Box,          requiredPermissions: ["route:sandboxes:view"] },
  { id: "library",   label: "Library",   href: "/app/library",    icon: Layers,       requiredPermissions: ["route:library:view"] },
];
```

`app-shell.tsx` renders the appropriate nav list based on `isWorkflowSection`.

---

## Toggle Logic Changes

In `app-header.tsx`, the Builder button's `onClick` needs a level gate:

```ts
// Before
onClick={() => router.push("/app/workflows/new")}

// After
onClick={() => {
  if (isBuilderUnlocked) {
    router.push("/app/workflows/new");
  } else {
    router.push("/app/studio");   // gate page for L1–L2
  }
}}
```

The toggle pill still slides visually in both cases. The visual affordance is preserved — members can see the tab, feel the click, and land on a clear upgrade prompt that explains what they're working toward.

---

## New Files and Directories

```
app/app/
  page.tsx                        ← REPLACE: was AIAgentFullPage, becomes HubHome
  welcome/
    page.tsx                      ← NEW: onboarding wizard
  journey/
    page.tsx                      ← NEW: level progress + task queue
  brain/
    page.tsx                      ← NEW: NotebookLM / Xponent Brain
  earn/
    page.tsx                      ← NEW: affiliate dashboard
  me/
    page.tsx                      ← NEW: profile + settings
  studio/
    page.tsx                      ← NEW: Builder gate for L1–L2

components/hub/
  hub-home.tsx                    ← NEW: level-aware home page component
  hub-home-explorer.tsx           ← NEW: Explorer-specific home content
  hub-home-creator.tsx            ← NEW: Creator-specific home content
  hub-home-operator.tsx           ← NEW: Shadow Operator-specific home content
  level-badge.tsx                 ← NEW: visual level indicator
  level-progress-bar.tsx          ← NEW: progress toward next level
  brain-widget.tsx                ← NEW: NotebookLM quick-access widget
  affiliate-dashboard.tsx         ← NEW: earn page component
  onboarding-wizard.tsx           ← NEW: 3-step welcome wizard
  builder-gate.tsx                ← NEW: upgrade prompt for L1–L2

lib/hub/
  member-profile.ts               ← NEW: server-side member profile fetch
  member-progress.ts              ← NEW: progress tracking helpers
  level-utils.ts                  ← NEW: level gate helpers, unlock criteria

app/api/hub/
  profile/route.ts                ← NEW: GET/PATCH member profile
  progress/route.ts               ← NEW: GET/POST task completions
  level/route.ts                  ← NEW: GET current level, POST level-up check

docs/level-up-ta-bai/
  README.md                       ← NEW: links to product repo, outlines tech docs
  hub-architecture.md             ← NEW: component map, data flow
  member-level-schema.md          ← NEW: DB tables, level criteria in code terms
  whop-integration.md             ← NEW: affiliate, access check, smart splits
  notebooklm-integration.md       ← NEW: Brain architecture, notebooklm-py bridge
```

---

## Integration Points

### Whop (existing in `lib/auth.ts`)

Whop OAuth is already fully wired for authentication and access verification. Extensions needed:

- Pull `whopAffiliateId` from the Whop profile response during OAuth and store it in `member_profiles`
- Call Whop's affiliate API to surface balance and payout history in `/app/earn`
- Respect Whop Smart Split mechanics — the platform does not build its own split logic; it reads from Whop's API

### NotebookLM (new — `notebooklm-py` bridge)

The Brain page connects to NotebookLM via the `notebooklm-py` Python API. For the initial implementation:

- Store the member's NotebookLM notebook ID in `member_profiles.notebooklm_notebook_id`
- The Brain page links out to the member's notebook until a deeper in-platform integration is built
- The notebook ID is set during the onboarding wizard (Step 2: "Link your Brain")
- Future: Chrome extension bridge for Level 3+ members enables NotebookLM → Superr Studio workflow triggers

### Settings (existing `/app/settings`)

The Permissions tab in `settings-content.tsx` already notes: "Account identity is currently managed through Whop OAuth." The LUTB member level should surface here as a read-only field in the Account tab. No structural changes to Settings are required.

---

## Implementation Phases

### Phase 0 — Documentation bridge (no code changes)
**Goal:** Establish the two-repo contract in writing before any code is written.

- [ ] Update `level-up-ta-bai/docs/README.md` — declare it a product docs repo, link to `superr-workflow-builder` for implementation
- [ ] Create `superr-workflow-builder/docs/level-up-ta-bai/README.md` — link back to product repo, outline what technical docs will live here
- [ ] Add `docs/level-up-ta-bai/hub-architecture.md` skeleton with this plan's structure

**Deliverable:** Both repos have a clear, written contract. No contributor confusion about where things live.

---

### Phase 1 — DB schema and shell context
**Goal:** Lay the foundation that every Hub page will depend on.

- [ ] Add `member_profiles` and `member_progress` tables to `lib/db/schema.ts`
- [ ] Generate and run Drizzle migration (`drizzle/0016_...`)
- [ ] Add `memberLevel` and `isBuilderUnlocked` to `AppShellContextValue` in `shell-context.tsx`
- [ ] Load member profile in `app-shell.tsx` after session resolves; default to `level: 1` while loading
- [ ] Create `lib/hub/member-profile.ts` — server-side fetch and cache helper
- [ ] Create `lib/hub/level-utils.ts` — `getIsBuilderUnlocked(level)`, `getLevelLabel(level)`, `getNextLevelCriteria(level)`
- [ ] Add API routes: `app/api/hub/profile/route.ts`, `app/api/hub/level/route.ts`

**Deliverable:** `useAppShellContext()` exposes `memberLevel` reliably. Shell compiles and all existing pages still work.

---

### Phase 2 — Shell rewiring and nav swap
**Goal:** The Workspace / Builder toggle routes correctly. Existing nav items move to the right mode.

- [ ] Split `NAV_ITEMS` in `app-shell.tsx` into `WORKSPACE_NAV_ITEMS` and `BUILDER_NAV_ITEMS`
- [ ] `AppShell` renders `WORKSPACE_NAV_ITEMS` in side nav when not in Builder mode
- [ ] `AppShell` renders `BUILDER_NAV_ITEMS` in side nav when in Builder mode (note: canvas already hides side nav, these appear on `/app/sandboxes` and `/app/library`)
- [ ] Update Builder button in `app-header.tsx` with level gate: routes to `/app/studio` for L1–L2, `/app/workflows/new` for L3+
- [ ] Create `app/app/studio/page.tsx` — Builder gate page with level progress and what unlocks at Level 3
- [ ] Move Settings out of side nav, into `UserMenu` dropdown (already in header)
- [ ] Remove Chat nav item from Workspace side nav (Chat becomes a panel inside Builder — deferred to Phase 4)

**Deliverable:** Toggle works correctly. Workspace and Builder show the right nav items. Level 1–2 members see the gate. Existing Builder pages are unchanged.

---

### Phase 3 — Hub Home and Onboarding
**Goal:** `/app` is now the Hub, not the chat page. New members get a proper welcome flow.

- [ ] Replace `app/app/page.tsx` content — swap `AIAgentFullPage` for `HubHome`
- [ ] Create `components/hub/hub-home.tsx` — reads `memberLevel` from context, renders the correct variant
- [ ] Create `components/hub/hub-home-explorer.tsx` — "what to do next" for Level 1
- [ ] Create `components/hub/hub-home-creator.tsx` — for Level 2
- [ ] Create `components/hub/hub-home-operator.tsx` — for Level 3+
- [ ] Create `components/hub/level-badge.tsx` and `level-progress-bar.tsx`
- [ ] Create `app/app/welcome/page.tsx` — onboarding wizard entry point
- [ ] Create `components/hub/onboarding-wizard.tsx` — 3-step wizard (Step 1: about you, Step 2: link your Brain, Step 3: pick your first goal)
- [ ] Middleware or layout check: redirect new members to `/app/welcome` if `onboardingCompletedAt` is null

**Deliverable:** `/app` is the Hub Home. New members see the wizard. Returning members see a level-appropriate home page.

---

### Phase 4 — My Journey, Brain, Earn, Profile pages
**Goal:** All Hub nav destinations are real pages, not placeholders.

- [ ] `app/app/journey/page.tsx` — level progress, skill tracks, task checklist; powered by `member_progress` table
- [ ] `app/api/hub/progress/route.ts` — GET tasks for current level, POST task completion
- [ ] `app/app/brain/page.tsx` — Xponent Brain; links to member's NotebookLM notebook; shows notebook ID setup prompt if not linked
- [ ] `app/app/earn/page.tsx` — affiliate dashboard; reads Whop affiliate balance via API; shows affiliate link, earning history
- [ ] `app/app/me/page.tsx` — public profile card preview + edit form; links to `member_profiles` PATCH endpoint
- [ ] Create shared `components/hub/brain-widget.tsx` for embedding Brain quick-access on Home page
- [ ] Create `components/hub/affiliate-dashboard.tsx` for Earn page

**Deliverable:** All 5 Workspace nav items are functional pages. Members can track progress, access their Brain, see earnings, and manage their profile.

---

### Phase 5 — Level gating and progression
**Goal:** Members can level up. Level transitions are validated and reflected across the platform.

- [ ] Define level-up criteria in `lib/hub/level-utils.ts` (maps to `docs/level-up-ta-bai/member-levels.md` in the product repo)
- [ ] `app/api/hub/level/route.ts` POST — checks if member meets next level criteria, applies level increment
- [ ] Add level-up celebration moment on Hub Home when a new level is reached
- [ ] Builder toggle gate respects live `memberLevel` — Level 3 unlock immediately grants Builder access without page refresh
- [ ] Update `/app/studio` gate page to show live progress toward Level 3 unlock

**Deliverable:** The full member progression loop works end to end. Reaching Level 3 unlocks the Builder toggle in the same session.

---

### Phase 6 — Polish and public profiles
**Goal:** Members are discoverable. The platform feels production-ready.

- [ ] Public profile pages at `/members/[username]` or similar public route
- [ ] Member directory page (opt-in) for discoverability
- [ ] AI agent as a floating panel inside Builder mode (restore the chat capability in its correct context)
- [ ] NotebookLM deeper integration: display notebook contents summary on Brain page via `notebooklm-py`
- [ ] Mobile nav — `AppNav` sheet variant for Hub mode on small screens

---

## What NOT to Change

- All API routes (`app/api/`) — untouched
- All workflow-related components (`components/workflow/`, `components/ai-elements/`) — untouched
- All plugin definitions (`plugins/`) — untouched
- Auth configuration (`lib/auth.ts`) — untouched (Whop OAuth already works)
- Public routes (`/`, `/login`, `/signup`, `/artifacts`, `/a/[slug]`, `/workflows/`) — untouched
- Drizzle migration history — add new migrations only, never modify existing ones
- The `AppHeader` toggle pill appearance — only its routing behavior changes

---

## Documentation Maintenance Rules

1. **Product decisions** (what a level means, who the audience is, what the brand voice is) → update `level-up-ta-bai/docs/` only
2. **Technical decisions** (how levels are stored, how the gate works, which API endpoint does what) → update `superr-workflow-builder/docs/level-up-ta-bai/` only
3. **Member level criteria** → defined in human terms in `level-up-ta-bai/docs/member-levels.md`; reflected in code terms in `superr-workflow-builder/docs/level-up-ta-bai/member-level-schema.md`. If criteria change, update both files in the same commit/PR.
4. **Route changes** → update this plan's page structure table AND the hub-architecture.md tech doc
5. **Never copy prose between repos** — link, don't duplicate

---

## Open Questions (resolve before Phase 3)

- **NotebookLM notebook creation flow**: Does the wizard create a new notebook via `notebooklm-py` automatically, or does the member paste an existing link? The product docs describe a "hybrid approach" — clarify the exact onboarding step.
- **Whop affiliate ID availability**: Is the `whopAffiliateId` returned in the existing OAuth `getUserInfo` response, or does it require a separate Whop API call post-auth?
- **Username / public profile URL**: What is the member's public URL? `/members/[whopUsername]`? `/u/[username]`? Needs a decision before Phase 6.
- **AI agent in Builder**: The current `AIAgentFullPage` at `/app` will be displaced by Hub Home. Where exactly does it live in Builder mode — a fixed panel, a floating button, or a sidebar toggle? Decide before Phase 4.
