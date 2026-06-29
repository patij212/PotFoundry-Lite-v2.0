# Scaling the metric recipe to production fidelity — RESULT (2026-06-29)

User feedback that drove this: *"the quality does not look high enough. I am expecting up to 15M triangles to
fully represent a complex style."* The earlier quality runs were toy-sized (10–22k tris); this pushes the locked
recipe toward production density (toward millions) on GyroidManifold and finds where it breaks + the fix.
Lab-only. Scorecards: `2026-06-29-rebaseline-evidence/{density-scale,quality-fix,quality-probe}-scorecard.json`.
Renders: `scratchpad/surfqual_{dense_relief,uniform_heatmap,uniform_relief}.png`.

## Density scaling (GyroidManifold, sizeRes 128 metric)
| arm | tris | worst | p5 | mean | %<20 | rms(mm) |
|---|---|---|---|---|---|---|
| euclid | 33k→213k | 8.0→3.7 | 15→13 | **28** flat | 14→11 | 0.219→0.114 |
| metric (chord) | 32k→189k | 10.7→4.8 | 23→13 | **44** flat | 1.5→8.2 | 0.212→0.106 |
| metric chord+grade (β.25) | 334k→885k | ~4 | 17→**30** | 47→48 | 5.5→**4.1** | 0.083→**0.042** |
| metric **uniform** @885k | 870k | 5.3 | **39** | **49.8** | **1.9** | 0.057 |
| metric chord @sizeRes256 | 969k | 2.1 | 16 | 44 | 5.6 | 0.025 |

## Findings
1. **Fidelity fully converges with density** — metric rms 0.21 → 0.11 → **0.042–0.057 mm** at ~0.9M tris on this
   patch (well below printer resolution ~0.1mm). The complex style IS fully represented (see `dense_relief.png`).
   The patch saturates ~0.9M; the full pot (all walls × circumference) at this per-patch density is the millions
   you expect.
2. **Mean quality holds high at every density** (metric ~44–50°; Euclidean stuck at 28° AND degrades — worst
   8°→3.7° as it densifies, MORE slivers). The metric's advantage is density-robust where Euclidean's isn't.
3. **The chord size-gradient grows slivers at scale** (%<20° 1.5%→8.2% as tris rise). **GRADATION** (cap
   adjacent size ratio ≤1.25, new `gradeSizeField`) cuts that — p5 13°→**30°**, %<20° 8%→4%, rms→0.042. The
   on-surface **smoothing pass is MARGINAL** on gmsh's already-optimized mesh (mean +0.9° at most) — the metric,
   not the smoothing, is the lever.
4. **Residual slivers root-caused: steep-relief CREASE anisotropy, NOT band-limiting.** Discriminators:
   sizeRes 256 (finer metric) made it WORSE (5.6% vs 4.1% — sharper creases → more extreme anisotropy), and
   uniform sizing is far cleaner (1.9% vs 4.1%). The slivers are crease-localized (heatmap: red only along the
   Gyroid channels). This is the **angle-domain analog of the project's chord straddle floor** — at a steep
   relief crease the surface near-folds, `g` is extremely anisotropic, so even metric-even triangles stretch in
   3D there. Geometric, ~2% floor.

## Recommendation (answers the 15M budget)
**With a generous triangle budget, drop aggressive chord-adaptivity and use near-UNIFORM dense 3D sizing.**
Chord-adaptivity exists to save triangles; at the 15M budget you don't need the savings, and it costs quality
(doubles crease slivers). Uniform @885k already gives **mean 49.8°, p5 39°, %<20° 1.9%, rms 0.057mm** (sub-printer)
— high quality AND faithful. Lightly-graded chord is the lever only when the triangle budget is tight.

The residual ~2% steep-crease sliver floor is geometric (steep relief = stretched 3D triangles). Pushing below it
needs crease-AWARE meshing (align the long triangle axis ALONG the crease, not the curvature-max metric) or the
production crease-exclusion machinery — an open lever, the angle analog of `analyticSurfaceGate` crease exclusion.

## Status / next
Recipe + scaling proven on the oracle. Quality is high and faithful at production density (uniform config). The
kernel/cutover phase still stands; before it, the open quality lever is crease-aware anisotropy for the last 2%.
