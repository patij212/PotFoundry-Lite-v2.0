#!/usr/bin/env bash
# run-s116-render.sh — S116 single-sided software rasteriser. Own bundle path; never share a runner.
#
# The meshes live in the PRIMARY checkout's research/exchange/ (gitignored, so absent from this worktree).
# They are passed by ABSOLUTE path and never copied, so the pixels are provably of the SAME bytes S108-S115
# measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s116Render.ts
BASE="$(basename "$TOOL" .ts)"
OUTB=research/bridge/out
BUNDLE="$OUTB/_run_${BASE}.cjs"
OUTDIR="${PF_S116_OUT:-research/exchange/_strataConformBisect/s116}"
REPORT="$OUTDIR/S116_RENDER_${PF_S116_RTAG:-ALL}.report.txt"
mkdir -p "$OUTB" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
