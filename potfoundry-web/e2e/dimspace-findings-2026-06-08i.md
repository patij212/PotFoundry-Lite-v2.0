# Dimension-space robustness sweep — conforming mesher (2026-06-08i)

Probe: e2e/_conforming_dimspace_probe.cjs (adds __pfFidelity.setDimensions). Default
harness only tested H120/top140/bottom90. Configs: tall-narrow, short-wide, no-drain,
high-flare, twisted. Goal vector: orient=bnd=nonMan=sliver=0.

## Result: TWO cutover-blocking robustness gaps (both PRE-EXISTING, broader than insertion)

| style | tall-narrow | short-wide | no-drain | high-flare | twisted |
|---|---|---|---|---|---|
| SuperformulaBlossom (smooth) | PASS | PASS | PASS | PASS | PASS |
| GothicArches (warp) | PASS | **FAIL sliver=2.9M** | PASS | PASS | PASS |
| LowPolyFacet (warp) | PASS | **FAIL sliver=615k** | PASS | PASS | PASS |
| HexagonalHive (insert) | PASS | **FAIL sliver=42** | PASS | **FAIL bnd=6** | **FAIL sliver=35** |
| GyroidManifold (insert) | **FAIL bnd=3** | **FAIL sliver=1.8M** | **FAIL sliver=25** | **FAIL** | **FAIL sliver=2** |
| CelticKnot (insert) | **FAIL sliver=1** | **FAIL sliver=1.5M** | **FAIL sliver=5** | **FAIL** | **FAIL sliver=3** |

## Diagnosis
1. SHORT-WIDE (extreme aspect, H40/OD300 = flat wide dish): ALL feature-bearing
   styles explode (warp AND insertion); SMOOTH styles are clean. Cause: the
   minUniformLevel (warp columns) / featureLevel (insertion) floor forces fine-u
   resolution; on a short-t pot the (u,t) cells become extreme-aspect → 3D slivers.
   PRE-EXISTING in the baseline 16/20 (GothicArches/LowPolyFacet fail), NOT from
   the insertion work. Fix = aspect-aware sizing (scale the uniform/feature floor
   by the metric anisotropy, or refine t to match forced u).
2. TWISTED / HIGH-FLARE: INSERTED styles fail (warps pass) — the (u,t) needle at
   curve extrema near cell edges, amplified by the twist/flare metric distortion.
   Fix = the deferred per-edge forced-crossing mirror (same fix as Voronoi).

## Cutover: NOT READY. The conforming path is robust at DEFAULT dims (all 20 clean,
## 19/20 featDrop=0) but breaks at extreme dims even for the pre-existing warp styles.
## Both gaps must be fixed before flipping the default.

## FULL sweep (dimspace-rest-2026-06-08i.log) — sharpens the diagnosis

Additional styles at short-wide (the only widely-failing config):
- BasketWeave sliver=2.1M, CelticTriquetra 1.9M, BambooSegments 552k, ArtDeco 559k,
  DragonScales 65k, SpiralRidges 41k, Crystalline 28k. GeometricStar = PASS.
- **Crystalline AND ArtDeco are SMOOTH styles (no warp, no insertion) and STILL FAIL
  short-wide.** SuperformulaBlossom (gentle smooth) passes; high-detail smooth fails.

### Reframed diagnosis
GAP 1 (short-wide / extreme aspect) is a FOUNDATION limitation of the conforming
mesher, NOT feature-specific: the square 2:1 quadtree cannot produce 3D-isotropic
cells when the metric anisotropy is extreme (circumference/height ≈ 23:1). Any style
with enough surface detail (smooth-high-curvature, warp, OR insertion) over-refines
into 3D slivers there (2-3.5M tris). minUniformLevel/featureLevel make it worse but
are NOT the root — even pure curvature-adaptive smooth styles fail. The real fix is
ANISOTROPIC cells (rectangular/kd splits) or an aspect-aware metric clamp in the
sizing field — a foundation change (PeriodicBalancedQuadtree / MetricSizingField).

All other configs (tall-narrow, no-drain, high-flare, twisted) PASS for warp+smooth;
only the INSERTED styles (Hex/Gyroid/Celtic) also fail twisted/high-flare (GAP 2, the
(u,t) needle).

CUTOVER remains NOT READY. Gap 1 (foundation, extreme aspect) is the dominant blocker.
