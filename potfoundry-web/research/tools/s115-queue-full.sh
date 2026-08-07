#!/usr/bin/env bash
# S115 FULL RUN — CelticTriquetra. All three scars swept; every stage run on BOTH the loose and the
# h-robust class. Expect ~15-25 min.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PF_S115_TAG=CelticTriquetra
export PF_S115_STYLE=CelticTriquetra
export PF_S115_STL="C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/celtictriquetra_ring_D--.stl"
export PF_S115_N=20000
export PF_S115_NCROSS=4000
export PF_S115_CLASSCAP=2000
export PF_S115_RAYN=400
export PF_S115_FLIPCAP=2500
bash research/tools/run-s115-inverted.sh
