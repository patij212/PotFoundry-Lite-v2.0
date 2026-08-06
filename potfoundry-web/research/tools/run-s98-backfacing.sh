#!/usr/bin/env bash
# S98-BF — the back-facing partition. Bundle name derives from the TOOL name (never hardcoded), per the
# _run-template.sh collision note: two agents once shared `out/_run_s51.cjs` and one reported the other's
# numbers as its own.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s98BackFacingPartition.ts

BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
REPORT="${PF_S98BF_REPORT:-research/exchange/_strataConformBisect/S98_BACKFACING.report.txt}"
mkdir -p "$OUT" "$(dirname "$REPORT")"

if [ "${PF_S98BF_SKIPBUILD:-0}" != "1" ]; then
  echo "── bundling $TOOL -> $BUNDLE ──"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

  echo "── checking for undefined identifiers (TS2304 only) ──"
  npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
    --skipLibCheck --strict false "$TOOL" 2>&1 | grep "TS2304" && {
      echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"
fi

export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
