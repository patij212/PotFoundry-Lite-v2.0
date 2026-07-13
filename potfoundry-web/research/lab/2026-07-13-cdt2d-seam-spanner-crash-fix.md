# cdt2d `upperIds` Crash — Seam-Spanner Root Cause + Pre-Triangulation Guard (2026-07-13)

**Status:** FIXED + verified. New `tierC/seamPlanarize.ts` (`planarizeChartMM`) wired into
`refineToZeroOutliers` before every in-loop `triangulateMM`. Flag-OFF production path byte-identical.

## Symptom

`refineToZeroOutliers` (`noBridgeRefine.ts`) crashes at high refine density:
`triangulateMM` → `cdt2d(...)` → `TypeError: Cannot read properties of undefined (reading 'upperIds')`
from `cdt2d/lib/monotone.js:127` inside `mergeHulls` — the classic cdt2d non-planar/degenerate-PSLG
failure (same class as the seed-path `planarizeMM`, project memory `cdt_planarization`). Reproduces
with rim-pin OFF and independent of `nRing` — purely a function of refine density. Production's real
`buildTierCOuterWall` config (`bgArcMm 0.35, maxPass 16`) is denser than the repro, so it WOULD block
real flag-ON runs.

## Root cause (MEASURED — captured the exact PSLG cdt2d rejected)

Instrumented `triangulateMM` to stash the failing `{uv, cEdges, uToMm, tToMm}` on the `upperIds`
throw, then analysed it offline (predicates ported from `morseComplex.properCross`).

Captured crash PSLG: **nV=187156, nE=62321** (GothicArches, bgArcMm=1.5).

| Probe | Result |
|---|---|
| exact-duplicate mm points | 857 pairs (secondary) |
| **proper constraint-edge crossings** | **2965** (the direct `upperIds` trigger) |
| chart-spanning constraint edges (\|Δx\|>½ chart) | **56**, each joining a **u=1.0** vertex to a **u=0.0** vertex |
| vertices with u ∉ [0,1) | **4078** (down to u=−0.375, and 1116 exactly at u=1) |
| crossings involving a spanner | **2947 / 2965 (99.4%)** |

**Mechanism:** `insertOutlierSplit`/`splitOneEdge` computes seam-CONSISTENT (unwrapped) midpoints —
the `while (ub-ua>0.5) ub-=1` logic pushes u outside [0,1). `addPt` stores that **raw** u
(`uv.push(u,t)`) while `keyOf` only wraps for the HASH. So a seam-adjacent edge's subdivided half
joins the unwrapped midpoint (u≈1.0, x≈uToMm) to its original **wrapped** opposite-seam endpoint
(u≈0.0003, x≈0). That half-edge is infinitesimal in the periodic (cylinder) topology but **spans the
entire ~283mm chart** in the flat mm space cdt2d triangulates → crosses thousands of constraints →
non-planar PSLG → `mergeHulls` reads undefined `upperIds`. Density-dependent because spanners only
**accumulate** over passes (a handful created per pass). The seed path never hits this — its
constraints are clipped to [0,1] and planarized by `morseComplex.planarizeMM`; the incremental
interior loop had no equivalent guard.

## Fix

`tierC/seamPlanarize.ts` → `planarizeChartMM(uv, cEdges, uToMm, tToMm)`, called before EVERY in-loop
`triangulateMM` (seed + per-pass; NOT the post-boundary-reconciliation one, which follows the
deliberate `symmetrizeSeamColumns` weld):

1. **Canonicalize** strictly out-of-range u (u<0 || u>1) into [0,1). **Keep u==1 exactly** — it is the
   far-seam boundary (x=uToMm); collapsing it to 0 wrecks the chart hull.
2. **Seam-split** straddling constraint edges (|Δu|>½) at u=0 / u=1 twins → two in-seam, non-spanning
   edges (the u=1 twin's x=uToMm is precisely what keeps a near-u=1 edge from spanning).
3. **Crossing-split** any residual proper crossing into a shared T-junction (mirrors
   `morseComplex.planarizeMM`'s iterate-to-zero mechanism).

**APPEND-ONLY** by construction — existing vertex indices never move (values may be u-canonicalized),
so `noBridgeRefine`'s "uv only GROWS" invariant + the stable-index dirty-facet cache hold. New
split/twin points weld onto an existing point within `WELD_MM` else append. On any guard mutation the
loop rebuilds `cMap` and clears `devCache`. Browser-safe (no `fs`).

## Verification

| Check | Result |
|---|---|
| Unit test (synthetic seam-straddle → 0 crossings, cdt2d ok; inert on planar) | ✅ `seamPlanarize.test.ts` |
| **Real captured crash PSLG** → guard → cdt2d | ✅ throw true→false, **residual crossings 0**, 367k tris, guard 881ms |
| In-loop through the crash zone (bgArcMm=1.5, maxPass=3 → 319k verts, past the 187k crash point) | ✅ no `upperIds` |
| **Converging seam-inclusive gate** `wholeMesh0Outlier` Gothic smoke (uLo=0) | ✅ literal **0 outliers**, watertight, worst→0.010mm at pass 7 |
| Byte-identical on normal flows (`anisoSplit`, `dirtyCache`) | ✅ |
| **Production flag-OFF path** `flagOff.byteIdentical` | ✅ untouched |
| `morseComplex`, lint (0 warnings), `detect_changes` (working tree) | ✅ LOW risk, scope = noBridgeRefine only |

**Guard cost:** negligible. In-loop the seam-split preempts spanners at the source each pass
(`crossFound` stayed 0 through the crash zone; ~+9 verts/pass, sub-second). The 881ms one-shot was on
the accumulated 187k pileup (56 spanners + 18 residual crossings), <1% of that mesh's cdt2d. The
crossing-split is belt-and-suspenders — it fires only on the accumulated PSLG's 18 residuals, never
in-loop.

## Separate finding (NOT the crash; pre-existing; unmasked by the fix)

At the coarse repro config (bgArcMm=1.5, tol=0.01) the refine **DIVERGES**: outliers grow
(26k→44k→77k), worst stuck ~0.8mm, mesh ~doubles/pass. Previously the cdt2d crash aborted this run
early (~289s); with the crash fixed the loop runs on and OOMs/hangs after hours. This is an
"irreducible floor" (cf crease-density / analytic-floor), NOT the guard (which adds ~9 verts/pass, 0
crossings). The SAME mesher converges cleanly at a finer seed (bgArcMm=0.6 gate above hits literal 0),
so it's a coarse-config artifact; production's finer bgArcMm=0.35 seed should converge. **Follow-up
(out of scope for the crash fix):** if a flag-ON production run at 0.35 fails to converge within
maxPass=16, that is the floor to chase — not this crash.

## Ops notes

- Vitest `pool:'forks'` **buffers worker stdout and flushes at test END** — cannot live-monitor
  per-pass `console.log` via the output file; size runs to complete or tail after.
- A Vitest parent can error ("Worker exited unexpectedly") while the **worker child detaches** and
  keeps running for hours — check for orphan `node --conditions` workers by CPU/mem after a "failed"
  long run, but verify the parent PID is DEAD before killing (concurrent agents share the box).

## Artifacts

- `src/renderers/webgpu/parametric/conforming/tierC/seamPlanarize.ts` (fix)
- `src/renderers/webgpu/parametric/conforming/tierC/seamPlanarize.test.ts` (unit/regression)
- `src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine.ts` (+15: import + 2 guard sites)
