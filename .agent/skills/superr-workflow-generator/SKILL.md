---
name: superr-workflow-generator
description: Generate and save AI-powered automation workflows to the superr-workflow-builder database. Use this skill when the user asks you to create, build, or design a workflow. The workflow will be saved automatically and will appear in the web app for the user to run.
---

# Superr Workflow Generator

This skill lets you create automation workflows for the superr-workflow-builder by describing them in plain English. The generated workflow is saved directly to the database and immediately visible in the web app.

## Prerequisites

- A `wfb_` API key with `workflow:compose` and `workflow:write` scopes (set as `WORKFLOW_AGENT_KEY` in your environment, or ask the user for it).
- The app must be running or deployed (set `WORKFLOW_APP_URL` to the base URL, e.g. `http://localhost:3000`).

## How to Generate a Workflow

### Step 1 — Understand the request

Ask the user what the workflow should do. Understand:
- **Trigger**: How does the workflow start? (Manual, Webhook, Schedule, etc.)
- **Steps**: What actions should happen in sequence or in parallel?
- **Data flow**: Does one step's output feed into another step?

### Step 2 — Choose actions from the registry

Read `resources/actions.json` in this skill directory to discover all available plugin actions. Each entry has:
- `id` — the `actionType` value to use in the node config (e.g. `"ai-gateway/generate-text"`)
- `label` — human-readable name
- `configFields` — required and optional fields per action
- `outputFields` — fields this action produces (available as `{{NodeName.field}}` references)

### Step 3 — Compose the workflow JSON

Build a JSON object with the following structure:

```json
{
  "name": "My Workflow Name",
  "description": "Optional description",
  "nodes": [...],
  "edges": [...]
}
```

#### Node schema

Every workflow needs at least one **trigger** node:

```json
{
  "id": "trigger-1",
  "type": "trigger",
  "position": { "x": 100, "y": 200 },
  "data": {
    "label": "Webhook Trigger",
    "description": "Receives incoming webhook",
    "type": "trigger",
    "config": { "triggerType": "Webhook" },
    "status": "idle"
  }
}
```

Valid `triggerType` values: `"Manual"`, `"Webhook"`, `"Schedule"`.

Action nodes use `actionType` to specify which plugin action runs:

```json
{
  "id": "action-1",
  "type": "action",
  "position": { "x": 400, "y": 200 },
  "data": {
    "label": "Generate Summary",
    "description": "Summarize the incoming data",
    "type": "action",
    "config": {
      "actionType": "ai-gateway/generate-text",
      "aiModel": "meta/llama-4-scout",
      "aiPrompt": "Summarize: {{Webhook Trigger.body}}"
    },
    "status": "idle"
  }
}
```

**Referencing previous node outputs** in config fields: use `{{NodeLabel.fieldName}}` where `NodeLabel` is the `data.label` value of the source node and `fieldName` is one of its `outputFields`.

#### Edge schema

Edges connect nodes source → target:

```json
{
  "id": "edge-1",
  "source": "trigger-1",
  "target": "action-1",
  "type": "animated"
}
```

#### Positioning guidelines

- Trigger node starts at `{ x: 100, y: 200 }`.
- Each subsequent action node steps `x` by `+300`.
- If branches split (e.g. after a condition), offset `y` by `+150` and `-150`.

### Step 4 — Save the workflow via API

Use `curl` to POST the workflow JSON to the save endpoint:

```bash
curl -s -X POST "${WORKFLOW_APP_URL}/api/agent/workflows/save" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WORKFLOW_AGENT_KEY}" \
  -d '{
    "name": "My Workflow",
    "description": "Optional description",
    "nodes": [...],
    "edges": [...]
  }'
```

A successful response contains the saved workflow ID:

```json
{
  "id": "wf_abc123",
  "name": "My Workflow",
  "createdAt": "2026-02-21T...",
  "updatedAt": "2026-02-21T..."
}
```

### Step 5 — Report to the user

Tell the user:
- The workflow name.
- The direct link: `${WORKFLOW_APP_URL}/workflow/<id>`
- A brief summary of what nodes were created.

---

## Example: Fetch user data and send a Slack notification

**Prompt**: "Create a workflow that fetches a user from JSONPlaceholder when triggered by a webhook, then sends their name to Slack."

**Resulting JSON**:

```json
{
  "name": "Fetch User and Notify Slack",
  "description": "Fetches user data from JSONPlaceholder and posts to Slack",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Webhook Trigger",
        "type": "trigger",
        "config": { "triggerType": "Webhook" },
        "status": "idle"
      }
    },
    {
      "id": "action-1",
      "type": "action",
      "position": { "x": 400, "y": 200 },
      "data": {
        "label": "Fetch User",
        "description": "GET user from JSONPlaceholder",
        "type": "action",
        "config": {
          "actionType": "bash/run-command",
          "command": "curl -s https://jsonplaceholder.typicode.com/users/{{Webhook Trigger.body.userId}}"
        },
        "status": "idle"
      }
    },
    {
      "id": "action-2",
      "type": "action",
      "position": { "x": 700, "y": 200 },
      "data": {
        "label": "Notify Slack",
        "description": "Post user name to Slack",
        "type": "action",
        "config": {
          "actionType": "slack/send-message",
          "slackChannel": "#notifications",
          "slackMessage": "New user fetched: {{Fetch User.stdout}}"
        },
        "status": "idle"
      }
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "trigger-1", "target": "action-1", "type": "animated" },
    { "id": "edge-2", "source": "action-1", "target": "action-2", "type": "animated" }
  ]
}
```

---

## Refreshing the Actions List

If new plugins have been added to the app, regenerate `resources/actions.json` by running:

```bash
pnpm skill:update-actions
```
