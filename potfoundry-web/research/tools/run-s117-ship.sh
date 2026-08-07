#!/usr/bin/env bash
# run-s117-ship.sh — S117 P0: drive the SHIPPING conforming generator head-less. Own bundle path.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s117ShipMesh.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR="${PF_S117_OUTDIR:-research/exchange/_strataConformBisect/s117}"
REPORT="$OUTDIR/S117_SHIP_${PF_S117_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S117_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE (NOBUNDLE=1) --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS=--max-old-space-size=14336
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
