# Incremental Delaunay — findings (2026-06-29)

Goal: remove the kernel's per-round full `delaunator` rebuild (toward sub-minute 16M). Lab-only.
Module: `research/bridge/incrementalRefine.ts` (+ tests). Status: **primitives CORRECT & verified; the
insertion-based drop-in OVER-REFINES — root-caused; clean fix path identified but not yet built.**

## What works (verified, reusable)
A **live half-edge mesh** with in-place **edge-split insertion** (1 edge → 4 triangles, full half-edge relink
following Delaunator's conventions) + **local Lawson flips**. Tests (`incrementalRefine.test.ts`, both pass):
1. **Integrity** through 400 interior splits + local flips — half-edge involution, twin-endpoint consistency,
   consistent orientation, non-degeneracy, exact vertex/triangle counts.
2. **Delaunay property** — after edge-split + **in-circle** local flips, **0 circumcircle violations** over
   568 tris / 301 verts (empty-circumcircle, scaled coords). The in-circle flips correctly MAINTAIN Delaunay.

So the half-edge data structure, the split relink, and the in-circle flip are all correct.

## What fails: the drop-in over-refines (root cause)
`buildInhouseMetricMeshIncremental` (refine by metric-edge-split, maintain Delaunay) produces **~4× the batch's
triangles** (hits the maxPoints cap: 1.4M pts / 2.8M tris vs batch 348k / 696k at tol 0.006) with poor quality.
Root cause, confirmed across BOTH flip criteria (in-circle AND 3D-angle over-refine identically):
- The metric-split decision is **connectivity-dependent**. A pure-Delaunay triangulation tolerates long thin
  triangles (Delaunay maximizes the empty-circumcircle, NOT edge length). Those long edges are **metric-over-size
  → split → cascade**, inflating the count.
- The **batch** avoids this because each round it **rebuilds the global Delaunay (delaunator) AND applies
  max-min-angle 3D flips** — the rebuild is a *global reset* that removes long-thin triangles before the next
  size measurement. Insertion-based incremental cannot cheaply replicate that reset: in-circle flips (maintain
  Delaunay) and 3D-angle flips (remove slivers) **fight** each other without the per-round global rebuild.

This is a real algorithmic wall, not a bug in the relink (the relink is verified).

## Clean fix path (not yet built)
**Connectivity-free metric point sampling → single triangulation.** Generate the point set directly from the
metric field (a balanced quadtree over (u,t), subdivide while a cell's metric diagonal > target, emit
jittered corners) — density comes from the field, NOT from mesh feedback, so no over-refinement. Then ONE
`delaunator` + global 3D-flip + smooth (reuse `flipHE`/`flipGlobal` + `surfaceSmoothing`). This eliminates the
per-round rebuild (1 rebuild, not 9) while sidestepping the feedback.

**Honest perf expectation:** ~2× over the batch at 16M (est. ~100s vs 214s), NOT sub-minute — the global flip
(O(edges)) and smoothing are unavoidable O(N) costs even done once. Sub-minute 16M likely needs GPU or a
fundamentally different pipeline. Weigh against the already-banked **14×** batch win (3M/55s, 16M/210s).

## Recommendation
The batch kernel (14×, 16M-capable, correct) is the practical path. The incremental insertion primitives are
banked (correct, reusable). Decide whether the additional ~2× from connectivity-free sampling is worth the
build, or move to the seam/rim + crease-metric-into-kernel + production cutover.
