#!/usr/bin/env bash
# run-s120-ct.sh — S120 TASK C. CelticTriquetra cross-style arm (CT2X: the DRAINED 1,303,516-facet run,
# acceptTol 7 µm per its own driver log). Tagged CT2Xc so it cannot collide with the ladder's own CT2X.
set -uo pipefail
cd "$(dirname "$0")/../.."
EX="$(pwd)/research/exchange/_strataConformBisect"
export PF_S120_DIR="$EX/s120"
export PF_S120_NOBUNDLE=1
export PF_S120_TAG=CT2Xc
export PF_S120_STL="$EX/celtictriquetra_ring_D--H_S119CT2X.stl"
export PF_S120_STYLE=CelticTriquetra
export PF_S120_ACCEPT_UM=7
export PF_S120_SNAP=0
export PF_S120_OUT="$PF_S120_DIR/blocked_CT2Xc.json"
bash research/tools/run-s120-blocked.sh > /dev/null 2>&1
echo "stage1 done"
export PF_S120_DUMP="$PF_S120_OUT"
bash research/tools/run-s120-applyc.sh > /dev/null 2>&1
echo "stage4 done"
PF_S120_APPLYC_PLACEBO=1 bash research/tools/run-s120-applyc.sh > /dev/null 2>&1
echo "stage4 placebo done"
bash research/tools/run-s120-ops.sh > /dev/null 2>&1
echo "stage2 done"
