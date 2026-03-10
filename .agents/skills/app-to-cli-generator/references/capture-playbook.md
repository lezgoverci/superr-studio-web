# Capture Playbook

Capture the target from the live product only. Do not inspect its source code.

## Goals

- Map the app's main nouns and verbs
- Save enough evidence to build stable commands
- Separate API-backed flows from UI-only flows
- Preserve auth state for later replay

## Web Targets

1. Open the target and record the home route.
2. Use bounded waits. Prefer `wait --load domcontentloaded` plus a short explicit wait over relying entirely on `networkidle`.
3. Prime request tracking explicitly before flows:
   - `agent-browser network requests --clear`
   - reload or perform the action
   - `agent-browser network requests --json`
4. Save an annotated screenshot plus both text and JSON snapshots.
5. Visit each top-level navigation area.
6. For each area, identify:
   - list views
   - detail views
   - filters and search
   - create or update actions
   - publish, deploy, run, or destructive actions
7. While performing the flow, inspect network traffic and note:
   - method
   - URL
   - query params when visible
   - auth behavior
   - resource type
8. Save auth state once the session is valid.

Recommended artifacts:

- `captures/screenshots/*.png`
- `captures/snapshots/*.txt`
- `captures/snapshots/*.json`
- `captures/pages/*.json`
- `captures/network/*.json`
- `captures/auth/auth-state.json`
- `captures/site-capture.json`

## Electron Targets

Only support Chromium-based Electron apps exposed over CDP.

1. Launch the app with a remote debugging port if needed.
2. Connect with `agent-browser connect <port>`.
3. Run `agent-browser tab` and identify the correct page or webview.
4. Capture snapshots, screenshots, and network activity exactly as you would for a web app.
5. If the app uses multiple webviews, note the target selection needed for each flow.

If CDP connection is not possible, stop. This skill does not support arbitrary native desktop automation.

## Auth Strategy

Prefer saved state over re-entering credentials:

- Web: `agent-browser state save <path>`
- Electron: use the same state save flow once the connected target is authenticated

Never store raw credentials in the manifest. Refer to environment variables in login flows instead.

## Command Discovery Heuristics

Good candidates:

- top-level nav items
- visible buttons and menu actions
- stable API resources
- page headings that map cleanly to nouns

Avoid:

- transient onboarding UI
- one-off promo or marketing elements
- commands that require hidden data you cannot reliably capture

## Request Harvesting Rules

Promote a request into `requestRecipes` only when:

- the endpoint is stable
- required headers are reproducible
- cookies or storage-backed auth can be replayed
- the response is useful in CLI form

If request logs are thin or empty, fall back to route and runtime heuristics from the observed page. Do not inspect the target's source repository.

Keep the UI flow even when an API recipe exists. It is the fallback path.

## Minimum V1 Coverage

Capture at least:

- one read-only command backed by API
- one read-only command backed by UI
- one mutating command if the user wants write access
- the login flow if auth is required
