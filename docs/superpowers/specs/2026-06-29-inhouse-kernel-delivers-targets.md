# In-house kernel delivers the targets — per-node metric + past the gmsh cap (2026-06-29)

Continues `2026-06-29-inhouse-kernel-milestone.md`. The two follow-ups the user asked for — **per-node metric
placement** and **push past the gmsh cap to chase rms 0.01** — both landed. Lab-only (dev), GyroidManifold.
Mesher: `research/bridge/inhouseMetricMesh.ts` (no gmsh). Results: `research/exchange/_indense/result.json`.

## Per-node metric placement (closes the oracle quality gap)
Replaced the spike's single global anisotropy scale with the **per-node surface metric** `M=g/h₃D²`
(`buildSurfaceMetricField`): refine by the local **metric edge length** (bilinear field lookup, no per-triangle
oracle chord sampling), keep the fast xyz-cached true-3D flips + the [smooth+flip] optimization.

| mesher | tris | mean | p5 | %<20 | rms |
|---|---|---|---|---|---|
| spike, refine-only | 40k | 35.9 | 16 | 12.2 | 0.192 |
| spike + optimization | 40k | 41.3 | 22 | 2.5 | 0.218 |
| **in-house per-node metric** | 180k | **45.4** | 23 | 3.5 | 0.080 |
| **in-house per-node metric** | 692k | 45.1 | 22 | 4.0 | 0.027 |
| gmsh oracle (reference) | ~0.9M | ~47 | — | ~2 | 0.04–0.06 |

Per-node placement lifted mean **41.3 → 45.4** — essentially the oracle (~47), with rms matching gmsh per
triangle. No triangle cap (`hitBudget=false`).

## Past the gmsh cap → rms 0.01 (both targets hit)
gmsh BAMG pinned at ~1.796M regardless of settings. The in-house kernel has no such cap. Dense run
(tol 0.0015, sizeRes 256, 1.5M-point budget):

| metric | value |
|---|---|
| triangles | **2,998,516** — exceeds the gmsh 1.8M cap ✓ |
| **rms** | **0.0030 mm** (3µm) — the rms-0.01 target *exceeded* |
| **p99** (crease worst-chord) | **0.0101 mm** (10µm) — steep crease at the 0.01 target |
| mean min-angle | **46.5°** (oracle ~47) |
| p5 / %<20° | 31° / 1.1% |
| worst-angle | 0.1° (a few residual hard slivers; %<20° 1.0%) |
| build | **55s** (after the perf pass below; was 759s); `hitBudget=true` → headroom toward 15M |

**Both user targets met in the lab, by our own kernel:** rms 0.01 (reached 0.003), steep crease at highest
fidelity (p99 10µm), and well past the gmsh cap (3M, with headroom). Quality matches the oracle (mean 46.5).

## Honest status / remaining
- LAB/dev-only; the conforming mesher still SHIPS. These numbers are on a (u,t) PATCH (no periodic-u seam,
  no t=0/1 rim) — the known-solvable engineering, not yet done.
- **Performance — DONE (~14×): 3M in 55s (was 759s).** Profiled, then fixed the real bottlenecks: the flip was
  84% of runtime (per-pass edge Map) → replaced with halfedge-structure flips (Delaunator `_legalize` relink) +
  an acos-free squared-cosine criterion; the smoothing rebuilt a `Set[]` ring + re-evaluated `rA` per neighbour
  → CSR adjacency + positions precomputed per iteration; and the longest-edge-only refinement trickled (rounds
  hit the 60 cap) → split every over-size edge per round (rounds 60→9). Measured: 360k 82→9s, 692k 368→38s,
  1.13M 142→50s, 3M 759→55s. Quality byte-identical across the change. The last ceiling for *seconds* at 15M is
  the per-round full `delaunator` rebuild → incremental Bowyer-Watson insertion (not yet done).
- **Residual hard slivers** (worst 0.1°, %<20° 1.1%) at the steep creases — the geometric crease floor; a
  correct crease-aligned anisotropic metric ((II,I) generalized eigendecomp) is the lever to push it lower.
- **Next:** periodic-u seam + rim/base; incremental-Delaunay perf; then the flag-gated production cutover
  (CRITICAL `PeriodicBalancedQuadtree`/`WatertightAssembly`, needs a design pass).
