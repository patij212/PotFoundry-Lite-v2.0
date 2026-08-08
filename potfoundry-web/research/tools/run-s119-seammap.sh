#!/usr/bin/env bash
# run-s119-seammap.sh — S119 task 3 stage 0. OWN BUNDLE PATH — never overwrite another agent's bundle.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s119SeamMap.ts
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_s119SeamMap.cjs"
OUTDIR="${PF_S119_OUTDIR:-research/exchange/_strataConformBisect/s119}"
REPORT="$OUTDIR/S119_SEAMMAP_${PF_S119_TAG:-CT}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
if [ "${PF_S119_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"; [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S119_NODEOPTS:---max-old-space-size=12288}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
