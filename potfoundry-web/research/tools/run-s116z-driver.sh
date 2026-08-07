#!/usr/bin/env bash
# run-s116z-driver.sh — ONE CelticTriquetra driver arm for the S116 PHASE 3 champion hunt.
#
#   bash research/tools/run-s116z-driver.sh <TAGSUFFIX> <TRICAP> <GUARD:on|off> [MAXSECS] [WORKERS]
#
# WHY THIS ARM EXISTS. celtictriquetra_ring_D--H_S102.stl (the SHAPE-guard mesh) is 9.74x better than
# the shipping mesh on fold area but its allocation budget was CAPPED at 2,500,000, so it is COARSER
# (1,282,394 tris vs 1,714,638) and loses on position. The hypothesis under test is that the guard's
# fold win and the shipping mesh's density win are INDEPENDENT and can be had together by raising the
# cap with the guard left on.
#
# THE COST-MATCHED CONTROL IS THE `off` ARM: the SAME cap, the SAME everything, with the guard family
# (PF_CB_SHAPE / PF_CB_MID3D / PF_CB_LONGFALL) turned off — the three flags the driver's own header
# states restore the pre-2026-07-29 splitter EXACTLY. That isolates the GUARD at matched budget, which
# is the only comparison that can attribute a difference to the lever rather than to triangle count.
#
# *** OPS SCAR, PAID FOR IN THIS SESSION AT 2 x 11 MINUTES: DO NOT RUN `npx esbuild` WHILE THIS IS
# RUNNING. *** The worktree's node_modules is a junction to the primary checkout's, so a CLI esbuild
# invocation tears down the esbuild service vitest is holding and BOTH arms die with
# "Error: The service is no longer running" after eleven minutes of work. Bundle every tool you will
# need BEFORE launching, then run only `node <bundle>`.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

SUF="${1:?usage: run-s116z-driver.sh <TAGSUFFIX> <TRICAP> <on|off> [MAXSECS] [WORKERS]}"
CAP="${2:?}"
GUARD="${3:?}"
MAXSECS="${4:-0}"
WORKERS="${5:-7}"

export NODE_OPTIONS=--max-old-space-size=12288
export PF_STRATA_CB=1
export PF_CB_STYLE=CelticTriquetra
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_TRICAP="${CAP}"
export PF_CB_MAXSECS="${MAXSECS}"
export PF_CB_AUDIT_WORKERS="${WORKERS}"
export PF_CB_TAG_SUFFIX="_${SUF}"
if [ "$GUARD" = "off" ]; then
  export PF_CB_SHAPE=0
  export PF_CB_MID3D=0
  export PF_CB_LONGFALL=0
fi

D=research/exchange/_strataConformBisect/s116
mkdir -p "$D"
REPORT="$D/S116Z_DRIVER_${SUF}.log"

echo "=============================================================="
echo "S116Z CT DRIVER ARM ${SUF}  cap=${CAP}  guard=${GUARD}  maxsecs=${MAXSECS}  workers=${WORKERS}"
echo "=============================================================="
npx vitest run -c vitest.strata.config.ts research/bridge/_strataConformBisectS34.test.ts 2>&1 | tee "$REPORT" &
NPID=$!
sleep 5
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
echo
echo "report -> $REPORT"
ls -la ../potfoundry-web/research/exchange/_strataConformBisect/celtictriquetra_ring_*${SUF}.stl 2>/dev/null
ls -la research/exchange/_strataConformBisect/celtictriquetra_ring_*${SUF}.stl 2>/dev/null
