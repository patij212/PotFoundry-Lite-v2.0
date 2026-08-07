#!/usr/bin/env bash
# run-s118-ctapcr.sh — S118 drive phase: CelticTriquetra to 0.01 mm then 0.001 mm via APCR.
# OWN BUNDLE PATH — never overwrite another agent's live bundle.
# PF_S118A_NOBUNDLE=1 reuses the bundle; USE IT WHENEVER ANOTHER VITEST/ESBUILD RUN IS LIVE.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118CtApcr.ts
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_s118CtApcr.cjs"
OUTDIR="${PF_S118A_OUTDIR:-research/exchange/_strataConformBisect/s118}"
REPORT="$OUTDIR/S118_APCR_${PF_S118A_TAG:-CT}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
if [ "${PF_S118A_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"; [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S118A_NODEOPTS:---max-old-space-size=14336}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
