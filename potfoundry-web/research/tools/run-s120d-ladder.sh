#!/usr/bin/env bash
# run-s120d-ladder.sh — S120 TASK D: THE DENSITY LADDER, >= 4 RUNGS, BOTH ARMS, BOTH STYLES.
#
#   bash research/tools/run-s120d-ladder.sh ct        # CelticTriquetra ladder (4 rungs x off/on) + placebo
#   bash research/tools/run-s120d-ladder.sh goth      # GothicArches   ladder (4 rungs x off/on) + placebo
#   bash research/tools/run-s120d-ladder.sh head      # the two PUBLISHED-RECIPE headline arms
#
# *** NEVER A/B A REFINEMENT LEVER AT ONE DENSITY. *** S119's apparent 76.6x penalty was a ONE-RUNG
# TRANSITION LAG that INVERTED to a 1.43x win at the next rung. Four rungs, both arms, both styles, and
# the growth EXPONENT (count ~ N^alpha) is the headline, not the endpoints.
#
# The two arms of a rung run CONCURRENTLY so their wall clocks are co-scheduled and comparable (a solo arm
# on a 16-core box looks faster than a co-scheduled one). PF_CB_AUDIT_WORKERS=3 keeps 2 arms x (1 main + 3
# audit) inside 8 of 16 logical cores. Rungs run SEQUENTIALLY so peak RAM stays near 2 x heap.
#
# NO `npx esbuild` ANYWHERE IN THIS SCRIPT — a CLI esbuild tears down the service a live vitest holds
# through the junctioned node_modules and kills the arm with EPIPE *after* it has done its work.
set -uo pipefail
cd "$(dirname "$0")/../.."
WHICH="${1:-ct}"
A=research/tools/run-s120d-arm.sh
OUT=research/exchange/_strataConformBisect/s120d
mkdir -p "$OUT"

pair () {   # style tag_prefix tricap accept heapmb
  local st="$1" tp="$2" cap="$3" acc="$4" hm="$5"
  echo "######## RUNG $tp   style=$st  TRICAP=$cap  ACCEPT=$acc ########"
  bash "$A" "$st" off "${tp}OFF" "$cap" "$acc" "$hm" > "$OUT/arm_${tp}OFF.txt" 2>&1 &
  local p1=$!
  bash "$A" "$st" on  "${tp}ON"  "$cap" "$acc" "$hm" > "$OUT/arm_${tp}ON.txt"  2>&1 &
  local p2=$!
  wait $p1; echo "  off exit $?"
  wait $p2; echo "  on  exit $?"
  tail -n 12 "$OUT/arm_${tp}OFF.txt"
  tail -n 12 "$OUT/arm_${tp}ON.txt"
}
solo () {   # style arm tag tricap accept heapmb
  echo "######## SOLO $3   style=$1  arm=$2  TRICAP=$4  ACCEPT=$5 ########"
  bash "$A" "$1" "$2" "$3" "$4" "$5" "$6" > "$OUT/arm_$3.txt" 2>&1
  echo "  exit $?"
  tail -n 12 "$OUT/arm_$3.txt"
}

case "$WHICH" in
  # ── CelticTriquetra. TRICAP 8 M on every rung so the rung DRAINS: a capped rung confounds density with
  #    the cap and Task C excluded such rungs from every verdict. ACCEPT spans 8x. ──
  ct)
    pair CelticTriquetra DCT1 8000000 0.056 6144
    pair CelticTriquetra DCT2 8000000 0.028 6144
    pair CelticTriquetra DCT3 8000000 0.014 8192
    pair CelticTriquetra DCT4 8000000 0.007 10240
    ;;
  ctpla)
    solo CelticTriquetra placebo DCT4PLA 8000000 0.007 10240
    ;;
  # ── GothicArches, S39CTL recipe (SNAP + TIGHTEN + aligned seed), ACCEPT spanning 8x. Rung 4 is the
  #    PUBLISHED baseline setting, so its OFF arm is also the provenance arm. ──
  goth)
    pair GothicArches DGO1 8000000 0.028  6144
    pair GothicArches DGO2 8000000 0.014  6144
    pair GothicArches DGO3 8000000 0.007  8192
    pair GothicArches DGO4 8000000 0.0035 10240
    ;;
  gothpla)
    solo GothicArches placebo DGO4PLA 8000000 0.0035 10240
    ;;
  # ── THE PUBLISHED-RECIPE HEADLINE ARMS. CelticTriquetra's published baseline is TRICAP 2.5 M (NOT 8 M —
  #    at 8 M the same recipe gives 1,303,516 facets, a DIFFERENT mesh). Its OFF arm must reproduce
  #    1,282,394 facets / 48,535.770 mm2 TO THE DIGIT or nothing in this session is a result. ──
  head)
    pair CelticTriquetra DCTH 2500000 0.007 10240
    solo CelticTriquetra placebo DCTHPLA 2500000 0.007 10240
    ;;
  *) echo "usage: run-s120d-ladder.sh <ct|goth|head>"; exit 2 ;;
esac
echo "LADDER SEGMENT '$WHICH' COMPLETE"
