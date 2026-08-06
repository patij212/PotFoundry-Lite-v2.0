#!/usr/bin/env bash
# S105 BANDS — phase-block pool for the H1 pair (lepp vs cone), s94ConeRefine settings.
# s105-OWNED bundle + report paths.
set -uo pipefail
cd "$(dirname "$0")/../.."
TOOL=research/tools/s105BandsCone.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s105BandsCone.cjs"
REPORT="research/exchange/_strataConformBisect/S105_BANDS_CONE_${PF_S94R_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo; echo "report -> $REPORT"
