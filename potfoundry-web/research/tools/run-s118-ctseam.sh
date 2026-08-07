#!/usr/bin/env bash
# run-s118-ctseam.sh — S118 drive phase step 0: the CelticTriquetra C0-seam floor probe.
# OWN BUNDLE PATH — never overwrite another agent's live bundle.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118CtSeamProbe.ts
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_s118CtSeamProbe.cjs"
OUTDIR="${PF_S118P_OUTDIR:-research/exchange/_strataConformBisect/s118}"
REPORT="$OUTDIR/S118_CTSEAM_${PF_S118P_TAG:-A}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
if [ "${PF_S118P_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"; [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S118P_NODEOPTS:---max-old-space-size=12288}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
