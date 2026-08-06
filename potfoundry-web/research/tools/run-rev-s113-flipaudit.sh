#!/usr/bin/env bash
# run-rev-s113-flipaudit.sh — adversarial re-measurement of S113 OPERATOR 1. Own bundle path.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/revS113FlipAudit.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/REV_S113_FLIPAUDIT_${PF_S113_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
