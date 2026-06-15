# Option-C De-Risk Spike — Metric Delaunay Refinement (2026-06-15)

De-risks **Option C** (replace the conforming mesher's triangulation with a
Delaunay-refinement remesh giving a *provable* min-angle bound) before committing the
re-architecture. Throwaway code: `src/fidelity/spike/metricDelaunayRefine.{ts,test.ts}`
(standalone, NOT wired to production). Built: metric-scaled Delaunay (`delaunator`) +
**isotropic-in-the-metric seed** + longest-3D-edge bisection + **metric Lawson flips**
(maximize the true 3D min-angle). Measured on synthetic surfaces with the real 3D
min-angle + facet→surface chord.

## Results

| surface | approach | worst 3D min-angle | %<20° | converged? |
|---|---|---|---|---|
| **Smooth** anisotropic relief (6:1) | metric-Delaunay + seed | **44.67°** | 0% | ✅ (441 pts, 0 refine rounds) |
| **Tangled** gyroid-like lattice (LOCAL anisotropy) | global-scale, no flips | **4.29°** | 8.1% | ❌ (hit budget) |
| **Tangled** gyroid-like lattice | + metric Lawson flips | **8.53°** | 4.3% | ❌ (hit budget; slow) |

## The decisive finding

**Delaunay-refinement is SOUND for smooth anisotropy** — the isotropic-in-the-metric seed
alone gives 44.67° (well above the 20° CAD bar), no refinement needed. This is the
positive half: the basic machinery works, and smooth styles would CAD-grade cleanly.

**But it CANNOT CAD-grade the tangled lattice** — the case that actually matters
(Gyroid/CelticKnot/BasketWeave, where the conforming mesher's `efg` guard fails). A
*global* anisotropy scale is right on average but wrong locally; the Euclidean Delaunay
keeps forming slivers (worst 4.29°, doesn't converge). Adding metric Lawson flips —
the standard local-metric correction — only lifts the worst angle to **8.53°**, still
**far below 20°**, while being slow (in-loop flips: 170s on a 60k mesh) and able to
*worsen* chord (the flip optimizes angle, not sag). More budget does not help (the stall
is budget-independent: 4.1°→4.4° across 10k–300k points).

**⇒ CAD-grading the tangled-lattice styles via Option C requires FULL anisotropic
Delaunay** — a per-point **metric tensor**, anisotropic in-circle test, and anisotropic
refinement (CGAL `Mesh_3` / `2D periodic anisotropic` class). That is research-grade,
notoriously finicky on tangled surfaces, and a major undertaking — **not** the tractable
win the smooth-case success might suggest.

## Honest caveats
- Tested a **synthetic gyroid-like proxy** (high-frequency local anisotropy), not the
  production Gyroid. But the conforming mesher's measured real-Gyroid failure
  (worst 0.85°, `efg` guard-suppressed on high-variation cells) confirms real Gyroid has
  exactly this pathology, so the proxy is representative.
- Tested the **tractable** Delaunay-refinement (global scale + Lawson flips), NOT a full
  CGAL-class anisotropic mesher. The finding is "the tractable shortcut fails; the proper
  version is a heavy lift," not "Delaunay-refinement is impossible."

## Implication for the A-vs-C decision
Neither path is a quick win for the **tangled** styles:
- **Option A** (extend the conforming mesher) — Phase 1/1b showed its slivers are
  structural (transition-template/feature-pin degenerate cells + `efg`-guard blind spots);
  fixing them is deep work with whack-a-mole risk.
- **Option C** (Delaunay-refinement) — clean for smooth, but the tangled styles need full
  anisotropic Delaunay (this spike), a major re-architecture with the production path's
  watertightness/vertex-exactness to re-prove.

So the realistic options narrow to:
1. **Accept the tangled-lattice styles as a documented quality-floor class** (the minority
   — Gyroid/CelticKnot/BasketWeave/Gothic-upper/CelticTriquetra), CAD-grade everything
   else, and be honest that their slivers are an inherent cost of representing a tangled
   lattice with flat triangles (analogous to the chord exclusion classes).
2. **Commit to full anisotropic Delaunay** (heavy C) only if those styles MUST be CAD-grade.
3. **Targeted conforming fix** of just the catastrophic degenerate cells
   (transition-template centroid fans / feature-pin junctions) — may lift the worst-case
   <1° slivers without solving general anisotropic meshing (partial, not full CAD-grade).
