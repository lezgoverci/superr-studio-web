# Manifest Schema

The renderer consumes a single JSON manifest.

## Top-Level Keys

```json
{
  "version": 1,
  "app": {},
  "auth": {},
  "entities": [],
  "commands": [],
  "requestRecipes": [],
  "flows": [],
  "selectors": [],
  "regeneration": {}
}
```

## `app`

Required fields:

- `name`
- `slug`
- `bin`
- `platform`

Common fields:

- `defaultMode`: `auto`, `api`, or `ui`
- `homeDir`: app-specific state directory name under the user's home directory
- `defaultSessionName`
- `baseUrl` for web targets
- `electron.cdpPort` and `electron.appName` for Electron targets

## `auth`

Supported values:

```json
{
  "strategy": "none"
}
```

```json
{
  "strategy": "state-file",
  "loginUrl": "https://example.com/login",
  "stateFile": "auth-state.json",
  "loginFlowId": "auth-login",
  "env": [
    { "name": "APP_USERNAME", "description": "Login email" },
    { "name": "APP_PASSWORD", "description": "Login password", "secret": true }
  ]
}
```

## `commands`

Each command becomes a terminal subcommand.

```json
{
  "id": "projects-list",
  "path": ["projects", "list"],
  "description": "List projects",
  "mode": "auto",
  "requestRecipeId": "projects-list-api",
  "flowId": "projects-list-ui",
  "inputs": [
    {
      "name": "limit",
      "flag": "--limit",
      "type": "number",
      "description": "Maximum number of results",
      "required": false
    }
  ],
  "output": {
    "type": "json"
  }
}
```

Rules:

- `path` is an array of command segments.
- Do not use `auth`, `inspect`, `regen`, `raw`, or `help` as the first segment.
- A command must have at least one executable path:
  - `requestRecipeId`
  - `flowId`

## `requestRecipes`

Use for repeatable HTTP calls.

```json
{
  "id": "projects-list-api",
  "method": "GET",
  "url": "/api/projects",
  "headers": {
    "accept": "application/json"
  },
  "query": {
    "limit": "{{args.limit}}"
  },
  "responseType": "json",
  "useCookies": true
}
```

Supported `responseType` values:

- `json`
- `text`
- `bytes`

## `flows`

Use for UI automation or as fallback for `auto` commands.

```json
{
  "id": "projects-list-ui",
  "description": "Open the project list and capture visible text",
  "steps": [
    { "action": "loadState", "optional": true },
    { "action": "open", "url": "{{app.baseUrl}}/projects" },
    { "action": "waitForLoad", "state": "networkidle" },
    { "action": "getText", "target": "body", "saveAs": "pageText" }
  ],
  "result": {
    "capture": "pageText"
  }
}
```

Supported actions:

- `loadState`
- `saveState`
- `open`
- `connect`
- `waitForLoad`
- `wait`
- `snapshot`
- `click`
- `fill`
- `type`
- `press`
- `select`
- `getText`
- `getUrl`
- `getTitle`
- `eval`
- `screenshot`
- `close`

## `selectors`

Optional shared notes for humans. The generated runtime does not currently require them, but they are useful when regenerating flows.

```json
{
  "id": "projects-nav",
  "value": "text=Projects",
  "notes": "Main navigation link"
}
```

## `regeneration`

Use this to explain how the manifest was built.

```json
{
  "capturedAt": "2026-03-10T00:00:00.000Z",
  "source": "runtime-observation",
  "sourceNotes": [
    "Captured with agent-browser",
    "Commands inferred from top navigation and observed network requests"
  ],
  "fingerprints": {
    "target": "https://example.com"
  }
}
```

## Template Variables

Supported placeholders inside recipes and flows:

- `{{app.baseUrl}}`
- `{{app.defaultSessionName}}`
- `{{args.<name>}}`
- `{{env.<NAME>}}`
- `{{captures.<name>}}`
- `{{state.cookies.<name>}}`
- `{{state.localStorage.<name>}}`

If a placeholder resolves to an empty value, the runtime emits an empty string.
