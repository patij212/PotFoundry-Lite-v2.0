# Feature-Aligned Band Remesh — Advancing-Front Paving (Voronoi-first) — Design

**Date:** 2026-06-24
**Branch:** refactor/core-migration
**Status:** Design — approved verbally, pending written review → writing-plans

## 1. Problem (measured, not assumed)

Tangled-lattice relief styles (Voronoi first; Gothic/Gyroid/Celtic later) render their feature
**ribbons** with a visible serrated tessellation, even after the feature *curve* itself was made
smooth (commit `82d4832`). The mesh ribbon sawtooths around the smooth inserted curve and is
filled with slivers.

Root cause is **ERROR 2** from the export root-cause review
(`2026-06-15-export-fidelity-arc-SYNTHESIS.md`, memory `project_export_rootcause_review`): the
axis-aligned 2:1 dyadic quadtree + per-cell constrained Delaunay (`ConstrainedCellTriangulator.cdt2d`)
**cannot orient triangles along a diagonal/curved ribbon**. Two measured layers (workflow
`wf_dab29be7`, unit-level builds of the real `assembleWatertight` path):

- **Layer 1 — un-pinned crest free edge (tractable).** `extractVoronoi` inserts only the foot
  level set `f2−f1=th`; the crest centerline `f2−f1=0` is a ridge minimum (no zero crossing) and is
  never inserted. So one ribbon boundary is left to the grid and staircases: crest free-edge wobble
  p99 **0.289mm / max 0.654mm** vs the pinned foot's 0.091mm; isolated single-ribbon probe wobble
  1.27 / 0.86 / 0.54mm at featureLevel 7/9/11 (halves per ~2 levels = grid-staircase signature).
- **Layer 2 — across-band slivers / regular triangular sawtooth (the wall).** The band is ~1–2
  featureLevel-11 cells wide (already at feature density, NOT coarse), runs diagonally, and each
  square cell is filled by plain Delaunay → long thin triangles with the diagonal alternating
  cell-to-cell → the regular sawtooth + slivers (ribbon aspect to 36; 0.6% of ribbon tris <10°).

**Input-side fixes are exhausted by measurement.** Pinning *both* rails (foot+crest 2-constraint
prototype) pins the crest (0.03mm) but makes the slivers **worse** (aspect 36→104; <10° 0.6%→2.1%;
+0.65M tris). Density leaves the sliver percentage **flat** (3.4/4.1/4.4% across FL7/9/11).
`snapToCellEdge` is ruled out (7µm move, 74× below the wobble). The defect is **orientation, not
density or constraints** — the fill must lay triangles *along* the ribbon.

## 2. Goal + success metrics

Mesh each feature ribbon with band-following triangles so it is genuinely smooth and well-shaped,
**watertight by construction**. Success (all measured, all density-invariant — must hold at FL7 and
FL11; the slivers are currently density-invariant so the fix must be too):

- **Watertight:** `boundaryEdges = 0`, `nonManifoldEdges = 0`, `orientationMismatches = 0` at every
  featureLevel (must not regress from today's 0/0/0).
- **Edge smoothness:** ribbon free-edge wobble (both rails) ≤ **0.05mm** (≈ resin printer
  resolution), no axis-aligned staircase (down from crest p99 0.289mm / max 0.654mm).
- **Triangle quality (the actual cure):** ribbon-triangle worst 3D aspect ≤ **~6** (from 36
  foot-only / 104 two-constraint), and **zero** ribbon triangles with min interior angle <10°
  (from 0.6% / 2.1%); ribbon min-angle p50 stays ≥ ~30°.
- **Visual:** a real GPU export + 3MF + flat-shaded render shows a smooth ribbon to the user's eye.

## 3. Approach — advancing-front paving of the band (Approach C)

Chosen over A (per-cell strip fill) and B (global rotated cells) for **generality**: A is
Voronoi-ribbon-shaped; C paves an arbitrary bounded band and generalizes to Gothic arches, Gyroid
TPMS regions, and Celtic braids.

**Honest risk context.** The in-repo spike `ceb5d08` found the *global* anisotropic metric-Delaunay
/ advancing-front family stalls on tangled lattices ("research-grade, a major undertaking"). That
was **global** remeshing of the whole tangled surface, where the in-circle/refinement fights itself
everywhere. This design is **constrained paving of a *bounded* band between two already-pinned
rails** — a well-posed cousin, not the thing that stalled. The real, specific risks here are
**watertight stitching of the front to the dyadic grid** and **triple junctions** — both de-risked
by spike before any real build (§5).

### 3.1 The rails

Pin **both** ribbon boundaries as constraint curves through the existing general-curve registry
(`FeatureConformingTriangulator` `edgeCrossingsInto` / `registerBoundary`):

- **Foot:** `f2−f1 = th` (the current committed `extractVoronoi` zero set, DP tol 3e-4).
- **Crest:** an interior offset level `f2−f1 = th·frac` for a small `frac` (start 0.15) that DOES
  sign-change, traced by `marchingSquaresZero` (the true centerline `f2−f1=0` is a ridge minimum and
  cannot be traced). Alternative pin source if needed: the categorical cellId border (the pre-fix
  locus) used purely as a geometric pin.

Because both rails go through the same registry the dyadic grid already uses, their vertices are
shared by construction — the band mesher will **consume those exact vertices** as anchors rather
than minting new ones, which is the crux of watertight stitching.

### 3.2 The paving

Parameterize the band by *(s = arclength along the ribbon, w = 0→1 across foot→crest)*. Advance a
front along *s*, emitting rows of triangles whose size is set by the **surface metric** (so they are
well-shaped in 3D, aspect → ~2–3, not 36+). The front's two edges ride the foot/crest **rail
registry vertices** as anchors; cross-band rows connect matching *s*-stations on the two rails. This
makes triangles run *along* the ribbon (the orientation fix) instead of across axis-aligned cells.

### 3.3 Stitching + junctions (the make-or-break)

- **Stitching:** the band is excluded from the dyadic CDT; the dyadic grid meshes the complement
  (flat exterior + cell interiors beyond the crest), with the foot+crest as constraints. The two
  meshes meet only at the shared rail registry vertices → no T-junctions, watertight by construction.
- **Triple junctions** (Voronoi vertices, 3 ribbons meet): the junction neighborhood is a small
  polygon paved/fanned, shared by the three incoming fronts at common vertices.

## 4. Integration

- **Flag-gated, default OFF.** Production default path stays byte-identical until the flag flips.
- The band region is excluded from `ConstrainedCellTriangulator.cdt2d`; the band mesher runs as a
  pass that emits triangles sharing the cell-boundary + rail registry vertices.
- Likely hook points: `FeatureConformingTriangulator` (route band cells to the band mesher) and/or a
  post-pass in `WatertightAssembly.assembleWatertight`. Exact seam to be settled in the plan.

## 5. Build order — spike-gated, with fallback

Each step is measured; the spike can **abort to fallback Approach A** (local per-cell strip) if
stitching proves intractable.

1. **SPIKE A — watertight stitching.** One straight diagonal ribbon between two pinned curves on a
   smooth wall. Pave it; stitch to the surrounding dyadic grid at rail vertices. **Gate:** `bnd=0`,
   `nonManifold=0`, zero T-junctions; ribbon aspect ≤6, no <10° slivers, edge wobble ≤0.05mm. If it
   cannot be made watertight cleanly → STOP, fall back to A.
2. **SPIKE B — triple junction.** A 3-ribbon junction (synthetic). Same watertight + quality gate.
3. **Real Voronoi band mesher.** Build for real Voronoi via `assembleWatertight`, flag-gated.
4. **Verify + render.** Unit metrics (watertight, wobble, aspect, slivers, density-invariant) + real
   GPU export + 3MF + render for the user.
5. **Generalize (separate spec).** Extend to Gothic/Gyroid/Celtic — each needs its own band
   definition; deferred until Voronoi is proven.

## 6. Testing

- **Unit (no GPU):** synthetic single ribbon + triple junction — watertight edge audit, triangle
  aspect/min-angle, edge wobble vs the analytic locus; reuse `verify_voronoiCelticFeatureFlow.test.ts`
  patterns and the wall edge audit.
- **Regression:** existing conforming suites (`FeatureConformingTriangulator.test.ts`,
  `WatertightAssembly.test.ts`) stay green; flag-off path byte-identical.
- **e2e:** real Voronoi export via the committed `_export_deliverables_probe.cjs` → 3MF + render.
- **Gates:** re-baseline `gateThresholds.ts` watertight/quality only after the flag is default-on.

## 7. Risks + open questions

- **Watertight stitching** (primary) — de-risked by SPIKE A; fallback A if it fails.
- **Triple junctions** — de-risked by SPIKE B.
- **Crest extraction `frac`** — must trace a single clean loop per ribbon within feature tolerance;
  the f64 worley replica must reproduce it. Tune in SPIKE A.
- **Build time / triangle count** — paving adds vertices; must stay within the budget cap and
  acceptable export time. Measure in step 3.
- **Generalization shape** — non-thin-ribbon bands (Gyroid TPMS region) may not fit the two-rail
  model; addressed in the generalization spec, not here.

## 8. Out of scope

- Gothic/Gyroid/Celtic band meshers (separate spec, after Voronoi proven).
- The Gyroid deepest-crest CAD-depth residual and the smooth-style work (tracked separately).
- Triangle-shape slivers *outside* feature bands (the user's deferred general-sliver item).
