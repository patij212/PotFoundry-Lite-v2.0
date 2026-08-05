#!/usr/bin/env bash
# S50 — where do the certificate's rA evals go? Read-only over a finished STL, single-threaded,
# ~1-3 min at the default N. Safe beside a running certificate.
#
# Usage:  bash research/tools/run-s50-eval-split.sh [TAG]
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:-S39CTL}"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S52_RA_COST_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s52RaCost.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s52.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=6144
node "$OUT/_run_s52.cjs" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
