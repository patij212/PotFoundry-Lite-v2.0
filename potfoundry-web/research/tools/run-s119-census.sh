#!/usr/bin/env bash
# run-s119-census.sh — S119 task 3.5. OWN BUNDLE PATH.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s119MeshClassCensus.ts
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_s119MeshClassCensus.cjs"
OUTDIR="${PF_S119M_OUTDIR:-research/exchange/_strataConformBisect/s119}"
REPORT="$OUTDIR/S119_CENSUS_${PF_S119M_TAG:-RUN}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
echo "-- bundling $TOOL -> $BUNDLE --"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS="${PF_S119M_NODEOPTS:---max-old-space-size=12288}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
