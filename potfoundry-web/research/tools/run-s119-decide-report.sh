#!/usr/bin/env bash
# run-s119-decide-report.sh — regenerate EVERY table of the S119 deciding run from the instruments' JSON.
# Nothing here measures; it only re-reads what s119ThinLadder / s119CliffRuler / the driver logs wrote.
# Never invokes esbuild.
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=research/exchange/_strataConformBisect/s119

echo "── CelticTriquetra: the two-arm ladder ──"
node research/tools/s119Decide2ArmTable.cjs CELTICTRIQUETRA \
  R1:S119LCTR1CTL:S119LCTR1PAR \
  R2:S119LCTR2CTL:S119LCTR2PAR \
  R3:S119LCTR3CTL:S119LCTR3PAR \
  R4:S119LCTR4CTL:S119LCTR4PAR > "$OUT/DECIDE_TABLE_CT.txt" 2>&1
tail -1 "$OUT/DECIDE_TABLE_CT.txt"

echo "── GothicArches (the C1 control style): the two-arm ladder ──"
node research/tools/s119Decide2ArmTable.cjs GOTHICARCHES \
  R1:S119LGOR1CTL:S119LGOR1PAR \
  R2:S119LGOR2CTL:S119LGOR2PAR \
  R3:S119LGOR3CTL:S119LGOR3PAR \
  R4:S119LGOR4CTL:S119LGOR4PAR > "$OUT/DECIDE_TABLE_GO.txt" 2>&1
tail -1 "$OUT/DECIDE_TABLE_GO.txt"

echo "── driver-side price ──"
node research/tools/s119DriverFacts.cjs \
  DRV2_CelticTriquetra_S119LCTR1CTL DRV2_CelticTriquetra_S119LCTR1PAR \
  DRV2_CelticTriquetra_S119LCTR2CTL DRV2_CelticTriquetra_S119LCTR2PAR DRV2_CelticTriquetra_S119LCTR2RND \
  DRV2_CelticTriquetra_S119LCTR3CTL DRV2_CelticTriquetra_S119LCTR3PAR \
  DRV2_CelticTriquetra_S119LCTR4CTL DRV2_CelticTriquetra_S119LCTR4PAR \
  DRV2_GothicArches_S119LGOR1CTL DRV2_GothicArches_S119LGOR1PAR \
  DRV2_GothicArches_S119LGOR2CTL DRV2_GothicArches_S119LGOR2PAR \
  DRV2_GothicArches_S119LGOR3CTL DRV2_GothicArches_S119LGOR3PAR \
  DRV2_GothicArches_S119LGOR4CTL DRV2_GothicArches_S119LGOR4PAR > "$OUT/DECIDE_PRICE.txt" 2>&1
cat "$OUT/DECIDE_PRICE.txt"

echo "── per-arm alpha fits (T2's instrument, one arm at a time) ──"
bash research/tools/run-s119-alpha2arm.sh CT_ARM_CTL S119LCTR1CTL S119LCTR2CTL S119LCTR3CTL S119LCTR4CTL | tail -2
bash research/tools/run-s119-alpha2arm.sh CT_ARM_PAR S119LCTR1PAR S119LCTR2PAR S119LCTR3PAR S119LCTR4PAR | tail -2
bash research/tools/run-s119-alpha2arm.sh GO_ARM_CTL S119LGOR1CTL S119LGOR2CTL S119LGOR3CTL S119LGOR4CTL | tail -2
bash research/tools/run-s119-alpha2arm.sh GO_ARM_PAR S119LGOR1PAR S119LGOR2PAR S119LGOR3PAR S119LGOR4PAR | tail -2
echo "=== S119 DECIDE REPORT REGENERATED ==="
