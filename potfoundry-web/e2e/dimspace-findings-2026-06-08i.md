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
