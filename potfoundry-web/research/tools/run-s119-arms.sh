#!/usr/bin/env bash
# run-s119-arms.sh — S119 TASK 1: the parameter-metric edge-selection arms, ON THE DRIVER.
#
#   bash research/tools/run-s119-arms.sh <STYLE> <small|full> <ARMS csv>
#
# ARMS — one env var apart, every other flag identical. THE ONLY DIFFERENCE IS WHICH EDGE IS SPLIT.
#   ctl      PF_CB_S119_PARAMSEL unset      — the control (max chord SAG, a 3-D quantity)
#   param    PF_CB_S119_PARAMSEL=param      — TREATMENT: longest edge in the metric u=rMean*theta, v=z
#   long3d   PF_CB_S119_PARAMSEL=long3d     — CONTRAST: longest 3-D edge. Isolates METRIC from RULE.
#   short3d  PF_CB_S119_PARAMSEL=short3d    — PLACEBO: shortest 3-D edge (uninformed)
#   rand     PF_CB_S119_PARAMSEL=rand       — PLACEBO: uniform among candidates, seeded
#   attrib   param + PF_CB_S119_ATTRIB=1    — the disagreement rate vs the control's choice. SLOWER; its
#                                             WALL CLOCK IS NOT COMPARABLE and must never be quoted as param's.
#
# SCALE `full` is the configuration that produced the published baselines (see run-s118-arms.sh for the
# provenance of the GothicArches S39CTL recipe, transcribed here unchanged):
#   CelticTriquetra -> celtictriquetra_ring_D--H_*   (bare D--H, what S102 published)
#   GothicArches    -> gothicarches_ring_DS-HT_*     (S39CTL: SNAP + TIGHTEN + aligned seed)
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
#
# ═══ COPY-PASTEABLE: BUILD A MESH AT A GIVEN TOLERANCE WITH THE S119 LEVER ON ═══
#   export PF_STRATA_CB=1 PF_CB_STYLE=CelticTriquetra PF_CB_STAGE=ring PF_CB_DIRECTED=1
#   export PF_CB_TOL=0.01 PF_CB_GRIDU=200 PF_CB_GRIDV=140 PF_CB_TRICAP=8000000 PF_CB_MAXSECS=7200
#   export NODE_OPTIONS=--max-old-space-size=12288
#   export PF_CB_S118_CENSUS=1          # free, PROVEN byte-identical, exact f64 artefact census
#   export PF_CB_S119_PARAMSEL=param    # <<< THE LEVER
#   export PF_CB_TAG_SUFFIX=_YOURTAG    # or two agents overwrite each other's STL
#   npx vitest run --config vitest.stratal.config.ts
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

STYLE="${1:?usage: run-s119-arms.sh <STYLE> <small|full> <ctl,param,long3d,short3d,rand,attrib>}"
SCALE="${2:-small}"
ARMS="${3:-ctl,param}"
D=research/exchange/_strataConformBisect
OUT=$D/s119
mkdir -p "$OUT"

export PF_STRATA_CB=1
export PF_CB_STYLE="$STYLE"
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
# ALWAYS ON: measurement only, proven byte-identical in S118, and it is the instrument that reports the
# arc-altitude floor this session exists to move.
export PF_CB_S118_CENSUS=1
# PINNED so wall clocks are comparable when arms run concurrently on a 16-core box. The post-loop audit
# pool is READ-ONLY against the mesh and against rA, so this cannot move a vertex or change the STL —
# but leaving it at "physical cores" would let a solo arm look faster than a co-scheduled one.
export PF_CB_AUDIT_WORKERS="${PF_CB_AUDIT_WORKERS:-4}"

if [ "$SCALE" = "small" ]; then
  export PF_CB_TOL=0.05
  export PF_CB_GRIDU=60
  export PF_CB_GRIDV=40
  export PF_CB_TRICAP=200000
  export PF_CB_MAXSECS=1800
  export NODE_OPTIONS=--max-old-space-size=8192
  if [ "$STYLE" = "GothicArches" ]; then export PF_CB_SNAP=1; fi
else
  export PF_CB_TOL=0.01
  export PF_CB_GRIDU=200
  export PF_CB_GRIDV=140
  export PF_CB_TRICAP=8000000
  export PF_CB_MAXSECS=7200
  export NODE_OPTIONS=--max-old-space-size=12288
  if [ "$STYLE" = "GothicArches" ]; then
    # THE S39CTL RECIPE, transcribed from run-s118-arms.sh / run-land-driver.sh. Do not "improve" any line.
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
  fi
fi

run_arm () {   # $1 = arm name
  local a="$1"
  unset PF_CB_S119_PARAMSEL
  export PF_CB_S119_ATTRIB=0
  case "$a" in
    ctl) ;;
    param)   export PF_CB_S119_PARAMSEL=param ;;
    long3d)  export PF_CB_S119_PARAMSEL=long3d ;;
    short3d) export PF_CB_S119_PARAMSEL=short3d ;;
    rand)    export PF_CB_S119_PARAMSEL=rand ;;
    attrib)  export PF_CB_S119_PARAMSEL=param PF_CB_S119_ATTRIB=1 ;;
    *) echo "unknown arm $a"; return 1 ;;
  esac
  local tag="_S119${a}"
  local log="$OUT/${STYLE}_${SCALE}_${a}.log"
  echo "===================== $STYLE / $SCALE / arm $a  (tag $tag) ====================="
  local t0; t0=$(date +%s)
  PF_CB_TAG_SUFFIX="$tag" npx vitest run --config vitest.stratal.config.ts > "$log" 2>&1
  echo "  vitest exit $?   wall $(( $(date +%s) - t0 )) s"
  if grep -qE "1 skipped|0 passed" "$log"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; return 1; fi
  # ⚠ INSTRUMENT SCAR, OBSERVED LIVE IN S119: another agent running `npx esbuild` in this worktree tears
  # down the esbuild service THIS vitest process holds through the junctioned node_modules, and the arm
  # dies with "The service was stopped: write EPIPE" AFTER doing its full work. The existing
  # "1 skipped|0 passed" guard does NOT catch it (the log says "1 failed"), so a killed arm would be read
  # as a result. Name it here or it hides.
  if grep -qE "The service was stopped|service is no longer running" "$log"; then
    echo "  *** VOID — esbuild service torn down by a CONCURRENT esbuild INVOCATION. NOT A RESULT. RE-RUN. ***"; return 1
  fi
  if grep -qE "^ *Tests +1 failed|1 failed" "$log"; then echo "  *** ARM FAILED — NOT A RESULT ***"; return 1; fi
  grep -E "^grid |^splits |^unresolved" "$log" | head -3
  grep -E "^\*\*\* edge selection|^edge selection|^  triangles selected|^  ATTRIBUTION" "$log" | head -4
  sed -n '/S118 EMIT-TIME ADMISSION/,/arcAlt <    20/p' "$log"
  echo
}

IFS=',' read -ra AS <<< "$ARMS"
for a in "${AS[@]}"; do run_arm "$a"; done
echo "=== DONE. logs in $OUT ==="
