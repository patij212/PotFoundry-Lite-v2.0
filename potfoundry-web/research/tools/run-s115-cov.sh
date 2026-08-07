#!/usr/bin/env bash
# run-s115-cov.sh — S115 coverage arm. THIRD bundle path so three arms can run concurrently.
set -uo pipefail
cd "$(dirname "$0")/../.."
TOOL=research/tools/s115CurtainK.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s115cov.cjs"
OUTDIR=research/exchange/_strataConformBisect/s115curtainK
REPORT="$OUTDIR/S115_${PF_S115_TAG:-COV}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo "report written to $REPORT"
