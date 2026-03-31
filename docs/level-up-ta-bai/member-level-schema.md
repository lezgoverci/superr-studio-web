# Member Level Schema

Technical reference for the member profile and progress database tables. For the product-level description of what each level means, see [`level-up-ta-bai/docs/member-levels.md`](https://github.com/lezgoverci/level-up-ta-bai/tree/main/docs/member-levels.md).

## Tables

### `member_profiles`

Stores one row per user. Auto-bootstrapped on first access via `getOrCreateMemberProfile()`.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | text (PK) | `generateId()` | Unique profile ID |
| `user_id` | text (FK, unique) | — | References `users.id`, cascade delete |
| `level` | integer | `1` | Member level (1-4) |
| `display_name` | text | null | Public display name |
| `bio` | text | null | Short bio |
| `location` | text | null | Location |
| `avatar_url` | text | null | Profile image URL |
| `is_public` | boolean | `false` | Profile visibility |
| `current_role` | text | null | Current professional role |
| `target_role` | text | null | Aspirational role |
| `skill_level` | text | null | `starting`, `developing`, `advanced` |
| `ai_familiarity` | text | null | `new`, `comfortable`, `power-user` |
| `career_pressure` | text | null | `low`, `medium`, `high` |
| `first_goal` | text | null | Sprint goal from onboarding |
| `whop_affiliate_id` | text | null | Whop affiliate ID |
| `notebooklm_notebook_id` | text | null | Linked Brain notebook ID |
| `onboarding_completed_at` | timestamp | null | When onboarding was finished |
| `created_at` | timestamp | `now()` | Row creation |
| `updated_at` | timestamp | `now()` | Last update |

**Indexes:** unique on `user_id`, index on `level`

### `member_progress`

Tracks task completion across journey tracks.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | text (PK) | `generateId()` | Unique progress ID |
| `user_id` | text (FK) | — | References `users.id`, cascade delete |
| `track_id` | text | — | Journey track (e.g. `foundation`) |
| `task_id` | text | — | Task within track (e.g. `finish-onboarding`) |
| `completed_at` | timestamp | null | When completed (null = incomplete) |
| `created_at` | timestamp | `now()` | Row creation |
| `updated_at` | timestamp | `now()` | Last update |

**Indexes:** index on `user_id`, unique on `(user_id, track_id, task_id)`

## Level Definitions

| Level | Name | Product Doc |
|-------|------|-------------|
| 1 | Explorer | `member-levels.md` "Explorer" section |
| 2 | Creator | `member-levels.md` "Creator" section |
| 3 | Shadow Operator | `member-levels.md` "Shadow Operator" section |
| 4 | Founder | `member-levels.md` "Founder" section |

## Level-Up Criteria (Code Terms)

Level-up is checked via `checkLevelUp()` in `lib/hub/content.ts`. The criteria map journey track completion and profile signals to level eligibility.

### Level 1 to Level 2 (Explorer to Creator)

- All `foundation` track tasks complete (onboarding, seed brain, define goal)
- `onboardingCompletedAt` is set

### Level 2 to Level 3 (Creator to Shadow Operator)

- All `creation` track tasks complete (share link, publish weekly)
- Brain is provisioned (`notebooklmNotebookId` is set)
- Affiliate link is active (`whopAffiliateId` is set)

### Level 3 to Level 4 (Shadow Operator to Founder)

- All `builder` track tasks complete (unlock builder, launch workflow)
- At least one user-created workflow exists

These criteria are the **code-level reflection** of the product-level criteria in `member-levels.md`. If the product criteria change, update both this document and `checkLevelUp()`.

## Type Definitions

All types live in `lib/hub/types.ts`:

- `MemberLevel` = `1 | 2 | 3 | 4`
- `MemberSkillLevel` = `"starting" | "developing" | "advanced"`
- `MemberAiFamiliarity` = `"new" | "comfortable" | "power-user"`
- `MemberCareerPressure` = `"low" | "medium" | "high"`
- `HubMemberProfile` includes joined fields from `users` and `accounts` tables
- `HubLevelCheckResponse` contains eligibility status, criteria lists, and level-up result
