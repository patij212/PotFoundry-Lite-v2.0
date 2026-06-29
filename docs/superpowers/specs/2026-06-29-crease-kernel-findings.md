# Crease-aligned metric → kernel — findings (2026-06-29)

Wired the validated crease-aligned anisotropic metric (`creaseAlignedMetric.ts`) into a mesher: connectivity is
the **anisotropic-metric Delaunay** via a **metric in-circle flip** (Cholesky-whiten the 4 points by the local
metric, then Euclidean in-circle — `creaseAlignedMesh.ts`, reuses the kernel's `flipHE` via a new pluggable
`shouldFlip` criterion; the batch kernel's default behaviour is byte-unchanged). Goal: replace the steep-crease
"slivers" with intentional long-along-crease / short-across-crease triangles. Lab-only. Judged by chord +
**in-metric** min-angle (the honest measure for an anisotropic mesh; isotropic 3D min-angle mislabels aligned
triangles).

## Result (Gyroid + HarmonicRipple, tol 0.006)
| style | mesh | tris | chord rms / p99 | ISO-3D mean / %<20 | IN-METRIC mean / %<20 |
|---|---|---|---|---|---|
| HarmonicRipple | iso surface | 740k | 0.0020 / 0.0074 | 44.6 / 0.0 | (n/a) |
| HarmonicRipple | **crease** | **53k (14× fewer)** | 0.0039 / 0.0151 | 9.4 / 95.7 | **41.0 / 1.1** |
| Gyroid | iso surface | 774k | 0.016 / 0.064 | 44.6 / 3.1 | (n/a) |
| Gyroid | crease (hMax 8) | 406k | 0.073 / 0.40 | 21.7 / 51 | 18.1 / 66 |
| Gyroid | **crease (hMax 1, res 256)** | **306k (2.5× fewer)** | 0.064 / 0.40 | 37.9 / 15 | **38.1 / 6.0** |

## Findings
1. **The kernel is correct and anisotropy is a BIG efficiency win on extended-feature styles.** HarmonicRipple
   (long smooth ripples) meshes at **14× fewer triangles** than the isotropic metric for comparable chord
   (0.0039 vs 0.0020), with **excellent in-metric quality (mean 41°, %<20 1.1%)**. The metric in-circle flip
   produces a clean anisotropic-metric Delaunay. (Its ISO-3D min-angle is low — 9.4° — but that's CORRECT: the
   triangles are intentionally long-along-ridge; the honest measure is the in-metric angle.)
2. **On sharp near-C0 creases (Gyroid) the anisotropic metric is fragile and hMax-sensitive.** At hMax 8 it
   degrades badly (in-metric 18°). Root cause #1: hMax must stay **below the feature wavelength** (the agent
   flagged this) — tuning to hMax 1 + sizeRes 256 restores quality (in-metric 38°/%<20 6, ISO-3D mean 38) at
   2.5× fewer triangles.
3. **Residual: chord lags on Gyroid (0.064 vs iso 0.016) — the band-limited metric grid.** Even tuned, the
   long along-channel edges accumulate chord error because the sizeRes-256 grid + central differences
   under-resolve Gyroid's fine ALONG-channel curvature (k2), so the metric mis-sizes the along direction. This
   is the recurring band-limited-curvature blind spot; the anisotropic metric is MORE sensitive to it than the
   isotropic one (it needs accurate principal DIRECTIONS, not just magnitude).

## Net
- **Crease-aligned meshing is a real, correct lever** — a large triangle-budget win (2.5–14×) at good in-metric
  quality, biggest where features are extended/straight (ripples, flutes, ridges; likely SpiralRidges,
  BambooSegments, ArtDeco, GothicArches).
- **It does NOT cleanly "kill" Gyroid's steep-crease slivers**: it converts them to well-shaped aligned
  triangles at fewer tris, but trades chord (band-limit). Closing the Gyroid chord needs a finer/analytic
  curvature metric (the standing band-limit fix), not the alignment itself. The steep near-C0 crease remains the
  hardest case (consistent with the project-wide "steep relief = accept/irreducible-on-current-metric" theme).

## Next levers (if pursued)
Analytic curvature (or much finer metric grid) to fix the Gyroid along-channel chord; per-style hMax in the
curvature regime; apply crease-aligned to the extended-feature styles where the 14× win lands.
