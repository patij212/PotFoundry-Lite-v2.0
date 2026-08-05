#!/usr/bin/env bash
# THE RUNNER TEMPLATE for an offline, read-only research probe. Copy it; do not sed an existing runner.
#
#   cp research/tools/_run-template.sh research/tools/run-<name>.sh
#   # then set TOOL below. Everything else derives from it.
#
# *** WHY THIS FILE EXISTS: A REAL COLLISION, MEASURED. *** Every runner in this directory was made by
# `sed`-ing a previous one, which copies its HARDCODED bundle path along with everything else. On
# 2026-08-05 two agents working in parallel both bundled to `research/bridge/out/_run_s51.cjs`, and one
# of them executed the OTHER'S BINARY and reported its numbers as its own. It was caught, but only
# because the numbers looked wrong for the question asked.
#
# The bundle name here is DERIVED FROM THE TOOL NAME, so two tools cannot collide unless they are the
# same tool. That is the whole point of the file.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

# ── THE ONE LINE TO EDIT ──────────────────────────────────────────────────────────────────────────
TOOL=research/tools/s85PosRebase.ts
# ──────────────────────────────────────────────────────────────────────────────────────────────────

BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"                       # derived, never hardcoded
# S85 runs MANY meshes concurrently off ONE bundle. Three jobs all esbuild-ing to the same output file is
# exactly the collision _run-template.sh exists to prevent, so the bundle step is gated: bundle ONCE
# (PF_S85_BUNDLE=1, no job running), then launch every mesh with PF_S85_BUNDLE=0. The report name carries
# arm+tag so concurrent jobs cannot overwrite each other's log either.
REPORT="research/exchange/_strataConformBisect/S85_${PF_S85_ARM:-target}_${PF_S85_TAG:-X}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"

if [ "${PF_S85_BUNDLE:-1}" = "1" ]; then
  echo "── bundling $TOOL -> $BUNDLE ──"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

  # TS2304 only: a full typecheck of this repo is slow and noisy, but an undefined identifier in a probe
  # is a silent wrong answer rather than a crash, so it is worth the seconds.
  echo "── checking for undefined identifiers (TS2304 only) ──"
  npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
    --skipLibCheck --strict false "$TOOL" 2>&1 | grep "TS2304" && {
      echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"
else
  [ -f "$BUNDLE" ] || { echo "*** $BUNDLE missing — run once with PF_S85_BUNDLE=1 first ***"; exit 1; }
  echo "── reusing $BUNDLE (PF_S85_BUNDLE=0) ──"
fi

export NODE_OPTIONS=--max-old-space-size=6144
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
