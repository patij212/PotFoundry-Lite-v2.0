#!/usr/bin/env bash
# S98-BF visual evidence: dump render bins for each arm, then render the SAME bins DoubleSide (what the lab
# renderer always showed) beside FrontSide (backface culling ON — what a viewer actually shows).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s98BackFacingRenderBins.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s98BackFacingRenderBins.cjs"
BINS=research/exchange/_strataConformBisect/s98bf/render
MAIN=C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect
mkdir -p "$OUT" "$BINS"

npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 --outfile="$BUNDLE" \
  || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=10240
PF_S98R_TAG=vorOFF PF_S98R_STL="$MAIN/voronoi_ring_D--.stl" \
  PF_S98R_NDJSON=research/exchange/_strataConformBisect/s98bf/S98BF_VOR_SHAPEOFF_FULL_bucketA.ndjson \
  PF_S98R_PATCH=2.5 node "$BUNDLE"
PF_S98R_TAG=vorON PF_S98R_STL="$MAIN/voronoi_ring_D--H_S94CTL.stl" \
  PF_S98R_NDJSON=research/exchange/_strataConformBisect/s98bf/S98BF_VOR_S94CTL_FULL_bucketA.ndjson \
  PF_S98R_PATCH=2.5 node "$BUNDLE"
PF_S98R_TAG=goth PF_S98R_STL="$MAIN/gothicarches_ring_DS-HT_S39CTL.stl" \
  PF_S98R_NDJSON=research/exchange/_strataConformBisect/s98bf/S98BF_GOTH_S39CTL_FULL_bucketA.ndjson \
  PF_S98R_PATCH=2.5 node "$BUNDLE"

PNG=research/exchange/_strataConformBisect/s98bf/S98_BACKFACING.png
PF_RENDER_CELL=${PF_RENDER_CELL:-760} \
PF_S98R_CAPS="Voronoi SHAPE-OFF — 62,332 back-facing (7.73%)|Voronoi SHAPE-OFF — same mesh, culled|Voronoi SHAPE-ON (ships) — 488 back-facing (0.099%)|Voronoi SHAPE-ON — same mesh, culled" \
NODE_PATH="$(pwd)/node_modules" node research/render/s98BackfaceRender.cjs \
  "$PNG" "$BINS" 2 DFDF vorOFF_full vorOFF_full vorON_full vorON_full

PNG2=research/exchange/_strataConformBisect/s98bf/S98_BACKFACING_PATCH.png
PF_RENDER_CELL=${PF_RENDER_CELL:-760} \
PF_S98R_CAPS="Gothic S39CTL patch — bucket-(a) painted RED|Gothic S39CTL patch — culled: the RED facets are GONE|Voronoi SHAPE-ON patch — bucket-(a) painted RED|Voronoi SHAPE-ON patch — culled" \
NODE_PATH="$(pwd)/node_modules" node research/render/s98BackfaceRender.cjs \
  "$PNG2" "$BINS" 2 DFDF goth_patch goth_patch vorON_patch vorON_patch

echo "wrote $PNG and $PNG2"
