#!/usr/bin/env bash
# run-s118-ceilings.sh — S118: measure what actually breaks at 1e7 triangles.
#
# EACH STAGE RUNS IN ITS OWN PROCESS. A stage that dies of OOM is itself a datum and must not take the
# other stages with it, so the loop does not `set -e` on the node call and records the exit code.
#
# OWN BUNDLE PATH (_run_s118Ceilings.cjs) — never overwrite another agent's live bundle.
# PF_S118C_NOBUNDLE=1 reuses the bundle; USE IT WHENEVER A VITEST RUN IS LIVE (a CLI esbuild invocation
# tears down the esbuild service vitest holds through the junctioned node_modules).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118Ceilings.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s118Ceilings.cjs"
OUTDIR="${PF_S118_OUTDIR:-research/exchange/_strataConformBisect/s118}"
REPORT="$OUTDIR/S118_CEILINGS_${PF_S118C_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S118C_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S118C_NODEOPTS:---max-old-space-size=12288}"
STAGES="${PF_S118C_STAGES:-limits synth read dih proj}"
{
  for st in $STAGES; do
    echo ""
    echo "########################################################################################"
    echo "## STAGE $st"
    echo "########################################################################################"
    PF_S118C_STAGE="$st" node "$BUNDLE" "$@"
    echo "## stage $st exit code $?"
  done
} 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
