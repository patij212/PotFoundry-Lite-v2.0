# Bamboo pipeline-fidelity reconciliation — TWO bugs, both fixed (2026-07-23 evening)

_Autonomous session. Continues the production-export-truth audit (`2026-07-23-production-export-truth.md`)._

## The question

The audit left one loose end: the **isolated** BambooSegments emitter closed at ≤0.01 (bridge smooth-complement
0.0045 at fine sag-tol 0.004), but the **real pipeline** reported `smoothMax=0.121` at the export default. Why does the
emitter lose fidelity through the full pipeline?

Answer: **two independent bugs**, both in the path between "the emitter builds a wall" and "the GPU evaluates it."

## How the pipeline consumes the emitter (established by code trace)

1. `buildBambooDispatchWall` → `buildBambooRingStripWallGeometric` → `dsRingStripWallToOuterWall`, which stores the
   emitter as **(u, t, surfaceId=0)** — NOT baked 3D (`dsRingStrips.ts:222-226`).
2. The assembly adopts it (`WatertightAssembly.ts:567`), then `evaluatePoints` **GPU-evaluates ALL (u,t,surfaceId)
   vertices to 3D** through the single-valued `style_radius` (`ParametricExportComputer.ts:3220`). The treads survive
   because the analytic radius itself has the C0 step and the double-valued row-pair brackets it.
3. Two things differ from the isolated bridge: the dispatch passes `sagTolMm = qMaxSag` = the export profile's surface
   error (`high` → **0.05mm**, 12.5× coarser than the bridge's 0.004), and a **t-warp** is applied to the adopted wall
   before the GPU eval.

The prior audit's `vertexMax ≈ 0.00001` means the GPU vertices sit exactly on the CPU `rA` surface — so CPU `analyticRA`
≡ GPU WGSL for Bamboo. Both bugs below are **facet-chord** failures (vertices on-surface, but the triangles between them
are wrong), not vertex-placement failures.

## Bug 1 — nodal sag-law strides over the node-bulge peak (MAX-vs-p99)

`buildBambooTSchedule`'s body walk read curvature `r''(z)` **nodally** at the current row, then stepped
`Δt = sqrt(8·tol/|r''|)`. A Gaussian node-bulge peak that falls *between* rows is strided over: the walk samples the
flat `r''` before the bulge, takes a big step, and lands past the peak.

MEASURED (`research/bridge/_pfCloseBambooSagLaw1D.test.ts`, pure-1D):

| requested tol | worst body chord (old nodal walk) | ratio |
|---|---|---|
| 0.10 | 1.610 mm | 16× |
| 0.05 (export default) | 1.610 mm | **32×** |
| 0.01 | 0.0047 mm | ok |
| 0.004 | 0.0042 mm | ok |

Note 0.10 and 0.05 are **identical** — sag-blind in the coarse regime (the step is `hMax`-clamped / nodal-`r''`-blind).
p99 stayed ~0.002 mm throughout, so a p99-scoped gate waved through a mesh with 0.7–1.6 mm cliffs. On the emitted mesh
the precise t-band ruler read `smoothMax = 0.718` at sag 0.05 (`_pfCloseBambooFilter.test.ts`).

**FIX** (`dsRingStrips.ts`, `buildBambooTSchedule`): replace the nodal walk with **verify-and-bisect** — start at
`hMax`, halve the step until the TRUE chord-sag over the candidate interval honors tol; walk WITHIN each segment
bounded by the C0 loci `t=k/nodeCount` so a body interval never chords across a step. Bounds MAX (not just p99) at the
requested tol.

RESULT: production `buildBambooTSchedule` worst body chord **1.61 mm → 0.0047 mm** at default sag, **~same row count**
(1019 → 1025, `hMax`-clamped body dominates) — zero triangle cost. Emitted-mesh precise `smoothMax` **0.718 → 0.0039**.
Regression guard added to `bambooStrips.test.ts` (fails on the old code). 9/9 invariants + 21/21 DS tests pass.

## Bug 2 — the t-warp drags the pre-conformed wall off its loci

The pipeline builds a `creaseTChoice` warp from the featureGraph `horizontal-band` lines and applies it to the adopted
wall's `t` before GPU eval (`ParametricExportComputer.ts:3179`). For Bamboo the warp is **non-identity** (grid=8, L3):
its anchors map a uniform grid's lines `{0.25,0.375,0.625,0.75}` onto the creases `{0.2,0.4,0.6,0.8}`
(`_pfCloseBambooTWarp.test.ts`).

But the ring-strip emitter **already** places its rows on `t=k/5` by construction. So the warp — designed to make a
*generic uniform grid* conform — drags the *already-conforming* rows OFF the loci. MEASURED
(`_pfCloseBambooWarpEffect.test.ts`): `applyTWarp` maps the emitter's node-boundary rows `0.8 → 0.84`, and the
warped-space body chord re-busts to **1.808 mm** — undoing Bug-1's fix.

**FIX** (`ParametricExportComputer.ts:3154`): `outerPreConformed = adoptTierCOuter && !adoptSmooth` gates all three
domain-warp applications. Pre-conformed adopted walls (Bamboo/DS ring-strip, region kernel, Gothic/GeoStar
`buildTierCOuterWall` refine) are exempt; the ONE generic adopted wall — the smooth grid (SpiralRidges needs the helix
shear) — is excluded from the exemption and keeps its warps. Flag-gated (`adoptTierCOuter ⊂` perfect-mesher/sub-flags,
default OFF) ⇒ byte-identical off (`flagOff.byteIdentical.test.ts` passes). Suppressing a homeomorphism can only make
it a no-op, so watertightness/orientation/T-junction-freeness are trivially preserved.

## Live-GPU end-to-end verification

Real WebGPU export (`?fidelity=1`, `__pfBamboo` ON) at production dims, `diagnoseExportTruth`:

- Export builds **watertight** (boundary 0), 7.56M tris, `nRing=2048`, no null, download-gate pass — both fixes intact
  on the ON path.
- `vertexMaxMm = 0.0000393` — the GPU-evaluated vertices sit on the CPU `rA` surface (CPU `analyticRA` ≡ GPU WGSL).
- `smoothMaxMm`: **0.121 (audit) → 0.048 (crude ruler, post mesher-fix) → 0.00265 (precise z-crossing ruler)** ⇒
  **Bamboo's smooth body CLOSES ≤0.01 through the real pipeline.** The residual `maxMm = 0.776` is the tread-riser
  inflation vs the single-valued `rA` (the treads are faithful vertical walls by construction — `vertexMax ≈ 0`).

## Bug 3 (the ruler) — crude tread classifier over- AND under-excludes; FIXED

`measureProjectorMax`'s `treadRadiusSpreadMm` heuristic (flag a face if its vertex-radius spread > 0.1mm) is unreliable:
on the fixed mesh it flagged **1,210,828** faces (over-excluding gentle bulge flanks) yet still LEAKED a ~half-step
0.048mm tread face into `smoothMaxMm` (under-excluding a low-relief tread). Since the Bamboo C0 steps sit at KNOWN
heights `z = k/nodeCount·H`, a precise **z-crossing** classifier is exact: flag a face iff its z-span crosses a locus
(±band). FIX: `measureProjectorMax({treadZLociMm, treadZBandMm})` (`measureProjectorMax.ts`) + wired for Bamboo in
`diagnoseExportTruth` (loci from `bsNodeCount`). Result: **81,920** tread faces flagged (15× fewer, exactly the
step-crossing risers), honest `smoothMaxMm = 0.00265`. Additive/opt-in (radius-spread path byte-identical; 3/3
`measureProjectorMax.test.ts` pass). Other riser styles (DS/ArtDeco/BasketWeave) keep the heuristic until their loci
are wired — the documented follow-up.

## Scope

Both bugs were **Bamboo-specific in effect**: only the ring-strip emitter pairs a nodal density law with sharp
sub-cell features (Bug 1), and the warp-vs-pre-conformed-wall conflict (Bug 2) is now fixed generally for ALL
pre-conformed adopted walls. The smooth-grid emitter sizes by a global `maxSag` over a 128² probe — same aliasing
*class*, but safe for its C∞ styles. DS uses uniform body rows (denser, no stride-over).
