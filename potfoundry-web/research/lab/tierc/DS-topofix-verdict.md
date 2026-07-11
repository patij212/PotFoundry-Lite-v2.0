# DS Topology Fix (Findings 1+2) — CLOSED 0/0

**Experiment:** PROD-TIERC (E-2026-07-11-TIERC-HEADTOHEAD Addenda 7/9). **DS assembled topology is
CLOSED.** Raw: `research/exchange/tierc/dsTopofix_scorecard.ndjson`, `windingDiag_ds_summary.json`.

## Two edits (research libs, zero src/ blast — diagnosis-confirmed)

1. **Finding 1** — `tierc_manifest.ts` `dragonScalesAnatomy`: R-CDT body-region z-boundaries now stop
   at `ringZ ∓ DS_RING_HALF_BAND_MM` (strictly disjoint from the R-STRUCT ring bands), matching B0's
   proven contract. Drives nonManifoldEdges 3584→0.
2. **Finding 2** — `_sharp3dMesh.ts` `buildStructuredWall` (both equal-count and general `stripBetween`
   branches): triangle winding flipped CW→CCW-in-(θ,z) to match `ConformingWall`/`QuadtreeTriangulator`.
   Drives orientationMismatches 7168→0.

## Gate — PASS (independently re-confirmed by coordinator)

`buildRegionOuterWall(getManifest('DragonScales'), dims)` native RSTRUCT-RCDT chain, 1,098,756 tris:
**nonManifoldEdges 0, orientationMismatches 0, boundaryEdges 1024 (all rim, interior 0), zeroArea 0,
signedVolume +395,052.5mm³ (OUTWARD)** — non-vacuous (injected control moved rawNonMan 0→3),
byte-identical across runs. typecheck + ESLint clean.

## The load-bearing verification

Direction-correctness was checked via signed volume, NOT just mismatch count — and it proved the
subtle point: Finding-1-only already had **positive** signed volume (+343,871mm³) WITH all 7168
mismatches present (ring bands are too small a fraction of volume to flip the aggregate sign). **Only
`topologyMetric`'s local orientationMismatches catches this class** — a globally-positive-volume mesh
can still be locally mis-wound. The winding flip went the correct direction (winding-diag toy:
`ringStruct` 100% CW → 100% CCW, now agreeing with the quadtree's CCW).

## Consumers

- `_tierc_winding_diag.test.ts`: orientation 32→0 as predicted. Its pre-fix non-vacuity assertion
  (`toBeGreaterThan(0)`, written to prove the toy reproduced the then-unfixed defect) correctly now
  fails → updated to assert the fix (`toBe(0)` + per-source sign agreement), flagged in-file, GREEN.
- `_tierc_b0_toy.test.ts` (6 tests) PASS. `_pf_dsconform.test.ts` smoke PASS (import chain clean).
- `_pf_dszdensity`/`_sharp3dArtDeco` (multi-hour-gated): statically verified winding-invariant
  (assertions are on edge-multiplicity + vertex positions, unchanged by a per-triangle index reorder).

## Status

**DS topology CLOSED (0/0, outward).** Remaining for full DS reproduction: Finding 3 (quality
%<20°≈73%, undiagnosed) + the tight-sizing (`AF_PROD_OPTS`, not `K1_TOY_DEFAULTS`) fidelity rerun —
both explicitly out of this arm's topology scope. The chain path also carries an honest standing
warning (per-region uBias interaction across >1 seam untested at scale; production-tight sizing never
run at N-region scale) — a structural TODO before DS ships.
