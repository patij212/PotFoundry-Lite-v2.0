#!/usr/bin/env bash
# S65 — targeted longest-edge bisection on the over-bar facets. Per-tool outfile _run_s65.cjs.
set -uo pipefail
cd "$(dirname "$0")/../.."
TAG="${1:-SPLIT}"
export PF_S65_TAG="$TAG"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S65_SPLIT_${TAG}.report.txt"
npx esbuild research/tools/s65SplitAndFlip.ts --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s65.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$OUT/_run_s65.cjs" 2>&1 | tee "$REPORT" &
NPID=$!
sleep 3
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { \$_.StartTime -gt (Get-Date).AddSeconds(-20) } | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
echo "report written to $REPORT"
