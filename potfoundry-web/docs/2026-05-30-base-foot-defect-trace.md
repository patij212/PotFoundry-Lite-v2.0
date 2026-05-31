# Base/Foot "20 mm Defect" — Read-Only Trace & Re-Attribution Plan

**Date:** 2026-05-30
**Status:** read-only investigation complete; no production code touched.
**TL;DR:** The committed shaders do **not** displace the base disc in z. The
parametric and GPU-grid reference build the **same** flat bottom slab from the
**same** radius functions. The prior session's "parametric base disc is displaced
~20 mm upward" conclusion is **not supported by the current shader code**. Before
any geometry fix, the residual must be re-attributed — the prime suspect is the
**uncommitted v18.1 subdivision/repair tree**, not the base parameterization.

---

## What the under-test base actually is (parametric path)

`ParametricExportComputer` assembles 6 surfaces. The bottom is surfaces 3/4/5,
built in the non-outer `else` branch
([ParametricExportComputer.ts:1837](../src/renderers/webgpu/ParametricExportComputer.ts#L1837))
via `generateAdaptiveGrid(surfaceU, surfT, surf.id, …)`. `selectSurfaceUPositionsForClosure`
([:275](../src/renderers/webgpu/ParametricExportComputer.ts#L275)) returns the
outer-wall U columns for every surface, so all surfaces share the angular sampling.

3D positions are resolved on GPU in `evaluate_vertices`
([adaptive_mesh.wgsl:763](../src/assets/shaders/adaptive_mesh.wgsl#L763)):

| surf | what | z | r |
|---|---|---|---|
| 3 Bottom Under | flat annulus | `z = 0` | `r_outer(θ,0) → rDrain`, linear in t |
| 4 Bottom Top | inner floor | `z = tBottom` | `r_inner(θ,tBottom/H) → rDrain`, linear in t |
| 5 Drain | cylinder | `z = t·tBottom` | `rDrain` |

`compute_outer_radius(θ,t) = style_radius(styleId, θ, t, r_base(t))`
([adaptive_mesh.wgsl:126](../src/assets/shaders/adaptive_mesh.wgsl#L126)) — and
`r_base`/`style_radius` live in the **shared** `styles.wgsl`.

## The reference base (GPU-grid path)

`pot_export.wgsl` builds Bottom Under
([:625](../src/assets/shaders/pot_export.wgsl#L625)) at `z = 0`,
`r = style_radius(styleId, θ, 0, r_base(0))`, and Bottom Top
([:644](../src/assets/shaders/pot_export.wgsl#L644)) at `z = tBottom`,
`r = style_radius(…,tBottom/H) − tWall`; drain rings at `rDrain`. It imports the
**same `styles.wgsl`** `r_base`/`style_radius`.

## Side-by-side

- **z model: identical.** Both put the under-face at `z = 0` and the inner floor
  at `z = tBottom`. There is no z-offset between them.
- **outer radius at the base: identical function** (`style_radius` at `t = 0`).
- **radial extent: identical** — flat annulus `rDrain → r_outer(θ,0)` at `z = 0`.
- Only difference: the parametric annulus subdivides radially over `h` rows
  (linear in r); the reference is a 2-ring strip. Same **surface**, denser
  sampling. A point-to-triangle distance between two co-planar annuli of equal
  radial extent is ≈ 0.

**Conclusion: the committed base model is correct and matches the reference.**

## Why the prior "~20 mm displaced disc" reading is now in doubt

The 20 mm came from a `measureBaseNearest` point-to-triangle diagnostic run
**against the working tree, which carries the uncommitted v18.1 changes**
(`ParametricExportComputer.ts +550`, `MeshSubdivision.ts +111`: tolerance
preflight, GPU-surface subdivision sag-gate, T-junction/boundary-loop repair,
10 M soft-cap). If anything moves base vertices off `z = 0`, it is downstream of
the (correct) `evaluate_vertices`, i.e. in that **subdivision/repair** stage —
not in the base parameterization. The earlier z-band diagnostic's "TEST 0–1 mm
rms 22 mm" was the **radial-metric degeneracy** on the flat annulus (now fixed by
the surface-aware metric), and its "REF nearHoriz 0.0%" vs "TEST 54.6%" is
consistent with the diagnostic's z-band capturing wall on the ref side but the
flat disc on the test side — a band-definition artifact, not a geometry defect.

## Re-attribution plan (do this BEFORE any geometry fix)

1. **Per-surface nearest-surface breakdown.** Extend the (authorized) harness to
   report max/rms nearest-surface deviation **bucketed by surfaceId** (0–5), so
   we see whether the residual is actually on surfaces 3/4 (base) or on the
   outer-wall bottom rows. Run on the 6 measurable styles. *(harness code —
   no sign-off needed.)*
2. **v18.1 isolation.** Re-run the per-surface breakdown with the v18.1 tree
   stashed (clean HEAD pipeline) vs as-is. If the base residual disappears at
   HEAD, the defect is in the uncommitted subdivision/repair, not the shader.
   *(requires your call on touching the v18.1 tree — see open question.)*
3. **Drain-hole/extent sanity.** Confirm test dimensions' `rDrain`; verify both
   meshes leave `r < rDrain` open (the `[10..45.9]` vs `[0..45.9]` r-extent note
   suggests the *reference* may close to r=0 — if so the reference, not the
   parametric, is wrong on the hole, and that contaminated the old diagnostic).

## Step 1 RESULT (2026-05-30, real WebGPU, 6 measurable styles, 30min)

Ran a per-region breakdown instead of a per-surfaceId one: the v18.1 subdivision
remaps the index buffer, so the initial per-surface index ranges do not survive
to the final mesh. Geometric region bucketing (centroid z-band × orientation
|n_z|/|n|) is robust to the remap and answers the same question. Each region uses
the SAME honest split as the metric (nearest-surface for non-vertical, radial for
near-vertical). Decisive numbers:

| style | `body_vert` rms (wall floor) | `low_horiz` rms/max (base disc, **honest**) | `low_vert` rms (radial) |
|---|---|---|---|
| SuperformulaBlossom | 1.51 | **18.66 / 33.27** | 24.24 |
| FourierBloom | 1.51 | **14.76 / 30.32** | 24.82 |
| SpiralRidges | 1.51 | **14.76 / 67.32** | 22.51 |
| SuperellipseMorph | 1.51 | **17.47 / 31.70** | 23.93 |
| HarmonicRipple | 1.51 | **13.02 / 27.94** | 22.56 |
| LowPolyFacet | 1.51 | **15.60 / 28.00** | 20.80 |

**Conclusions:**
1. **Wall body (z>5mm, vertical) is CLEAN** — `mid_vert`+`body_vert` rms = 1.51mm
   (the radial metric floor) on every style. The body is NOT under-tessellated.
2. **The base (z<5mm) carries a real, honest defect** — `low_horiz`, measured by
   true nearest-surface (NOT the degenerate radial path), is 13–18mm rms /
   28–67mm max across all 6 styles. Co-planar discs would score ~0, so the
   parametric base disc is genuinely OFF the reference base surface. Corroborates
   the metric-independent point-to-triangle base finding (~20mm).
3. **Feature-dense styles add a SECOND defect up the body** — HarmonicRipple
   `body_horiz` rms=27mm (max ~100mm); its maxSag driver is the horizontal
   ripple-shelf facets up the wall, NOT the base. SpiralRidges/FourierBloom show
   smaller body_horiz/slope residuals. So maxSag has two regimes: smooth styles →
   base disc; ripple/bloom styles → horizontal feature shelves.

**Caveat:** `low_vert` is on the radial path, and R_true averages over the base
disc's full radius range at low z, so its 20–25mm is contaminated and NOT
trustworthy for attributing a wall-bottom defect. Only `low_horiz` (honest) is.
The nearest-surface index excludes near-vertical reference triangles, so the
outer-wall bottom rows cannot currently be measured honestly — if step 2 needs to
isolate the wall bottom, the index must be extended to include near-vertical
reference triangles for that query.

## Candidate fixes — ONLY if step 1–2 confirm a real base defect

- If v18.1 subdivision perturbs base z → constrain the sag-gate/repair to leave
  flat (|nz|≈1) surfaces on-plane.
- If the outer-wall bottom row (t≈0) is the culprit → inspect the CDT outer-wall
  bottom boundary, not surfaces 3/4.

## Open question for sign-off

Step 2 needs the v18.1 tree temporarily stashed to get a clean-HEAD baseline.
That touches in-progress work that isn't mine — your call on whether to stash it,
commit it first, or have me work around it.
