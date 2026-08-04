#!/usr/bin/env bash
# S16 BOW RULE — seed-only A/B at the S47CAV production configuration.
#
# WHAT IT ANSWERS. S47CAV's own header reports 9,363 of 349,848 seed edges CROSSING a locus — against
# 10,641 for the uniform grid the aligned seed replaced. This prices the one repair the seed builder
# already ships for that failure (`bowFrac`, _strataAlignedSeed.ts:91-98), which is default 0 = OFF.
#
# Seed stage only: no refinement, no STL, no fidelity verdict. Runs in minutes, not the ~31 min of a
# mesher arm. The hypotheses, the cost side and the validity gate are registered in s16BowAB.ts's
# header — READ THAT FIRST, and read the CONTROL row before any treatment row.
#
# Usage:  bash research/tools/run-s16-bow-ab.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT=research/bridge/out
mkdir -p "$OUT"
REPORT=research/exchange/_strataConformBisect/S16_BOW_AB.report.txt
mkdir -p "$(dirname "$REPORT")"

# `npx tsc -p tsconfig.json` DOES NOT CHECK research/ (include: ["src"]), so every "typecheck clean"
# on a research file is vacuous. esbuild does not check types either — but it DOES fail on a parse
# error and on an unresolved import, which is what has actually bitten this campaign. Bundle first,
# separately, so a build failure is distinguishable from a run failure.
echo "── bundling ──"
npx esbuild research/tools/s16BowAB.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s16bowab.cjs"

# TS2304 (undefined identifier) is the class that has survived lint AND esbuild here and only
# surfaced as a runtime ReferenceError 20 minutes into a run. Check for it explicitly; the
# StyleDims/Phase2Dims TS2322/TS2345 pairs are pre-existing and are NOT read.
echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s16BowAB.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

# The seed's repair rounds hold several full triangulations; the driver runs at 6 GB for the same
# reason. Windows EcoQoS throttles detached node jobs ~4-5x — run this in the foreground.
export NODE_OPTIONS=--max-old-space-size=6144

echo "── running (4 arms, one variable: bowFrac) ──"
node "$OUT/_run_s16bowab.cjs" 2>&1 | tee "$REPORT"

echo
echo "report written to $REPORT"
