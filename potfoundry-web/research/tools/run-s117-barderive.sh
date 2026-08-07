#!/usr/bin/env bash
# run-s117-barderive.sh — S117 P5: retire the inherited 45 deg bar. Own bundle path; never share a runner.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s117BarDerive.ts
BASE="$(basename "$TOOL" .ts)"
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_${BASE}.cjs"
OUTDIR="${PF_S117BD_OUTDIR:-research/exchange/_strataConformBisect/s117}"
REPORT="$OUTDIR/S117_BARDERIVE_${PF_S117BD_TAG:-BD}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=14336
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
