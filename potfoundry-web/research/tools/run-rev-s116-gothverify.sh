#!/usr/bin/env bash
# run-rev-s116-gothverify.sh — own bundle path; never share a runner.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/revS116GothVerify.ts
BASE="$(basename "$TOOL" .ts)"
OUTD=research/bridge/out
BUNDLE="$OUTD/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/s116
REPORT="$OUTDIR/REV_S116_GOTHVERIFY_${PF_RV_TAG:-A}.report.txt"
mkdir -p "$OUTD" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
