#!/usr/bin/env bash
# run-s118-drive.sh — S118 DRIVE: generate + refine a GothicArches mesh to a position bar.
#
# OWN BUNDLE PATH (_run_s118DriveGoth.cjs) — never overwrite another agent's live bundle.
# PF_S118D_NOBUNDLE=1 reuses the bundle; USE IT WHENEVER A VITEST RUN OR ANOTHER esbuild IS LIVE
# (a CLI esbuild invocation tears down the esbuild service and kills concurrent arms).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118DriveGoth.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s118DriveGoth.cjs"
OUTDIR="${PF_S118D_OUTDIR:-research/exchange/_strataConformBisect/s118}"
REPORT="$OUTDIR/S118_DRIVE_${PF_S118D_TAG:-DRV}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S118D_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S118D_NODEOPTS:---max-old-space-size=14336}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
