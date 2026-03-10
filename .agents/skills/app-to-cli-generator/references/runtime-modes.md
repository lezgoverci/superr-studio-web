# Runtime Modes

Generated commands support three execution modes.

## `auto`

Default for commands that have both:

- a stable `requestRecipeId`
- a viable `flowId`

Behavior:

1. Try the API recipe first.
2. If it fails and a UI flow exists, fall back to UI automation.

Use `auto` only when the auth and request shape are reproducible.

## `api`

Runs only the harvested request recipe.

Use this when:

- the endpoint is stable
- CLI output is cleaner than screen-scraped text
- cookies or storage-backed auth are enough to replay the request

Avoid `api` when the app signs every request with short-lived data you cannot reconstruct.

## `ui`

Runs only the browser or Electron automation flow through `agent-browser`.

Use this when:

- the action exists only in the UI
- the request pattern is unstable
- the page content itself is the output you want

## Choosing Modes

Recommended default:

- reads with good HTTP evidence: `auto`
- simple screen-scraped reads: `ui`
- UI-only mutations: `ui`
- stable HTTP mutations: `auto`

If in doubt, keep the command UI-backed and document the uncertainty in `regeneration.sourceNotes`.
