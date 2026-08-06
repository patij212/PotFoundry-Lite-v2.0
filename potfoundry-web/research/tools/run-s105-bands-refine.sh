#!/usr/bin/env bash
# S105 BANDS — phase-block pool for the position / chord-LEPP / 1-deg-angle multipliers.
# s105-OWNED bundle + report paths (a shared bundle path caused a cross-agent collision on 2026-08-05).
set -uo pipefail
cd "$(dirname "$0")/../.."
TOOL=research/tools/s105BandsRefine.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s105BandsRefine.cjs"
REPORT="research/exchange/_strataConformBisect/S105_BANDS_REFINE_${PF_FD_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo; echo "report -> $REPORT"
