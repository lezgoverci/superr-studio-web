---
name: superr-workflow-editor
description: Edit an existing workflow on the Superr canvas. Use this skill whenever the user wants to modify, add, remove, or rearrange nodes in a workflow they are currently viewing. This skill handles workflow editing — not creation (use superr-workflow-generator for that).
---

# Superr Workflow Editor

Edit existing workflows on the Superr canvas. The user must already have a workflow open on the canvas.

## Prerequisites

- A `wfb_` API key with `workflow:write` scope. Set as `WORKFLOW_AGENT_KEY` in your environment, or ask the user for it.
- The app URL. Set `WORKFLOW_APP_URL` (e.g., `http://localhost:3000`).

## When to Use This Skill

Use this skill when the user:

- Asks to add, remove, or modify nodes in their current workflow
- Wants to change the order of steps
- Asks to connect or disconnect nodes
- Requests changes to an existing workflow they are viewing

Do NOT use this skill when:

- The user wants to create a NEW workflow (use `superr-workflow-generator` instead)
- The user is not viewing a specific workflow

## Workflow Editing Process

### Step 1: Get the workflow ID

The `pageContext` contains the workflow ID when viewing the canvas:

- `pageContext.pageType` is `"workflow-editor"`
- `pageContext.entities.workflowId` contains the ID (e.g., `"wf_abc123"`)

If the ID is not available, ask the user which workflow to edit.

### Step 2: Fetch the current workflow

```bash
curl -s "${WORKFLOW_APP_URL}/api/agent/workflows/${workflowId}" \
  -H "Authorization: Bearer ${WORKFLOW_AGENT_KEY}"
```

Response contains: `id`, `name`, `description`, `nodes`, `edges`, `createdAt`, `updatedAt`.

### Step 3: Understand the structure

- **Nodes**: `{ id, type, position: {x, y}, data: { label, description, config, status } }`
- **Edges**: `{ id, source, target, type }`

### Step 4: Find available actions (when adding nodes)

Read `resources/actions.json` to discover action types. Each entry has:

- `id` — the `actionType` value (e.g., `"ai-gateway/generate-text"`)
- `label` — human-readable name
- `configFields` — required and optional fields

### Step 5: Make modifications

**Adding a node:**

1. Create new node with unique ID (e.g., `action-3`)
2. Position at `x + 300` from previous node
3. Add edge connecting to/from

**Removing a node:**

1. Remove from `nodes` array
2. Remove all connected edges

**Editing a node:**

- Update `data.label`, `data.description`, or `data.config`

**Reconnecting edges:**

- Change `source` or `target` to different node IDs

### Step 6: Save changes

```bash
curl -s -X PATCH "${WORKFLOW_APP_URL}/api/agent/workflows/${workflowId}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WORKFLOW_AGENT_KEY}" \
  -d '{"nodes": [...], "edges": [...]}'
```

### Step 7: Report to user

Tell the user:

- What changed (added/removed/modified nodes)
- Link: `${WORKFLOW_APP_URL}/workflow/${workflowId}`

## Node Reference

### Trigger Node

```json
{
  "id": "trigger-1",
  "type": "trigger",
  "position": { "x": 100, "y": 200 },
  "data": {
    "label": "Webhook Trigger",
    "description": "Receives webhook",
    "type": "trigger",
    "config": { "triggerType": "Webhook" },
    "status": "idle"
  }
}
```

`triggerType` values: `"Manual"`, `"Webhook"`, `"Schedule"`.

### Action Node

```json
{
  "id": "action-1",
  "type": "action",
  "position": { "x": 400, "y": 200 },
  "data": {
    "label": "Generate Summary",
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

### Edge

```json
{
  "id": "edge-1",
  "source": "trigger-1",
  "target": "action-1",
  "type": "default"
}
```

### Positioning

- Trigger: `{x: 100, y: 200}`
- Each action: `x + 300`
- Branching: `y ± 150`

## Important Notes

- Always fetch the latest workflow before editing (may have changed)
- Validate edge references point to existing node IDs
- Use `{{NodeLabel.fieldName}}` for referencing previous node outputs
