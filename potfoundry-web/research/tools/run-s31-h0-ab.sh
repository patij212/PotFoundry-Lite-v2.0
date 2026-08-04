#!/usr/bin/env bash
# S31 H0 — two single-variable families against the 9,363 crease-crossing seed edges:
#   D  chainDecimateMm   (21,686 chain vertices dropped at the S47CAV default)
#   J  junctionMergeMm   (1,559 raw junctions clustered to 235; the disks SUPPRESS offset rings)
#
# Follows the S16 bow A/B (commit 181e6962), which refuted the bow lever and left H0 standing.
# Same validated instrument: the DRIVER's locateKink against the analytic surface, not the seed
# builder's self-referential counter. Each family's control must reproduce the S47CAV header or the
# probe prints VOID over that family. Hypotheses and the phantom-junction trap are registered in
# s31H0AB.ts's header — READ IT BEFORE THE NUMBERS.
#
# Seed-stage only. ~25 min for 8 arms, against ~31 min for a SINGLE mesher arm.
#
# Usage:  bash research/tools/run-s31-h0-ab.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT=research/bridge/out
mkdir -p "$OUT"
REPORT=research/exchange/_strataConformBisect/S31_H0_AB.report.txt
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s31H0AB.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s31h0ab.cjs"

# `npx tsc -p tsconfig.json` DOES NOT CHECK research/ (include: ["src"]). TS2304 is the class that
# survives both lint and esbuild and only surfaces as a runtime ReferenceError mid-run.
echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s31H0AB.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=6144

echo "── running (D: 4 arms shared trace; J: 4 arms, re-trace per arm) ──"
node "$OUT/_run_s31h0ab.cjs" 2>&1 | tee "$REPORT"

echo
echo "report written to $REPORT"
