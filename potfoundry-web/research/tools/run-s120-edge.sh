#!/usr/bin/env bash
# run-s120-edge.sh — S120: the EDGE-conformance scorecard.
#
# env: PF_S120_STL (ABSOLUTE) PF_S120_TAG PF_S120_STYLE [PF_S120_NS=256] [PF_S120_PERP=0]
#
# OWN BUNDLE PATH — never overwrite another agent's live bundle. PF_S120_NOBUNDLE=1 reuses it; USE THAT
# WHENEVER A VITEST RUN IS LIVE (a CLI esbuild tears down the esbuild service vitest holds through the
# junctioned node_modules and kills every concurrent arm with "Error: The service is no longer running").
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s120EdgeRuler.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s120EdgeRuler.cjs"
OUTDIR="${PF_S120_OUTDIR:-research/exchange/_strataConformBisect/s120}"
REPORT="$OUTDIR/S120_EDGE_${PF_S120_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S120_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S120_NODEOPTS:---max-old-space-size=12288}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
