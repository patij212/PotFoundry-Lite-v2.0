#!/usr/bin/env bash
# run-s116z-final.sh — S116 PHASE 3 honest final scorecard. Own bundle path; never share a runner.
#
# The meshes live in the PRIMARY checkout's research/exchange/ (gitignored, absent from this worktree),
# so they are passed by ABSOLUTE path via PF_S116Z_STL and never copied.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s116zFinalScore.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR="${PF_S116Z_OUTDIR:-research/exchange/_strataConformBisect/s116}"
REPORT="$OUTDIR/S116Z_FINAL_${PF_S116Z_TAG:-FINAL}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
# PF_S116Z_NOBUNDLE=1 reuses the existing bundle. *** USE IT WHENEVER A DRIVER RUN IS LIVE. *** A CLI
# esbuild invocation tears down the esbuild service vitest holds through the junctioned node_modules and
# kills every concurrent driver arm with "Error: The service is no longer running" — measured, twice, in
# this session, at 11 minutes of work per arm.
if [ "${PF_S116Z_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE (NOBUNDLE=1: a driver run is live) --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS=--max-old-space-size=14336
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
