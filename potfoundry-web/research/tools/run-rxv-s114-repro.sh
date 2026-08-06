#!/usr/bin/env bash
# run-rxv-s114-repro.sh — INDEPENDENT REPRODUCTION of s114Adjudicate.ts by the adjudicating reviewer.
# Own bundle path and own report tag so the original artifact is never clobbered.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s114Adjudicate.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_rxv_s114repro.cjs"
OUTDIR=research/exchange/_strataConformBisect/adjudicate
REPORT="$OUTDIR/S114_ADJUDICATE_${PF_S114_TAG:-RXV}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "-- bundling $TOOL -> $BUNDLE --"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
