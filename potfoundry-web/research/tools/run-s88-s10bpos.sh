#!/usr/bin/env bash
# S88 — run S87's UNMODIFIED tool to score the honest POSITION of `_S10B`, the family's one clean
# buy-more-triangles arm (aligned seed BIT-IDENTICAL to _S10A, PF_CB_ACCEPT 0.0035 -> 0.00175,
# 1.626x the triangles). S87 scored _S10B on ORIENTATION only; its POSITION row is the missing
# DENSITY NULL that decides whether _S28i1's 0.604x area movement is a lever or is density.
#
# Copied from research/tools/_run-template.sh. TWO DELIBERATE DEVIATIONS, both to avoid stepping on
# another agent's files:
#   1. TOOL is s87's, which I own read/run but MUST NOT EDIT. It is run byte-unmodified, so the row it
#      produces is directly comparable with _S10A's (same tol, nMax, N, DIMS, golden-stride construction).
#   2. The BUNDLE is named for THIS runner, not for the tool, so a concurrent s87 run cannot be mid-write
#      on the binary I execute. (The template derives the bundle from the tool precisely to stop two
#      DIFFERENT tools colliding; here it is the SAME tool, and the hazard is the opposite one — a write
#      race on one path. Naming it s88 removes both.)
#   3. PF_S87_TAG is in my own s88 namespace so no s87 output file is overwritten.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s87LedgerReexam.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s88_s10bpos.cjs"
REPORT="research/exchange/_strataConformBisect/s88S10Bpos.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"

echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=6144
export PF_S87_ARM=pos
export PF_S87_TAG=s88S10B
export PF_S87_STEM=gothicarches_ring_DS-H_S10B
export PF_S87_STYLE=GothicArches
export PF_S87_N=50000
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
