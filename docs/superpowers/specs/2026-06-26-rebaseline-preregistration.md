# All-20 Re-baseline — PRE-REGISTRATION (write-before-run)

**Date:** 2026-06-26 · **Branch:** refactor/core-migration · **Lab:** `potfoundry-web/research/`
**Committed BEFORE the run** (the `meshing-research` discipline: the kill-criteria are fixed in advance so
no result can be rationalized after the fact). The run = Task 8 of the meshing-lab Phase-1 plan.

## The question
For every style, how does our mesher / a best-in-class engine fare on the SAME instruments, and — the
high-value open claim from `2026-06-15-export-fidelity-arc-SYNTHESIS.md` — **is the tangled-lattice problem
already solved by an engine we can run today (gmsh anisotropic)?**

## The 20 styles (STYLE_FUNCTIONS keys)
SuperformulaBlossom, FourierBloom, SpiralRidges, SuperellipseMorph, HarmonicRipple, GothicArches,
WaveInterference, Crystalline, ArtDeco, DragonScales, BambooSegments, RippleInterference, GyroidManifold,
Voronoi, BasketWeave, GeometricStar, HexagonalHive, CelticKnot, CelticTriquetra, LowPolyFacet.

**Classification (governs interpretation):**
- **5 tangled lattices (the H1 targets):** GyroidManifold, BasketWeave, CelticKnot, CelticTriquetra, GothicArches.
- **Chord exclusion-pending (crease/straddle/riser — chord is an UPPER BOUND without per-style exclusion opts):**
  BasketWeave, CelticKnot, CelticTriquetra, GeometricStar, ArtDeco, BambooSegments, DragonScales.
- **Clean-chord (smooth relief — chord honest as-is):** the rest, incl. **GyroidManifold** (smooth sinusoidal relief).

**Metric honesty (stated up front):**
- **min-angle quality** (`triangleQualityDistribution.pctBelow20`, `minAngleDeg`) is **clean for ALL 20** — pure
  triangle geometry, no exclusion needed. This is the PRIMARY tangled-lattice signal.
- **perp-3D chord** (`perpendicular3DDeviation.p99DevMm`) is honest for the clean-chord styles; for
  exclusion-pending styles it is an upper bound (engine-vs-engine comparison still valid; absolute value inflated).
- vertices are lifted analytically ⇒ `vertexMaxMm≈0` is the per-row correctness check.

## The matrix
20 styles × { `triangle` (Ruppert/Chew, iso), `gmsh-iso` (Frontal-Delaunay, scalar curvature field),
`gmsh-aniso` (BAMG + 2nd-fundamental-form metric — IF Task 6's BAMG engages) }, at **tol = 0.05 mm**,
metric/size grid res 32. Measured TS-side by the project's own instruments (one-metric-both-meshes).
`ours` (production conforming mesher) = STRETCH (needs CPU (u,t) extraction; included only if cheap).

## Pre-registered hypotheses + kill-criteria (FIXED NOW)
- **H1 — the open claim:** *No engine achieves BOTH CAD-grade chord (p99 ≤ 0.1 mm on the clean-chord tangled
  style GyroidManifold) AND CAD-grade quality (`pctBelow20` ≤ 5%) across all 5 tangled lattices, at tol 0.05.*
  - **REFUTED if** any engine (esp. gmsh-aniso) hits chord p99 ≤ 0.1 on GyroidManifold **and** `pctBelow20` ≤ 5%
    on **all 5** tangled lattices → "an existing engine solves the tangled problem" → roadmap pivot (port it).
  - **CONFIRMED if** every engine config fails at least one (chord>0.1 on Gyroid, or `pctBelow20`>5% on any
    tangled) → the documented floor stands, now quantified by *how* the best tools fail.
- **H2 — engines are competent (calibration):** *On the clean-chord smooth styles, at least one engine achieves
  chord p99 ≤ 0.1 AND `pctBelow20` ≤ 5%* → the harness + engines are trustworthy as a SOTA yardstick.
  - REFUTED if no engine clears a smooth style → suspect the harness, not the styles.
- **H3 — anisotropy pays:** *gmsh-aniso reaches comparable chord with materially fewer triangles than gmsh-iso
  (tris ratio ≤ 0.8) on ≥ 3 styles, OR a better `pctBelow20` at comparable tris.*
  - REFUTED if gmsh-aniso never beats gmsh-iso on tris-at-chord or quality → BAMG anisotropy isn't helping here.

## Protocol
1. (this doc, committed) — pre-registration fixed.
2. Build the all-20 runner over the matrix; **tol 0.05, res 32**; capture per (style,engine): chord p99/max,
   vertexMax, `pctBelow20`, minAngle, tris, ms.
3. Classify each hypothesis against the criteria ABOVE — no moving the goalposts.
4. Write the result doc (`2026-06-26-rebaseline-sota-vs-ours.md`) + the scorecard JSON; commit. Keep every row,
   including refutations.
5. Decide the next arc from the verdicts (port gmsh-aniso / accept-floor-with-proof / pursue quad edge-flow).

## Controls
Equal tol across engines; analytic lift identical for all; same instruments; deterministic (Triangle; gmsh
seed pinned). Chord caveats stated per-style. No GPU in this run (CPU-only — no GPU-hygiene exposure).
