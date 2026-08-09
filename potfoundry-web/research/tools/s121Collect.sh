#!/usr/bin/env bash
# s121Collect.sh — assemble the S121 result table from the arm logs. Pure grep: it invokes NOTHING, so it
# is safe to run while a driver arm is live (a concurrent esbuild would tear down the arm's service).
set -uo pipefail
cd "$(dirname "$0")/../.."
D=research/exchange/_strataConformBisect
OUT=$D/s121

echo "════════════════════════════════════════════════════════════════════════════════════════════════"
echo "S121 RESULT MATRIX — COUNT + AREA + MAX, per emitter, per flag combination"
echo "════════════════════════════════════════════════════════════════════════════════════════════════"
echo "PUBLISHED BASELINE md5:"
echo "  ca7e8bb32baec7a24b934e77eb6bb82c  celtictriquetra_ring_D--H_S102.stl"
echo "  9d5061f111f683ce65644809ded04876  gothicarches_ring_DS-HT_S39CTL.stl"
echo

for STYLE in CelticTriquetra GothicArches; do
  for ARM in OFFOFF ONOFF OFFON ONON; do
    LOG="$OUT/DRV_${STYLE}_${ARM}.log"
    [ -f "$LOG" ] || continue
    echo "──────────────────────────────────────────────────────────────────────────────────────────────"
    echo "$STYLE  $ARM"
    stem=$(echo "$STYLE" | tr '[:upper:]' '[:lower:]')
    stl=$(ls -1 "$D/${stem}_ring"*"_S121_${ARM}.stl" 2>/dev/null | head -1)
    [ -n "$stl" ] && echo "  md5 $(md5sum "$stl" | awk '{print $1}')"
    grep -E "^grid " "$LOG" | head -1 | sed 's/^/  /'
    grep -E "^  soup: " "$LOG" | head -1
    grep -E "FINAL SOUP" "$LOG" | head -1 | sed 's/^ */  /'
    echo "  -- TOPOLOGY --"
    grep -E "non-manifold edges|reversed facets|seam-crack edges|boundary edges" "$LOG" | sed 's/^ */  /'
    echo "  -- S121 FIX 1 (treads) --"
    grep -E "S121 FIX 1|densify/re-zip|REFUSED —|RESIDUAL —|WALL fan children" "$LOG" | sed 's/^ */  /'
    echo "  -- S120 TREAD CENSUS (the independent in-driver instrument) --"
    grep -E "THE 3-D CONTROL: [0-9]+ of [0-9]+ treads" "$LOG" | sed 's/^ */  /'
    grep -E "^       facets [0-9]+ \(" "$LOG" | head -1 | sed 's/^ */  /'
    echo "  -- S121 FIX 2 (seed) --"
    grep -E "initial grid:|S121 FIX 2|S121 SEED ANATOMY|S121 SEED RESIDUAL" "$LOG" | sed 's/^ */  /'
    grep -E "^       tri +[0-9]+  AR" "$LOG" | head -8 | sed 's/^ */  /'
    echo "  -- STL-SIDE INDEPENDENT SCAN --"
    [ -f "$OUT/STLAR_${STYLE}_${ARM}.txt" ] && grep -E "facets |OVER THE CAP|worst 3-D AR|AR histogram" "$OUT/STLAR_${STYLE}_${ARM}.txt" | sed 's/^ */  /'
    echo "  -- WALL CLOCK --"
    grep -E "Duration " "$LOG" | tail -1 | sed 's/^ */  /'
  done
done
echo "════════════════════════════════════════════════════════════════════════════════════════════════"
