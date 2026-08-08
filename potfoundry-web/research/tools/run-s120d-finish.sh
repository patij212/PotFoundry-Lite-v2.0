#!/usr/bin/env bash
# run-s120d-finish.sh — S120 TASK D: wait for the two ladders, then SCORE every mesh and TABLE the result.
#
#   bash research/tools/run-s120d-finish.sh
#
# Blocks until both ladder segments have written their rung-4 ON arm, then:
#   1. runs the placebo arm of each style at rung 4 (the COST-MATCHED PLACEBO — one per operator),
#   2. runs research/tools/s120dPole.cjs over EVERY produced STL, cross-checked against the second
#      instrument (research/tools/s118ThinCensus.ts via its prebuilt bundle),
#   3. builds the ladder table with the growth exponents.
# Nothing here invokes esbuild.
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=research/exchange/_strataConformBisect/s120d

wait_for () {   # file that must contain `attempted`
  while true; do
    [ -f "$1" ] && grep -q "attempted" "$1" 2>/dev/null && break
    sleep 30
  done
}
echo "waiting for CelticTriquetra rung 4 …"; wait_for "$OUT/DRV_CelticTriquetra_DCT4ON.log"
echo "waiting for GothicArches rung 4 …";   wait_for "$OUT/DRV_GothicArches_DGO4ON.log"
echo "both ladders have produced rung 4 at $(date)"
sleep 60   # let the two ladder scripts finish their own tails

echo "════════ PLACEBO ARMS (cost-matched, one per operator) — run CONCURRENTLY, as the rung pairs were ════════"
bash research/tools/run-s120d-ladder.sh ctpla   > "$OUT/seg_ctpla.txt"   2>&1 &
P1=$!
bash research/tools/run-s120d-ladder.sh gothpla > "$OUT/seg_gothpla.txt" 2>&1 &
P2=$!
wait $P1; echo "  ct placebo exit $?"
wait $P2; echo "  goth placebo exit $?"

echo "════════ STL CENSUSES ════════"
bash research/tools/run-s120d-score.sh \
  DCT1OFF DCT1ON DCT2OFF DCT2ON DCT3OFF DCT3ON DCT4OFF DCT4ON DCT4PLA \
  DGO1OFF DGO1ON DGO2OFF DGO2ON DGO3OFF DGO3ON DGO4OFF DGO4ON DGO4PLA \
  > "$OUT/SCORE_ALL.txt" 2>&1
echo "  score exit $?"
tail -40 "$OUT/SCORE_ALL.txt"

echo "════════ LADDER TABLES ════════"
node research/tools/s120dTable.cjs DCT1 DCT2 DCT3 DCT4 > "$OUT/S120D_LADDER_CT.report.txt" 2>&1
node research/tools/s120dTable.cjs DGO1 DGO2 DGO3 DGO4 > "$OUT/S120D_LADDER_GOTH.report.txt" 2>&1
echo "tables at $OUT/S120D_LADDER_CT.report.txt and $OUT/S120D_LADDER_GOTH.report.txt"
echo "S120D FINISH COMPLETE at $(date)"
