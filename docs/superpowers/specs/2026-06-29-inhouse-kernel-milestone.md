# In-house metric-Delaunay kernel — first lab milestone (2026-06-29)

The gmsh oracle hit its ~1.8M BAMG cap, so the user's rms-0.01 / 15M targets require OUR OWN kernel. This is the
first step of that build: validate the existing in-house spike against the oracle and close its known gap. All
lab-only (dev), validated with the project's own instruments.

## The in-house kernel
`src/fidelity/spike/metricDelaunayRefine.ts` (shipped `delaunator` + true-3D-angle Lawson flips
`metricFlipPasses` + chord/angle longest-edge refinement). Documented weakness: a single GLOBAL anisotropy
scale `s = median(√E/√G)` (vs the session's per-node surface metric `M=g/h²`).

## Validation vs oracle (lift the spike's (u,t) mesh, score with lab instruments)
| style | tris | worst | p5 | mean | %<20 | rms | p99 |
|---|---|---|---|---|---|---|---|
| HarmonicRipple (smooth) | 39k | 9.9 | 28 | 40.6 | 0.8 | 0.037 | 0.100 |
| GyroidManifold (tangled) refine-only | 40k | 4.8 | 16 | **35.9** | **12.2** | 0.192 | 0.748 |
| GyroidManifold + optimize ×8 | 40k | 6.5 | 22 | **41.3** | **2.5** | 0.218 | 0.748 |

(gmsh oracle reference at ~40k tris: mean ~47, %<20 ~3.)

## Findings
1. **The spike handles smooth, lags on tangled** — confirms the handoff. HarmonicRipple is near-oracle
   (mean 40.6, %<20 0.8); Gyroid refine-only is poor (mean 35.9, %<20 12.2).
2. **The missing piece is a vertex-OPTIMIZATION pass** (the spike has connectivity flips but never relocates
   vertices; gmsh does both). Adding iterated **[on-surface smooth + true-3D flip]** (reusing
   `surfaceSmoothing` + `metricFlipPasses`) lifts Gyroid **mean 35.9→41.3, p5 16→22, %<20 12.2→2.5%** — most of
   the gap to the oracle, with OUR code. Unlike on a gmsh mesh (where smoothing was marginal because gmsh was
   already optimal), on the spike's suboptimal mesh the optimization is decisive.
3. **Residual gap (mean 41 vs 47; rms 0.22; p99 0.748 crease):** the global anisotropy scale and the
   longest-edge (not metric-driven) point placement. p99 is the unchanged steep-crease straddle.

## Next steps (the kernel build)
1. **Per-node metric placement** — replace the global `s` with the surface metric `M=g/h²` to drive point
   density + the Delaunay scaling locally (closes the mean 41→47 gap).
2. **Chord-aware refinement** — drive rms/p99 down with the curvature sizing (the proven density lever).
3. **Scale + seam + watertight** — periodic-u seam, t=0/1 rim, and push past gmsh's 1.8M cap toward 15M.
4. **Then** the production cutover (brainstorm; CRITICAL `PeriodicBalancedQuadtree`/`WatertightAssembly`).
