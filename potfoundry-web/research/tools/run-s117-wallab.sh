#!/usr/bin/env bash
# run-s117-wallab.sh — S117 P2 shipping-mesher A/B on qMinEdge. Own bundle path; never share a runner.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s117WallAB.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s117WallAB.cjs"
OUTDIR=research/exchange/_strataConformBisect/s117
REPORT="$OUTDIR/S117_WALLAB_${PF_S117_TAG:-X}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
