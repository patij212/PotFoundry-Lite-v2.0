#!/usr/bin/env bash
# run-s117-apcr.sh — S117 P4: one APCR arm (baseline + operator + cost-matched placebo) on one style.
#   bash research/tools/run-s117-apcr.sh
# env: PF_S117_STL(abs) PF_S117_STYLE PF_S117_TAG PF_S117_ROUNDS PF_S117_MAXT PF_S117_TCAP PF_S117_VCAP
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s117ApcrReach.ts
BASE="$(basename "$TOOL" .ts)"
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_${BASE}_${PF_S117_TAG:-X}.cjs"
export PF_S117_OUTDIR="${PF_S117_OUTDIR:-research/exchange/_strataConformBisect/s117}"
OUTDIR="$PF_S117_OUTDIR"
REPORT="$OUTDIR/S117_APCR_${PF_S117_TAG:-X}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=${PF_S117_HEAP:-14336}
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
