# Base/Foot "20 mm Defect" — Read-Only Trace & Re-Attribution Plan

**Date:** 2026-05-30 (Step 3 added 2026-05-31)
**Status:** investigation COMPLETE. No base/foot geometry defect exists. The
"20 mm base defect" was a **metric artifact**, now proven and resolved.
**TL;DR:** The committed shaders do **not** displace the base disc in z. The
parametric and GPU-grid reference build the **same** flat bottom slab from the
**same** radius functions. The prior "parametric base disc is displaced ~20 mm
upward" conclusion is **wrong** — it was a nearest-surface index artifact. The
index excluded near-vertical reference triangles (the drain cylinder and the
outer-wall bottom rows), so honest base-disc test points near the rim/drain had
no adjacent reference surface and snapped to distant horizontal triangles,
inflating the deviation to 13–18 mm. **Step 3 (2026-05-31)** re-ran the
per-region breakdown with a FULL reference index (`minNonVerticalCos:0`): the
low-z residual collapsed to **0.4–1.5 mm rms** on all 6 styles. There is no base
defect, no foot defect, and no wall-bottom defect. The only real residuals are
**horizontal/slope feature shelves up the body of feature-dense styles**
(HarmonicRipple, FourierBloom, SpiralRidges) — under-tessellation of ripple/ridge
facets, not the base. Smooth styles (SuperformulaBlossom, SuperellipseMorph,
LowPolyFacet) are essentially clean everywhere.

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

## Step 2 RESULT — v18.1 isolation (2026-05-31, real WebGPU, 6 styles, isolated worktree)

Re-ran the identical per-region breakdown against the **pre-v18.1** pipeline
(worktree at `df9d729`, the surface-aware-metric commit, on its own dev server
:3002 so it could not accidentally hit the v18.1 HEAD server on :3001). `metrics.ts`
is byte-identical at `df9d729` and HEAD, so the v18.1 parametric pipeline
(`c7ebe9a` and later) is the **only** variable between the two runs.

| style | `low_horiz` rms/max — HEAD (v18.1) | `low_horiz` rms/max — pre-v18.1 (`df9d729`) |
|---|---|---|
| SuperformulaBlossom | 18.66 / 33.27 | **18.65 / 33.27** |
| FourierBloom | 14.76 / 30.32 | **14.74 / 30.20** |
| SpiralRidges | 14.76 / 67.32 | **15.12 / 67.23** |
| SuperellipseMorph | 17.47 / 31.70 | **17.48 / 31.70** |
| HarmonicRipple | 13.02 / 27.94 | **13.30 / 26.57** |
| LowPolyFacet | 15.60 / 28.00 | **15.62 / 28.00** |

**v18.1 is EXONERATED.** The base `low_horiz` residual is identical within ~0.3mm
noise at both pipelines. The candidate-fix hypothesis "v18.1 subdivision perturbs
base z" (below) is **refuted** — the ~13–18mm base defect predates v18.1 and lives
in base-disc generation upstream of the subdivision/repair. Corollaries:

1. The `body_vert` 1.51mm floor is unchanged (1.51 → 1.51–1.67) — wall body clean
   in both.
2. The feature-dense body defects are unchanged: HarmonicRipple `body_horiz`
   27.01 → 24.64 (max 99.99 in both); FourierBloom `body_slope` max 85.30 → 82.22.
   v18.1's tolerance-first sag-gate moved **none** of the honest sag deviations
   (it may still help other dimensions — slivers/watertightness — not measured here).

**Re-attribution after step 2:** the fix target is NOT the v18.1 subdivision/repair.
It is upstream — but note the tension with the shader trace above, which shows the
base disc is built identically to the reference with no z-displacement. Both can be
true only if (a) base-disc vertex *placement* (CPU grid build, stages 3/6) differs
from the GPU-grid reference despite the shared `style_radius`, or (b) `low_horiz`
still carries a nearest-surface artifact at the base rim (query points just past the
reference disc edge snapping to the rim). Distinguishing (a) from (b) is the cheap
next diagnostic (step 3-adjacent): dump the parametric base-disc vertex z/r extent
vs the reference at matched (θ), no GPU re-run needed.

## Step 3 RESULT — full-coverage honest breakdown (2026-05-31, real WebGPU, 6 styles, 12.8min)

Per the "broaden first" decision, the nearest-surface index was extended from
XY-only + near-vertical-excluded to a **3D-cell spatial hash** with
`minNonVerticalCos:0` (vertical walls INCLUDED). This closes the metric's last
blind spot: horizontal base-disc test points near the rim/drain, and the
outer-wall bottom rows (vertical at low z), can now both snap to the correct
adjacent reference surface. (Harness change only — `buildNearestSurface` 3D hash,
pinned by new vitest contract tests; production sag path keeps the default
`minNonVerticalCos:0.35` and is byte-identical. Diagnostic reverted after the run.)

| style | low_horiz rms/max — partial idx → FULL idx | low_vert rms — radial → honest | body_vert rms — partial → full |
|---|---|---|---|
| SuperformulaBlossom | 18.66/33.27 → **0.42/19.46** | 24.24 → **1.42** | 1.51 → **0.27** |
| FourierBloom | 14.76/30.32 → **1.42/29.32** | 24.82 → **1.42** | 1.52 → 1.52 |
| SpiralRidges | 14.76/67.32 → **1.42/67.36** | 22.51 → **1.42** | 1.67 → 1.67 |
| SuperellipseMorph | 17.47/31.70 → **0.42/19.42** | 23.93 → **1.42** | 1.51 → **0.27** |
| HarmonicRipple | 13.02/27.94 → **1.46/27.99** | 22.56 → **1.42** | 1.66 → 1.66 |
| LowPolyFacet | 15.60/28.00 → **0.42/19.46** | 20.80 → **1.42** | 1.52 → 1.52 |

**Decisive conclusions:**
1. **NO base defect.** `low_horiz` rms dropped from 13–18 mm to **0.4–1.5 mm**
   the instant vertical reference triangles entered the index. The base disc lies
   on the reference base disc to sub-mm — exactly as the shader trace predicted.
   This resolves the (a)/(b) tension from Step 2 in favor of **(b): metric rim
   artifact**. Option (a) (real base-disc placement divergence) is refuted.
2. **NO wall-bottom defect.** `low_vert`, now on the honest nearest-surface path
   (was the contaminated radial 20–25 mm), reads **1.42 mm** on every style. The
   outer-wall bottom rows — the blind spot this step existed to close — are clean.
3. **Correctness cross-check.** Where the reference is genuinely horizontal and
   dense, the number did NOT move: HarmonicRipple `body_horiz` 24.64 → 24.64
   identical. Only regions that previously LACKED adjacent reference dropped. The
   collapse is the artifact being removed, not a measurement bug. (22 vitest
   contract tests green, incl. a real 20 mm displacement still caught at ~20.)
4. **The smooth-style `body_vert` 1.51 "floor" was also artifact** — it was the
   radial metric's chord/quantization floor. Honest nearest-surface reads **0.27**
   on SuperformulaBlossom/SuperellipseMorph: the wall body is near-perfect.
5. **The REAL residuals are feature shelves up the body, feature-dense styles
   only:** HarmonicRipple `body_horiz` 24.64 rms / 99.99 max + `mid_horiz` 103 max
   (ripple shelves); FourierBloom `body_slope` 82 max + `mid_horiz` 12.27;
   SpiralRidges `body_slope` 75 max / `body_horiz` 52 max. Smooth styles have only
   a localized ~19–20 mm max at the drain/rim corner (shared low_horiz≈low_vert
   max → same vertices), no systematic residual.

**Final re-attribution:** The multi-session "base/foot 20 mm defect" never
existed — it was the nearest-surface index excluding the vertical walls. The
parametric base disc, foot, and wall bottom are all correct. The maxSag headline
is driven entirely by **horizontal feature-shelf under-tessellation on
feature-dense styles** (the v18.1 sag-gate moved none of these — Step 2). Any
future fidelity work on smooth styles is essentially done; feature-dense styles
need finer horizontal-shelf tessellation, NOT base geometry changes.

### Recommendation (needs sign-off — changes the baseline contract)
The PRODUCTION sag metric (`computeFidelityMetrics` → default
`minNonVerticalCos:0.35`) STILL carries the base-rim artifact, so `baseline.json`
maxSag for smooth styles is inflated by ~18–33 mm of phantom base sag. Promoting
the production index to `minNonVerticalCos:0` (now affordable via the 3D hash)
would make the headline metric honest — but it rewrites `baseline.json` and the
pinned `INVARIANT sag` numbers, so it is a measurement-contract change to confirm
before applying.

## Candidate fixes — SUPERSEDED by Step 3 (no base defect exists)
The candidates below were written before Step 3 proved the base is clean. They are
retained only as a record; do NOT act on them — there is no base z-perturbation to
constrain and no wall-bottom CDT defect to inspect.

- If v18.1 subdivision perturbs base z → constrain the sag-gate/repair to leave
  flat (|nz|≈1) surfaces on-plane.
- If the outer-wall bottom row (t≈0) is the culprit → inspect the CDT outer-wall
  bottom boundary, not surfaces 3/4.

## Open question for sign-off

Step 2 needs the v18.1 tree temporarily stashed to get a clean-HEAD baseline.
That touches in-progress work that isn't mine — your call on whether to stash it,
commit it first, or have me work around it.
