#!/usr/bin/env bash
# run-s108-angle-calib.sh — E-2026-08-06-ANGLE-BAR-CALIB.
# Copied from research/tools/_run-template.sh. Bundle path is DERIVED from the tool name.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s108AngleBarCalib.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/anglecalib
REPORT="$OUTDIR/S108_ANGLE_CALIB_${PF_S108_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"

echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"

TAG="${PF_S108_TAG:-GOTH}"
echo
echo "── rendering ──"
NODE_PATH="$PWD/node_modules" PF_RENDER_CELL=1200 \
  node research/render/meshRender.cjs "$OUTDIR/${TAG}_calib_window.png" "$OUTDIR" 2 "${TAG}_clay_win" "${TAG}_band_win" \
  || echo "*** window render failed (non-fatal) ***"
NODE_PATH="$PWD/node_modules" PF_RENDER_CELL=1200 \
  node research/render/meshRender.cjs "$OUTDIR/${TAG}_calib_whole.png" "$OUTDIR" 2 "${TAG}_clay_all" "${TAG}_band_all" \
  || echo "*** whole render failed (non-fatal) ***"

echo
echo "report  $REPORT"
echo "images  $OUTDIR/${TAG}_calib_window.png  and  ${TAG}_calib_whole.png"
