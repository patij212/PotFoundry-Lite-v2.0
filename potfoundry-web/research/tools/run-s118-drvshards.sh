#!/usr/bin/env bash
# run-s118-drvshards.sh — S118 DRIVE: run a RANGE of s118Score perpendicular PARTITION shards in parallel.
#
# PF_S118_PERPSHARD=i/n restricts the perpendicular phase to facets with f % n === i. Running every i
# covers every facet EXACTLY ONCE — it is a partition, not a sample — and the per-shard COUNT/AREA sum and
# MAX-of-MAXes are the exact mesh numbers. A SINGLE shard is not a mesh number and s118Score says so on
# every line it prints.
#
#   bash research/tools/run-s118-drvshards.sh <stl-abs> <tag> <n> <i-from> <i-to>
set -uo pipefail
cd "$(dirname "$0")/../.."
STL="$1"; TAG="$2"; N="$3"; FROM="$4"; TO="$5"
BUNDLE=research/bridge/out/_run_s118ScoreDRV.cjs
[ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
for ((i=FROM; i<=TO; i+=1)); do
  PF_S118_STL="$STL" PF_S118_TAG="${TAG}_q${i}" PF_S118_STYLE="${PF_S118_STYLE:-GothicArches}" \
  PF_S118_LO=0 PF_S118_ORIENT=0 PF_S118_TOPO=0 PF_S118_PERPSHARD="$i/$N" \
  NODE_OPTIONS=--max-old-space-size=4096 \
  node "$BUNDLE" > "/tmp/s118_${TAG}_q${i}.log" 2>&1 &
  echo "launched shard $i/$N -> /tmp/s118_${TAG}_q${i}.log"
done
wait
echo "ALL SHARDS $FROM..$TO DONE"
