# By-Construction Watertight Export — Design Spec

**Date:** 2026-06-05
**Status:** Approved design (pending spec review)
**Goal:** Reshape the parametric export assembly so the mesh is watertight, consistently wound, feature-preserving, and sliver-free **by construction** — reaching Grasshopper/Rhino-level export quality — instead of generating disjoint surfaces and stitching them with a 12-stage repair battery that injects non-orientable patches and slivers.

## 1. Background & problem statement

The parametric pipeline (`ParametricExportComputer.compute()`) currently:

1. Generates each surface independently (outer wall via CDT + feature chains; inner wall / rim / base / drain / foot via uniform grids).
2. Combines them by **concatenation with vertex offsets** — every surface keeps its **own disjoint vertex pool**; junctions are only "watertight" if boundary vertices happen to coincide in 3D.
3. Refines (subdivides) the combined mesh.
4. Runs a **~12-stage repair/fill "tail"** (T-junction repairs, same/cross-surface loop fills, center-fan fills, seam zipper, defect weld, winding normalization) to stitch the disjoint sheets watertight.

Measured root causes (2026-06-05, e2e-proven; see memory `export-defect-rootcauses`):

- **Orientation mismatches** are *injected* by the fill battery. The outer-wall θ-seam is half-open and closed by `fillOuterWallSeamBoundaryChains` (UV-CCW zipper) → non-orientable half-twist (HarmonicRipple: winding conflicts jump 0→5862 at that one stage). When the seam is closed at base-gen instead, the *next* filler (`finalCrossSurfaceLoopFill`) injects more. Multiple fills each inject genuinely non-orientable topology that `normalizeWindingByComponent` cannot fix. **This is architectural** — patching individual fills only unmasks the next injector.
- **Slivers** come from: rim/cap needles (≈82% of HarmonicRipple's 4213 — near-duplicate columns × the wide rim span at mismatched boundary rings), center-fan/zipper needles (the worst, aspect ~1900), and near-duplicate **chain (feature) vertices** on the wall.
- **Watertightness** itself is achieved today only via the battery + position welding; it breaks down (boundary/non-manifold > 0) on the most feature-dense styles (HexagonalHive, CelticKnot/Triquetra).

The fundamental issue: **nothing is shared by construction**, so the repair battery must exist — and its local heuristics create the defects.

## 2. Goals & non-goals

### Goal acceptance criteria (per the e2e fidelity matrix, ALL registered styles)
- `boundaryEdges == 0`
- `nonManifoldEdges == 0`
- `orientationMismatches == 0`
- `sliverCount == 0` (`maxAspect3D < ASPECT_MAX`, ASPECT_MAX=100)
- `featuresPresent == featuresExpected` and `featuresDropped == 0`
- No throughput regression: the 3 formerly-hanging styles (SpiralRidges, RippleInterference, GyroidManifold) stay measurable; overall export time should *improve* (the battery is removed).

### Explicitly NOT goals
- Sag/aspect tolerance changes (sag is a separate known reference-metric artifact; not in the goal set).
- Rewriting the feature-detection, CDT chain tessellation, subdivision, or GPU evaluation math — these are **reused**.
- A net-new unified manifold tessellator (rejected: high regression risk; discards working code).

## 3. Strategy (decided)

**Restructure the pipeline flow; reuse the generators.** Keep the proven building blocks; change *ordering* and *vertex ownership* so junctions are shared rather than stitched.

## 4. Architecture — restructured flow

```
1. Detect features + build chains                         (unchanged — reuse)
2. Build PERIODIC outer-wall grid + integrate chains      (§5: wrap cell uses col-0
   - chain-vertex dedup (§7)                               verts → no seam boundary;
   - feature taper to base columns at t=0/t=1 (§6)         features taper at t-edges)
3. Build inner-wall grid (periodic)
4. REFINE outer + inner walls                             (subdivision on the walls
                                                            only, before caps exist;
                                                            seam edges subdivide as
                                                            ordinary interior edges)
5. Build caps FROM refined wall rings (SHARED indices):   (§8: rim/base/foot/drain are
   rim, base, foot, drain                                  strips between existing rings)
6. Assemble into ONE shared vertex pool                   (caps reference ring indices;
                                                            no offset-duplicated boundary)
7. Final topology-preserving quality pass                 (§9: edge flips + safe
                                                            collapses → slivers=0)
8. Verify-only tail (assert watertight + oriented +       (§10: battery → verifier +
   no slivers; minimal guarded numeric weld)               minimal guarded safety net)
```

Key inversions vs today: **refinement before caps**; **caps share wall ring vertices**; **seam never exists as a boundary**; **repair battery becomes a verifier**.

## 5. Periodic seam by construction

- The outer-wall grid columns live in `[0,1)`; the **wrap cell** (last column → column 0) is emitted *during tessellation* using **column-0's vertex indices** (no separate `u=1` column).
- Seam-crossing chain edges (|Δu| > 0.5) connect to the shared column-0 vertices.
- Refinement: seam edges are ordinary interior edges (both incident cells share the same verts), so subdivision keeps them shared automatically.
- Replaces `fillOuterWallSeamBoundaryChains` and the post-hoc `PeriodicSeamClosure` zipper.
- Component: extend `buildCDTOuterWall` (OuterWallTessellator) with a true periodic-grid mode that emits wrap cells. (The existing `periodicSeamU` flag was a *post-hoc closure*; this is *grid construction*.)

## 6. Feature taper at t-boundaries

- Chain/feature amplitude tapers to zero over a small band (e.g. last N rows or a fixed t-distance) approaching t=0 and t=1, so the outer-wall top/bottom boundary rings carry only uniform base columns — no near-duplicate feature columns.
- Makes the rim/base caps clean matched quad strips → eliminates rim/base needle slivers.
- Chains are still detected and counted (`featuresDropped` unaffected); only amplitude blends to the lip/foot — physically the natural pottery behavior.
- Component: applied in chain integration / patching (ChainLinker / OuterWallTessellator per-row patch); taper band is a tunable constant with a unit test pinning amplitude→0 at the boundary rows.

## 7. Chain-vertex dedup

- Merge near-coincident chain points (3D distance below a sub-resolution ε, ~0.05 mm) before they enter the grid, so no needle-width chain edges form.
- Component: in chain linking / re-snap; reuse the `weldNearCoincidentBoundaryVertices` pattern. Unit test on a near-dup chain fixture.

## 8. Shared junction rings

- After refining outer + inner walls, extract their boundary rings (outer-top/bottom, inner-top/bottom, drain).
- Caps are triangle strips/grids built **between existing rings, referencing those ring vertex indices directly** (one shared vertex pool). The cap winds to match the ring's outward orientation (owner-consistent → orient=0 by construction).
- With feature taper (§6) the boundary rings are uniform base columns, so each cap is a clean matched quad strip (rim outer ring ≡ inner ring columns).
- Replaces `fillCrossSurfaceConstantTBoundaryLoopsWithCenters`, `repairSurfaceBoundaryTJunctions`, branched/geometric fills.
- Component: a new `buildCapBetweenRings(outerRing, innerRing, surfaceId, winding)` in a `parametric/CapBuilder.ts`; consumes refined ring vertex indices, emits triangles referencing them.

## 9. Final topology-preserving quality pass (slivers)

- On the assembled watertight + oriented mesh, run a pass that:
  - **Edge-flips** to raise the minimum angle (preserves topology + winding),
  - **Collapses** residual tiny/degenerate triangles in a watertight-safe way (gated: never create a boundary, non-manifold, or winding-inconsistent edge),
  until `maxAspect3D < ASPECT_MAX` everywhere.
- Reuse/generalize `ChainStripOptimizer`'s 3D edge-flip logic to the whole mesh, with strict gating.
- Component: `parametric/MeshQualityPass.ts` (or extend MeshOptimizer); unit tests on sliver fixtures asserting aspect improvement with topology/winding invariants preserved.

## 10. Repair battery → verifier

- Replace the load-bearing tail with a **verifier**: assert `boundaryEdges==0`, `nonManifoldEdges==0`, `orientationMismatches==0`, `sliverCount==0`. On assertion failure in dev, log a precise diagnostic (which invariant, where).
- Keep at most a **minimal guarded numeric-coincidence weld** (1e-4) that is a no-op in the happy path (handles float coincidence only).
- Old fill functions (`fill*`, `repair*`, seam zipper, `normalizeWindingByComponent`) remain in the tree (tested) but **uncalled** in the by-construction path; removed once the new path passes the full matrix.

## 11. Rollout & validation

- **Flag-gated:** `byConstructionAssembly` (default false initially) selects the new flow, so old vs new can be compared on the same harness run.
- **Acceptance gate:** the e2e `export-fidelity` matrix (real WebGPU) — the authoritative gate (unit tests can mislead; proven this session). All goal criteria (§2) on all styles.
- **Per-phase validation:** unit tests (synthetic fixtures) + e2e probe on **HarmonicRipple** (representative: features, measurable, exhibited all defects) + a spot clean style (SuperformulaBlossom stays clean) + a hang style (SpiralRidges stays measurable). Full matrix at phase boundaries.
- **Flip default** to the new path only after the full matrix meets §2; then remove the dead battery in a follow-up.

## 12. Phased implementation (for the plan)

1. **Phase 1 — Periodic seam by construction** (§5). Wall is a true cylinder; no seam boundary. Validate: HarmonicRipple seam winding conflicts gone at base-gen; bnd/orient improve; no regression on a clean style.
2. **Phase 2 — Refine-before-caps + shared junction rings** (§4 reorder, §8). Caps built from refined rings, shared pool. Validate: cross-surface orientation injection gone; junction boundary/non-manifold = 0.
3. **Phase 3 — Feature taper + chain-vertex dedup** (§6, §7). Validate: rim/base/wall needle slivers gone (HarmonicRipple sliverCount drops sharply); featuresDropped stays 0; sag not regressed.
4. **Phase 4 — Final quality pass** (§9). Validate: `maxAspect3D < ASPECT_MAX`, sliverCount=0, watertight/orient preserved.
5. **Phase 5 — Verifier + flip default + remove battery** (§10, §11). Validate: full matrix meets §2; perf improved.

Each phase: failing test(s) first (TDD), then implementation, then e2e validation, then commit.

## 13. Risks & mitigations

- **Refinement of inner wall** — currently only the outer wall is refined; inner wall refinement (needed so caps share refined inner rings) is new wiring. Mitigation: inner wall is a uniform grid (simpler); refine it with the same `subdivideLongEdges` machinery, or size its grid to match without refinement if simpler.
- **Feature taper fidelity** — tapering near the lip could reduce edge-feature fidelity. Mitigation: small band; validate sag/features on the harness; make the band tunable.
- **Quality-pass collapses reopening topology** — collapses can break watertightness if ungated. Mitigation: strict manifold/winding gating; edge-flips (which can't change topology) preferred; collapses only when provably safe.
- **Extreme interlaced styles (CelticKnot 113k slivers, 2.6M tris)** — the hardest sliver target and heaviest perf. Mitigation: structural fixes remove the *sources*; the quality pass mops up; iterate against the harness; this dimension may need the most tuning.
- **Big diff on an already-dirty tree** — the working tree already carries ~3015 uncommitted lines from a prior session (and 2 pre-existing M/N regressions). Mitigation: flag-gated new path keeps old path intact; land per-phase commits; the spec/plan are committed checkpoints.

## 14. Components touched / created (summary)

- `OuterWallTessellator.ts` — periodic-grid wrap-cell mode (§5); feature taper hook (§6).
- `ChainLinker.ts` (or re-snap) — chain-vertex dedup (§7).
- `CapBuilder.ts` (new) — shared-ring cap strips (§8).
- `MeshQualityPass.ts` (new, or extend `MeshOptimizer`/`ChainStripOptimizer`) — final quality pass (§9).
- `ParametricExportComputer.ts` — restructured flow (refine-before-caps), shared vertex pool, verifier tail, `byConstructionAssembly` flag (§4, §10, §11).
- Verifier reuses `fidelity/metrics` topology/quality definitions for assertions.
