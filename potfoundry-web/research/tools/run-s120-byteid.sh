#!/usr/bin/env bash
# run-s120-byteid.sh — S120 THE BYTE-IDENTITY GATE for the LINEAGE CENSUS.
#
#   bash research/tools/run-s120-byteid.sh CelticTriquetra
#   bash research/tools/run-s120-byteid.sh GothicArches
#
# Runs the SAME configuration twice:
#   arm BASE  = _s120Baseline.test.ts  (git show HEAD:.../_strataConformBisectL.test.ts, verbatim)
#   arm LIVE  = _strataConformBisectL.test.ts (the working tree, S120 landed)
# and md5s the two STLs. EQUAL or the change is not landable.
#
# TWO LIVE ARMS, NOT ONE — and this is stronger than S119's gate. S119 only proved its lever was inert
# when UNSET. S120 is a CENSUS: it must be free when it is ON, because every number the session reports
# comes from an arm with the flag ON. So the gate runs LIVE twice, once OFF and once ON, and demands the
# md5 of all three STLs be identical.
#
# The configuration is DELIBERATELY SMALL (coarse tol, small grid, low cap) so the gate is minutes, not
# hours — but it still drives tens of thousands of splits through `refineDirected` and `bisectAt`, which
# are the only code paths S120 touches. `splits` in each report is the receipt that it did.
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

echo "===== ARM BASE (HEAD, no S120 code at all) ====="
unset PF_CB_S120_LINEAGE
PF_CB_TAG_SUFFIX=_S120BASE npx vitest run --config vitest.s120base.config.ts > "$OUT/byteid_BASE_${STYLE}.log" 2>&1
echo "  vitest exit $?"
grep -E "^grid |^splits " "$OUT/byteid_BASE_${STYLE}.log" | head -2

echo "===== ARM LIVE-OFF (working tree, PF_CB_S120_LINEAGE unset) ====="
unset PF_CB_S120_LINEAGE
PF_CB_TAG_SUFFIX=_S120OFF npx vitest run --config vitest.stratal.config.ts > "$OUT/byteid_OFF_${STYLE}.log" 2>&1
echo "  vitest exit $?"
grep -E "^grid |^splits " "$OUT/byteid_OFF_${STYLE}.log" | head -2

echo "===== ARM LIVE-ON (working tree, PF_CB_S120_LINEAGE=1 — THE ARM THE SESSION QUOTES) ====="
export PF_CB_S120_LINEAGE=1
PF_CB_TAG_SUFFIX=_S120ON npx vitest run --config vitest.stratal.config.ts > "$OUT/byteid_ON_${STYLE}.log" 2>&1
echo "  vitest exit $?"
grep -E "^grid |^splits " "$OUT/byteid_ON_${STYLE}.log" | head -2
grep -E "S120 LINEAGE CENSUS" -A 3 "$OUT/byteid_ON_${STYLE}.log" | head -6

echo
echo "===== MD5 — ALL THREE MUST MATCH ====="
md5sum "$D/${stem}_ring"*_S120BASE.stl "$D/${stem}_ring"*_S120OFF.stl "$D/${stem}_ring"*_S120ON.stl 2>/dev/null
n=$(md5sum "$D/${stem}_ring"*_S120BASE.stl "$D/${stem}_ring"*_S120OFF.stl "$D/${stem}_ring"*_S120ON.stl 2>/dev/null | awk '{print $1}' | sort -u | wc -l)
if [ "$n" = "1" ]; then echo "  *** BYTE-IDENTICAL — the census is FREE ***"; else echo "  *** NOT IDENTICAL ($n distinct hashes) — THE CENSUS MOVES THE MESH. NOT LANDABLE. ***"; fi
