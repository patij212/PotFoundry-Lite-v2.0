#!/usr/bin/env bash
# S98-BF step 2 — the mechanism of the UNAMBIGUOUS back-facing class. Bundle name derives from TOOL.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s98BackFacingMechanism.ts

BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
REPORT="${PF_S98M_REPORT:-research/exchange/_strataConformBisect/S98_BACKFACING_MECH.report.txt}"
mkdir -p "$OUT" "$(dirname "$REPORT")"

if [ "${PF_S98M_SKIPBUILD:-0}" != "1" ]; then
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
