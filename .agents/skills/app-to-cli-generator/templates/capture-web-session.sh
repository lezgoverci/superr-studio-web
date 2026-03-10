#!/bin/bash
set -euo pipefail

TARGET_URL="${1:?Usage: $0 <target-url> [output-dir]}"
OUTPUT_DIR="${2:-./captures}"

mkdir -p "$OUTPUT_DIR/screenshots" "$OUTPUT_DIR/snapshots" "$OUTPUT_DIR/network"

agent-browser open "$TARGET_URL" --waitUntil domcontentloaded
agent-browser wait --load domcontentloaded
agent-browser wait 1000
agent-browser network requests --clear --json
agent-browser open "$TARGET_URL" --waitUntil domcontentloaded
agent-browser wait --load domcontentloaded
agent-browser wait 1000

agent-browser screenshot --annotate "$OUTPUT_DIR/screenshots/initial.png"
agent-browser snapshot -i >"$OUTPUT_DIR/snapshots/initial.txt"
agent-browser snapshot -i --json >"$OUTPUT_DIR/snapshots/initial.json"
agent-browser get title >"$OUTPUT_DIR/page-title.txt"
agent-browser get url >"$OUTPUT_DIR/final-url.txt"
agent-browser network requests --json >"$OUTPUT_DIR/network/initial.json"

echo "Captured initial web session artifacts under $OUTPUT_DIR"
echo "Next: walk the main navigation, save additional snapshots, and harvest request recipes."
