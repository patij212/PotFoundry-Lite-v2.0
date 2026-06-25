# Feature-Aligned Mesher — De-Risk Arc COMPLETE & GO

**Date:** 2026-06-25
**Branch:** refactor/core-migration
**Verdict: GO.** The universal feature-aligned watertight mesher mechanism is PROVEN end-to-end on REAL geometry, including the hardest case (a dense tangled Voronoi network). The full all-20 production mesher build can proceed on this foundation.

## 1. The problem (the user's original ask)

A mesh that perfectly represents the generated mathematical models — vertices that FOLLOW the features, triangle density that follows the surface, no serration/sawtooth/staircasing — printable seamlessly on resin printers. The dominant defect (root-cause review, `project_export_rootcause_review`) was ERROR 2: the production axis-aligned dyadic quadtree + per-cell CDT cannot orient triangles along a diagonal/curved feature → serration + slivers.

## 2. The proven mechanism (style-agnostic, watertight-by-construction)

```
detectFeatures (sub-project 1) → FeatureGraph (style-agnostic feature loci)
  → exclude the feature-crossing CELLS from the production complement (emit-gate, default-OFF)
  → ONE corridor (the excluded whole cells), bounded by DYADIC cell edges
  → pave the corridor feature-pinned: full cdt2d + constraint-respecting TOPOLOGICAL FLOOD-FILL
       (wall edges = boundary loops ∪ feature chains; flood into components; keep interior
        components by even-odd ray test on the largest-area triangle — robust to self-proximity)
  → weld at the DYADIC cell-edge seam: reuse the complement's EXACT registered boundary vertices
       (corners + 2:1 mid-edges) → count-2 by the same construction the complement uses internally
  → the dyadic complement meshes the smooth regions (unchanged)
```

**The universal principle:** the dyadic complement only shares its own dyadic cell edges watertight; so a feature-aligned region must be bounded by whole cell edges and reuse the complement's exact boundary vertices — the feature lives strictly INSIDE, never on the seam. Style-agnostic by construction.

## 3. What is PROVEN (every step opus-reviewed + controller-verified; module `src/fidelity/bandRemesh/`)

| Step | Result | Commit |
|---|---|---|
| Band-stitch (seam at the feature curve) | **NO-GO** (complement re-discretizes the curve → 817 T-junctions) — a cheap dead-end | c87b72a |
| Dyadic-edge SEAM (Q1) | externally-filled cell-aligned hole welds **0/0/0** at FL7&11 (244/248 boundary verts are 2:1 mid-edges, all reused) | 47c6c60 |
| Feature-aligned interior (Q2, synthetic ridge) | **0/0/0**, feature followed (wobble 0.0000), %<10°=0.06% | f8c038b |
| Real curved Voronoi WALL | **0/0/0** at FL7&11 (flood-fill solves the self-proximate corridor; the cdt2d-flood-fill was the blocker) | fe65c73 |
| Real JUNCTION (3 edges, shared node) + LOOP (closed cell, annulus) | both **0/0/0**, junction node shared, loop closed | fc3fffd |
| DENSE Voronoi network (11 edges / 7 junctions) — the tangled-lattice make-or-break | **0/0/0**, scales (compact-point fix: 95–278s → 0.8s, fillTris byte-identical) | f30ad47 |

Every weld is genuine: the audit is by-index; a non-vacuous control (crack an interior shared vertex → T-junctions>0) accompanies each. Quality at density: aspectMax ≈12.7, %<10° ≈0.23% — near sliver-free; remaining slivers are at acute junction nodes / feature-tip wedges, where the user accepts them because the feature is followed.

## 4. The user's problem — solved in mechanism

On the worst case (a diagonal/curved feature crossing axis-aligned cells — the exact serration source), and on a dense tangled Voronoi web (the priority styles), the feature is now a continuous smooth mesh edge-chain (no staircase), the mesh is watertight, and slivers are near-zero / confined off-feature. The "vertices not following features" + serration defect is solved.

## 5. The path to the full production mesher (the next sub-project — a fresh brainstorm)

The mechanism + seam + interior fill + topology + scale are proven and never change. The full build SCALES the harness to production:
1. **All 20 styles:** drive `corridorPaveMulti` from `detectFeatures` per style (the FeatureGraph is style-agnostic); the detector already validated 14/20 recall with the priority lattices fully tracked.
2. **Production integration:** wire the corridor mesher into the export path (flag-gated default-OFF, byte-identical when off), `gitnexus impact` + `detect_changes`.
3. **Perf:** the per-region `assembleWatertight` ≈22s dominates (orthogonal to mesher correctness) — optimize/cache; the cdt2d pave is already 0.8s after the compact-point fix.
4. **GPU export + 3MF + flat-shaded render** — the human acceptance test; re-baseline `gateThresholds.ts`.
5. **Carry-forward residuals (non-blocking):** feature-endpoint-meets-coarse-boundary wedge (FL11-resolved; finer boundary or endpoint paving); rim/base-incident corridors (Q1 proven for interior holes); the `localOf.get as number` hardening guard; closed-loop-at-density (inferred, co-exercise it).

## 6. Process note

This arc applied: measure-before-fix (every NO-GO was diagnosed precisely, not guessed), preserve-work (the real-wall fix built on an interrupted subagent's robust-classification — reverting would have lost the load-bearing half — `feedback-preserve-work`), and per-task adversarial review + independent controller verification. Two NO-GOs (band-stitch, real-wall-interior) were the cheap, decisive findings that redirected the work correctly.
