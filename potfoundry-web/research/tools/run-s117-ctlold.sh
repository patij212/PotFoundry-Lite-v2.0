#!/usr/bin/env bash
# run-s117-ctlold.sh — THE CONTROL ARM for run-s117-bigscore.sh.
#
# Runs the UNMODIFIED research/tools/s116zFinalScore.ts (Map-based dihedral ruler) so its report can be
# diffed line-for-line against s117BigScore's on the SAME mesh with the SAME env. Same instrument, one
# different container => the two reports must be identical, and if they are not the S117 numbers are VOID.
#
# It exists only so the control can be run WITHOUT touching _run_s116zFinalScore.cjs, which concurrent
# agents in this worktree are executing.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s116zFinalScore.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s117CtlOldScore.cjs"
OUTDIR="${PF_S116Z_OUTDIR:-research/exchange/_strataConformBisect/s117}"
REPORT="$OUTDIR/S117_BIGSCORE_${PF_S116Z_TAG:-CTLOLD}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S117BS_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE (NOBUNDLE=1) --"
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
