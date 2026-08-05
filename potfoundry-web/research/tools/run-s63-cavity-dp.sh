#!/usr/bin/env bash
# S63 — CAVITY DP (exact min-max retriangulation of 4-facet hexagonal cavities). Read-only over a
# finished STL, single-threaded. Per-tool bundle name (_run_s63.cjs).
#
# Usage:  bash research/tools/run-s63-cavity-dp.sh <TAG>
#   env:  PF_S63_PATH=<stl>  PF_S63_STYLE=Voronoi  PF_S63_POS=0  PF_S63_ROUNDS=N
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:-DP}"
export PF_S63_TAG="$TAG"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S63_CAVITYDP_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling (per-tool outfile _run_s63.cjs) ──"
npx esbuild research/tools/s63CavityDP.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s63.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=10240
node "$OUT/_run_s63.cjs" 2>&1 | tee "$REPORT" &
NPID=$!
sleep 3
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { \$_.StartTime -gt (Get-Date).AddSeconds(-20) } | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
echo
echo "report written to $REPORT"
