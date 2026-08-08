#!/usr/bin/env bash
# run-s120-reloc.sh — S120 TASK C stage 3, operator (f). Own bundle path.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s120Relocate.ts
BASE="$(basename "$TOOL" .ts)"
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_${BASE}.cjs"
OUTDIR="${PF_S120_DIR:-research/exchange/_strataConformBisect/s120}"
REPORT="$OUTDIR/S120_RELOC_${PF_S120_TAG:-RUN}${PF_S120_RELOC_PLACEBO:+_PLA}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
if [ "${PF_S120_NOBUNDLE:-0}" != "1" ]; then
  echo "── bundling $TOOL -> $BUNDLE ──"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
