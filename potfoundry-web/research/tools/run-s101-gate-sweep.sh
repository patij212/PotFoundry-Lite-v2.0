#!/usr/bin/env bash
# S101 — the S100 back-facing ship gate across every available per-style ring mesh.
#
# ⚠ SCOPE, STATED UP FRONT AND CARRIED INTO THE TABLE: these `*_ring_D--.stl` carry NO 'H' suffix, and
# SHAPE_SUFFIX = SHAPE||MID3D||LONGFALL ? 'H':'' — so they are the SHAPE-OFF lineage, which S94/S95 proved
# is the SUPERSEDED and WORSE config (Voronoi SHAPE-off 0.50635% back-facing AREA vs SHAPE-on 0.01298%,
# a 39.0x gap). This sweep therefore measures the OLD config and is an UPPER BOUND on the ship state.
# Its value is the RELATIVE RANKING across styles + the "before" column for a later SHAPE-on sweep.
# It must NOT be quoted as where the export stands today.
cd "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web" || exit 1
D=research/exchange/_strataConformBisect
OUT="$D/s100/S101_GATE_SWEEP.tsv"
mkdir -p "$D/s100"
printf "style\tstem\tfacets\tbackfacing\tarea_pct\tverdict\n" > "$OUT"

declare -A S=(
  [artdeco]=ArtDeco [bamboosegments]=BambooSegments [basketweave]=BasketWeave
  [celticknot]=CelticKnot [celtictriquetra]=CelticTriquetra [crystalline]=Crystalline
  [dragonscales]=DragonScales [fourierbloom]=FourierBloom [geometricstar]=GeometricStar
  [gothicarches]=GothicArches [gyroidmanifold]=GyroidManifold [hexagonalhive]=HexagonalHive
  [lowpolyfacet]=LowPolyFacet [rippleinterference]=RippleInterference [spiralridges]=SpiralRidges
  [superellipsemorph]=SuperellipseMorph [superformulablossom]=SuperformulaBlossom
  [voronoi]=Voronoi [waveinterference]=WaveInterference
)

for f in "$D"/*_ring_D--.stl; do
  b=$(basename "$f" .stl); pre=${b%%_ring_D--}
  st=${S[$pre]}
  if [ -z "$st" ]; then echo "SKIP $b — no StyleId mapping"; continue; fi
  r=$(PF_S100_STL="$f" PF_S100_STYLE="$st" PF_S100_TAG="SW_$pre" \
        bash research/tools/run-s100-bf-gate.sh 2>&1)
  fac=$(echo "$r"  | grep -oE "^facets +: [0-9]+"                 | grep -oE "[0-9]+" | head -1)
  bf=$(echo "$r"   | grep -oE "BACK-FACING FACETS +: [0-9]+"      | grep -oE "[0-9]+" | head -1)
  ar=$(echo "$r"   | grep -oE "share of scope, AREA +: [0-9.]+%"  | grep -oE "[0-9.]+" | head -1)
  vd=$(echo "$r"   | grep -oE "GATE VERDICT: [A-Z-]+"             | awk '{print $3}'  | head -1)
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$st" "$b" "${fac:-?}" "${bf:-?}" "${ar:-?}" "${vd:-NOT-MEASURED}" >> "$OUT"
  echo "  $st  facets=${fac:-?}  backfacing=${bf:-?}  area=${ar:-?}%  ${vd:-NOT-MEASURED}"
done

echo
echo "=== S101 SWEEP (SHAPE-OFF lineage — upper bound, NOT the ship state) ==="
column -t -s $'\t' "$OUT" 2>/dev/null || cat "$OUT"
echo
echo "PASS (zero back-facing): $(awk -F'\t' 'NR>1 && $6=="PASS"' "$OUT" | wc -l) of $(($(wc -l < "$OUT")-1))"
