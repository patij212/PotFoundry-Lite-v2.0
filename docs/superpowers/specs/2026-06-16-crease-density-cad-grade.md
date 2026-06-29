# Crease-Density CAD-Grade — the tangled-lattice "floor" was a depth cap (2026-06-16)

**This overturns the central conclusion of the 2026-06-15 arc** (`2026-06-15-export-fidelity-arc-SYNTHESIS.md`
+ `2026-06-15-export-quality-gate-and-floor.md`), which declared the 5 tangled lattice/weave/braid
styles (Gyroid, BasketWeave, CelticKnot, CelticTriquetra, Gothic-upper) a **proven-irreducible quality
floor** needing a heavyweight anisotropic remesher. That was wrong. Branch `refactor/core-migration`.

## What triggered it

The user rejected the "accept slivers on a faithful surface" framing: *"the slivers are cases by
stretching the mesh from UV to 3D … lacking the density to represent the steep curvature … staircasing
a smooth curved surface."* That is exactly right, and it exposed a category error in the prior arc:
**"vertices lie on the surface" does NOT imply "the surface is faithful"** — it says nothing about whether
the flat *facets between* the vertices chord across the curvature. The perpendicular-3D chord metric
(which measures facet→surface distance) already recorded these styles as genuine 3D gaps; the arc had
explained that away as an irreducible floor.

## The measurements (Gyroid, perpendicular3DDeviation, denseN=6, tol 0.1mm)

| config | perp p99 | worst facet | wall tris | |
|---|---|---|---|---|
| **default export** (sag 0.05, L12, nRing 1024) | 0.4554 | 1.106 | 715k | staircased |
| maxSag 0.1→0.05 | 0.4554 | 1.106 | 715k | **byte-identical** (refiner blind at coarse sag) |
| maxSag 0.01 + L14 + nRing2048 | 0.2322 | 0.976 | 1.06M | the old "0.23 plateau" |
| uniform L9 (blunt) | 0.2493 | 0.982 | 1.39M | same plateau, different method |
| maxSag 0.005 + L15 + nRing2048 | 0.1236 | 0.832 | 1.66M | plateau **broken** |
| **maxSag 0.003 + L16 + nRing2048** | **0.0857** | 0.724 | 2.29M | **≤ 0.1 CAD-grade** |

**The "0.23 plateau ⇒ structural floor" inference (prior arc) was wrong.** Two density methods
converged at ~0.23 only because BOTH were depth-capped (uniform ≈ budget, maxSag0.01 ≈ L14). Pushing
past both — deeper level + tighter chord target — converges monotonically to CAD-grade. The chord was
never a floor; the **L12 quadtree depth cap** (`resolveQuadtreeMaxLevel(0.05)=12`) physically stopped
the refiner before it could resolve the steep crease.

## Generality (same near-tol config across styles)

| style | perp p99 | note |
|---|---|---|
| GyroidManifold | 0.124 (0.086 deeper) | ✓ |
| GothicArches | 0.110 | ✓ at deeper |
| CelticKnot | **0.0041** | was the 0.42 "floor" |
| HarmonicRipple (smooth ctrl) | 0.0045 | already-fine style stays fine |
| BasketWeave, CelticTriquetra | meshes build; perp-diag timed out (>10min, too dense to measure) |

## What did NOT work (measured, so the production fix is honest)

- **cellSamples (crease-seeing refiner)** — a k×k metric sample across each cell instead of centre-only.
  Built + shipped (flag-gated, byte-identical at k=1, 30 conforming unit tests pass). ISOLATION at
  fixed depth: cells1 0.1305 / cells4 0.1236 / cells8 0.1225 — **only ~5%, saturates.** The workhorse
  is refinement DEPTH, not seeing. Kept (principled, free), not oversold.
- **Adaptive via curvature-grid resolution** (`__pfConformingSizingRes`) — raise the sizing field's
  128² curvature grid so a *moderate* chord target densifies only the crease (no smooth bloat).
  MEASURED FAIL: 128→1024 barely moved Gyroid (maxSag0.02: 0.336→0.326). The curvature **model** is
  band-limited (finite-difference κ underestimates the crease by ~16×), not just the grid. The known
  efficient fix is per-style **analytic curvature** (`curvatureFloor`) — deferred (per-style work).

## The production fix — CAD-fidelity floor (faithful by default, user-chosen)

`ParametricExportComputer.compute()` conforming block: for the **high/ultra** export profiles only
(draft/standard stay fast for iteration; dev `__pfConforming*` levers still win), floor the mesher knobs:
`maxSag ≤ 0.003`, `maxLevel ≥ 16`, `nRing ≥ 2048`, `cellSamples = 2`, and raise the decimation budget cap
to 16M so the faithful crease mesh is not decimated back into a staircase. Cost is **adaptive**: flat
walls stay `maxEdge`-bounded (~1mm facets); only real curvature (tangled/wavy relief) densifies, so a
plain pot stays ~1M tris while a tangled lattice goes to ~5-6M (~150-250MB STL) — appropriate for the
user's stated CAD/interchange-master end-use.

## Slivers

Density-INVARIANT throughout (worst min-angle pinned ~0.85°, %<20° ~6%). The crease slivers remain but
are now thin needles between correctly-placed DENSE vertices — no longer the staircase. The user accepts
slivers; the gate's quality dimension still documents them.

## Remaining / open

- Re-baseline the committed dual-gate (`stage1-dualgate-baseline.json`) at the new default + flip
  `dualGate.test.ts` so the 5 former-floor styles PASS the chord ceiling (instead of being pinned over).
- BasketWeave / CelticTriquetra perp measurement times out at faithful density — confirm via a lighter
  probe (region-restricted or lower denseN) that they also cross tol.
- Export TIME / file SIZE at faithful default (perf pass).
- Efficient-faithful (per-style analytic `curvatureFloor`) would remove the smooth-wavy bloat — future.

## Probes (e2e/, uncommitted)
`_fidelity_crease_convergence.cjs`, `_fidelity_crease_multistyle.cjs`, `_fidelity_cad_default_validate.cjs`,
`_render_export_mesh.cjs` (baseline-vs-CAD-grade flat-shaded render via the dev-only `getMeshForRender`).
