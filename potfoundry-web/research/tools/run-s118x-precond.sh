#!/usr/bin/env bash
# run-s118x-precond.sh — independent PRECOND perpendicular re-measurement (own bundle path).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118xPrecondAudit.ts
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_s118xPrecondAudit.cjs"
OUTDIR="${PF_S118X_OUTDIR:-research/exchange/_strataConformBisect/s118}"
REPORT="$OUTDIR/S118X_PRECOND_${PF_S118X_LABEL:-ARM}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
if [ "${PF_S118X_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"; [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S118X_NODEOPTS:---max-old-space-size=12288}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
