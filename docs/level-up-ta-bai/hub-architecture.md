# Hub Architecture

Technical reference for the LUTB Hub surface inside `superr-workflow-builder`.

## Shell and Navigation

The `AppShell` component (`components/app-shell/app-shell.tsx`) is the root layout wrapper for all `/app/*` routes. It provides:

- **Session resolution** via Better Auth (`useSession`)
- **Member profile loading** on mount (SSR-prefetched in `app/app/layout.tsx`, hydrated client-side)
- **Area detection** (`workspace` or `builder`) based on the current pathname
- **Nav rendering** based on the active area

### Context (`shell-context.tsx`)

Every Hub component reads from `useAppShellContext()`:

| Field | Type | Description |
|-------|------|-------------|
| `user` | `ShellUser` | Session user or null |
| `memberProfile` | `HubMemberProfile \| null` | Full member profile with joined user fields |
| `memberLevel` | `MemberLevel` | 1-4, defaults to 1 while loading |
| `isBuilderUnlocked` | `boolean` | `memberLevel >= 3` |
| `currentArea` | `AppShellArea` | `"workspace"` or `"builder"` |
| `builderEntryHref` | `string` | `/app/workflows/new` for L3+, `/app/studio` for L1-L2 |
| `navItems` | `ShellNavItem[]` | Filtered items for the current area |

### Nav Items

**Workspace mode** (LUTB Hub): Home, Journey, Brain, Earn, Profile

**Builder mode** (Superr Studio): Studio, Assistant, Workflows, Sandboxes, Library

## Route Table

### Workspace Mode (LUTB Hub)

| Route | Page |
|-------|------|
| `/app` | Hub Home (level-aware dashboard) |
| `/app/welcome` | Onboarding triage screen |
| `/app/role` | Team role recommendation and selection |
| `/app/journey` | Level progress and task queue |
| `/app/brain` | Xponent Brain (member-linked NotebookLM) |
| `/app/earn` | Affiliate dashboard |
| `/app/me` | Profile and settings |

### Builder Mode (Superr Studio)

| Route | Page | Access |
|-------|------|--------|
| `/app/studio` | Builder gate and overview | All |
| `/app/assistant` | Full-page AI assistant | All |
| `/app/workflows` | Workflow list | L3+ |
| `/app/workflows/new` | New workflow canvas | L3+ |
| `/app/workflows/[id]` | Workflow editor (canvas) | L3+ |
| `/app/sandboxes` | Managed sandboxes | L3+ |
| `/app/library` | Artifacts and assets | L3+ |

### Universal

| Route | Page |
|-------|------|
| `/app/settings` | Account, AI keys, connections |

## Data Flow

```
layout.tsx (SSR)
  ├── auth.api.getSession()
  └── getHubMemberProfile(userId)
        ├── db.query.memberProfiles.findFirst()
        ├── db.insert().onConflictDoNothing() (auto-bootstrap)
        └── serializeMemberProfileRecord()

  ↓ passes initialMemberProfile to AppShell

AppShell (client)
  ├── useSession() for live session
  ├── useState(initialMemberProfile)
  ├── refreshMemberProfile() → api.hub.profile.get()
  ├── derives memberLevel, isBuilderUnlocked, currentArea
  ├── renders AppHeader (toggle, workflow selector, user menu)
  └── renders AppNav (workspace or builder items)
```

## Redirects

| Condition | Redirect |
|-----------|----------|
| No `onboardingCompletedAt` | `/app/welcome` |
| Onboarding done but no team role | `/app/role` |
| On `/app/welcome` with onboarding done | `/app` or `/app/role` depending on role state |
| On `/app/role` with role already set | `/app` |
| L1-L2 accessing `/app/workflows`, `/app/sandboxes`, `/app/library` | `/app/studio` |

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/hub/profile` | GET, PATCH | Member profile CRUD |
| `/api/hub/progress` | GET, POST | Journey task tracking |
| `/api/hub/level` | GET, POST | Level check and level-up |
| `/api/hub/brain` | GET | Brain state |
| `/api/hub/brain/link` | POST | Validate and link a member-owned notebook |
| `/api/hub/brain/sources/url` | POST | Add URL source |
| `/api/hub/brain/sources/text` | POST | Add text source |
| `/api/hub/earn` | GET | Affiliate dashboard data |
