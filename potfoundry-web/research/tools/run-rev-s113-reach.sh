#!/usr/bin/env bash
# run-rev-s113-reach.sh — adversarial audit of S113-OP2. Own bundle path; never share a runner.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/revS113SplitReach.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/REV_S113_SPLIT_REACH.report.txt"
mkdir -p "$OUT" "$OUTDIR"
export PF_REV_STL="${PF_REV_STL:-C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl}"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
