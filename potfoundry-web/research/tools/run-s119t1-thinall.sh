#!/usr/bin/env bash
# run-s119t1-thinall.sh — thin/pole census over every S119 TASK 1 arm STL that exists.
# Reuses the copied bundle (PF_S119T1_NOBUNDLE=1) so it NEVER invokes esbuild while a vitest arm is live.
set -uo pipefail
cd "$(dirname "$0")/../.."
D="$(pwd)/research/exchange/_strataConformBisect"
export PF_S119T1_NOBUNDLE=1
for a in ctl param long3d rand short3d; do
  STL="$D/celtictriquetra_ring_D--H_S119$a.stl"
  if [ -f "$STL" ]; then
    echo "── CT $a ──"
    PF_S118T_STL="$STL" PF_S118T_TAG="CT_$a" bash research/tools/run-s119t1-thin.sh >/dev/null 2>&1
  fi
done
for a in ctl param; do
  STL="$D/gothicarches_ring_DS-HT_S119$a.stl"
  if [ -f "$STL" ]; then
    echo "── GO $a ──"
    PF_S118T_STL="$STL" PF_S118T_TAG="GO_$a" bash research/tools/run-s119t1-thin.sh >/dev/null 2>&1
  fi
done
echo "=== thinall done ==="
