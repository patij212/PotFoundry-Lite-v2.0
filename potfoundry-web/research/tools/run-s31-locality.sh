#!/usr/bin/env bash
# S31 CROSSING LOCALITY — are the 9,363 crease-crossing seed edges REAL, or detector false positives?
#
# Three seed knobs have now been swept (bowFrac, chainDecimateMm, junctionMergeMm — 12 arms, every
# control reproducing S47CAV to the digit) and the crossing RATE will not move off 2.3-2.7%. Before
# reading anything architectural into that invariance, check the instrument: a fixed fraction of
# edges tripping a threshold would produce the same signature. Hypotheses R-REAL / R-FALSE and the
# stated one-sidedness of the discriminator are in s31CrossLocality.ts's header — read it first.
#
# Control arm only. ~4 min.
#
# Usage:  bash research/tools/run-s31-locality.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT=research/bridge/out
mkdir -p "$OUT"
REPORT=research/exchange/_strataConformBisect/S31_LOCALITY.report.txt
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s31CrossLocality.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s31locality.cjs"

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s31CrossLocality.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=6144

node "$OUT/_run_s31locality.cjs" 2>&1 | tee "$REPORT"

echo
echo "report written to $REPORT"
