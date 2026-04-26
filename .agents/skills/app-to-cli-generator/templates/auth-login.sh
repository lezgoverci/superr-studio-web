#!/bin/bash
set -euo pipefail

LOGIN_URL="${1:?Usage: $0 <login-url> [state-file]}"
STATE_FILE="${2:-./captures/auth/auth-state.json}"

: "${APP_USERNAME:?Set APP_USERNAME in the environment}"
: "${APP_PASSWORD:?Set APP_PASSWORD in the environment}"

mkdir -p "$(dirname "$STATE_FILE")"

if [[ -f "$STATE_FILE" ]]; then
  echo "Loading existing auth state from $STATE_FILE"
  agent-browser state load "$STATE_FILE"
fi

agent-browser open "$LOGIN_URL"
agent-browser wait --load networkidle

echo "Inspect the interactive snapshot and replace @e1/@e2/@e3 before reusing this template."
agent-browser snapshot -i

# Example login flow:
# agent-browser fill @e1 "$APP_USERNAME"
# agent-browser fill @e2 "$APP_PASSWORD"
# agent-browser click @e3
# agent-browser wait --load networkidle
# agent-browser state save "$STATE_FILE"

echo "Auth helper finished. Update the selectors before relying on it."
