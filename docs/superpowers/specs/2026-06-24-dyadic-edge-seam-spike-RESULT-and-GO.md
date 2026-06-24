# Dyadic-Edge-Seam Mesher — Spike Result & GO

**Date:** 2026-06-24
**Branch:** refactor/core-migration
**Verdict: GO.** The universal feature-aligned watertight mesher mechanism is PROVEN. The architecture for sub-project 2 (the general feature-graph mesher) is settled.

## 1. The journey (two spikes, one settled architecture)

1. **Band-stitch spike → NO-GO** (`2026-06-24-mesher-integration-spike-design.md`, gate `c87b72a`): stitching a feature-aligned band to the production complement AT THE FEATURE CURVE cannot weld — the complement re-discretizes any feature-curve constraint at its own cell crossings (even an axis-aligned rail welds 0/32 edges). FL7 817 / FL11 5217 T-junctions. A cheap, decisive dead-end.
2. **The universal reframe:** the dyadic complement shares ONLY its own dyadic CELL EDGES watertight (the `regH`/`regV` registry, incl. 2:1 mid-edges). An arbitrary feature curve can never be a watertight seam. ⇒ a feature-aligned region must be **bounded by whole dyadic cell edges** and **reuse the complement's exact registered boundary vertices**; the **feature lives strictly inside**; the seam is never the feature. Style-agnostic by construction.
3. **Dyadic-edge-seam spike → GO** (this record): both halves proven.

## 2. What is PROVEN (committed, controller-verified, reviewed)

Module `src/fidelity/bandRemesh/` (`seamFill.ts`, `corridorPave.ts`) + `verify_dyadic_seam.test.ts`. **ZERO production edits** — pure orchestration on Task-2's `bandRegions` emit-gate. Tested on the WORST case: a **diagonal feature crossing axis-aligned cells** (the original serration source).

**Q1 — the universal seam (commit `47c6c60`):** exclude a cell-aligned region → the emit-gate leaves a whole-cell hole whose count-1 boundary edges already carry the complement's exact vertices (244/248 are 2:1 mid-edges) → fill reusing those ids → **FL7 & FL11 both watertight 0/0/0** (boundaryEdges=rings, nonManifold=0, orientationMismatches=0, tJunctions=0). Genuine shared-id weld (reviewer probe: re-minting vertices at the same positions → tJunctions 0→496; the audit is by-index, so 0 is a true weld). The exact inverse of the band-stitch NO-GO.

**Q2 — the feature-aligned interior (commit `f8c038b`):** triangulate the whole corridor as ONE region with feature-pinned `cdt2d` + interior Steiner density auto-calibrated to the dyadic boundary spacing.
- **Seam holds:** FL7 & FL11 both 0/0/0 (Q1 weld survives; boundary ids reused, not re-minted).
- **Feature followed EXACTLY (the cure for serration):** the 362-segment densified feature is a continuous chain where **every segment is a mesh edge** (no staircase), **lateral wobble p99 = 0.0000 mm**. Reviewer probe: dropping the feature constraint flips `allMeshEdges` to false — so the cure is *caused* by pinning the feature, not coincidence.
- **Sliver-free:** corridor `%<10°` = **0.06% (FL7) / 0.00% (FL11)** (down from 44.95% with a coarse interior — boundary-matched Steiner density is the lever); `cdt2d` inv=0, drop=0 (no degenerate-triangle masking).

## 3. Why this works (the universal mechanism)

| | band-stitch (NO-GO) | dyadic-edge seam (GO) |
|---|---|---|
| seam | the arbitrary feature curve | whole dyadic cell edges |
| complement | re-discretizes the curve at its own crossings | shares its own cell edges with neighbours by construction (registry, incl. 2:1 mid-edges) |
| external region | adopted vertices, edges never match → T-junctions | reuses the complement's exact boundary vertices → edges match → count-2 weld |
| feature | on the seam (broke) | strictly inside the corridor (our own constraint; no re-discretization) |

The corridor is triangulated as ONE region (the per-cell axis-aligned geometry that caused ERROR-2 slivers is dissolved), the feature is our own `cdt2d` constraint (so it is a smooth mesh edge-chain), and the boundary reuses the dyadic vertices (so it welds). Style-agnostic: nothing here depends on the feature's shape or the style.

## 4. Known residual + the next verification

The FL7 `aspectMax=107` residual is ~4 acute wedges where each snapped feature **endpoint** meets its adjacent **coarse** boundary edge (the 2 tips of the synthetic pointed ribbon, ON the feature tip; FL11-resolved to 5.36). The real mechanism to watch is **feature-endpoint-meets-coarse-boundary**, not a synthetic artifact per se — so the first task of the full mesher is to verify on a **real full-height / closed-loop feature** (which has no interior pinch), and to handle feature endpoints that land on the corridor boundary gracefully (snap to a finer boundary vertex, or pave the endpoint wedge).

## 5. The path to the full general mesher (on the proven seam)

The seam + the feature-aligned corridor fill are proven and never change. The full mesher SCALES the interior on top:
1. **Real features:** drive the corridor from sub-project 1's `detectFeatures` FeatureGraph (not a synthetic ridge) — full-height walls, closed loops.
2. **Topology:** junctions (degree-3 corridors merge — a junction polygon, like Phase-0 `paveJunction`, but welded at dyadic edges), loops, the full feature NETWORK.
3. **All 20 styles** + density-follows-features (the detector's saliency drives Steiner density) + off-feature snap.
4. **Production integration:** wire the corridor mesher into the export path (flag-gated), GPU export + 3MF + render verification, re-baseline.
5. **Rim/base-incident corridors** (features reaching t=0/t=1) — the Q1 GO is proven for INTERIOR holes; corridors touching the rings are a separate seam case to handle.

That is a fresh brainstorm → spec → plan. The hard, foundational risk (does feature-aligned paving weld watertight to the production complement, and does it actually follow the feature?) is now answered: **yes.**

## 6. Commit-hygiene note (carried)

`ConformingWall.ts`, `WatertightAssembly.ts`, `PeriodicBalancedQuadtree.ts`, `ParametricExportComputer.ts` carry pre-existing uncommitted `cellSamples` WIP (an unrelated feature). Every spike commit staged ONLY its own files; future work must do the same and must not reference `cellSamples` in new options objects.
