#!/usr/bin/env bash
# S39 SINGLE ARM — one arm per invocation, so the remaining arms can run CONCURRENTLY.
#
#   bash research/tools/run-s39-one-arm.sh <TAG> <PF_CB_ACCEPT> <PF_CB_CERTACCEPT>
#
# S39CTL (blind @ 3.5 um) already landed and REPRODUCED (822 s / 1,142,166 tris / 774 unresolved),
# so the validity gate is passed and the remaining two arms are independent of each other:
#   S39B10   0.010  0   — the TOLERANCE change alone
#   S39CA10  0.010  1   — + the sound ruler
#
# ⚠ WALL TIME FROM A CONCURRENT RUN IS NOT COMPARABLE to the sequential control. The arms contend
# for memory bandwidth and cache even though each is single-threaded (the heap driver's pop loop is
# inherently serial — see _sweepPool.ts). Triangle counts, veto outcomes and the certificate are
# unaffected and remain fully comparable; WALL TIME IS NOT, and must not be quoted as an A/B result
# against S39CTL's 822 s.
#
# Heap is 4096 MB, not the usual 6144: two concurrent arms must not be able to overcommit. Measured
# working set for this configuration is ~0.7-3 GB, against 17.2 GB free.
#
# The caller is expected to bump PriorityClass after spawning — Windows EcoQoS was measured
# throttling this exact workload to 0.61 of a core, and the bump restored it to 1.00.
set -uo pipefail
cd "$(dirname "$0")/../.."

TAG="${1:?usage: run-s39-one-arm.sh <TAG> <ACCEPT> <CERTACCEPT>}"
ACCEPT="${2:?}"
CA="${3:?}"

export PF_STRATA_CB=1
export PF_CB_STYLE=GothicArches
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_SNAP=1
export PF_CB_TOL=0.01
export PF_CB_TRICAP=8000000
export PF_CB_GRIDU=200
export PF_CB_GRIDV=140
export PF_CB_TIGHTEN=research/exchange/_phase2/S24i1.loci.json
export PF_CB_ALIGNED_SEED=1
export PF_CB_ALIGNED_ACROSS_ABS=1
export PF_CB_ALIGNED_RINGS=7
export PF_CB_ALIGNED_TURN_MUL=9
export PF_CB_ALIGNED_PATCH=research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json
export PF_CB_ALIGNED_PATCH_TOPN=0
export PF_CB_ALIGNED_PATCH_IDS=0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016
export PF_CB_EMIT_UNRESOLVED=1
export PF_CB_ALIGNED_RESOLVE_UM=50
export PF_CB_MAXSECS=7200
export NODE_OPTIONS=--max-old-space-size=4096

echo "=============================================================="
echo "ARM ${TAG}   PF_CB_ACCEPT=${ACCEPT}   PF_CB_CERTACCEPT=${CA}   (concurrent)"
echo "=============================================================="
PF_CB_TAG_SUFFIX="_${TAG}" PF_CB_ACCEPT="${ACCEPT}" PF_CB_CERTACCEPT="${CA}" \
  npx vitest run --config vitest.s34resolve.config.ts
