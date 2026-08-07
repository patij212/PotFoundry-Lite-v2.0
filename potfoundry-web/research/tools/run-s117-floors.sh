#!/usr/bin/env bash
# run-s117-floors.sh — S117 P2 item 3 floor stack. Own bundle path; never share a runner.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s117FloorStack.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s117FloorStack.cjs"
OUTDIR=research/exchange/_strataConformBisect/s117
REPORT="$OUTDIR/S117_FLOORSTACK.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
