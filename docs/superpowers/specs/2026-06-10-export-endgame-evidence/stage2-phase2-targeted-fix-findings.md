# Stage-2 Phase-2 — Targeted Transition-Sliver Fix: Experiments & Findings (2026-06-15)

Two measured attempts to eliminate the catastrophic transition-template slivers (the user's
chosen "targeted fix of the catastrophic degenerate cells"). **Both failed; both reverted;
production untouched.** This documents them fully so the dead-ends are not re-tried and the
root cause is unambiguous for future work.

Localizer (committed `sliversBySource.localizer.test.ts`): **100% of the wall slivers are
`TRI_SOURCE.TRANSITION_FAN`** (the 2:1-transition centroid-fan template); `PLAIN_QUAD` and the
`EAR_CLIP` max-min-angle DP produce **zero**. So the target was pinpointed; the question was
whether a better transition template removes them.

---

## Experiment 1 — DP-always (force the DP over the centroid fan)

**Hypothesis:** the centroid fan radiates needles over a wide transition polygon; forcing the
interior-only max-min-angle DP instead would remove them.

**Method:** flag-gated `forceDp` in `emitShapedTransition` (skip the fan/DP score comparison,
always emit the DP); proxy efg `{E:4^uBias, G:1}` where efg is guard-suppressed.

**Result — REGRESSION (worse):**

| metric (synthetic tangled wall) | fan (off) | DP-always (on) |
|---|---|---|
| triangles < 20° | 4960 | **8128** |
| worst min-angle | 17.977° | **11.874°** |

**Analysis:** the DP maximizes min-angle **in the cell-center efg metric**, which is *wrong* on
a high-curvature cell — so it optimizes the wrong objective and yields worse 3D triangles than
the (crude but interior-Steiner) fan. **This was already known:** `FeatureConformingTriangulator.ts:768-769`
documents *"the DP-always variant regressed fan-favourable cells."* We independently re-confirmed it.

**Disposition:** reverted. Dead end.

---

## Experiment 2 — True-3D-scored transition chooser

**Hypothesis:** the fan-vs-DP choice is scored by the wrong (center-efg) metric; scoring by the
**true 3D surface** would pick the genuinely-better template and remove the slivers.

**Method:** thread the warp-composed surface sampler (`qt.surfaceSampler()`, the same map used
for `efg`) into `emitShapedTransition`; score both templates by **real 3D angles** of the lifted
polygon. Flag-gated (`__pfConformingTrue3DTransition`), default off → byte-identical. Wired into
both the plain (`QuadtreeTriangulator`) and feature (`FeatureConformingTriangulator`) paths.

**Result — NO-OP:**

| style | worst min-angle (off → on) | %<20° | tris |
|---|---|---|---|
| GyroidManifold (real, tangled) | 0.85 → **0.85** | 7.10 → 7.10 | 684876 → 681392 |
| FourierBloom (real, non-tangled) | 13.36 → **13.36** | 17.30 → 17.30 | 360010 → 360018 |
| synthetic tangled wall | 17.977 → **17.977** | 4960 → 4960 tris | 79648 → 81600 |

(The tris shift proves the flag took effect and *did* re-choose some cells — it just didn't
change the worst angle or the sliver count.)

**Analysis:** true-3D scoring **correctly keeps the fan** — the fan genuinely *is* the better of
the two templates in real 3D on these cells. **Both templates are slivers** because the
transition *cell itself* is too coarse for the local high-curvature surface. This is a
cell-**resolution** problem, not a template-**choice** problem.

**Disposition:** reverted (no measured benefit on any style).

---

## Issues / caveats encountered
- **The synthetic localizer wall (`GyroidLikeSampler`) only produces MILD slivers (worst 17.977°),
  not the real catastrophic <1°.** So it validated the *mechanism* (TRANSITION_FAN) and the
  *direction* of each fix, but the **real-style GPU sweep was the decisive test** (and confirmed
  the no-op). Future transition-cell experiments should validate on real styles, not only the
  synthetic.
- **The plain-path flag had no effect on real Gyroid** because Gyroid's wall is built via the
  **feature path** (`triangulateQuadtreeWithFeatures`) — both paths must be patched to test a
  transition-template change on the feature-dense styles.
- **GPU hygiene:** all probes were let to finish (`browser.close()`); no orphaned chromium.

---

## Root cause (unifying, confirmed across both experiments)
The 2:1 transition cell is sized by the curvature grid + uBias for its *average* local geometry.
On a tangled lattice the geometry varies *within* the cell, so (a) the cell-center `efg` metric
mis-describes it and (b) no flat-triangle template of that cell — fan, DP, or true-3D-chosen — can
be sliver-free. The fix must make the **cell** match the local geometry, not the **template**.

---

## Further developments (for the next pipeline work)
1. **Perp-3D-oracle-driven adaptive refinement of high-sliver transition cells (MOST PROMISING,
   UNTESTED).** Subdivide *specifically the transition cells that produce slivers* until each is
   small enough that its local metric is ~uniform (so the existing templates become correct).
   This is the Stage-3 "fix the refiner" idea (Option A) applied to the quality defect — and it
   could close BOTH the chord gap AND the quality slivers with one mechanism. **Caveat:** Stage-1's
   *blunt uniform* density left the worst angle pinned at 0.85° (uniform density doesn't remove the
   2:1 boundaries), so this needs *targeted, metric-aware* refinement (subdivide + re-evaluate the
   metric per sub-cell), not global density. Worth a measured spike before committing.
2. **Full anisotropic (local-metric) meshing (DEFINITIVE, HEAVY).** A per-point-metric anisotropic
   Delaunay (CGAL `Mesh_3`-class or a from-scratch anisotropic refinement, seeded by the existing
   `projectPointToRadialSurface` oracle). The Option-C spike (`stage2-optionC-spike-findings.md`)
   showed the tractable global-scale version fails on tangled local anisotropy — this is the
   research-grade version that would actually work. Large re-architecture; re-prove
   watertightness/vertex-exactness.
3. **Surface-aware transition templates (NARROW, UNCERTAIN).** Give the triangulator the sampler
   (now plumbed via `qt.surfaceSampler()` — though reverted) and triangulate transition polygons by
   a true-3D constrained Delaunay / ear-clip rather than fan-or-DP. Likely only a marginal win
   (the cell is still coarse), but the sampler-threading work is mapped if revisited.

**Recommendation (shipped):** accept the affected styles as a documented quality-floor + the CI
dual-gate (`2026-06-15-export-quality-gate-and-floor.md`); revisit (1) as the next real attempt
if the tangled-style quality becomes a priority.
