#!/usr/bin/env bash
# S34 — the seed-time chain re-solve, now WIRED INTO THE BUILDER (_strataAlignedSeed.ts stage 1a-bis,
# `resolveSpanMm`, DEFAULT OFF), A/B'd against the untouched default path.
#
# S33 (de030134) priced this by moving vertices in an already-triangulated seed and published its
# shape numbers as worst-case. The pass now runs BEFORE cdt2d, so the triangulation adapts — this is
# the honest measurement S33 stood in for.
#
# READ P1 FIRST: with the lever unset the control must reproduce S47CAV in every field. A new
# parameter that perturbs the default path is a regression whatever the arm shows.
#
# Predictions P1-P5 are registered in s34ResolveSeedAB.ts's header. Read it before the numbers.
#
# ~8 min (two seed builds + two censuses).
#
# Usage:  bash research/tools/run-s34-resolve-seed-ab.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT=research/bridge/out
mkdir -p "$OUT"
REPORT=research/exchange/_strataConformBisect/S34_RESOLVE_SEED_AB.report.txt
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s34ResolveSeedAB.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s34resolveseedab.cjs"

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s34ResolveSeedAB.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=6144

node "$OUT/_run_s34resolveseedab.cjs" 2>&1 | tee "$REPORT"

echo
echo "report written to $REPORT"
