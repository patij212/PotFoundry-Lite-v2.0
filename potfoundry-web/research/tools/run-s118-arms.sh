#!/usr/bin/env bash
# S118 — the treatment arms.
#
#   bash research/tools/run-s118-arms.sh <STYLE> <SCALE small|full> <ARMS csv of ctl,cen,adm>
#
# ARMS
#   ctl  every S118 flag OFF                      — the control
#   cen  PF_CB_S118_CENSUS=1                      — MEASUREMENT ONLY; must stay byte-identical to ctl
#   adm  PF_CB_S118_ADMIT=1 PF_CB_S118_CENSUS=1   — the gate
#
# SCALE `full` is the configuration that produced the published baselines:
#   CelticTriquetra -> celtictriquetra_ring_D--H_S102.stl  (1,282,394 facets)
#   GothicArches    -> gothicarches_ring_DS-HT_S39CTL.stl  (1,142,166 facets, needs the S39 flag set)
# SCALE `small` is the byte-identity gate's cheap configuration, for iterating.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════════════
# FOR THE DRIVE PHASE — BUILD A MESH AT A GIVEN TOLERANCE. Copy-pasteable, from the worktree root
#   C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/.claude/worktrees/s112-angular-quantity/potfoundry-web
#
#   # 0.01 mm, CelticTriquetra, with the S118 gate and census on:
#   bash research/tools/run-s118-arms.sh CelticTriquetra full adm
#
#   # ... or spelled out, if you need to vary the tolerance:
#   export PF_STRATA_CB=1 PF_CB_STYLE=CelticTriquetra PF_CB_STAGE=ring PF_CB_DIRECTED=1
#   export PF_CB_TOL=0.01 PF_CB_GRIDU=200 PF_CB_GRIDV=140 PF_CB_TRICAP=8000000 PF_CB_MAXSECS=7200
#   export NODE_OPTIONS=--max-old-space-size=12288
#   export PF_CB_S118_CENSUS=1        # ALWAYS ON: free, PROVEN byte-identical, exact f64 artefact census
#   export PF_CB_S118_ADMIT=1         # the gate — see the session verdict before trusting it
#   export PF_CB_TAG_SUFFIX=_YOURTAG  # or two agents overwrite each other's STL
#   npx vitest run --config vitest.stratal.config.ts
#
# GOING TO 0.001 mm: set PF_CB_TOL=0.001 and RAISE THE CAP AND THE HEAP TOGETHER — the brief prices
# ~1.1e7 (Gothic) / ~1.7e7 (CT) triangles, so PF_CB_TRICAP=20000000 and
# NODE_OPTIONS=--max-old-space-size=16384 at minimum. PF_CB_MAXSECS is a TRAJECTORY guard, not a budget:
# a run that trips it prints [TIME-CAPPED] and its numbers are a trajectory, not a verdict.
#
# ⚠ GothicArches at `full` carries the S39CTL recipe (SNAP + TIGHTEN + aligned seed) transcribed from
# run-land-driver.sh. CelticTriquetra at `full` is bare D--H, which is what S102 published. Do not mix
# the two flag sets between a control and its treatment.
# ═══════════════════════════════════════════════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

STYLE="${1:?usage: run-s118-arms.sh <STYLE> <small|full> <ctl,cen,adm>}"
SCALE="${2:-small}"
ARMS="${3:-ctl,cen,adm}"
D=research/exchange/_strataConformBisect
OUT=$D/s118
mkdir -p "$OUT"

export PF_STRATA_CB=1
export PF_CB_STYLE="$STYLE"
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1

if [ "$SCALE" = "small" ]; then
  export PF_CB_TOL=0.05
  export PF_CB_GRIDU=60
  export PF_CB_GRIDV=40
  export PF_CB_TRICAP=200000
  export PF_CB_MAXSECS=1800
  export NODE_OPTIONS=--max-old-space-size=8192
else
  export PF_CB_TOL=0.01
  export PF_CB_GRIDU=200
  export PF_CB_GRIDV=140
  export PF_CB_TRICAP=8000000
  export PF_CB_MAXSECS=7200
  export NODE_OPTIONS=--max-old-space-size=12288
  if [ "$STYLE" = "GothicArches" ]; then
    # THE S39CTL RECIPE, transcribed from run-land-driver.sh. Do not "improve" any line of it.
    export PF_CB_SNAP=1
    # ABSOLUTE paths into the MAIN repo: this worktree does not carry these two research artifacts, and
    # the relative paths from run-land-driver.sh made both Gothic arms die in 3 s with ENOENT (S118, caught
    # by the runner's own "DID NOT RUN" guard rather than by reading a plausible-looking number).
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
  export PF_CB_S118_ADMIT=0 PF_CB_S118_CENSUS=0 PF_CB_S118_PARAMMID=0
  case "$a" in
    ctl) ;;
    cen) export PF_CB_S118_CENSUS=1 ;;
    adm) export PF_CB_S118_CENSUS=1 PF_CB_S118_ADMIT=1 ;;
    pmid) export PF_CB_S118_CENSUS=1 PF_CB_S118_PARAMMID=1 ;;
    *) echo "unknown arm $a"; return 1 ;;
  esac
  local tag="_S118${SCALE^^}${a^^}"
  local log="$OUT/${STYLE}_${SCALE}_${a}.log"
  echo "===================== $STYLE / $SCALE / arm $a  (tag $tag) ====================="
  local t0; t0=$(date +%s)
  PF_CB_TAG_SUFFIX="$tag" npx vitest run --config vitest.stratal.config.ts > "$log" 2>&1
  echo "  vitest exit $?   wall $(( $(date +%s) - t0 )) s"
  if grep -qE "1 skipped|0 passed" "$log"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; return 1; fi
  grep -E "^grid |^splits |^unresolved" "$log" | head -3
  sed -n '/S118 EMIT-TIME ADMISSION/,/arcAlt <    20/p' "$log"
  echo
}

IFS=',' read -ra AS <<< "$ARMS"
for a in "${AS[@]}"; do run_arm "$a"; done
echo "=== DONE. logs in $OUT ==="
