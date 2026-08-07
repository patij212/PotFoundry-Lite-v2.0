#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."
export PF_S115_STL="C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/celtictriquetra_ring_D--.stl"
OUT=research/bridge/out
mkdir -p "$OUT" research/exchange/_strataConformBisect/s115inverted
npx esbuild research/tools/s115BoundaryProbe.ts --bundle --platform=node --format=cjs --target=node20 --outfile="$OUT/_run_s115Boundary.cjs" || exit 1
export NODE_OPTIONS=--max-old-space-size=10240
node "$OUT/_run_s115Boundary.cjs" 2>&1 | tee research/exchange/_strataConformBisect/s115inverted/S115_BOUNDARY.txt
