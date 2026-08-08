#!/usr/bin/env bash
# run-s119t1-thin.sh — S119 TASK 1: the SCALE-FREE THIN + POLE census on one driver STL.
#
#   PF_S118T_STL=<ABSOLUTE path> PF_S118T_TAG=<tag> bash research/tools/run-s119t1-thin.sh
#
# OWN BUNDLE PATH (_run_s119t1Thin.cjs) — never share a runner or a bundle with another agent's arm.
# PF_S119T1_NOBUNDLE=1 reuses the bundle; USE IT WHENEVER A VITEST RUN IS LIVE (a CLI esbuild invocation
# tears down the esbuild service vitest holds through the junctioned node_modules and kills every
# concurrent arm with "Error: The service is no longer running").
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118ThinCensus.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s119t1Thin.cjs"
OUTDIR=research/exchange/_strataConformBisect/s119
REPORT="$OUTDIR/S119_THIN_${PF_S118T_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S119T1_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
