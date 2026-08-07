#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."
export PF_S115_TAG=SMOKE
export PF_S115_STYLE=CelticTriquetra
export PF_S115_STL="C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/celtictriquetra_ring_D--.stl"
export PF_S115_N=1500
export PF_S115_NCROSS=300
export PF_S115_CLASSCAP=200
export PF_S115_RAYN=60
export PF_S115_FLIPCAP=120
export PF_S115_INSETS=0.05
export PF_S115_HS=2e-4,2e-6
export PF_S115_KS=4,8
bash research/tools/run-s115-inverted.sh
