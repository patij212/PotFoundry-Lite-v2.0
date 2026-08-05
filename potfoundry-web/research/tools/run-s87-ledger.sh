#!/usr/bin/env bash
# Copied from research/tools/_run-template.sh. The bundle path DERIVES from TOOL, so it cannot collide.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

# ── THE ONE LINE TO EDIT ──────────────────────────────────────────────────────────────────────────
TOOL=research/tools/s87LedgerReexam.ts
# ──────────────────────────────────────────────────────────────────────────────────────────────────

BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"                       # derived, never hardcoded
TAGSUF="${PF_S87_TAG:-X}_${PF_S87_ARM:-orient}"
REPORT="research/exchange/_strataConformBisect/${BASE}.${TAGSUF}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"

if [ "${PF_S87_SKIPBUILD:-0}" != "1" ]; then
  echo "── bundling $TOOL -> $BUNDLE ──"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

  echo "── checking for undefined identifiers (TS2304 only) ──"
  npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
    --skipLibCheck --strict false "$TOOL" 2>&1 | grep "TS2304" && {
      echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"
fi

export NODE_OPTIONS=--max-old-space-size=6144
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
