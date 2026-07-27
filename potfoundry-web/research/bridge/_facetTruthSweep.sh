#!/usr/bin/env bash
# Re-audit every STRATA-001 "closed" row with the independent facet-truth ruler.
# Run from potfoundry-web/. Heavy jobs go ONE AT A TIME (concurrent mesher/auditor runs have OOM'd before).
#
#   bash research/bridge/_facetTruthSweep.sh            # all rows
#   bash research/bridge/_facetTruthSweep.sh LowPolyFacet SpiralRidges
#
# Each row maps to the exact mesh the scorecard's verdict was based on: the DIRECTED ("D--"), registry
# defaults, ring-stage output in research/exchange/_strataConformBisect. GothicArches uses its RING file
# (gothicarches_D--) rather than the solid, because the auditor's surface model is the outer wall — inner
# wall and cap triangles would read as false H1 exceedances.
set -u
D=research/exchange/_strataConformBisect
OUT=research/exchange/_strataFacetTruth
mkdir -p "$OUT"

# SINGLE-INSTANCE LOCK. Three copies of this script once ran concurrently (a `pkill` that does not exist on
# Git Bash silently failed to stop the first two), and they competed for CPU and overwrote each other's logs
# — one style produced no report at all. Concurrent heavy runs have also OOM'd this box before. Refuse to
# start a second copy rather than produce results nobody can trust.
LOCK="$OUT/.sweep.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "REFUSING TO START: another sweep holds $LOCK (remove it if that sweep is definitely dead)"; exit 3
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT INT TERM

ROWS=(
  "LowPolyFacet:$D/lowpolyfacet_ring_D--.stl"
  "SuperellipseMorph:$D/superellipsemorph_ring_D--.stl"
  "SuperformulaBlossom:$D/superformulablossom_ring_D--.stl"
  "WaveInterference:$D/waveinterference_ring_D--.stl"
  "RippleInterference:$D/rippleinterference_ring_D--.stl"
  "ArtDeco:$D/artdeco_ring_D--.stl"
  "BambooSegments:$D/bamboosegments_ring_D--.stl"
  "FourierBloom:$D/fourierbloom_ring_D--.stl"
  "DragonScales:$D/dragonscales_ring_D--.stl"
  "SpiralRidges:$D/spiralridges_ring_D--.stl"
  "HexagonalHive:$D/hexagonalhive_ring_D--.stl"
  "GeometricStar:$D/geometricstar_ring_D--.stl"
  "HarmonicRipple:$D/harmonicripple_D--.stl"
  "Voronoi:$D/voronoi_ring_D--.stl"
  "Crystalline:$D/crystalline_ring_D--.stl"
  "BasketWeave:$D/basketweave_ring_D--C.stl"
  "GyroidManifold:$D/gyroidmanifold_ring_D--.stl"
  "CelticTriquetra:$D/celtictriquetra_ring_D--.stl"
  "GothicArches:$D/gothicarches_D--.stl"
)

WANT=("$@")
for row in "${ROWS[@]}"; do
  style="${row%%:*}"
  stl="${row#*:}"
  if [ ${#WANT[@]} -gt 0 ]; then
    hit=0
    for w in "${WANT[@]}"; do [ "$w" = "$style" ] && hit=1; done
    [ $hit -eq 0 ] && continue
  fi
  if [ ! -f "$stl" ]; then echo "SKIP $style — missing $stl"; continue; fi
  echo "=== $style  <-  $stl  ($(date +%H:%M:%S)) ==="
  NODE_OPTIONS=--max-old-space-size=12288 \
  PF_STRATA_FT=1 \
  PF_FT_STYLE="$style" \
  PF_FT_STL="$stl" \
  PF_FT_TAG="$style" \
  PF_FT_TOL_UM="${PF_FT_TOL_UM:-10}" \
  PF_FT_OLDRULER="${PF_FT_OLDRULER:-0}" \
  PF_FT_H2SECS="${PF_FT_H2SECS:-300}" \
  PF_FT_H2MINPITCH_UM="${PF_FT_H2MINPITCH_UM:-2.5}" \
  npx vitest run --config vitest.strata.config.ts research/bridge/_strataFacetTruth.test.ts \
    > "$OUT/$style.run.log" 2>&1
  echo "    exit $?  ->  $OUT/$style.report.txt"
  grep -E "CERTIFIED UPPER BOUND|WITNESSED max|old-ruler MAX|CAPPED" "$OUT/$style.report.txt" 2>/dev/null | sed 's/^/    /'
done
