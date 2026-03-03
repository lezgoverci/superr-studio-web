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

## How It Works

Changes are broadcast in real-time to the user's canvas via Server-Sent Events (SSE). The user sees updates instantly as you make them. The changes are NOT saved to the database automatically — the user must manually save when satisfied.

## Workflow Editing Process

### Step 1: Get the workflow ID

The `pageContext` contains the workflow ID when viewing the canvas:

- `pageContext.pageType` is `"workflow-editor"`
- `pageContext.entities.workflowId` contains the ID (e.g., `"wf_abc123"`)

If the ID is not available, ask the user which workflow to edit.

### Step 2: Understand the current workflow

You can either:

- **Fetch the workflow**: Use GET to understand the current structure
- **Ask the user**: What does your workflow currently look like?

### Step 3: Find available actions (when adding nodes)

Read `resources/actions.json` to discover action types. Each entry has:

- `id` — the `actionType` value (e.g., `"ai-gateway/generate-text"`)
- `label` — human-readable name
- `configFields` — required and optional fields

### Step 4: Make modifications (broadcast to canvas)

Send operations via PATCH. Each operation is broadcast instantly to the canvas:

```bash
curl -s -X PATCH "${WORKFLOW_APP_URL}/api/agent/workflows/${workflowId}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WORKFLOW_AGENT_KEY}" \
  -d '{
    "operations": [
      { "op": "addNode", "node": { ... } },
      { "op": "addEdge", "edge": { ... } }
    ]
  }'
```

**Available Operations:**

| Operation    | Description                           |
| ------------ | ------------------------------------- |
| `addNode`    | Add a new node to the canvas          |
| `addEdge`    | Connect two nodes                     |
| `removeNode` | Remove a node and its connected edges |
| `removeEdge` | Remove a specific edge                |
| `updateNode` | Update node position or data          |
| `updateEdge` | Update edge source/target             |
| `replaceAll` | Replace entire nodes/edges arrays     |

**Operation Examples:**

```json
// Add a node
{ "op": "addNode", "node": { "id": "action-3", "type": "action", "position": { "x": 700, "y": 200 }, "data": { ... } } }

// Add an edge
{ "op": "addEdge", "edge": { "id": "edge-3", "source": "action-2", "target": "action-3" } }

// Remove a node
{ "op": "removeNode", "nodeId": "action-1" }

// Update node position
{ "op": "updateNode", "nodeId": "action-1", "updates": { "position": { "x": 500, "y": 300 } } }

// Update node data
{ "op": "updateNode", "nodeId": "action-1", "updates": { "data": { "label": "New Label" } } }

// Replace all (full refresh)
{ "op": "replaceAll", "nodes": [...], "edges": [...] }
```

### Step 5: Real-time updates

The canvas updates automatically via SSE. The user sees changes instantly as you broadcast operations.

### Step 6: Report to user

Tell the user:

- What changed (added/removed/modified nodes)
- Remind them to save the workflow when satisfied
- Provide the link: `${WORKFLOW_APP_URL}/workflow/${workflowId}`

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

- Operations are broadcast in real-time via SSE — the user sees changes instantly
- Changes are NOT saved to the database automatically — the user must click Save
- Validate edge references point to existing node IDs
- Use `{{NodeLabel.fieldName}}` for referencing previous node outputs
- If the user refreshes the page, changes are lost unless they saved
