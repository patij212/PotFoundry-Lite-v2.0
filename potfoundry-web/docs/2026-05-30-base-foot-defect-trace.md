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

## Candidate fixes — ONLY if step 1–2 confirm a real base defect

- If v18.1 subdivision perturbs base z → constrain the sag-gate/repair to leave
  flat (|nz|≈1) surfaces on-plane.
- If the outer-wall bottom row (t≈0) is the culprit → inspect the CDT outer-wall
  bottom boundary, not surfaces 3/4.

## Open question for sign-off

Step 2 needs the v18.1 tree temporarily stashed to get a clean-HEAD baseline.
That touches in-progress work that isn't mine — your call on whether to stash it,
commit it first, or have me work around it.
