#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=research/bridge/out; BUNDLE="$OUT/_run_s99ArCalib.cjs"
REPORT="research/exchange/_strataConformBisect/S99_ARCALIB_${PF_S99_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"
npx esbuild research/tools/s99ArCalib.ts --bundle --platform=node --format=cjs --target=node20 --outfile="$BUNDLE" || exit 1
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo; echo "report -> $REPORT"
