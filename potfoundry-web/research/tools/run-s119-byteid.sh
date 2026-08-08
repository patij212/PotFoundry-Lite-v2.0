#!/usr/bin/env bash
# run-s119-byteid.sh — S119 THE BYTE-IDENTITY GATE.
#
#   bash research/tools/run-s119-byteid.sh CelticTriquetra
#   bash research/tools/run-s119-byteid.sh GothicArches
#
# Runs the SAME configuration twice with PF_CB_S119_PARAMSEL UNSET:
#   arm BASE  = _s119Baseline.test.ts  (git show HEAD:.../_strataConformBisectL.test.ts, verbatim)
#   arm LIVE  = _strataConformBisectL.test.ts (the working tree, S119 landed, flag off)
# and md5s the two STLs. EQUAL or the change is not landable.
#
# The configuration is DELIBERATELY SMALL (coarse tol, small grid, low cap) so the gate is minutes, not
# hours — but it still drives tens of thousands of splits through `refineDirected`, which is the ONLY code
# path S119 touches. A gate that never reaches the changed line proves nothing; `splits` in each report is
# the receipt that it did. GothicArches additionally carries SNAP=1 so the SNAP branch of `splitEdge` is
# exercised on at least one arm.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

STYLE="${1:-CelticTriquetra}"
D=research/exchange/_strataConformBisect
OUT=$D/s119
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
# the S119 lever explicitly OFF — the gate is about the DEFAULT, so state it rather than rely on it
export PF_CB_S119_PARAMSEL=0
export PF_CB_S119_ATTRIB=0

stem="$(echo "$STYLE" | tr '[:upper:]' '[:lower:]')"

echo "===== ARM BASE (HEAD) ====="
PF_CB_TAG_SUFFIX=_S119BASE npx vitest run --config vitest.s119base.config.ts > "$OUT/byteid_BASE_${STYLE}.log" 2>&1
echo "  vitest exit $?"
grep -E "^grid |^splits " "$OUT/byteid_BASE_${STYLE}.log" | head -2

echo "===== ARM LIVE (working tree, S119 flag OFF) ====="
PF_CB_TAG_SUFFIX=_S119LIVE npx vitest run --config vitest.stratal.config.ts > "$OUT/byteid_LIVE_${STYLE}.log" 2>&1
echo "  vitest exit $?"
grep -E "^grid |^splits " "$OUT/byteid_LIVE_${STYLE}.log" | head -2
grep -E "^edge selection" "$OUT/byteid_LIVE_${STYLE}.log" | head -2

echo
echo "===== MD5 ====="
ls -1 "$D/${stem}_ring"*_S119BASE.stl "$D/${stem}_ring"*_S119LIVE.stl 2>/dev/null
md5sum "$D/${stem}_ring"*_S119BASE.stl "$D/${stem}_ring"*_S119LIVE.stl 2>/dev/null
