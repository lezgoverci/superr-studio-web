#!/usr/bin/env bash
set -euo pipefail

# Required env vars:
#   COMPOSE_KEY, WRITE_KEY, EXEC_KEY, WEBHOOK_KEY
# Optional:
#   BASE_URL (default: http://localhost:3000)
#   MODEL (default: anthropic/claude-haiku-4.5)
#   AUTO_OPEN=1 to open run page on macOS

BASE_URL="${BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"
MODEL="${MODEL:-anthropic/claude-haiku-4.5}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || {
    echo "Missing required env var: $name" >&2
    exit 1
  }
}

request_json() {
  local method="$1"
  local url="$2"
  local key="$3"
  local data="${4:-}"
  local tmp status

  tmp="$(mktemp)"
  if [[ -n "$data" ]]; then
    status="$(curl -sS -o "$tmp" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $key" \
      -H "Content-Type: application/json" \
      -d "$data")"
  else
    status="$(curl -sS -o "$tmp" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $key")"
  fi

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "HTTP $status -> $method $url" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi

  cat "$tmp"
  rm -f "$tmp"
}

request_expect_status() {
  local method="$1"
  local url="$2"
  local key="$3"
  local expected="$4"
  local data="${5:-}"
  local tmp status

  tmp="$(mktemp)"
  if [[ -n "$data" ]]; then
    status="$(curl -sS -o "$tmp" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $key" \
      -H "Content-Type: application/json" \
      -d "$data")"
  else
    status="$(curl -sS -o "$tmp" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $key")"
  fi

  if [[ "$status" != "$expected" ]]; then
    echo "Expected HTTP $expected but got $status -> $method $url" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi

  cat "$tmp"
  rm -f "$tmp"
}

require_cmd curl
require_cmd jq
require_env COMPOSE_KEY
require_env WRITE_KEY
require_env EXEC_KEY
require_env WEBHOOK_KEY

echo "== Step 4: compose stream test =="
STREAM_FILE="$(mktemp)"
COMPOSE_PAYLOAD="$(jq -nc \
  --arg prompt "Create a simple manual trigger workflow with one HTTP Request action" \
  --arg model "$MODEL" \
  '{prompt:$prompt, model:$model}')"

curl -sS -N "$BASE_URL/api/agent/workflows/compose" \
  -H "Authorization: Bearer $COMPOSE_KEY" \
  -H "Content-Type: application/json" \
  -d "$COMPOSE_PAYLOAD" | tee "$STREAM_FILE"

OPS_COUNT="$(jq -r 'select(.type=="operation") | .type' "$STREAM_FILE" | wc -l | tr -d ' ')"
COMPLETE_COUNT="$(jq -r 'select(.type=="complete") | .type' "$STREAM_FILE" | wc -l | tr -d ' ')"

if [[ "$OPS_COUNT" -eq 0 || "$COMPLETE_COUNT" -eq 0 ]]; then
  echo "Compose stream did not produce expected operation/complete messages." >&2
  exit 1
fi
echo "Compose stream OK: operations=$OPS_COUNT"

echo
echo "== Step 5: create + ui-spec + patch + execute =="
CREATE_PAYLOAD="$(jq -nc '{
  name: "Agent Route Test",
  description: "Scripted test workflow",
  nodes: [],
  edges: [],
  visibility: "private"
}')"

CREATE_RESP="$(request_json POST "$BASE_URL/api/agent/workflows" "$WRITE_KEY" "$CREATE_PAYLOAD")"
WF_ID="$(echo "$CREATE_RESP" | jq -r '.id // empty')"
[[ -n "$WF_ID" ]] || { echo "Failed to parse workflow id"; exit 1; }
echo "Created workflow: $WF_ID"

UI_PAYLOAD="$(jq -nc \
  --arg prompt "Build a run form with one input field labeled Customer ID and a submit button." \
  --arg summary "Manual trigger workflow used for integration test." \
  --arg model "$MODEL" \
  '{prompt:$prompt, workflowSummary:$summary, model:$model}')"

UI_RESP="$(request_json POST "$BASE_URL/api/agent/workflows/ui-spec/compose" "$COMPOSE_KEY" "$UI_PAYLOAD")"
SPEC="$(echo "$UI_RESP" | jq -c '.spec // empty')"
[[ -n "$SPEC" ]] || { echo "Failed to generate ui spec"; exit 1; }

PATCH_PAYLOAD="$(jq -nc --argjson spec "$SPEC" '{
  uiSpec: $spec,
  uiSpecVersion: "1",
  uiMetadata: { generatedBy: "steps-4-7-script" }
}')"

PATCH_RESP="$(request_json PATCH "$BASE_URL/api/agent/workflows/$WF_ID" "$WRITE_KEY" "$PATCH_PAYLOAD")"
echo "Patched workflow ui spec: $(echo "$PATCH_RESP" | jq -r '.uiSpecVersion // "null"')"

EXEC_PAYLOAD="$(jq -nc '{input:{customerId:"cust_123"}}')"
EXEC_RESP="$(request_json POST "$BASE_URL/api/agent/workflows/$WF_ID/execute" "$EXEC_KEY" "$EXEC_PAYLOAD")"
EXEC_ID="$(echo "$EXEC_RESP" | jq -r '.executionId // empty')"
[[ -n "$EXEC_ID" ]] || { echo "Failed to parse execution id"; exit 1; }
echo "Execution started: $EXEC_ID"

echo
echo "== Step 6: run page URL =="
RUN_URL="$BASE_URL/workflows/$WF_ID/run"
echo "Open this page and submit the generated form:"
echo "$RUN_URL"

if [[ "${AUTO_OPEN:-0}" == "1" ]] && command -v open >/dev/null 2>&1; then
  open "$RUN_URL" >/dev/null 2>&1 || true
fi

echo
echo "== Step 7: webhook scope enforcement =="
HOOK_PATH="/webhooks/test-$RANDOM"
WEBHOOK_CREATE_PAYLOAD="$(jq -nc --arg path "$HOOK_PATH" '{
  name: "Webhook Scope Test",
  description: "Webhook scope test workflow",
  visibility: "private",
  nodes: [
    {
      id: "trigger-1",
      type: "trigger",
      position: {x:100, y:200},
      data: {
        label: "Webhook Trigger",
        description: "",
        type: "trigger",
        config: {triggerType: "Webhook", webhookPath: $path},
        status: "idle"
      }
    }
  ],
  edges: []
}')"

WEBHOOK_CREATE_RESP="$(request_json POST "$BASE_URL/api/agent/workflows" "$WRITE_KEY" "$WEBHOOK_CREATE_PAYLOAD")"
WEBHOOK_WF_ID="$(echo "$WEBHOOK_CREATE_RESP" | jq -r '.id // empty')"
[[ -n "$WEBHOOK_WF_ID" ]] || { echo "Failed to create webhook workflow"; exit 1; }

WEBHOOK_BODY="$(jq -nc '{ping:true, source:"steps-4-7-script"}')"
WEBHOOK_OK_RESP="$(request_json POST "$BASE_URL/api/workflows/$WEBHOOK_WF_ID/webhook" "$WEBHOOK_KEY" "$WEBHOOK_BODY")"
WEBHOOK_EXEC_ID="$(echo "$WEBHOOK_OK_RESP" | jq -r '.executionId // empty')"
[[ -n "$WEBHOOK_EXEC_ID" ]] || { echo "Webhook call succeeded but no executionId"; exit 1; }
echo "Webhook execution started: $WEBHOOK_EXEC_ID"

echo "Validating missing-scope behavior (using EXEC_KEY against webhook endpoint)..."
request_expect_status POST "$BASE_URL/api/workflows/$WEBHOOK_WF_ID/webhook" "$EXEC_KEY" "403" "$WEBHOOK_BODY" >/dev/null
echo "Scope enforcement OK (403 received for non-webhook-scoped key)."

echo
echo "All steps 4-7 completed successfully."
echo "Workflow ID: $WF_ID"
echo "Run URL: $RUN_URL"
echo "Webhook Workflow ID: $WEBHOOK_WF_ID"
