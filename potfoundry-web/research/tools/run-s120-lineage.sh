#!/usr/bin/env bash
# run-s120-lineage.sh — S120 TASK A: the LINEAGE CENSUS, ON THE DRIVER, FROM THE DRIVER'S OWN SEED.
#
#   bash research/tools/run-s120-lineage.sh <STYLE> <TAG>
#
# THE ONLY THING THIS CHANGES vs the published control is PF_CB_S120_LINEAGE=1, which is measurement and
# is gated byte-identical by research/tools/run-s120-byteid.sh. Everything else is transcribed from the
# recipe that PRODUCED THE PUBLISHED BASELINE, so the control arm must reproduce it TO THE DIGIT:
#
#   CelticTriquetra  -> celtictriquetra_ring_D--H_*   1,282,394 facets   (triCap 2.5 M, CAPPED)
#   GothicArches     -> gothicarches_ring_DS-HT_*     1,142,166 facets   (triCap 8 M, S39CTL recipe)
#
# ⚠ THE CT RECIPE'S triCap IS 2,500,000, NOT 8,000,000. run-s119-arms.sh `full` uses 8 M and therefore
# produces 1,303,516 facets — a DIFFERENT mesh from the published S102 baseline. Do not "fix" this line.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

STYLE="${1:?usage: run-s120-lineage.sh <STYLE> <TAG>}"
TAG="${2:?usage: run-s120-lineage.sh <STYLE> <TAG>}"
D=research/exchange/_strataConformBisect
OUT=$D/s120/lineage
mkdir -p "$OUT"

export PF_STRATA_CB=1
export PF_CB_STYLE="$STYLE"
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_TOL=0.01
export PF_CB_GRIDU=200
export PF_CB_GRIDV=140
export PF_CB_MAXSECS=7200
export NODE_OPTIONS=--max-old-space-size=12288
export PF_CB_S118_CENSUS=1          # free, proven byte-identical; gives the arc-altitude ladder to cross-read
export PF_CB_S120_LINEAGE=1         # <<< THE CENSUS
export PF_CB_AUDIT_WORKERS="${PF_CB_AUDIT_WORKERS:-4}"

if [ "$STYLE" = "GothicArches" ]; then
  # THE S39CTL RECIPE, transcribed from run-s119-arms.sh. Do not "improve" any line.
  export PF_CB_TRICAP=8000000
  export PF_CB_SNAP=1
  export PF_CB_TIGHTEN=C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_phase2/S24i1.loci.json
  export PF_CB_ALIGNED_SEED=1
  export PF_CB_ALIGNED_ACROSS_ABS=1
  export PF_CB_ALIGNED_RINGS=7
  export PF_CB_ALIGNED_TURN_MUL=9
  export PF_CB_ALIGNED_PATCH=C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json
  export PF_CB_ALIGNED_PATCH_TOPN=0
  export PF_CB_ALIGNED_PATCH_IDS=0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016
  export PF_CB_EMIT_UNRESOLVED=1
  export PF_CB_ALIGNED_RESOLVE_UM=50
  export PF_CB_ACCEPT=0.0035
  export PF_CB_CERTACCEPT=0
else
  export PF_CB_TRICAP=2500000
fi

log="$OUT/${STYLE}_${TAG}.log"
echo "===================== $STYLE  tag _$TAG ====================="
t0=$(date +%s)
PF_CB_TAG_SUFFIX="_$TAG" npx vitest run --config vitest.stratal.config.ts > "$log" 2>&1
echo "  vitest exit $?   wall $(( $(date +%s) - t0 )) s"
if grep -qE "1 skipped|0 passed" "$log"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; exit 1; fi
if grep -qE "The service was stopped|service is no longer running" "$log"; then
  echo "  *** VOID — esbuild service torn down by a CONCURRENT esbuild INVOCATION. NOT A RESULT. RE-RUN. ***"; exit 1
fi
if grep -qE "^ *Tests +1 failed|1 failed" "$log"; then echo "  *** ARM FAILED — NOT A RESULT ***"; exit 1; fi
echo "--- CONTROL IDENTITY (must match the published baseline TO THE DIGIT) ---"
grep -E "^grid " "$log" | head -1
grep -E "FINAL SOUP" "$log" | head -1
echo "--- S120 ---"
sed -n '/S120 LINEAGE CENSUS/,/THE TREAD EMITTER/p' "$log"
echo "=== DONE. log $log ==="
