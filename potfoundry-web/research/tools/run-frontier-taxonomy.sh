#!/usr/bin/env bash
# Copied from research/tools/_run-template.sh. Bundle path is DERIVED from the tool name (a real
# collision happened on 2026-08-05 when two agents sed-ed the same runner and one ran the other's binary).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/frontierTaxonomy.ts

BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
REPORT="research/exchange/_strataConformBisect/frontier/FR_TAX_${PF_FR_TAG:-S39CTL}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"

echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false "$TOOL" 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
