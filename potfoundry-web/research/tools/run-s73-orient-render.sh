#!/usr/bin/env bash
# S73 — three-panel orientation render. Read-only, single-threaded.
# Bundle name is PER-TOOL (_run_s73.cjs): two agents collided on a shared bundle name on 2026-08-05.
#
#   bash research/tools/run-s73-orient-render.sh [TAG]
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:-A}"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S73_RENDER_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s73OrientRender.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s73.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=6144
node "$OUT/_run_s73.cjs" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
