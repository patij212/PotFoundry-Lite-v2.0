#!/usr/bin/env bash
# S70 — the orientation ruler on real meshes. Read-only over finished STLs, single-threaded.
# Bundle name is PER-TOOL (_run_s70.cjs): two agents collided on a shared bundle name on 2026-08-05.
#
#   bash research/tools/run-s70-orient-census.sh [TAG]
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:-A}"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S70_ORIENT_CENSUS_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s70OrientCensus.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s70.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=6144
node "$OUT/_run_s70.cjs" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
