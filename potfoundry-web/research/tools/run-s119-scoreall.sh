#!/usr/bin/env bash
# run-s119-scoreall.sh — score every finished S119 rung STL through the thin ladder.
#   bash research/tools/run-s119-scoreall.sh <STYLEPREFIX> <STYLE> <TAG...>
set -uo pipefail
cd "$(dirname "$0")/../.."
PFX="${1:?usage: run-s119-scoreall.sh <stlprefix> <STYLE> <TAG...>}"
STYLE="${2:?}"
shift 2
D="$(pwd)/research/exchange/_strataConformBisect"
for t in "$@"; do
  STL="$D/${PFX}_${t}.stl"
  if [ ! -f "$STL" ]; then echo "SKIP $t — no STL yet"; continue; fi
  if [ -f "$D/s119/LADDER_${t}.json" ] && [ "$D/s119/LADDER_${t}.json" -nt "$STL" ]; then echo "SKIP $t — already scored"; continue; fi
  echo "── scoring $t ──"
  PF_S119_STL="$STL" PF_S119_STYLE="$STYLE" bash research/tools/run-s119-ladder.sh "$t" | tail -3
done
echo "=== scoreall done ==="
