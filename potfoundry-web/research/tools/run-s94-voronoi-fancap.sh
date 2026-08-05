#!/usr/bin/env bash
# S94 — THE VORONOI FAN-CAP ARM. Control (MAXDEG=0) then treatment (MAXDEG=64), SEQUENTIAL, same box.
#
# CONFIGURATION NOTE, and it is why this arm is shaped this way: the historical `voronoi_ring_D--`
# baseline carries NO 'H' suffix, and SHAPE_SUFFIX = SHAPE||MID3D||LONGFALL ? 'H':''. So that mesh was
# built with PF_CB_SHAPE=0 — and with SHAPE off, `shapeAdmits` returns at its first line and the S83 fan
# cap is UNREACHABLE. Testing the cap REQUIRES SHAPE=1, a different mesh from the committed baseline.
# Hence a fresh same-session control. Distinct PF_CB_TAG_SUFFIX so neither arm overwrites the other.
#
# PF_STRATA_CB=1 IS MANDATORY: the driver is `it.runIf(RUN)` with RUN = PF_STRATA_CB === '1'. Without it
# vitest SKIPS the test and still exits 0 — which is exactly what happened on the first attempt. The
# assert_ran check below exists so that can never be read as a result again.
cd "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web" || exit 1
export NODE_OPTIONS=--max-old-space-size=12288
export PF_STRATA_CB=1
export PF_CB_STYLE=Voronoi
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
R=research/exchange/_strataConformBisect

assert_ran () {  # $1 = log path, $2 = arm label
  if grep -qE "1 skipped|0 passed" "$1"; then
    echo "*** $2 DID NOT RUN (vitest skipped it). NOT A RESULT. ***"; return 1
  fi
  if ! grep -qiE "wrote|facets|triangles|soup" "$1"; then
    echo "*** $2 PRODUCED NO MESH OUTPUT — treat as FAILED, not as a null result. ***"; return 1
  fi
  echo "    ($2 ran)"; return 0
}

run_arm () {   # $1 = MAXDEG, $2 = suffix, $3 = log
  echo "=== ARM MAXDEG=$1  tag$2 ==="
  PF_CB_MAXDEG="$1" PF_CB_TAG_SUFFIX="$2" \
    npx vitest run -c vitest.strata.config.ts research/bridge/_strataConformBisectS34.test.ts \
    > "$3" 2>&1
  echo "  vitest exit $?"
  assert_ran "$3" "MAXDEG=$1"
  grep -iE "unresolved|refusedDeg|RefusedAR|max ?deg|degree|wrote .*stl|alloc|tris " "$3" | tail -22
  echo
}

run_arm 0  _S94CTL "$R/S94_VOR_CTL.log"
run_arm 64 _S94D64 "$R/S94_VOR_D64.log"

echo "=== TAILS ==="
echo "--- CTL ---"; tail -14 "$R/S94_VOR_CTL.log"
echo "--- D64 ---"; tail -14 "$R/S94_VOR_D64.log"
