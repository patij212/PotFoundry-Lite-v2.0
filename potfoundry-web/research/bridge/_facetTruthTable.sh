#!/usr/bin/env bash
# Regenerate the re-audit results table straight from the report files, so no number in the write-up is
# hand-transcribed. Run from potfoundry-web/.
set -u
OUT=research/exchange/_strataFacetTruth
CB=research/exchange/_strataConformBisect

declare -A STL=(
  [LowPolyFacet]=lowpolyfacet_ring_D-- [SuperellipseMorph]=superellipsemorph_ring_D--
  [SuperformulaBlossom]=superformulablossom_ring_D-- [WaveInterference]=waveinterference_ring_D--
  [RippleInterference]=rippleinterference_ring_D-- [ArtDeco]=artdeco_ring_D--
  [BambooSegments]=bamboosegments_ring_D-- [BasketWeave]=basketweave_ring_D--C
  [FourierBloom]=fourierbloom_ring_D-- [DragonScales]=dragonscales_ring_D--
  [SpiralRidges]=spiralridges_ring_D-- [HexagonalHive]=hexagonalhive_ring_D--
  [GeometricStar]=geometricstar_ring_D-- [HarmonicRipple]=harmonicripple_D--
  [Voronoi]=voronoi_ring_D-- [Crystalline]=crystalline_ring_D--
  [GyroidManifold]=gyroidmanifold_ring_D-- [CelticTriquetra]=celtictriquetra_ring_D--
  [GothicArches]=gothicarches_D--
)

printf '| style | tris | old ruler (recorded) | H2 witnessed | H2 refinement | H2 uniform resolving power | H1 certified |\n'
printf '|---|---|---|---|---|---|---|\n'
for s in LowPolyFacet SuperellipseMorph SuperformulaBlossom WaveInterference RippleInterference ArtDeco \
         BambooSegments BasketWeave FourierBloom DragonScales SpiralRidges HexagonalHive GeometricStar \
         HarmonicRipple Voronoi Crystalline GyroidManifold CelticTriquetra GothicArches; do
  r="$OUT/$s.report.txt"; c="$CB/${STL[$s]}.report.txt"; h1="$OUT/$s.h1h2.report.txt"
  [ -f "$r" ] || { printf '| %s | | | _(not yet measured)_ | | | |\n' "$s"; continue; }
  tris=$(grep -am1 -oE '\(([0-9]+) triangles\)' "$r" | grep -oE '[0-9]+')
  old=$(grep -am1 -oE 'MAX [0-9.]+ µm' "$c" 2>/dev/null | head -1 | grep -oE '[0-9.]+')
  h2=$(grep -am1 'WITNESSED max :' "$r" | grep -oE '[0-9.]+ um' | head -1 | grep -oE '[0-9.]+')
  ref=$(grep -am1 'refinement' "$r" | grep -oqE 'TRUNCATED' && echo 'truncated (floor)' || echo '**exhausted**')
  res=$(grep -am1 -oE 'structure pitch [0-9.]+ um UNIFORM' "$r" | grep -oE '[0-9.]+')
  cert=$(grep -am1 'CERTIFIED UPPER BOUND' "$h1" 2>/dev/null | sed 's/.*BOUND ://' | tr -s ' ' || true)
  [ -z "${cert:-}" ] && cert='_(pass 2)_'
  printf '| %s | %s | %s | **%s** | %s | %s | %s |\n' "$s" "${tris:-}" "${old:-}" "${h2:-}" "$ref" "${res:-}" "$cert"
done
