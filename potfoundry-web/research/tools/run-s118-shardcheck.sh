#!/usr/bin/env bash
# run-s118-shardcheck.sh — prove the PARTITION really is a partition.
#
# Runs the GothicArches perpendicular phase as 4 shards and merges them. The merged COUNT / AREA / MAX
# must equal the unsharded run's 2,327 / 11.702 mm2 / 3.3268e-1 exactly. If sharding drifted by even one
# facet, some facet was counted twice or not at all, and every 1e7 number a DRIVE agent produces with
# PF_S118_PERPSHARD would be wrong in a way no single report could reveal.
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=research/bridge/out
mkdir -p "$OUT"
npx esbuild research/tools/s118Score.ts --bundle --platform=node --format=cjs --target=node20 --outfile="$OUT/_run_s118Score.cjs" || exit 1
npx esbuild research/tools/s118Merge.ts --bundle --platform=node --format=cjs --target=node20 --outfile="$OUT/_run_s118Merge.cjs" || exit 1
export NODE_OPTIONS=--max-old-space-size=12288
export PF_S118_STL="${PF_S118_STL:-C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl}"
export PF_S118_STYLE="${PF_S118_STYLE:-GothicArches}"
export PF_S118_LO=0 PF_S118_PNTH=1024 PF_S118_PNZ=512 PF_S118_ORIENT=0 PF_S118_TOPO=0
export PF_S118_TAG="${PF_S118_TAG:-GOTH_SHARD}"
N="${PF_S118_SHARDS:-4}"
i=0
while [ "$i" -lt "$N" ]; do
  PF_S118_PERPSHARD="$i/$N" node "$OUT/_run_s118Score.cjs" > "/tmp/s118_shard_$i.log" 2>&1
  echo "shard $i/$N exit $?  $(grep -E 'PERPENDICULAR:' "/tmp/s118_shard_$i.log" | head -1)"
  i=$((i + 1))
done
OUTDIR="${PF_S118_OUTDIR:-research/exchange/_strataConformBisect/s118}"
PF_S118M_GLOB="$OUTDIR/S118_SCORE_${PF_S118_TAG}_p*of${N}.json" node "$OUT/_run_s118Merge.cjs" \
  | tee "$OUTDIR/S118_SHARDCHECK_${PF_S118_TAG}.report.txt"
