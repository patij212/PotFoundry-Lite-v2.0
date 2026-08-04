#!/usr/bin/env bash
# S38 — price a CERTIFIED accept test over the WHOLE facet distribution, at each candidate tolerance,
# BEFORE spending a mesher arm on it.
#
# S37 (d2febcda) showed 98.9% of the certified veto's refusals were radial-conservatism artifacts and
# suggested that at the true 10 um bar a certified test costs ~190 evals against the blind ruler's
# 375. That was a p50 figure and covRad scales with edge length, so the large-facet tail could
# dominate. Two cost estimates in this thread have already been wrong; this measures the distribution.
#
# THE DECISIVE COLUMN IS `INFEASIBLE`, NOT THE EVAL COUNT. The radial reading is a MAX over samples,
# so raising n can never bring it down — a facet already over tol can NEVER certify and must be
# refused. That is what made S36 cost 7.1x, and its artifact rate is measured here at each tol
# rather than assumed from S37's 3.5 um number.
#
# Read-only against a finished STL. ~6-10 min at stride 1; PF_S38_STRIDE=4 for a fast estimate.
#
# Usage:  bash research/tools/run-s38-cert-cost.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

OUT=research/bridge/out
mkdir -p "$OUT"
REPORT=research/exchange/_strataConformBisect/S38_CERT_COST.report.txt
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s38CertCost.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s38.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s38CertCost.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=8192
node "$OUT/_run_s38.cjs" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
