#!/usr/bin/env bash
# run-s117-render.sh — S117 P4: render the best mesh per style with the S116 SINGLE-SIDED rasteriser.
# Every render before S116 was DoubleSide and therefore blind to inverted normals; this wraps the
# validated tool (13/13 planted-defect fixtures) and only fixes the S117 output directory and tags.
set -uo pipefail
cd "$(dirname "$0")/../.."
S117=research/exchange/_strataConformBisect/s117
EX=C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect
A=C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/.claude/worktrees/s112-angular-quantity/potfoundry-web/research/exchange/_strataConformBisect/s117
mkdir -p "$S117"
export PF_S116_OUT="$A"
export PF_S116_RTAG="${PF_S117_RTAG:-S117}"
export PF_S116_MODES="${PF_S117_MODES:-clay,backface}"
export PF_S116_AZ="${PF_S117_AZ:-0,90}"
export PF_S116_STL="${PF_S117_RSTL:?PF_S117_RSTL required}"
export PF_S116_TAG="${PF_S117_RTAGS:?PF_S117_RTAGS required}"
echo "rendering: $PF_S116_TAG"
bash research/tools/run-s116-render.sh
