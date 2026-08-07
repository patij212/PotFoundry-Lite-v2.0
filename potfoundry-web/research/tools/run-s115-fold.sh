#!/usr/bin/env bash
# run-s115-fold.sh — S115 stage-1-only arm. SEPARATE bundle path so it cannot collide with the main run.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s115CurtainK.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s115fold.cjs"
OUTDIR=research/exchange/_strataConformBisect/s115curtainK
REPORT="$OUTDIR/S115_${PF_S115_TAG:-FOLD}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo "report written to $REPORT"
