#!/bin/bash
set -euo pipefail

CDP_PORT="${1:?Usage: $0 <cdp-port> [output-dir]}"
OUTPUT_DIR="${2:-./captures}"

mkdir -p "$OUTPUT_DIR/screenshots" "$OUTPUT_DIR/snapshots" "$OUTPUT_DIR/network"

agent-browser connect "$CDP_PORT"
agent-browser tab >"$OUTPUT_DIR/targets.txt"
agent-browser screenshot --annotate "$OUTPUT_DIR/screenshots/initial.png"
agent-browser snapshot -i >"$OUTPUT_DIR/snapshots/initial.txt"
agent-browser get title >"$OUTPUT_DIR/page-title.txt"

echo "Captured initial Electron session artifacts under $OUTPUT_DIR"
echo "Next: switch to the correct target if needed, then capture flows and observed requests."
