#!/usr/bin/env bash
# S71 — can a single split fix a TURNING facet? Read-only over finished STLs, single-threaded.
# Bundle name is PER-TOOL (_run_s71.cjs): two agents collided on a shared bundle name on 2026-08-05.
#
#   bash research/tools/run-s71-orient-achievable.sh [TAG]
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:-A}"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S71_ACHIEVABLE_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s71OrientAchievable.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s71.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=6144
node "$OUT/_run_s71.cjs" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
