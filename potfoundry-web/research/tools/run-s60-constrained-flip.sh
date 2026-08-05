#!/usr/bin/env bash
# S60 — the CONSTRAINED FLIP. Read-only over a finished STL, single-threaded.
# Per-tool bundle name (_run_s60.cjs) so it cannot collide with another agent's binary.
#
# Usage:  bash research/tools/run-s60-constrained-flip.sh <TAG>
#   env:  PF_S60_ARM=none|tangexc|con   PF_S60_STYLE=Voronoi   PF_S60_STEM=voronoi_ring_D--
#         PF_S60_NOPOS=1  PF_S60_NODET=1  PF_S60_LEX=1  PF_S60_DETPROBE=1  PF_S60_POS_STRIDE=N
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:-A2CON}"
export PF_S60_TAG="$TAG"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S60_FLIP_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling (per-tool outfile _run_s60.cjs) ──"
npx esbuild research/tools/s60ConstrainedFlip.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s60.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=10240
node "$OUT/_run_s60.cjs" 2>&1 | tee "$REPORT" &
NPID=$!
# Windows EcoQoS throttles detached node jobs to ~0.6 of a core; pin the tree.
sleep 3
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { \$_.StartTime -gt (Get-Date).AddSeconds(-20) } | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
echo
echo "report written to $REPORT"
