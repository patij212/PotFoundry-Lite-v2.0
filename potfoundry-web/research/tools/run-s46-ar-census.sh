#!/usr/bin/env bash
# S42 — reproduce the S1 split guard, WITH THE SURFACE LIFT, over every facet the driver stranded as
# `shape-ar`, and answer whether the jam is a real geometric obstruction or a search that gave up.
#
# A first pass at this put the split point on the CHORD and reported 77.5% of the jam as splittable.
# `bisectAt` scores the LIFTED point — the new vertex sits on the SURFACE — so that pass was measuring
# a different mesh. This one uses liftAt/shapeAdmits/aspect3 as the driver defines them, and sweeps 97
# placements per edge against the driver's 11, so a "no legal placement" verdict is strictly stronger
# than "the driver failed".
#
# THE DECIDING COLUMN IS THE RELIEF RATIO, not the count. |lift - chord| / edgeLen > 1 means one
# bisection cannot conform at ANY placement — the answer there is connectivity, never a better nudge.
#
# Read-only against a finished STL. Runs in ~1-3 min. Safe to run while a mesher arm is in flight
# (single-threaded, ~1 GB, no shared files written).
#
# Usage:  bash research/tools/run-s42-jam-legal.sh [TAG]
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

export PF_S46_TAGS="${1:-S39CTL}"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S46_AR_CENSUS_${PF_S46_TAGS}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s46ArCensus.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s46.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s46ArCensus.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=6144
node "$OUT/_run_s46.cjs" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
