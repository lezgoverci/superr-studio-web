#!/usr/bin/env bash
# Superr AI Agent Installer
# Installs OpenCode and starts it as a local API server so the Superr Workflow
# Builder can use your own AI subscriptions (Gemini, Anthropic, OpenAI, etc.)
# without any cloud infrastructure.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SUPERR_CONFIG_DIR="$HOME/.config/superr-ai"
OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
OPENCODE_CONFIG="$OPENCODE_CONFIG_DIR/opencode.json"
SERVER_HOSTNAME="127.0.0.1"
SERVER_PORT=4096
SERVER_USERNAME="superr"
# A simple random token for local auth
SERVER_TOKEN=$(LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 32 2>/dev/null || echo "superr-local-$(date +%s)")

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}Superr AI Agent Installer${NC}"
  echo -e "${CYAN}─────────────────────────────────${NC}"
  echo ""
}

step() {
  echo -e "${CYAN}→${NC} $1"
}

ok() {
  echo -e "${GREEN}✓${NC} $1"
}

warn() {
  echo -e "${YELLOW}⚠${NC}  $1"
}

die() {
  echo -e "${RED}✗${NC} $1" >&2
  exit 1
}

check_install_bun() {
  if command -v bun &>/dev/null; then
    ok "Bun runtime already installed ($(bun --version))"
    return
  fi

  step "Installing Bun runtime..."
  curl -fsSL https://bun.sh/install | bash
  # Source the bun environment for the rest of this script
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  ok "Bun installed"
}

check_install_opencode() {
  if command -v opencode &>/dev/null; then
    ok "OpenCode already installed ($(opencode --version 2>/dev/null || echo 'unknown version'))"
    return
  fi

  step "Installing OpenCode..."
  curl -fsSL https://opencode.ai/install | bash

  # Add to PATH for the rest of this script
  OPENCODE_BIN_DIR="$HOME/.opencode/bin"
  export PATH="$OPENCODE_BIN_DIR:$PATH"

  if ! command -v opencode &>/dev/null; then
    # Try loading from common paths
    for dir in "$HOME/.opencode/bin" "$HOME/.local/bin" "/usr/local/bin"; do
      if [[ -x "$dir/opencode" ]]; then
        export PATH="$dir:$PATH"
        break
      fi
    done
  fi

  command -v opencode &>/dev/null || die "OpenCode installation failed. Please install manually: npm i -g opencode-ai"
  ok "OpenCode installed"
}

write_opencode_config() {
  step "Configuring OpenCode..."
  mkdir -p "$OPENCODE_CONFIG_DIR"

  # If config already exists, preserve existing settings and merge
  if [[ -f "$OPENCODE_CONFIG" ]]; then
    warn "OpenCode config already exists at $OPENCODE_CONFIG — updating CORS and plugin settings"
    # Add cors whitelist if not already present (simple sed approach)
    # Full merge is complex; we just inform the user and overwrite cors/plugin fields
    EXISTING=true
  else
    EXISTING=false
  fi

  cat > "$OPENCODE_CONFIG" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-gemini-auth@latest"],
  "server": {
    "hostname": "${SERVER_HOSTNAME}",
    "port": ${SERVER_PORT},
    "cors": ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]
  },
  "keybinds": {}
}
EOF

  ok "OpenCode configured at $OPENCODE_CONFIG"

  # Save the token for reconnection
  mkdir -p "$SUPERR_CONFIG_DIR"
  cat > "$SUPERR_CONFIG_DIR/server.json" <<EOF
{
  "url": "http://localhost:${SERVER_PORT}",
  "username": "${SERVER_USERNAME}",
  "token": "${SERVER_TOKEN}",
  "port": ${SERVER_PORT}
}
EOF
  ok "Connection details saved to $SUPERR_CONFIG_DIR/server.json"
}

start_opencode_server() {
  step "Starting OpenCode API server on port ${SERVER_PORT}..."

  # Kill any previous opencode server process
  pkill -f "opencode.*serve" 2>/dev/null || true
  EXISTING_LISTENER_PIDS=$(lsof -nP -iTCP:"${SERVER_PORT}" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "${EXISTING_LISTENER_PIDS}" ]]; then
    kill -9 ${EXISTING_LISTENER_PIDS} 2>/dev/null || true
  fi
  sleep 1

  # Start OpenCode API server
  OPENCODE_SERVER_PASSWORD="${SERVER_TOKEN}" \
  OPENCODE_SERVER_USERNAME="${SERVER_USERNAME}" \
  nohup opencode \
    serve \
    --port "${SERVER_PORT}" \
    --hostname "${SERVER_HOSTNAME}" \
    --cors "http://localhost:3000" \
    --cors "http://localhost:3001" \
    --cors "http://localhost:3002" \
    > "$SUPERR_CONFIG_DIR/opencode.log" 2>&1 &

  SERVER_PID=$!
  echo $SERVER_PID > "$SUPERR_CONFIG_DIR/server.pid"

  # Wait for server to start
  echo -n "   Waiting for server"
  for i in $(seq 1 15); do
    sleep 1
    echo -n "."
    if curl -s -u "${SERVER_USERNAME}:${SERVER_TOKEN}" "http://localhost:${SERVER_PORT}/app" >/dev/null 2>&1; then
      echo ""
      ok "OpenCode server is running (PID: $SERVER_PID)"
      return
    fi
  done

  echo ""
  warn "Server may still be starting. Check logs at: $SUPERR_CONFIG_DIR/opencode.log"
}

print_connection_info() {
  echo ""
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  Superr AI Agent is ready!${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  ${BOLD}Copy these into the Superr web app:${NC}"
  echo ""
  echo -e "  Server URL:  ${CYAN}http://localhost:${SERVER_PORT}${NC}"
  echo -e "  Auth Token:  ${CYAN}${SERVER_TOKEN}${NC}"
  echo ""
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  ${BOLD}Next: Connect your AI subscriptions${NC}"
  echo ""
  echo -e "  ${BOLD}Gemini (Google)${NC} — free tier available:"
  echo -e "  ${CYAN}opencode auth login${NC}  then choose Google"
  echo ""
  echo -e "  ${BOLD}Anthropic / OpenAI${NC} — use an API key:"
  echo -e "  Configure in the Superr web app after connecting."
  echo ""
  echo -e "  Logs: ${SUPERR_CONFIG_DIR}/opencode.log"
  echo ""
}

print_stop_instructions() {
  echo -e "  ${BOLD}To stop the server:${NC}  ${CYAN}pkill -f opencode${NC}"
  echo -e "  ${BOLD}To restart:${NC}          ${CYAN}./install-superr-ai.sh${NC}"
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────

banner
check_install_bun
check_install_opencode
write_opencode_config
start_opencode_server
print_connection_info
print_stop_instructions
