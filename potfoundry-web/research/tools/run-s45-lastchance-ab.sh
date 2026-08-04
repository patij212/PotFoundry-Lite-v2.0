#!/usr/bin/env bash
# S45 — LAST-CHANCE PLACEMENT SEARCH, matched A/B on the forked driver.
#
# WHY THIS FILE EXISTS. No invocation was ever recorded for `gothicarches_ring_DS-HT_S40VFC`, so the
# committed baseline cannot be reproduced and must not be A/B'd against directly (the standing lesson:
# run the flag-OFF control yourself). This script IS the arm definition. Both rows below differ in
# exactly one variable — PF_CB_LASTCHANCE — and everything else is transcribed from the S40VFC report
# header so the control reproduces that CONFIGURATION even though it cannot reproduce that FILE.
#
# HYPOTHESIS (registered before the numbers are read). The 2026-08-03 jam census measured that 28.1% of
# jammed facets have a legal single-edge split the driver's fixed 11-rung nudge ladder never samples.
# The treatment arm should therefore:
#   * REDUCE `unresolved` materially below the control's (~4,283 at this config);
#   * NOT raise worst AR above the 50 cap (every commit goes through the same `bisectAt` gate);
#   * cost only a small triangle increase, since it fires once per abandoned facet, not per refusal.
# A control that does not reproduce ~4,283 unresolved invalidates the comparison — check that FIRST.
#
# Usage:  bash research/tools/run-s45-lastchance-ab.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

export PF_STRATA_CB=1   # the driver's own opt-in gate; without it the suite skips and reports success
export PF_CB_STYLE=GothicArches
export PF_CB_STAGE=ring
# S40VFC ran [DIRECTED | SNAP | no-reproj]. BOTH default OFF; omitting them silently produces an `l--`
# LEPP/no-snap arm instead — the tag suffix is the only place that shows it. Always read the tag.
export PF_CB_DIRECTED=1
export PF_CB_SNAP=1
export PF_CB_TOL=0.01
export PF_CB_ACCEPT=0.0035
export PF_CB_TRICAP=8000000
export PF_CB_GRIDU=200
export PF_CB_GRIDV=140

# Phase-2 tightening field (149 loci, 500 um ball, 2.00x max scale — values live in the file).
export PF_CB_TIGHTEN=research/exchange/_phase2/S24i1.loci.json

# S10/S15/S19 aligned constrained seed.
export PF_CB_ALIGNED_SEED=1
export PF_CB_ALIGNED_ACROSS_ABS=1
export PF_CB_ALIGNED_RINGS=7
export PF_CB_ALIGNED_TURN_MUL=9

# S18 x-crossing patch emitter. NOTE: S40VFC also ran the S30 routed-coverage exclusion shadow
# (PF_CB_ALIGNED_PATCH_EXCLUSION_IDS=54). That flag lives only in the working tree's UNCOMMITTED driver
# edits, and this fork is taken from HEAD (the working copy is currently syntactically broken by an
# in-progress 1,181-line edit from another session). The flag is therefore absent from BOTH arms, which
# leaves the A/B internally valid while making this arm a near-, not exact-, reproduction of S40VFC.
export PF_CB_ALIGNED_PATCH=research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json
export PF_CB_ALIGNED_PATCH_TOPN=0
export PF_CB_ALIGNED_PATCH_IDS=0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016

export PF_CB_EMIT_UNRESOLVED=1
export NODE_OPTIONS=--max-old-space-size=6144

run_arm() {
  local suffix="$1" lastchance="$2"
  echo "=============================================================="
  echo "ARM ${suffix}   PF_CB_LASTCHANCE=${lastchance}"
  echo "=============================================================="
  PF_CB_TAG_SUFFIX="_${suffix}" PF_CB_LASTCHANCE="${lastchance}" \
    npx vitest run --config vitest.stratav2.config.ts
}

# Sequential, never concurrent: two 6 GB heaps on this box OOM the workers.
run_arm S46CTL 0   # control — the fork with the lever OFF must behave as the unforked driver
run_arm S46LC 96   # treatment — 96 swept positions per edge, coarse-to-fine from the midpoint
