# Arm A4 Diagnosis — the 360 boundary / 652 orientation-mismatch band-edge defect

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD Arm A4 (DIAGNOSIS ONLY — no fix implemented; audit-first).
**Probe:** `research/bridge/_tierc_a4_diag.test.ts` + `vitest.tierc_a4_diag.config.ts` (new files,
read-only on all `src/` and committed research libs). Raw data (gitignored):
`research/exchange/tierc/armA4_{loci,summary,clusters,patchDumps,cdtIncidents,counts,crumbs}.{json,ndjson}`.
Run: `NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_A4DIAG=1 node node_modules/vitest/vitest.mjs run --config vitest.tierc_a4_diag.config.ts`
— 78s total (extract 10.8s, build 57.4s, classify+resolve+cluster+patch ~10s). Build hash
`f033dbf5-b5f9fb84` = the exact A1/A2-proven 'off' banked twin (non-vacuity witness). My own
Map-free full-mesh edge classifier reproduced A1's independently-measured counts **exactly**:
boundary 360, orientationMismatch 652, nonManifold 3 — validating the instrument before trusting
its localization.

## Summary verdict (read this first)

**The defect is TWO mechanisms, not one.** ~91% of the 360 boundary holes (329, across ~65
distinct clustered spots that include but vastly outnumber A2's 3 known loci) are the **SAME
near-tangent doubled-band-edge-curve root cause** A2 characterized — just far more widespread than
previously measured, and manifesting as a genuine **hole** rather than A2's mult=3 **sliver** at
all but 3 of those spots (which is exactly why fanRepair, scoped only to mult>2 edges, could not
touch them). But **98.9% of the 652 orientation mismatches (645) plus another 51 boundary edges**
(696 total, 68.6% of the whole 1,015-defect population) are a **second, structurally distinct
mechanism**: a u=0/u=1 periodic-seam wrap-stitch inconsistency, concentrated almost entirely in
ONE narrow t-band (t≈0.307–0.442, 651/652 in t∈[0.30,0.40)) where a band-edge feature curve
happens to run near the seam — essentially uncorrelated with cross-isolevel near-tangency
(11.8%/14.3% vs 90%+ for mechanism 1). Both mechanisms are **cross-cell/registry** issues, not
per-cell CDT quality issues: the outer wall's `CdtStats` instrument (already wired, never read
before this probe) recorded **0 inversions, 0 drops** across the entire 2.24M-tri outer build —
cleanly ruling out "a cell's local CDT drops a sliver" (candidate b) as the mechanism for either
population.

## 1. LOCALIZATION

| population | n | crossIsolevelNear¹ | wide-seam² (uDist≤0.05) | near ANY of 3 known loci (≤0.01) | onGridLine³ | surfaceId |
|---|---|---|---|---|---|---|
| boundary | 360 | 329 (91.4%) | 51 (14.2%) | 20 (5.6%) | 331 (91.9%) | 0 (outer) 100% |
| orientationMismatch | 652 | 77 (11.8%) | 645 (98.9%) | 1 (0.2%) | 651 (99.8%) | 0 (outer) 100% |
| nonManifold (A2's known) | 3 | 3 (100%) | 0 (0%) | 3 (100%, they ARE the known loci) | 3 (100%) | 0 (outer) 100% |

¹ `crossIsolevelNear` = both `dInnerCtr` and `dOuterCtr` (nearest decimated-contour-point distance,
periodic-u-aware) ≤ 0.001 (u,t) (~2 featureLevel-11 cells, matching the 3 known loci's own measured
range 0.000126–0.000820). ² wide-seam = periodic-u distance to u=0/1 ≤ 0.05 (chosen empirically —
26× wider than the actual `uMargin` clip of 7.3e-4, sized to the observed cluster footprint, see
§2.2). ³ `onGridLine` = either endpoint's u or t sits within 3e-6 (float32-quantization-aware) of a
featureLevel-11 (uBias=1) cell-boundary dyadic fraction — i.e. the vertex was created as a
registered edge-crossing/registry point, not a free interior point.

**Clustering** (greedy 0.002-radius spatial grouping over all 1,015 defect loci):
**151 distinct clusters** — size histogram: 1 singleton, 47 clusters of 2–3, 76 of 4–9, **27 of
10+** (the 10+ clusters are almost entirely the u-seam population; the top-15 by member count are
ALL `orientationMismatch`-only and sit at u∈{0, 0.017–0.019, 0.954–0.991} × t∈{0.310–0.329} — i.e.
literally the same narrow physical neighborhood straddling the u=0/1 wrap, represented on both
sides of the seam). **Not** spread evenly along the ~2,045-polyline, 28,785-point contour length —
concentrated at a bounded number of specific spots.

**Full accounting of the 360 boundary edges** (exhaustive, no gaps): 51 wide-seam + 20 near one of
the 3 known loci + **289 at 62 other, previously-uncharacterized near-tangent clusters** (mean
cluster size ≈4.7, same `crossIsolevelNear` signature as the known loci — 87.3% in the single
richest t-decile alone). A2's "2-locus" (3-locus at step 0.15) characterization was a **≥20×
undercount** of the true extent of the near-tangent-curve-pass phenomenon on this axis alone.

**Known-loci cluster detail** (radius 0.003) — none of the 3 A2 loci are isolated:

| known locus (u,t) | cluster n | kinds |
|---|---|---|
| (0.6448, 0.8931) | 4 | 1 nonManifold + 3 boundary |
| (0.5231, 0.4162) | 7 | 1 nonManifold + 6 boundary |
| (0.4384, 0.4421) | 13 | 1 nonManifold + 11 boundary + 1 orientationMismatch |

**Negative controls, checked and clean:** 0/1,015 defects (any kind) sit within 0.01 of t=0 or
t=1 (the pinned shared-ring rows) — the "pinned boundary row" hazard named in
`forceRefineMultiCurveLeaves`'s own guard comment is **not** implicated here. `nearUSeam` (the
actual tight `uMargin=1.5/(1<<11)≈7.3e-4` clip-boundary check) is true for only 0% of boundary and
4.1% of orientationMismatch — so candidate (c) as narrowly stated ("the clip margin is too small")
does **not** directly explain the width of the affected seam band (§2.2 has the real mechanism).

## 2. CHARACTERIZED FAILURE MODE — two mechanisms, with cell examples

### 2.1 Mechanism 1 (majority of boundary + the 3 known nonManifold): near-tangent doubled-curve registry inconsistency

**Evidence** (`armA4_patchDumps.json`, 2-ring BFS patches over the REAL assembled mesh, no
re-simulated window). Reference locus (the known (0.6448,0.8931) mult=3 edge, a=165822 b=165824):
matches the already-documented sliver signature exactly. A **newly-characterized** boundary
example ~0.34 away from any known locus, at (0.9698, 0.9802) — one of the 62 previously-unnamed
clusters (this cluster has 4 members: this edge, a sibling boundary edge, plus its own local
neighbors):

```
edge (a=1574, b=1577) mult=1 (boundary/hole)
  aUt = (0.969747, 0.979980, surfaceId=0)   bUt = (0.969847, 0.980269, surfaceId=0)
  dInnerCtr=0.000801  dOuterCtr=0.000558   <- crossIsolevelNear=true (same class as the known loci)
edge (a=1574, b=1576) mult=1 (boundary/hole) -- 2nd hole sharing vertex 1574
  aUt = (0.969747, 0.979980, surfaceId=0)   bUt = (0.969915, 0.980433, surfaceId=0)
```
Local patch around vertex 1574 shows TWO triangles fanning off it toward two DIFFERENT, very
close but NOT welded, "far" vertices: **1577=(0.969847,0.980269)** from one triangle and
**1576=(0.969915,0.980433)** from an adjacent one — separation ≈0.000178 (u,t). Neither edge gets
a matching partner triangle: the local fan has a **thin wedge gap between 1576 and 1577** that no
triangle fills. This is bit-for-bit the same signature `fanConsistencyRepair`'s own doc already
names for the known loci ("near-tangent constraint-adjacent points land almost, but not exactly,
atop each other... closer than `WELD_TAU=1e-6` would merge, but far enough to survive as a
distinct... vertex") — except here the local topological outcome is a **hole** (two mult=1 edges)
rather than a mult=3 sliver. `nearbyInnerContourPts`/`nearbyOuterContourPts` confirm both isolevels
pass within 0.0006–0.0008 (u,t) of this exact spot, same as the known loci.

**`CdtStats.outer = {inversions:0, drops:0, incidentsCaptured:0}` across the WHOLE outer build**
(this is the free, already-wired `ConstrainedCellTriangulator.ts` `normalizeWinding`/`droppedCount`
instrument, read for the first time by this probe). This is decisive: **no single cell's local
`cdt2d` call ever emitted a CW or zero-(u,t)-area triangle anywhere in the outer wall.** Candidate
(b) — "a cell's constrained triangulation drops a sliver" — is cleanly refuted as the mechanism.
The defect is not inside any one cell's CDT; it is that **two adjacent cells, each individually
well-formed, disagree about the shared-boundary vertex set** near a near-tangent doubled-curve
pass — candidate (a) (cross-cell registry inconsistency), triggered by the same near-tangency that
produces the sliver in the 3 already-known cases.

### 2.2 Mechanism 2 (dominant orientationMismatch + 51 boundary): u=0/u=1 periodic-seam wrap-stitch inconsistency

**Evidence.** The kernel represents the periodic surface with u=0 and u=1 as **permanently
distinct vertex indices** (closure is implicit — θ=u·2π maps both to the same 3D point only after
evaluation; there is no positional weld of the seam columns). Watertightness across the seam
therefore depends entirely on explicit seam-spanning triangles (the `wrapsSeam`-tagged emission in
`QuadtreeTriangulator.ts`, inherited by `FeatureConformingTriangulator.ts`) consistently bridging
the last (u≈1) column to the first (u≈0) column. Direct triangle dump at a representative seam
locus (edge a=303844 b=303845, mult=2, **both uses forward** — `2f 0r`):

```
aUt=(0.999512, 0.324219, 0)   bUt=(0, 0.324219, 0)      <- a literal seam-spanning edge
triangle X: [303844(u=.9995), 303845(u=0), 303841(u=.9995)]   cycle uses 344->345 (forward)
triangle Y: [303867(u=.9995), 303844(u=.9995), 303845(u=0)]   cycle ALSO uses 344->345 (forward)
```
Both triangles incident to this edge traverse it in the **same** direction — for a correctly
oriented manifold the two incident triangles must traverse a shared edge in **opposite**
directions (that is the entire content of `orientationMismatch`). Both triangles also pick their
"third" vertex from the **u≈1 side** (341, 367) — the u≈0-side triangle that should flank the seam
edge from the other direction is structurally missing/misrouted. `forward` count across all 652:
`{2f0r: 314, 0f2r: 338}` — a near-even split, consistent with a **local fold/double-cover** at the
seam rather than a random scatter. `crossIsolevelNear` is only 11.8% here (this is NOT the
near-tangent-curve mechanism); `onGridLine` is 99.8%–100% (every one is a registry/cell-boundary
point, consistent with seam-column vertices, which are by construction on the u=0/u=1 grid line).
**100% of the 645 wide-seam loci concentrate in ONE t-sub-range** (t-histogram over [0,1) in 10
bins: `0,0,0,651,1,0,0,0,0,0`) — the seam is fine everywhere else in the pot; only where a
band-edge feature curve happens to run near the seam does the stitch go inconsistent.

**Plausible root (not yet pinpointed to a line — this is diagnosis, not fix-design):** the
extraction side already tears any physical contour crossing u=1↔0 into two separate `FeatureLine`
objects, because `linkSegments` (`research/bridge/_gyroidContourLib.ts:123-158`) welds polyline
endpoints by an **exact, non-periodic** quantized key (`weldEps=1e-6` on raw `(u,t)`, no `u mod 1`)
— a segment ending at u=1.0 and one starting at u=0.0 represent the *same physical point*
(`gyroidVal` is exactly periodic in u) but get **different weld keys** and are never chained,
confirmed structurally: **1999/2046 (97.7%) of inner-isolevel and 2001/2044 (97.9%) of
outer-isolevel polyline endpoints have a different-polyline endpoint within 2e-4 (u,t)** — i.e.
near-universal fragmentation-with-touching-endpoints along BOTH curves (this is simply how
`linkSegments`'s single-direction greedy chaining fragments closed/long loops in general, confirmed
independently of the defect population). `clipFeaturesToBox`/`clipLineToInterval`
(`ConformingWall.ts:558-586,596-606`) **also** treats `u` as a plain linear coordinate (no wrap)
when clipping to the `uMargin` safe box. Note this "torn-endpoint" precondition is present almost
everywhere along both curves yet **only ~4.1% of the affected defects sit inside the literal
`uMargin` clip zone** and the affected band is **~26× wider** (uDist up to 0.019) than the clip
margin (7.3e-4) — so the proximate trigger is not simply "the clip margin is too tight"; it is more
likely the kernel's own feature-registry construction (PASS A/B in
`FeatureConformingTriangulator.ts:1163-1509`, specifically how `regH`/`regV`'s `uKey` wraparound
(`((u%1)+1)%1`) interacts with the wrapsSeam boundary-polygon assembly for the two seam-adjacent
leaf columns) when curve-inserted points land asymmetrically near u=0 vs u=1. **This diagnosis does
not pinpoint the exact failing line** — the two candidate loci (extraction-side non-periodic weld,
kernel-side seam+feature-registry interaction) are named for a follow-up fix-design pass, not
resolved here.

## 3. RELATION TO A2 — BOTH answers apply, split by population

- **SAME mechanism, wider extent, different local outcome** for ~91% of boundary (329/360, across
  ~65 clustered spots including but vastly outnumbering A2's 3 known loci): the identical
  near-tangent doubled-band-edge-curve constraint-adjacency A2 named. A2 only ever measured the 3
  spots that happened to cross the mult=3 sliver threshold; **~62 more spots produce the milder
  "hole" (mult=1×2) outcome instead** — a manifestation A2's `nonManRawBig`-only acceptance never
  measured (G3/G7 coverage, first run on this style by A1's own gates harness). This directly
  explains why `fanRepair` left boundary **exactly** unchanged (360→360, A1's finding): fanRepair's
  edge-selection is scoped to `mult>2` edges only, and a hole has no excess triangle to drop — by
  construction it structurally cannot reach this population.
- **A DIFFERENT mechanism** for 98.9% of orientationMismatch (645/652) + 51/360 boundary (696/1,015
  = 68.6% of the total defect population, actually the LARGER share): the u=0/u=1 periodic-seam
  wrap-stitch inconsistency (§2.2), essentially uncorrelated with cross-isolevel near-tangency
  (11.8%/14.3%) and concentrated in one t-band unrelated to any of the 3 known loci. fanRepair
  improved orientationMismatch by exactly 1 (652→651, A1's finding) — consistent with a single
  incidental side effect at one of the 3 loci it did touch, not a targeted fix; fanRepair's
  mult>2-edge scope cannot reach a mult=2-but-miswound edge (this population) or a mult=1 edge
  (the 51 seam-band boundary holes) at all.
- **Decision for the fix:** this is why the fix does NOT extend `fanRepair` as a single lever — it
  needs **two separate remedies** (§4), because the two populations have different root causes,
  different spatial signatures, and different `CdtStats`/`crossIsolevelNear` correlations.

## 4. PROPOSED MINIMAL FIX (design only — NOT implemented)

### 4.1 Mechanism 1 (near-tangent registry gap) — KERNEL layer, moderate-low risk, scoped

Extend the **existing** `multiCurveCellPolicy` option family (`FeatureConformingTriangulator.ts`)
with a third variant, e.g. `'snapMerge'`, that reuses `forceRefineMultiCurveLeaves`'s own precise
same-cell, ≥2-distinct-general-curve-label detection (already correctly narrows ~12,000 window
leaves down to the exact offending handful — proven machinery, not proven *effective* at fixing
this) but, instead of splitting the flagged cell (measured to fail — 0/3 loci cleared) or dropping
a post-hoc sliver (measured to only reach `mult>2` edges), **widens the boundary-point weld
tolerance specifically inside a flagged cell** so that two near-coincident-but-distinct registry
points originating from the two different curve labels (measured gap ≈0.000178 in the one dumped
example, ~6× the production `cornerSnap≈2.9e-5`) get unified into one shared vertex before
`triangulateConstrainedCell` runs — a targeted, LOCAL generalization of the `cornerSnap`/`dedupSide`
mechanism the kernel already has, not a new geometric concept. **Explicitly avoids the named §V11q
over-constraint hazard**: this merges existing near-duplicate points, it does **not** add a new
constraint curve/line (the mechanism §V11q refuted). **Risk:** widening a weld tolerance is a
blunter instrument than a targeted split — scoping it to ONLY same-cell-flagged, ≥2-distinct-label
cells (not a global tolerance change) bounds the blast radius to the ~65 already-identified spots;
still needs a fidelity regression check (does merging shift any vertex enough to move Newton-worst
outside the A1 ±5% band) before it could ship even behind a flag.

### 4.2 Mechanism 2 (u-seam wrap-stitch) — cheaper research-side probe FIRST, then likely KERNEL

**Recommended order, cheapest discriminator first:** before touching the kernel (shared by every
style, much larger blast radius than 4.1), test whether making `linkSegments`
(`research/bridge/_gyroidContourLib.ts`, **research-side, not production**) periodic-u-aware — weld
a polyline endpoint at u≈1.0 to one at u≈0.0 when `(1-u_a)+u_b < weldEps` — eliminates Mechanism 2
by simply no longer feeding the kernel two artificially-torn curves right at its most seam-sensitive
point. This is a **research-file-only** change (no kernel edit, no risk to any other style), cheap
to test (re-run extraction, re-run this same probe, check whether the 645-member seam cluster
collapses). **If it does not fully clear Mechanism 2**, the residual points to the KERNEL layer:
`FeatureConformingTriangulator.ts`'s PASS A/B registry (`regH`/`regV`, `uKey` wraparound) and/or the
base `wrapsSeam` emission it inherits from `QuadtreeTriangulator.ts` need seam-aware handling for
feature-registered points — a materially larger-blast-radius change (touches the mechanism every
feature-carrying style shares, not just Gyroid's band-edge recipe) that should get its own
window-repro fixture (mirroring `MultiCurveCellPolicy.test.ts`'s pattern, but seeded with a
synthetic curve that genuinely wraps u=1→0) before any kernel edit is attempted. **Risk:** HIGH if
attempted directly in the kernel without the cheaper extraction-side test first — this is shared
seam-closure machinery, not a Gyroid-local code path.

### 4.3 Both fixes stay behind the existing default-off discipline

Neither proposal changes byte-identical default behavior: `multiCurveCellPolicy` already defaults
`'off'` (untouched call sites unaffected by adding a 3rd variant), and any `linkSegments` change is
confined to `research/` (never imported by `src/`, per the hard project rule).

---

**Not answered here (explicitly out of scope for diagnosis):** the exact line inside
`FeatureConformingTriangulator.ts`'s PASS A/B where the seam-adjacent registry read/write diverges;
whether Mechanism 1's proposed weld-widen fully clears all ~65 spots or only some (would need to be
built and measured, which is Arm A4's mission NOT to do); whether either mechanism's footprint
changes across the `gm_scale`/`gm_thickness`/`gm_sharpness` parameter envelope (per champion-spec
§4.6, zero sweep exists for any Gyroid mechanism at other parameter points, including these two).
