#!/usr/bin/env bash
# run-s120d-byteid.sh — S120 TASK D THE BYTE-IDENTITY GATE for the 1-RING RETRIANGULATION OPERATOR.
#
#   bash research/tools/run-s120d-byteid.sh CelticTriquetra
#   bash research/tools/run-s120d-byteid.sh GothicArches
#
# THREE ARMS:
#   BASE     = _s120dBaseline.test.ts  (git show HEAD:.../_strataConformBisectL.test.ts, HEAD = a7299ad0)
#   LIVE-OFF = _strataConformBisectL.test.ts, PF_CB_S120_RETRI unset   -> MUST be md5-equal to BASE
#   LIVE-ON  = _strataConformBisectL.test.ts, PF_CB_S120_RETRI=1       -> MUST DIFFER (it is a MOVE, not a
#              census; an ON arm that is byte-identical means the operator never fired and the gate is
#              vacuous — the S118 scar of a lever that was inert at defaults).
#
# So this gate is TWO-SIDED, which a census gate cannot be: equality where equality is the claim, and
# INEQUALITY where inequality is the claim. Both directions are asserted below.
#
# The configuration is DELIBERATELY SMALL (coarse tol, small grid, low cap) so the gate is minutes, not
# hours — but it still drives tens of thousands of splits through `refineDirected`, and its `splits` and
# `unresolved by reason` lines are the receipt that the strand site this operator hooks was reached.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

STYLE="${1:-CelticTriquetra}"
D=research/exchange/_strataConformBisect
OUT=$D/s120
mkdir -p "$OUT"

export PF_STRATA_CB=1
export PF_CB_STYLE="$STYLE"
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_TOL=0.05
export PF_CB_GRIDU=60
export PF_CB_GRIDV=40
export PF_CB_TRICAP=200000
export PF_CB_MAXSECS=1800
export NODE_OPTIONS=--max-old-space-size=8192
if [ "$STYLE" = "GothicArches" ]; then export PF_CB_SNAP=1; fi
export PF_CB_S119_PARAMSEL=0
export PF_CB_S119_ATTRIB=0

stem="$(echo "$STYLE" | tr '[:upper:]' '[:lower:]')"

echo "===== ARM BASE (HEAD a7299ad0, no Task-D code at all) ====="
unset PF_CB_S120_RETRI
PF_CB_TAG_SUFFIX=_S120DBASE npx vitest run --config vitest.s120dbase.config.ts > "$OUT/byteidD_BASE_${STYLE}.log" 2>&1
echo "  vitest exit $?"
grep -E "^grid |^splits |^  unresolved by reason" "$OUT/byteidD_BASE_${STYLE}.log" | head -3

echo "===== ARM LIVE-OFF (working tree, PF_CB_S120_RETRI unset) ====="
unset PF_CB_S120_RETRI
PF_CB_TAG_SUFFIX=_S120DOFF npx vitest run --config vitest.stratal.config.ts > "$OUT/byteidD_OFF_${STYLE}.log" 2>&1
echo "  vitest exit $?"
grep -E "^grid |^splits |^  unresolved by reason" "$OUT/byteidD_OFF_${STYLE}.log" | head -3
grep -E "1-ring retriangulation" "$OUT/byteidD_OFF_${STYLE}.log" | head -2

echo "===== ARM LIVE-ON (working tree, PF_CB_S120_RETRI=1) ====="
export PF_CB_S120_RETRI=1
PF_CB_TAG_SUFFIX=_S120DON npx vitest run --config vitest.stratal.config.ts > "$OUT/byteidD_ON_${STYLE}.log" 2>&1
echo "  vitest exit $?"
grep -E "^grid |^splits |^  unresolved by reason" "$OUT/byteidD_ON_${STYLE}.log" | head -3
grep -E "1-ring retriangulation" -A 5 "$OUT/byteidD_ON_${STYLE}.log" | head -8

echo
echo "===== MD5 ====="
mB=$(md5sum "$D/${stem}_ring"*_S120DBASE.stl 2>/dev/null | awk '{print $1}')
mO=$(md5sum "$D/${stem}_ring"*_S120DOFF.stl  2>/dev/null | awk '{print $1}')
mN=$(md5sum "$D/${stem}_ring"*_S120DON.stl   2>/dev/null | awk '{print $1}')
echo "  BASE     $mB"
echo "  LIVE-OFF $mO"
echo "  LIVE-ON  $mN"
if [ -z "$mB" ] || [ -z "$mO" ] || [ -z "$mN" ]; then echo "  *** A STL IS MISSING — NOT A RESULT ***"; exit 1; fi
if [ "$mB" = "$mO" ]; then echo "  *** FLAG-OFF BYTE-IDENTICAL TO HEAD — the operator is inert when unset ***";
else echo "  *** NOT IDENTICAL — THE OPERATOR MOVES THE MESH WITH THE FLAG OFF. NOT LANDABLE. ***"; exit 1; fi
if [ "$mN" != "$mO" ]; then echo "  *** FLAG-ON DIFFERS — the operator actually fired (a gate that passes both ways is vacuous) ***";
else echo "  *** FLAG-ON IS ALSO IDENTICAL — THE OPERATOR NEVER FIRED. The ON arm proves nothing. ***"; exit 1; fi
