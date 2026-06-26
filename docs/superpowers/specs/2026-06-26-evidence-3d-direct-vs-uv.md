# Evidence — 3D-DIRECT vs UV-(u,t)-metric meshing on the tangled lattices (2026-06-26)

**Experiment:** E-2026-06-26-3D-DIRECT-VS-UV
**Status:** REFUTED (the deciding-channel hypothesis) — with a sharper, decision-relevant finding
**Ledger:** `potfoundry-web/research/EXPERIMENT-REGISTRY.md` → block "E-2026-06-26-3D-DIRECT-VS-UV"
**Runner:** `potfoundry-web/research/bridge/threeDDirectVsUv.test.ts` + `potfoundry-web/research/bridge/remesh3d.py`
**Run:** `PF_3D_DIRECT=1 npx vitest run research/bridge/threeDDirectVsUv.test.ts` (CPU-only, 8.6 min, test PASSED, exit 0)
**Dumps (gitignored, NEW dir):** `potfoundry-web/research/exchange/_3ddirect/` — does NOT touch `_oursvssota*`
**New venv deps (recorded):** `potfoundry-web/research/oracle/requirements-3ddirect.txt` (pyvista 0.48.4 + pyacvd 0.4.0 + fast_simplification 0.1.13)

---

## The fork this de-risks

`2026-06-26-rebaseline-sota-vs-ours.md` §3.5: gmsh meshes the FLAT (u,t) under a band-limited metric; at tol=0.05 it UNDER-tessellates and LOSES the relief (BasketWeave mushy, Gyroid jagged) even though triangle angles are clean. The architectural question for the rebuild: **does meshing the surface DIRECTLY in 3D (placing/refining triangles by REAL 3D-surface criteria, not a lossy 2D metric proxy) capture the relief AND stay clean — at equal triangle budget?**

## Pre-registered hypothesis & kill-criterion (fixed BEFORE the deciding run)

**H:** A 3D-DIRECT remesh of the dense true surface achieves LOWER mean/RMS fidelity (`rmsDevMm` — captures the relief) at a `minAngleDeg` NO WORSE than gmsh-iso, at EQUAL triangle count, on BOTH GyroidManifold and BasketWeave.

**Kill-criterion** (per 3D-direct method, per style, ±5% of gmsh-iso's tri count):
- CONFIRMED if `rmsDevMm(3d-direct) < rmsDevMm(gmsh-iso)` AND `minAngleDeg(3d-direct) ≥ gmsh-iso − 2°`.
- REFUTED if `rmsDevMm(3d-direct) ≥ rmsDevMm(gmsh-iso)` OR `minAngleDeg(3d-direct) < gmsh-iso − 2°`.
- OVERALL CONFIRMED iff ≥1 method CONFIRMS on BOTH styles.

Honest metrics (this session's corrections): fidelity = `rmsDevMm` (NOT chordP99 — §3.5 proved p99 blind to under-tessellation, dominated by shared near-C0 creases); quality = `minAngleDeg` (depth-invariant — NOT `%<20°`, a dilution artifact). Both reported.

## Method / candidates (equal triangle budget; ONE instrument every mesh)

- **Ground truth:** dense (u,t) grid **768×768 (1.18M tris)** lifted via analytic `rA` (`measure.ts liftUtToRadial`). This is the FINEST faithful reference feasible — see the convergence table below.
- **3D-DIRECT (cvt):** pyacvd surface Centroidal-Voronoi clustering of the dense truth → uniform tris ON the surface (the principled "mesh the surface, not the flat UV" candidate). Resamples.
- **3D-DIRECT (qem):** fast_simplification Garland-Heckbert quadric-error decimation of the dense truth (cross-check; different mechanism; keeps truth vertices).
- **UV baseline:** gmsh-iso + GENUINE gmsh-aniso via `runStyle({aniso:true})` (metric wired — verified aniso tris ≠ iso tris; 4385/5773 ≈ the rebaseline's 4457/5757). tol 0.05, sizeRes 32, hMin 0.005.
- Instruments: `perpendicular3DDeviation` (rms+p99) + `triangleQualityDistribution` (minAngle+%<20°). Same `rA` lift + projection reference for truth, oracle, and candidate. `DIMS = {H:120, Rb:40, Rt:50, expn:1}`.

## Reference-faithfulness probe (the load-bearing caveat) — `_denseConvProbe`

The dense truth's OWN `rmsDevMm` does NOT converge to 0; `chordMax` is PINNED across a 36× tri-count range:

| res | tris | Gyroid rms | Gyroid chordMax | BasketWeave rms | BasketWeave chordMax |
|---|---|---|---|---|---|
| 128² | 32k | 0.294 | 1.509 | 0.376 | 1.760 |
| 256² | 131k | 0.223 | 1.124 | 0.310 | 1.748 |
| 512² | 523k | 0.143 | 1.025 | 0.237 | 1.745 |
| 768² | 1.18M | **0.0996** | **1.022** | **0.228** | **1.744** |

**Mechanism:** `chordMax` is density-INVARIANT (Gyroid ~1.02, BasketWeave ~1.74) ⇒ the worst facets straddle a **near-C0 relief STEP** (chord ≈ ½ step height) — the project's irreducible **steep-relief accept-class** (cf. rebaseline §3, GeometricStar `creaseStraddle`). Consequently a SUBSTANTIAL fraction of `rmsDevMm` is this same irreducible straddle (BasketWeave rms has nearly plateaued at 768²). **So even rms is partly straddle-contaminated — the §3.5 "fidelity gap lives in the mean/RMS" is only partly right**; the truly density-responsive part of rms is small on these styles. The 3D-direct candidate is remeshed from the 768² truth (its BEST shot — the finest faithful source).

## Measured scorecard — `_3ddirect/scorecard.json` (one-metric-both-meshes)

◆ = tangled lattice. **rms = the pre-registered deciding fidelity channel.** `vMax` = vertex-channel max.

| style | config | tris | **rmsDevMm** | minAngle° | %<20° | chordP99mm | chordMax | vMax mm |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Gyroid ◆ | **gmsh-iso** | 11168 | **0.3062** | 12.1 | 3.0 | 0.968 | 1.572 | <0.001 |
| Gyroid ◆ | gmsh-aniso | 4385 | 0.3273 | 13.2 | 0.3 | 1.190 | 1.590 | <0.001 |
| Gyroid ◆ | **cvt-3d @iso** | 10968 | 0.3079 | **32.9** | 0.0 | 0.897 | 1.501 | 1.05‡ |
| Gyroid ◆ | qem-3d @iso | 23828✗ | 0.2710 | **0.1** | 68.5 | 1.194 | 1.914 | 1.51‡ |
| Gyroid ◆ | cvt-3d @aniso | 4259 | 0.3620 | **32.5** | 0.0 | 1.231 | 1.521 | 0.75‡ |
| Gyroid ◆ | qem-3d @aniso | 23828✗ | 0.2710 | 0.1 | 68.5 | 1.194 | 1.914 | 1.51‡ |
| dense-truth | 768² | 1178112 | 0.0996 | 5.7 | 1.9 | 0.551 | 1.022 | — |
| BasketWeave ◆ | **gmsh-iso** | 12331 | **0.2333** | 9.6 | 3.8 | 0.917 | 1.781 | <0.001 |
| BasketWeave ◆ | gmsh-aniso | 5773 | 0.2520 | 13.8 | 0.3 | 0.950 | 1.815 | <0.001 |
| BasketWeave ◆ | **cvt-3d @iso** | 12105 | 0.3157 | **22.2** | 0.0 | 1.057 | 1.847 | 1.98‡ |
| BasketWeave ◆ | qem-3d @iso | 12331 | 0.2996 | **0.5** | 47.4 | 1.049 | 2.506 | 1.64‡ |
| BasketWeave ◆ | cvt-3d @aniso | 5622 | 0.3732 | **28.6** | 0.0 | 1.197 | 1.733 | 1.98‡ |
| BasketWeave ◆ | qem-3d @aniso | 5772 | 0.2835 | 0.2 | 59.5 | 1.113 | 2.899 | 1.79‡ |
| dense-truth | 768² | 1178112 | 0.2284 | 4.4 | 6.5 | 0.941 | 1.744 | — |

✗ QEM @iso for Gyroid floors at 23828 tris (target 11168) — it physically cannot reach the budget (see below), so it is NOT an equal-budget point. ‡ CVT/QEM `vMax` 0.75–1.98mm = the RESAMPLING artifact: their vertices are cluster-centroids / collapse-survivors that sit OFF the analytic surface (~½ a relief step), a vertex-channel penalty gmsh does NOT pay (gmsh places vertices exactly on `rA`). (BasketWeave's 2.0mm cap is the analytic-`rA`/warp-convention divergence noted in the OPUS run — affects the BasketWeave vertex channel.)

## Steelman: CHORD-ONLY rms (vertex penalty removed — "what the slicer sees") — `_chordOnlyProbe`

To give 3D-direct its FAIREST comparison (CVT is penalized by off-surface vertices gmsh isn't), the pure facet→surface rms (dense barycentric samples, no vertex channel):

| style | config | tris | CHORD-ONLY rms | p99 | max |
|---|---|---:|---:|---:|---:|
| Gyroid | gmsh-iso | 11168 | 0.1929 | 0.897 | 1.572 |
| Gyroid | **cvt-3d** | 10968 | **0.1688** | 0.751 | 1.501 |
| BasketWeave | gmsh-iso | 12331 | **0.2241** | 0.907 | 1.781 |
| BasketWeave | cvt-3d | 12105 | 0.2887 | 1.004 | 1.847 |

Even on the chord-only metric, CVT wins ONLY Gyroid (0.169 < 0.193) and LOSES BasketWeave (0.289 > 0.224) — **a split, marginal result, not the across-the-board fidelity win the hypothesis predicted.**

## Pre-registered kill-criterion classification (vs gmsh-iso, @iso budget)

| style | method | rms (3d) vs iso | minAngle (3d) vs iso | budgetOk | verdict |
|---|---|---|---|---|---|
| Gyroid | cvt-3d | 0.3079 ≥ 0.3062 | 32.9 ≥ 10.1 ✓ | ✓ | **REFUTED** (rms not lower) |
| Gyroid | qem-3d | 0.2710 < 0.3062 | 0.1 < 10.1 ✗ | ✗ (23828) | **REFUTED** (slivers + budget) |
| BasketWeave | cvt-3d | 0.3157 ≥ 0.2333 | 22.2 ≥ 7.6 ✓ | ✓ | **REFUTED** (rms not lower) |
| BasketWeave | qem-3d | 0.2996 ≥ 0.2333 | 0.5 < 7.6 ✗ | ✓ | **REFUTED** (rms + slivers) |

**OVERALL: REFUTED.** No 3D-direct method achieves lower combined `rmsDevMm` AND no-worse `minAngleDeg` on BOTH styles. (On the steelman chord-only rms, CVT still wins only 1 of 2.)

## Mechanisms (what the data says)

1. **3D-direct does NOT capture MORE relief than gmsh at equal budget.** CVT's fidelity is essentially TIED with gmsh-iso (Gyroid 0.308 vs 0.306 combined; 0.169 vs 0.193 chord-only) and WORSE on BasketWeave. Re-sampling the surface in 3D does not magically recover relief that 11k triangles cannot resolve — the relief is limited by the **near-C0 straddle floor** (chordMax pinned ~1.0–1.8mm) that is density-irreducible for BOTH the UV mesher and the 3D-direct mesher. The §3.5 visual "gmsh loses the relief" gap is REAL but it is a **budget/curvature-sizing** problem, not a UV-vs-3D-topology problem: at 11–12k tris neither approach can follow the lattice, and the fidelity numbers confirm they are within ~0.02–0.08mm of each other.
2. **CVT's DECISIVE win is triangle QUALITY, not fidelity.** At equal budget CVT min-angle is **32.9°/22.2°** vs gmsh-iso's **12.1°/9.6°** — CVT is by far the cleanest mesher (surface-CVT/Lloyd relaxation maximizes the minimum angle; cf. `tessellation-knowledge` CVT/ODT). It just spends that quality on *the same* relief gmsh captures, not more.
3. **QEM decimation is a sliver factory AND can't hit the budget.** min-angle 0.1–0.5° everywhere (the project's known "decimation injects slivers" defect, `meshDecimator`/`decimateConforming`). And on Gyroid it floors at 23828 tris regardless of target/aggressiveness (agg 7/8/10 all → 23.8–25.3k): the lattice's dense high-curvature relief edges carry huge quadric error, so QEM refuses to collapse across them while *also* making catastrophic slivers where it does. Pure error-driven decimation of a tangled lattice cannot be both small AND clean.
4. **Off-the-shelf CVT does not lock the boundary.** CVT z-range [0.93, 119.02] vs the true [0,120] — pyacvd resamples without border-locking, clipping the top/bottom rows. A production 3D-direct path would need a border-locked CVT (real, separate work).

## Verdict & recommendation for the architecture fork

**REFUTED — and the refutation is itself the decision-relevant result:**

- **Meshing directly in 3D does NOT "capture the relief better" than UV-(u,t)-metric meshing at equal budget.** The relief loss §3.5 saw in gmsh is a **sizing-field / triangle-budget** limitation (the band-limited curvature metric under-sizes the lattice), NOT an artifact of meshing the flat UV. A 3D-direct remesh from a near-perfect dense truth lands at the SAME fidelity floor — because the floor is the near-C0 straddle step, which no 11k-tri mesh (UV or 3D) can resolve.
- **Therefore: do NOT pivot the rebuild to a 3D-surface remesher to chase fidelity.** The cheaper, proven path stands: a **transition-free constrained-Delaunay quality loop over (u,t)** (the rebaseline / OURS-VS-SOTA recommendation) with **an accurate curvature sizing field** (fix the band-limited metric → `curvatureFloor`/analytic curvature) is what closes the relief gap — confirmed by the density-CLOSES-the-chord breakthrough (memory `project_crease_density_breakthrough`). 3D-direct adds cost (dense-truth build + resample, no native (u,t) for the warp/seam, off-surface vertices, no border lock) without a fidelity payoff.
- **The one transferable 3D-direct lesson = CVT/Lloyd SMOOTHING for triangle quality.** CVT's 32.9°/22.2° min-angle at equal budget is the cleanest in the matrix and corroborates `tessellation-knowledge`: a **CVT/ODT smoothing post-pass** on the (u,t) mesh (the in-house GAP — no CVT today) is the highest-leverage quality lever, independent of the UV-vs-3D question. Add it as a smoothing stage on the transition-free CDT kernel, NOT as a wholesale 3D remesh architecture.

**Next experiment:** measure whether an accurate (analytic-curvature) sizing field on the SAME transition-free engine closes the rms gap to the dense-truth floor at the same budget (isolates "sizing field" from "topology") — and whether a (u,t) CVT/ODT smoothing pass reproduces CVT's min-angle win without leaving the UV domain.

## Honesty / caveats

- **Watertightness NOT tested** (surface-patch fidelity+quality probe per the brief). CVT is an open patch (Euler χ=100), QEM keeps the seam — neither is a closed-solid claim.
- **rms is partly straddle-contaminated** on these styles (the reference itself floors at 0.10/0.23mm) — the deciding channel is imperfect, but it is the pre-registered, §3.5-mandated honest fidelity channel, and the verdict (no 3D-direct fidelity win) holds on BOTH the combined and the steelman chord-only rms.
- **BasketWeave vertex channel** carries the analytic-`rA`/warp-convention divergence (vMax 2.0mm, OPUS-run footnote); it does not affect the CHORD channel (recovered from xyz) on which the verdict rests.
- **GENUINE aniso** verified (aniso tris ≠ iso, matching the rebaseline) — no silent metric drop.
