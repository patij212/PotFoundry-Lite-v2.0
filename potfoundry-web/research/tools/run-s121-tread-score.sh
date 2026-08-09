#!/usr/bin/env bash
# run-s121-tread-score.sh — S121 TASK C2: the tread scorecard.
#
#   env PF_S121_STL(ABS) PF_S121_TAG PF_S121_STYLE PF_S121_NTREAD [PF_S121_REUSE] [PF_S121_WALLPERP]
#
# OWN BUNDLE PATH — never share a runner's bundle with another agent's live job. PF_S121_NOBUNDLE=1
# reuses it; USE THAT WHENEVER A VITEST RUN IS LIVE (a CLI esbuild tears down the esbuild service vitest
# holds through the junctioned node_modules and kills every concurrent arm with "The service is no
# longer running").
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s121TreadScore.ts
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_s121TreadScore.cjs"
OUTDIR="${PF_S121_OUTDIR:-research/exchange/_strataConformBisect/s121}"
REPORT="$OUTDIR/S121_TREAD_${PF_S121_TAG:-RUN}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
if [ "${PF_S121_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S121_NODEOPTS:---max-old-space-size=12288}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
