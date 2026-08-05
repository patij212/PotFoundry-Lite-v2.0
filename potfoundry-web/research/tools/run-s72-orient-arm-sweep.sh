#!/usr/bin/env bash
# S72 — the AR-cap sweep re-read on the corrected orientation ruler. Read-only, single-threaded.
# Bundle name is PER-TOOL (_run_s72.cjs): two agents collided on a shared bundle name on 2026-08-05.
#
#   bash research/tools/run-s72-orient-arm-sweep.sh [TAG]
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:-A}"
OUT=research/bridge/out
mkdir -p "$OUT"
REPORT="research/exchange/_strataConformBisect/S72_ARM_SWEEP_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s72OrientArmSweep.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s72.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=6144
node "$OUT/_run_s72.cjs" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
