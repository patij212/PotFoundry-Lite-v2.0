#!/usr/bin/env bash
# run-s117-precond.sh — S117 P4 step 0: the APCR admission gate. Own bundle path.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s117CliffProbe.ts
BASE="$(basename "$TOOL" .ts)"
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_${BASE}.cjs"
OUTDIR="${PF_S117_OUTDIR:-research/exchange/_strataConformBisect/s117}"
REPORT="$OUTDIR/S117_CLIFF_${PF_S117_TAG:-CLIFF}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=14336
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
