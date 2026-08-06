#!/usr/bin/env bash
# S106 CONFORM — what does CONFORMITY cost? (agent CONFORM)
# s106-OWNED bundle + report paths. A shared bundle path caused a cross-agent collision on 2026-08-05
# in which one agent executed the other's binary; the bundle name here is derived from THIS tool only.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s106ConformBisect.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s106ConformBisect.cjs"
REPORT="research/exchange/_strataConformBisect/S106_CONFORM_${PF_CF_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
echo "── TS2304 (undefined identifier) check ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false "$TOOL" 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"
export NODE_OPTIONS=${PF_CF_NODEOPTS:---max-old-space-size=12288}
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo; echo "report -> $REPORT"
