#!/usr/bin/env bash
# run-s117-emitwire.sh — S117 P1 part 2: measure the WIRED emit-time invariant. Own bundle path.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s117EmitWire.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR="${PF_S117W_OUT:-research/exchange/_strataConformBisect/s117/p1wire}"
REPORT="$OUTDIR/S117_EMITWIRE_${PF_S117W_REPORT:-RUN}.report.txt"
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
