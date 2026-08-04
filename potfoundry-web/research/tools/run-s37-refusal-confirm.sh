#!/usr/bin/env bash
# S37 — do the certified veto's REFUSALS survive a perpendicular confirm?
#
# S36 (4db657d6) refused 248,411 of 443,491 decisions on a WITNESSED exceedance of `distRadial`, and
# that cost 7.1x the rA evals without converging. `_facetTruthLib` says a FAIL from a candidate-based
# over-estimate can be a search ARTIFACT (only a PASS is sound). `distRadial` is the RADIAL foot, and
# on a gothic rib radial distance far exceeds true perpendicular distance. This measures how much of
# that 7.1x was chasing the ruler's own conservatism.
#
# Read-only against a FINISHED STL. No mesher runs, nothing can move a vertex.
# ~15-20 min single-threaded at stride 1; set PF_S37_STRIDE=4 for a ~4 min rate estimate.
#
# Usage:  bash research/tools/run-s37-refusal-confirm.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

OUT=research/bridge/out
mkdir -p "$OUT"
REPORT=research/exchange/_strataConformBisect/S37_REFUSAL_CONFIRM.report.txt
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s37RefusalConfirm.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s37.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s37RefusalConfirm.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=8192
node "$OUT/_run_s37.cjs" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
