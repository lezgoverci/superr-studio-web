# Agent Skills: Usage and Testing Guide

This guide explains how to use and validate the new agent skills implementation in `superr-workflow-builder`.

## What This Implementation Adds

1. Agent-scoped workflow APIs:
   - `POST /api/agent/workflows/compose` (NDJSON operation stream)
   - `POST /api/agent/workflows` (create)
   - `GET/PATCH /api/agent/workflows/:workflowId` (read/update)
   - `POST /api/agent/workflows/:workflowId/execute` (run)
   - `POST /api/agent/workflows/ui-spec/compose` (generate json-render UI spec)
2. API key scopes:
   - `workflow:compose`
   - `workflow:write`
   - `workflow:execute`
   - `workflow:webhook:execute`
3. Workflow UI spec persistence:
   - `workflows.ui_spec`, `workflows.ui_spec_version`, `workflows.ui_metadata`
4. Run page for generated forms:
   - `/workflows/:workflowId/run`
5. AI Agent node enhancements:
   - Skills source support (`preloaded` or `git`)
   - Vercel sandbox team/project fields for non-OIDC tokens

## Prerequisites

1. App running locally:
```bash
pnpm install
pnpm dev
```
2. Server AI key configured:
   - `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY`
3. Database schema includes new columns:
```sql
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "scopes" jsonb;
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "ui_spec" jsonb;
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "ui_spec_version" text;
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "ui_metadata" jsonb;
```

## Create Scoped API Keys

While logged in to your app, run in browser devtools console:

```js
const mk = async (name, scopes) => {
  const r = await fetch("/api/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, scopes }),
  });
  return r.json();
};

const composeKey = await mk("compose", ["workflow:compose"]);
const writeKey = await mk("write", ["workflow:write"]);
const execKey = await mk("execute", ["workflow:execute"]);
const webhookKey = await mk("webhook", ["workflow:webhook:execute"]);

console.log({ composeKey, writeKey, execKey, webhookKey });
```

Store returned full keys (`wfb_...`) immediately. They are only returned once.

## Manual End-to-End Test (Steps 4-7)

Set environment variables:

```bash
export BASE_URL="http://localhost:3000"
export COMPOSE_KEY="wfb_..."
export WRITE_KEY="wfb_..."
export EXEC_KEY="wfb_..."
export WEBHOOK_KEY="wfb_..."
```

### 1) Test compose stream

```bash
curl -N "$BASE_URL/api/agent/workflows/compose" \
  -H "Authorization: Bearer $COMPOSE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a simple manual trigger workflow with one HTTP Request action"}'
```

Expected: stream contains one or more `{"type":"operation"...}` lines and a final `{"type":"complete"}`.

### 2) Create workflow, generate UI spec, patch it, and execute

```bash
WF_ID=$(curl -s "$BASE_URL/api/agent/workflows" \
  -H "Authorization: Bearer $WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Agent Route Test","nodes":[],"edges":[]}' | jq -r '.id')

SPEC=$(curl -s "$BASE_URL/api/agent/workflows/ui-spec/compose" \
  -H "Authorization: Bearer $COMPOSE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Build a run form with a customerId input and Run button"}' | jq -c '.spec')

curl -s -X PATCH "$BASE_URL/api/agent/workflows/$WF_ID" \
  -H "Authorization: Bearer $WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"uiSpec\":$SPEC,\"uiSpecVersion\":\"1\"}" | jq

curl -s -X POST "$BASE_URL/api/agent/workflows/$WF_ID/execute" \
  -H "Authorization: Bearer $EXEC_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"customerId":"cust_123"}}' | jq
```

### 3) Validate run page rendering

Open:

```text
http://localhost:3000/workflows/<WF_ID>/run
```

Expected:

1. Form renders from `uiSpec`.
2. Canvas background is hidden on this route.
3. Owner can submit and receives execution feedback.

### 4) Validate webhook scope enforcement

Call webhook endpoint with key that has `workflow:webhook:execute` and verify it succeeds.  
Call same endpoint with a key without webhook scope and verify `403`.

## AI Agent Node: Skills Usage

In `AI Agent -> Run Agent` config:

1. `sandboxType`: `vercel` (recommended for skills)
2. `skillsEnabled`: `on`
3. `skillsSource`: `git` or `preloaded`
4. For git source:
   - `skillsRepoUrl`, `skillsRepoRef`, optional `skillsRepoSubdir`
5. For non-OIDC Vercel token, provide one of:
   - Node fields: `vercelSandboxTeamId` + `vercelSandboxProjectId`
   - Server env: `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID`

Prompt example:

```text
what skills do you have?
```

Expected output includes `skillsAvailable` and `skillsUsed`.

## Fast Validation Commands

```bash
pnpm type-check
pnpm exec ultracite check
pnpm exec ultracite fix
```

If `pnpm fix` fails in restricted/offline environments, use `pnpm exec ultracite fix` (no network fetch via `npx`).

## Troubleshooting

1. `column "ui_spec" does not exist`:
   - Apply SQL in the prerequisites section.
2. `Failed to refresh OIDC token ... Have you linked your project with vc link?`:
   - Use an OIDC token, or provide both team/project ids explicitly.
3. `db:migrate` tries to create existing tables:
   - Your DB migration history table is out of sync. Baseline `drizzle.__drizzle_migrations` before rerunning.
4. `db:push` crashes in drizzle introspection with `checkValue.replace`:
   - Use migration SQL/manual apply path until drizzle-kit is upgraded.
