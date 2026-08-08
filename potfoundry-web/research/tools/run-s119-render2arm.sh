#!/usr/bin/env bash
# run-s119-render2arm.sh — render an S119 ladder rung with the S116 single-sided rasteriser.
#
#   bash research/tools/run-s119-render2arm.sh "<ABS STL>[;<ABS STL>...]" "<tag>[;<tag>...]" <RTAG>
#
# clay + backface, per the brief. `backface` is the mode that matters: every campaign render before S98
# was THREE.DoubleSide and therefore BLIND to inverted normals (project_s98_backfacing).
# NEVER invokes esbuild — it runs research/bridge/out/_run_s116Render.cjs, which the S116 build already
# produced (2026-08-07 23:30) from s116Render.ts (2026-08-07 02:15, older). A CLI esbuild call tears down
# the esbuild service a live vitest driver holds through the junctioned node_modules.
set -uo pipefail
cd "$(dirname "$0")/../.."
STLS="${1:?usage: run-s119-render2arm.sh <abs stl;...> <tag;...> <RTAG>}"
TAGS="${2:?}"
RTAG="${3:-S119}"
OUT=research/exchange/_strataConformBisect/s119
BUNDLE=research/bridge/out/_run_s116Render.cjs
[ -f "$BUNDLE" ] || { echo "*** MISSING BUNDLE $BUNDLE — refusing to esbuild ***"; exit 3; }
mkdir -p "$OUT"
export NODE_OPTIONS=--max-old-space-size=14336
PF_S116_STL="$STLS" PF_S116_TAG="$TAGS" PF_S116_OUT="$OUT" PF_S116_RTAG="$RTAG" \
PF_S116_MODES="${PF_S116_MODES:-clay,backface}" PF_S116_AZ="${PF_S116_AZ:-0,90,180,270}" \
PF_S116_W="${PF_S116_W:-1000}" PF_S116_H="${PF_S116_H:-1300}" PF_S116_SS="${PF_S116_SS:-3}" \
  node "$BUNDLE" 2>&1 | tee "$OUT/S119_RENDER_${RTAG}.report.txt"
echo "report written to $OUT/S119_RENDER_${RTAG}.report.txt"
