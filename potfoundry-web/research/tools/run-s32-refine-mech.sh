#!/usr/bin/env bash
# S32 — the three REFINEMENT-SIDE mechanisms, measured on the S47CAV control seed:
#   M1  the SNAP_ALPHA (R4) band, and whether §4.3's deferred SNAP-TO-LOCUS VERTEX MOVE is legal
#   M2  one-kink-per-edge: is the published 9,363 an undercount?
#   M3  `conformed`/in-band retiring an edge that still carries a real interior crossing
#
# Follows 181e6962 (bow NO-GO) and 55554e29 (H0 refuted both ways; the crossing rate is an invariant
# and 88.4% of crossings have exactly one constrained endpoint). Those closed the seed side. These
# three were found by CODE READ and left explicitly unmeasured; this measures them.
#
# NOTE the R4 population is DISJOINT from the published 9,363 — the driver's own headline counter
# skips the band by construction (test.ts:1409), and so did every probe in this campaign so far.
#
# The §4.3 legality number is an OPTIMISTIC UPPER BOUND (scored on the fat seed, not mid-refinement).
# The hypotheses and that caveat are registered in s32RefineMech.ts's header — read it first.
#
# Control arm only, seed stage. ~6 min.
#
# Usage:  bash research/tools/run-s32-refine-mech.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT=research/bridge/out
mkdir -p "$OUT"
REPORT=research/exchange/_strataConformBisect/S32_REFINE_MECH.report.txt
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s32RefineMech.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s32refinemech.cjs"

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s32RefineMech.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=6144

node "$OUT/_run_s32refinemech.cjs" 2>&1 | tee "$REPORT"

echo
echo "report written to $REPORT"
