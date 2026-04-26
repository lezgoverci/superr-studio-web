# one-cli Integration Plan: Replacing Credential Management

> **Goal**: Evaluate whether `one-cli` (located at `/Users/cruzr/tools/one-cli/onecli`) can
> replace the existing credential management system in `superr-workflow-builder`, and outline
> how that replacement would be implemented.

---

## 1. TL;DR

**Yes, it is possible — but a full drop-in replacement is not the right frame.**

The two systems solve credential security in fundamentally different ways. one-cli is an
**HTTP proxy gateway** that intercepts outbound network calls and injects real credentials
on the wire; the workflow builder uses a **database-backed, per-integration credential
store** that resolves secrets at runtime by integration ID.

The most pragmatic path is a **hybrid migration**:

- Keep the `integrationId` abstraction layer (workflow nodes still reference an integration ID).
- Replace the in-house `encrypt/decrypt` + DB storage in `lib/db/integrations.ts` with
  one-cli acting as the secret backend.
- Leave the step execution model (`fetchCredentials(integrationId)`) largely intact by
  adding a thin one-cli adapter.

---

## 2. Understanding the Two Systems

### 2a. superr-workflow-builder — Current Credential System

| Layer | File | What it does |
|---|---|---|
| Storage | `lib/db/integrations.ts` | AES-256-GCM encrypt/decrypt; stores creds in `integrations` table |
| Fetch | `lib/credential-fetcher.ts` | Resolves `integrationId → WorkflowCredentials` at runtime |
| Enrichment | `lib/steps/credentials.ts` | Maps env-var-style keys onto step input objects |
| Per-plugin types | `plugins/*/credentials.ts` | TypeScript types per integration (e.g. `GITHUB_TOKEN`) |
| API | `app/api/integrations/` | CRUD for integrations, config intentionally excluded from GET |

**Key security principle**: credentials are never stored in workflow node configs or logs.
Steps store only an `integrationId` reference; credentials are fetched in-memory at
execution time using `fetchCredentials(integrationId)`.

### 2b. one-cli — Architecture

| Component | What it does |
|---|---|
| **Rust Gateway** (port 10255) | HTTP MITM proxy; matches outbound requests by host/path pattern, decrypts stored secrets, injects them as headers |
| **Web Dashboard / API** (port 10254) | Next.js app; manages agents, secrets, policy rules |
| **Secret Store** | Prisma + PostgreSQL; AES-256-GCM at rest; decrypted only at request time |

**Key difference**: one-cli works at the **network transport layer**. Agents make plain HTTP
calls through `http://localhost:10255`, using a fake placeholder key
(e.g. `Authorization: Bearer FAKE_KEY`). The gateway swaps the fake key for the real one
before the request leaves the network.

---

## 3. Gap Analysis: What Aligns vs. What Conflicts

### ✅ What aligns

- Both use AES-256-GCM encryption for secrets at rest.
- Both enforce that secrets are never exposed to calling code.
- Both support multi-service credential storage (one-cli via host patterns; workflow
  builder via integration types).
- one-cli's per-agent scoping maps naturally to the workflow builder's per-user
  integration ownership.

### ⚠️ What conflicts

| Issue | Detail |
|---|---|
| **Credential resolution model** | Workflow steps call `fetchCredentials(integrationId)` to get a `WorkflowCredentials` object. one-cli has no SDK for "fetch credentials by ID" — it resolves secrets at the HTTP transport layer, not in application code. |
| **SDK-based integrations** | Many plugins (Slack, Linear, GitHub) use their SDK clients (e.g. `@linear/sdk`, `@slack/web-api`), not raw HTTP calls. one-cli cannot intercept SDK calls unless they are forced through an HTTP proxy. |
| **Integration ID concept** | The workflow builder associates credentials with a typed, named `Integration` record. one-cli models secrets by `(hostPattern, pathPattern)` — there is no equivalent of a named integration type like `"github"` or `"resend"`. |
| **Per-user isolation** | The workflow builder enforces user ownership via `userId` on every DB query. one-cli uses per-agent access tokens to scope secrets. These need mapping. |
| **Self-hosted dependency** | Adopting one-cli adds a required running service (Rust gateway + PostgreSQL). The workflow builder currently has no external auth dependency beyond its own DB. |

---

## 4. Integration Options

### Option A — Full Replacement (Proxy Model)

Route **all** outbound API calls through the one-cli gateway. Steps no longer call
`fetchCredentials`; instead, they make HTTP calls using placeholder keys and one-cli
injects the real credentials.

**Changes required:**
- Rewrite every plugin step to use raw HTTP (`fetch`) instead of SDK clients.
- Remove `lib/db/integrations.ts` encryption logic and the `integrations` table.
- Replace `fetchCredentials` with a function that maps `integrationId → agent token`
  and constructs a proxied HTTP client.
- Add one-cli to the deployment stack (Docker Compose).

**Verdict**: Very high effort. SDK calls (Slack, Linear) are hard to proxy. Not recommended
unless you also want the network-level audit trail that one-cli provides.

---

### Option B — Hybrid: one-cli as Secret Backend (Recommended)

Keep the `integrationId` abstraction layer intact. Replace only the **storage and
encryption** in `lib/db/integrations.ts` with calls to the one-cli API. The step
execution model (`fetchCredentials(integrationId)`) stays the same — it just resolves
against one-cli instead of the local DB.

**Architecture:**

```
Workflow Node
  └─ integrationId: "abc123"
       │
       ▼
fetchCredentials("abc123")           ← no change to callers
       │
       ▼
one-cli Adapter                      ← NEW: replaces lib/db/integrations.ts
  GET /api/secrets?agentId=abc123    ← calls one-cli web API
       │
       ▼
WorkflowCredentials { GITHUB_TOKEN: "..." }
```

**Changes required:**

1. **Deploy one-cli** alongside the workflow builder (Docker Compose service or separate
   host). Configure `SECRET_ENCRYPTION_KEY`, `DATABASE_URL` (can share the same Postgres
   or use a separate DB).

2. **Create a mapping layer** (`lib/one-cli-adapter.ts`):
   - On integration creation (`POST /api/integrations`): call one-cli API to create an
     "agent" (maps to integration ID) and store each credential field as a secret with
     the appropriate `hostPattern`.
   - On `fetchCredentials(integrationId)`: call one-cli's internal API
     (`GET /api/secrets?agentId=...`) to retrieve decrypted values, reconstruct
     `WorkflowCredentials`.

3. **Migrate existing integrations**: write a one-time script that reads all encrypted
   integrations from the existing DB, decrypts them, and re-stores them in one-cli.

4. **Keep the `integrations` table** (or a lightweight version of it) for metadata
   (name, type, userId, createdAt) — but store no credential data there. Credentials
   live exclusively in one-cli.

**Verdict**: Moderate effort. Step execution code is unchanged. Security posture improves
because credentials are now managed by a dedicated service with audit logs.

---

### Option C — Additive / Parallel (Low Risk, Limited Scope)

Keep the existing credential system entirely. Use one-cli only for new integrations that
make raw HTTP calls (e.g. a future generic HTTP-request node), leveraging one-cli's
proxy injection model.

**Verdict**: Least effort, but does not achieve the stated goal of replacing credential
management. Introduces two parallel systems.

---

## 5. Recommended Implementation Plan (Option B)

### Phase 1 — Setup one-cli (1–2 days)

- [ ] Add one-cli to `docker-compose.yml` in the workflow builder project as a service.
- [ ] Configure environment variables: `SECRET_ENCRYPTION_KEY`, `ONECLI_DATABASE_URL`,
      `ONECLI_API_URL` (e.g. `http://localhost:10254`).
- [ ] Verify one-cli API is accessible and healthy from the workflow builder server.

### Phase 2 — Build the Adapter Layer (2–3 days)

Create `lib/one-cli-adapter.ts`:

```typescript
// Conceptual interface
export async function storeIntegrationInOneCli(
  integrationId: string,
  type: IntegrationType,
  config: IntegrationConfig
): Promise<void>;

export async function fetchCredentialsFromOneCli(
  integrationId: string
): Promise<WorkflowCredentials>;

export async function deleteIntegrationFromOneCli(
  integrationId: string
): Promise<void>;
```

Key design decisions:
- Map each `integrationId` to a one-cli "agent" using the integration ID as the agent
  name/identifier.
- Map each credential key (e.g. `GITHUB_TOKEN`) to a one-cli secret with:
  - `hostPattern`: the target service host (e.g. `api.github.com`)
  - `pathPattern`: `*`
  - `injectionConfig.headerName`: `Authorization`
- For `fetchCredentialsFromOneCli`, call one-cli's internal secrets list API filtered
  by agent ID, decrypt (or receive already-decrypted values), return as
  `WorkflowCredentials`.

> **Note**: one-cli's web API is currently designed for the dashboard UI. You may need
> to add a machine-to-machine API endpoint in one-cli's `app/api/` that accepts an
> agent ID and returns decrypted credential values — authenticated via a shared secret
> between the two services.

### Phase 3 — Wire Adapter into Existing Code (1 day)

- In `lib/credential-fetcher.ts`: replace `getIntegrationById(integrationId)` +
  `mapIntegrationConfig()` with `fetchCredentialsFromOneCli(integrationId)`.
- In `app/api/integrations/route.ts` POST handler: after creating the metadata record,
  call `storeIntegrationInOneCli(id, type, config)`.
- In `app/api/integrations/[integrationId]/route.ts` DELETE handler: call
  `deleteIntegrationFromOneCli(integrationId)`.
- Remove the `encrypt` / `decrypt` functions and `encryptConfig` from
  `lib/db/integrations.ts` (no longer needed for credential storage).

### Phase 4 — Migration Script (1 day)

Create `scripts/migrate-credentials-to-one-cli.ts`:

```
for each integration in existing DB:
  1. decrypt config using INTEGRATION_ENCRYPTION_KEY
  2. call storeIntegrationInOneCli(id, type, config)
  3. null out the config column in the integrations table
```

Run this script once with dual-write enabled (write to both systems) before cutting over.

### Phase 5 — Validation & Cutover (1–2 days)

- [ ] Run existing workflow step tests with the adapter enabled.
- [ ] Verify credential injection works end-to-end for at least: GitHub, Slack, Resend,
      Linear, Vercel.
- [ ] Check that `validateWorkflowIntegrations` still works (it only needs metadata, not
      credentials).
- [ ] Remove `INTEGRATION_ENCRYPTION_KEY` from env after migration is confirmed.

---

## 6. What Does NOT Change

The following are entirely unaffected by this migration:

- Workflow node structure and `integrationId` references.
- Plugin step execution code (`plugins/*/steps/`).
- The `WorkflowCredentials` type and `fetchCredentials` call signature.
- Auth, session management, and user isolation logic.
- `validateWorkflowIntegrations` (checks ownership, not credential values).
- The `integrations` table (kept for metadata: name, type, userId, timestamps).

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| one-cli adds a runtime dependency | Run one-cli in the same Docker Compose stack; health-check it before workflow execution |
| one-cli API not designed for machine-to-machine access | Add a lightweight internal endpoint in one-cli's `app/api/` (small change to one-cli source) |
| Key rotation complexity increases | one-cli centralizes this — rotating a key in one-cli propagates everywhere immediately |
| one-cli DB outage blocks workflow execution | Add a short-lived in-memory cache for resolved credentials (TTL: ~60s) |
| Host pattern mapping is lossy | Not all credentials map to a single host (e.g. `DATABASE_URL`); these may need to stay in the existing system or use a generic `*` pattern |

---

## 8. Conclusion

Integration is **feasible** via the hybrid approach (Option B). The workflow builder's
`integrationId` model and one-cli's agent/secret model are compatible with a thin adapter
layer. The primary work is building that adapter and one minor addition to one-cli's API.

**Estimated total effort**: 6–9 engineering days for a production-ready migration.

The payoff is a dedicated, auditable, rotation-friendly secret store with a management
dashboard — at the cost of a new runtime service dependency and the adapter work.
