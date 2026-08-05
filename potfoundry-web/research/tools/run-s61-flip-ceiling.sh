#!/usr/bin/env bash
# S61 — K4, the CONNECTIVITY CEILING. Read-only over a finished STL, single-threaded.
# Per-tool bundle name (_run_s61.cjs).
#
# Usage:  bash research/tools/run-s61-flip-ceiling.sh <TAG>
#   env:  PF_S61_PATH=<stl>  PF_S61_K=12  PF_S61_NPTS=20000  PF_S61_POS=1
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:-CEIL}"
export PF_S61_TAG="$TAG"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S61_CEILING_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling (per-tool outfile _run_s61.cjs) ──"
npx esbuild research/tools/s61FlipCeiling.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s61.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=10240
node "$OUT/_run_s61.cjs" 2>&1 | tee "$REPORT" &
NPID=$!
sleep 3
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { \$_.StartTime -gt (Get-Date).AddSeconds(-20) } | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
echo
echo "report written to $REPORT"
