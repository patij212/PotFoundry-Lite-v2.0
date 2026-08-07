#!/usr/bin/env bash
# run-s117-bigscore.sh — S117 P0: the honest final scorecard for meshes ABOVE the 2^23 edge ceiling.
#
# Same tool and same env contract as run-s116z-final.sh (PF_S116Z_*), one import different: the dihedral
# ruler is the Map-free CSR one, because the shipping CelticTriquetra outer wall's ~10.15 M unique edges
# crash V8's Map at 8,388,608. See research/tools/s117BigScore.ts for the delta and the control.
#
# OWN BUNDLE PATH (_run_s117BigScore.cjs). It must never overwrite _run_s116zFinalScore.cjs — concurrent
# agents in this worktree run that bundle, and clobbering a live runner's bundle is how a session loses
# an hour of driver work.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s117BigScore.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR="${PF_S116Z_OUTDIR:-research/exchange/_strataConformBisect/s117}"
REPORT="$OUTDIR/S117_BIGSCORE_${PF_S116Z_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
# PF_S117BS_NOBUNDLE=1 reuses the existing bundle. USE IT WHENEVER A VITEST RUN IS LIVE: a CLI esbuild
# invocation tears down the esbuild service vitest holds through the junctioned node_modules and kills
# every concurrent arm with "Error: The service is no longer running".
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
