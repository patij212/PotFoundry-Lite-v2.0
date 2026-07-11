# Champion Spec — GyroidManifold (PROD-TIERC Phase 0, deliverable D0.1)

**Program:** PROD-TIERC (`research/lab/2026-07-11-tierc-productionization-charter.md`), Phase 0
design-only. **Status:** read-only synthesis of already-measured evidence — NO new measurement,
NO `src/` edit in this document's authoring. Written at tree HEAD `65f85bbe753e003a38c01e5941f1e9f710344316`
on branch `refactor/core-migration`. Purpose: let a fresh implementer reproduce the Gyroid champion
inside the new region-based Tier-C mesher (charter §5 architecture sketch) without re-deriving any
of the mechanism.

Companion documents in the same slot: `champion-spec-dragonscales.md`, `champion-spec-gothic.md`
(other Phase-0 owners).

---

## 0. One-paragraph summary

Production's default GyroidManifold export already runs the per-cell constrained-CDT
general-curve conforming path (`assembleWatertight` → `ConformingWall.ts` →
`FeatureConformingTriangulator.ts`) — it is not a Tier-C-flag-gated or styleId-allow-listed
codepath, it is the unconditional default (`src/renderers/webgpu/ParametricExportComputer.ts:2670-2928`).
The problem is that `extractGyroidManifold` (`src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts:603-607`)
feeds that machinery the **wrong locus**: the `val=0` plateau centerline, where curvature is
saturated flat and no fidelity outliers live. The measured production regression (105,107 literal
outliers, Newton-worst 0.0590mm, `E-2026-07-09-FAST-HONEST-RULER`) sits instead at the **wall-band
edges** `|val| ∈ {0.135, 0.15}`. Feeding those two isolevels through the *same, unmodified*
machinery — proven on a Δ2-exact production twin — collapses the true-outlier population
**−67.6%** and the Newton-worst **−56.8%** at **+18.5%** outer tris, dominating the alternative
curvature-floor lever on every fidelity axis at ~21% of its triangle cost. The champion is
therefore a five-line fix to *what curve gets traced*, not a new mesher. What remains open is a
**knee-pin mechanism** for the residual ~31k population (100% classified at the smoothstep
curvature corner, structurally unreachable by any density lever) and a **2-locus deterministic
non-manifold defect** in the per-cell CDT at near-tangent doubled-curve passes — both named,
neither implemented in the production kernel.

---

## 1. THE CHAMPION

### 1.1 The mechanism, stated plainly

**Doubled band-edge contour embedding** — marching-squares extraction of **both** isolevels
`|val| = 0.135` (inner, ridge-plateau edge) and `|val| = 0.15` (outer, channel-floor edge) of the
Gyroid TPMS scalar field, fed as `FeatureLine[]` (`kind: 'general-curve'`) into
`AssemblyWallOptions.outerFeatureLines` — the **exact same field** production's
`extractAnalyticFeatures` → `outerFeatureLines` seam already consumes for every style
(`src/renderers/webgpu/ParametricExportComputer.ts:2893`). No new consumer code is needed: the
per-cell constrained CDT (`triangulateQuadtreeWithFeatures` inside `ConformingWall.ts`,
`FeatureConformingTriangulator.ts`) does not dispatch on `FeatureLine.kind` anywhere in the
insertion path (confirmed by direct read — zero occurrences of a `kind==='general-curve'` branch
in `ConformingWall.ts` or `FeatureConformingTriangulator.ts`; `clipFeaturesToBox`,
`buildFeatureIntersector`, and `triangulateQuadtreeWithFeatures` all operate on `points:{u,t}[]`
generically). Swapping the *locus* is therefore a substitution at one seam, not a new mechanism.

### 1.2 Why the centerline production traces today is harmless (R3, why centerlines fail)

`extractGyroidManifold` traces `val(u,t) = 0` at a 640×512 marching-squares grid
(`FeatureLineGraph.ts:600-607`, `GYR_RES_U=640`, `GYR_RES_T=512`, simplify tol `3e-4`). But
`val=0` is deep inside the `shape=1` plateau interior — `shape(val)` is the smoothstep
`s²(3−2s)` of `|val|` between `th·(1−smoothVal)=0.135` and `th=0.15`
(`_gyroidContourLib.ts:7-12`), and `val=0` sits many wavelengths from either band edge at default
params (`gm_thickness=0.1, gm_sharpness=0.1` ⇒ band `[0.135,0.15]`, width ≈0.015 in `|val|`
units, `≈0.0006–0.0015` wide **in (u,t)** per the gradient measurement below). At `val=0` the
relief is saturated flat (κ≈0) — embedding this locus inserts real mesh edges exactly where no
outliers live. This is the charter's **R3 (single feature centreline)** guardrail in a specific,
measured instance: a single traced locus that happens to sit *off* the load-bearing feature does
nothing (it neither bridges both sides catastrophically, per the single-**midline**-at-the-band
failure below, nor helps — it is simply the wrong curve). The load-bearing locus was proven
analytically and empirically to be the **wall-band edges themselves**, and — per **P2** — *both*
edges, never a single line:
- **`E-2026-07-08-GYROID-CONFORMING-CLOSE` §V11o** (`research/lab/2026-07-04-perfect-mesher-spec.md:2247-2299`,
  commits `aaf8f629` extractor, `8f578d4e` build+verdict): embedding the DOUBLED pair
  (`|val|=0.135` + `|val|=0.15`) took the honest un-embedded floor (~12,000 true-3D outliers, max
  0.0628mm, §V11j) to off-wall 0/46, ~2,133 on-wall residual, trueMax 0.0385 (halved). A
  **SINGLE midline** at `|val|=0.1425` (the band centre, NOT `val=0`) was tested as the natural
  "one curve is cheaper" alternative and **REFUTED catastrophically**: 90% off-wall (285/318),
  trueMax 0.321, zeroArea 57 — a single ramp-middle constraint forces facets to bridge
  ridge→wall→floor on *both* sides. This is the direct evidence for P2/R3: the doubled pair lets
  near-vertical ramp facets span cleanly between two real edges; one line (whether the band
  midline or, as production does today, the harmless `val=0` centerline) cannot do that job.
- **§V11q** (same spec file, lines 2301-2315, chord-refine round): a **THIRD** line added at the
  band midline (ON TOP of the doubled pair, not replacing it) was also **REFUTED** — regressed to
  trueMax 0.312, 69% off-wall, because the band is only ~0.001 wide in (u,t) and a third
  near-coincident parallel constraint over-constrains the triangulation. Two edges, never one,
  never three.

### 1.3 The measured production result (Δ2-exact twin)

`E-2026-07-10-GYROID-BANDEDGE` (`research/lab/E-2026-07-10-GYROID-BANDEDGE-prereg.md`, pre-reg
commit `3c996af8`, verdict commit `39ad7939`) fed the doubled contours through production's
*unmodified* general-curve machinery on the Δ2-exact twin `research/bridge/_gyroid_bandedge_lib.ts`
(built on top of the parent twin `research/bridge/_gyroid_prodclose_lib.ts`, pre-reg commit
`2285fd02`, verdict commit `66c6735e` — twin-gate matched the real production capture to
`outer tris Δ2 / prescreen-survivors Δ1 / coverage-max Δ0.00004`, i.e. the same mesh to
measurement precision). Headline (step 0.15 config, the **recommended** config — see §5):

| metric | baseline (val=0 centerline, production TODAY) | κ-floor alternative (512², KILL-A) | **band-edge doubled contours (this champion)** |
|---|---|---|---|
| outer tris | 1,892,112 | 3,545,856 (**+87%**) | **2,242,987 (+18.5%)** |
| est. true outliers (stratified) | ~96,012 (artifact literal 105,107) | ~78,124 (**−19%**) | **~31,114 (−67.6%, 3.1×)** |
| Newton-worst | 0.0576 (artifact literal 0.0590) | 0.0284 (**−51%**) | **0.024917 (−56.8%, 2.3×)** |
| coverage max / p99 | 0.0987 / 0.0036 | not measured | **0.0253 / 0.0009 (−74%)** |
| residual class | 372/372 knee-adjacent, 0 off | 754/754 knee-adjacent, 0 off | **410/410 knee-adjacent, 0 off, 0 wall-band** |
| watertight | 0/0 | 0/0 | **3 nonManifold** (2-locus defect, §1.5) / 0 zeroArea |

The band-edge contour mechanism **dominates the curvature floor on every fidelity axis at ~21% of
its added-triangle cost** (+18.5% vs +87% for a *worse* fidelity outcome). Acceptance
(every-facet ≤0.01mm) was **not** reached — the honest fork is that the entire residual
population, in both the baseline and both improved configs, is a single class: the smoothstep-knee
(§1.4).

### 1.4 The knee-pins mechanism for the residual (~31k population)

100% of every Newton-confirmed outlier sampled across all four measured configs (baseline, floor,
band-edge step-0.15, band-edge step-0.08) classifies as **knee-adjacent**
(`dEdge = min(||val|−0.135|, ||val|−0.15|) ≤ 0.005`) — zero off-band, zero mid-wall-band. This is
the curvature-peak corner of the smoothstep `shape(val)` at the band edges (FD-measured up to
**1049.9 mm⁻¹**, `E-2026-07-10-GYROID-PRODCLOSE` STAGE F1, `research/lab/E-2026-07-10-GYROID-PRODCLOSE-prereg.md:313-323`),
which is mechanically unreachable by ANY density lever at production's `minEdgeMm=0.1`: the sizing
formula `h(κ) = minEdgeMm` for `κ ≥ maxKappa = 8·maxSagMm/minEdgeMm² = 2.4 mm⁻¹` binds exactly,
so no density/floor escalation can move the sizing output at the knee — a mechanistic, not
tractability, floor. The SAME structural argument (a residual sitting exactly on a sizing-formula
plateau where the derivative of the request w.r.t. any raise-only floor change is zero) was
independently proven **three ways** for SpiralRidges' own sizing endgame (28 residual facet-points,
`E-2026-07-10-JACOBIAN-SIZING-MARGIN`, commits `875f9089→51d8a301→5776b079→2f3c6e9b`,
`research/lab/2026-07-10-program-consolidation.md:114-125`: bit-identical Newton deviations across
a 2.4% sizing-margin change; level arithmetic showing the whole reachable request band sits inside
one quadtree-level interval; QUADTREE LEVEL QUANTIZATION named as the sizing lever's hard floor) —
this is the analogous mechanism on a DIFFERENT style, not a Gyroid-specific re-derivation, and is
the basis for the program's own unification claim quoted below.

The **pins** mechanism that closes this class on the lab's (non-production) kernel is
`E-2026-07-08-GYROID-KNEE`, spec anchor **§V11aa**
(`research/EXPERIMENT-REGISTRY.md:5828-5857`, commit `011cfd08`):

> Place a **pinned vertex exactly on the true surface at the knee** (the smoothstep curvature
> corner), rather than relying on the chord-Steiner/metric-driven splitter to happen to land a
> point there. Recipe per surviving spot: Newton-project the **recorded worst-sag 3D point** back
> onto the true analytic surface to recover its `(u,t)`, then inject that point **plus a
> 6-satellite ring at radius `spread=0.0008`** (7 points/spot total), all held fixed across any
> smoothing/optimize sweep via `pinInjected`. Design 1 (worst-sag knee + 6-ring @ spread 0.0008,
> all pinned) cleared **all 5 surviving spots on the first cluster design** — no second design
> needed. Result: **K0c — literal whole-mesh Newton-0 at 6,612,759 tris** (35 pinned points total,
> 5 spots × 7 points, mirror-deduped), trueMax exactly 0, truep99 0.0061, watertight
> (`nonManIdx 0`, cracked-control 3 = non-vacuous), zeroArea 0, 14.1min build. The pinned cluster
> is triangle-budget-negligible (6,616,007 → 6,612,759, net **−3k** — the pins actually displaced
> a few chord-Steiner points).
>
> **Mechanism**: a midpoint/worst-sag chord split is placed by the *metric*, not on the isolevel
> corner — it competes for budget and lands *near*, not *on*, the knee. A vertex pinned EXACTLY on
> the true-surface knee removes the plateau→knee chord **by construction**: the two facets
> flanking the knee now share a vertex ON the knee, so their chord-sag collapses to the local
> curvature at the knee (≤tol) instead of spanning the whole S-curve. The knee closes with a
> **point**, not the pre-registered fallback of an isolevel-corner **edge**.

This generalizes ("the pinned-knee-injection lever generalizes: any residual smoothstep-knee
outlier in a doubled-wall lattice style closes by Newton-recovering the knee (u,t) and pinning a
micro-cluster there — no density bump", `EXPERIMENT-REGISTRY.md:5854`) and was independently
re-derived as **the same lever family** as SpiralRidges' own sizing endgame in the program's
unification finding (`research/lab/2026-07-10-program-consolidation.md:127-132`, commit
`4dad7528`):

> "the final residuals of SpiralRidges (28 facet-points / 14 (u,t) loci, all within 0.0002 of tol,
> near-rim) and Gyroid (~31k knee population) are the SAME lever class: LOCAL treatment (pinned
> points per §V11aa/HexHive, or forced level-split at named cells). **ONE production mechanism
> closes both styles' endgames** — the pins/level-split item absorbs the Gyroid completion chip's
> second half."

This is P5 (Localized residual insertion) directly: measured facet error → local pins, not
blanket refinement (R2 was already refuted for this residual class — see §4).

### 1.5 The 2-locus deterministic non-manifold finding

Feeding 28,785 general-curve points (step 0.15) through production's per-cell CDT — a machinery
that has never natively seen more than ~14 lines / a few hundred points (production's real
`val=0` trace) — left **3 non-manifold edges** (step 0.08 retry: 2), out of 4,365,677 total
triangles (`≈6.9e-7` fraction), `nonManRawBig` non-vacuous (injected-crack control moved the
count). Coordinator-directed follow-up classified every offender by resolving its raw-index
endpoints back to `(u,t)` (`classifyNonManLoci`, `research/bridge/_gyroid_bandedge_lib.ts:392-506`,
Map-free packed-key sort + run-length scan — the same "2^23 Map cap" lesson `nonManRawBigStats`
already encodes, needed here because the full scan is 13.1M edges). Data:
`research/exchange/_gyroid_bandedge/nonman_loci.json` (gitignored, 5 rows: 3 at step 0.15, 2 at
step 0.08):

| step | edge (u, t) | mid `\|val\|` | dEdgeIso | d(inner ctr) | d(outer ctr) | on-contour | near u-seam |
|---|---|---|---|---|---|---|---|
| 0.15 | (0.6448, 0.8931) | 0.13504 | 4e-5 | 0.000227 | 0.000820 | no/no | no |
| 0.15 | (0.5231, 0.4162) | 0.15005 | 5e-5 | 0.000502 | 0.000304 | no/no | no |
| 0.15 | (0.4384, 0.4421) | 0.13500 | 0 | 0.000126 | 0.000753 | no/no | no |
| 0.08 | (0.6448, 0.8931) | 0.13502 | 2e-5 | 0.000237 | 0.000658 | no/no | no |
| 0.08 | (0.4384, 0.4421) | 0.13500 | 0 | 0.000126 | 0.000591 | no/no | no |

**Classification** (`E-2026-07-10-GYROID-BANDEDGE-prereg.md:424-452`): every crack is `mult=3`
(one extra triangle on an edge), on the OUTER wall only, sits ON an embedded isolevel curve
(mid `|val|` within `5e-5` of 0.135/0.15), and lies within `~0.0001–0.0008` (u,t) of **both**
contour sets simultaneously — i.e. at loci where the two doubled band edges pass within
**~1–1.7 `featureLevel`-11 cells** of each other (cell width `= 1/2048 ≈ 4.88e-4` in u). Two of
the three loci (`(0.6448, 0.8931)` and `(0.4384, 0.4421)`) are **step-invariant**: bit-identical
`(u,t)` across a near-doubling of picket density (step 0.15 → 0.08), which REVISED the initial
hypothesis (picket-density recovery instability) — this is a **deterministic per-cell
constrained-CDT topology defect at near-tangent doubled-curve passes**, the §V11q
over-constraint hazard class ("the band is only ~0.001 wide... near-coincident parallel
constraint lines over-constrain the triangulation") in a different guise, and **not fixable by
step laddering** (proven — the bounded retry 0.15→0.08 is the pre-committed one-shot escalation
and it did not clear 2 of the 3 loci).

**Named remedies** (from the verdict text, `E-2026-07-10-GYROID-BANDEDGE-prereg.md:449-452` —
**not implemented**, out of that arm's scope):
1. **Force-refine feature cells crossed by ≥2 distinct general-curves to `featureLevel+1`.** The
   closest existing analog in the production kernel is the `railLines`/`bandRegions`
   "general-mesher integration spike" force-registration
   (`src/renderers/webgpu/parametric/conforming/ConformingWall.ts:180-198`) — every snapped rail
   vertex is admitted into the grid-line registry regardless of the on-edge check so both adjacent
   cells adopt it identically. This is a **different** mechanism (vertex force-registration, not a
   level escalation) and is itself experimental/WIP infrastructure (`bandRegions`/`railLines` are
   explicitly labeled "Task 2"/"Task 4" of an unfinished spike) — cited as the nearest existing
   hook, not as a proven fix.
2. **A fan-consistency post-pass** on cells emitting an edge already claimed by a neighbor
   (a local repair pass, not implemented anywhere in the current kernel).

---

## 2. THE RECIPE

### 2.1 Band values (exact formula + citation)

`_gyroidContourLib.ts:49-55`, `wallIsolevels(p)`:
```
th   = p.thickness * 1.5                    // gm_thickness=0.1 → th = 0.15
inner = th * (1 - p.smoothVal)               // shape=1 edge (ridge plateau top)   = 0.135
outer = th                                   // shape=0 edge (channel floor start) = 0.15
mid   = th * (1 - p.smoothVal / 2)           // band midline (NEVER embed alone)   = 0.1425
```
at production defaults `gm_thickness=0.1, gm_sharpness(=smoothVal)=0.1`
(`src/styles/registry.ts:328-330`; confirmed as the REAL resolved default via the registry chain
`setStyle → getDefaultStyleOpts → STYLE_SCHEMAS(==STYLE_REGISTRY) → buildStyleOptions` —
`research/lab/E-2026-07-10-GYROID-PRODCLOSE-prereg.md:256-271` — **not** `packGyroidManifold`'s
internal `gm_scale` fallback of 3.5, which is dead code on the default path and diverges from the
registry's 4.0). The field itself:
```
val(u,t) = sin(x)cos(y) + sin(y)cos(zT) + sin(zT)cos(x)     [morph=0, bias=0]
x  = fScale·cos(TAU·u),  y = fScale·sin(TAU·u)
zT = fScale·t·zStretch·4 + pulse·TAU,  fScale = gm_scale (=4.0 default)
```
(`_gyroidContourLib.ts:38-46`, matches `rOuterGyroidManifold`/`styles.ts` exactly — this is a
direct-read-verified parity, not an approximation). Gradient magnitude on the mid isolevel:
`|∇val| ∈ [4.8, 38.3]`, p50 24.0 (`2026-07-04-perfect-mesher-spec.md:2305`) — **never near zero**,
so the wall band has no low-gradient saddles; it is uniformly thin (~0.0006–0.0015 in (u,t))
everywhere. This REFUTED the initial "residual clusters at wall junctions/saddles" hypothesis —
the residual is knee-curvature-localized, not saddle-localized (§1.4).

### 2.2 Contour extraction method

Pipeline (`_gyroidContourLib.ts`, orchestrated per-isolevel by
`research/bridge/_gyroid_bandedge_lib.ts:130-171` `extractIsolevel`):

1. **Marching squares** on `g(u,t) = |val(u,t)| − c` at a `nu×nt` grid (u periodic, t not) —
   `marchAbsIso` (`_gyroidContourLib.ts:87-117`). Working on `|val|` captures both the `+c` and
   `−c` branches of the sign-changing field in one pass. Per-cell edge crossings are refined by
   **bisection→secant polish** (`edgeRoot`, lines 64-81), not linear interpolation.
2. **Link** unordered segments into ordered polylines by welding shared endpoints (quantized,
   `weldEps=1e-6`) — `linkSegments` (lines 123-158). u-periodic; polylines are not forced closed.
3. **Refine + filter**: every polyline vertex is root-polished onto the true isolevel by a bounded
   2D descent of `(|val|−c)²` (window 0.012, `polishVertexToIso`, lines 166-181); a vertex that
   cannot reach `valErr ≤ valTol` is **dropped**, splitting its polyline (`refineAndFilterContours`,
   lines 184-195). This removes the ~0.28% marching-squares saddle-junction strays the plain
   linker leaves (up to ~0.013 val-err / ~3.9mm 3D at cells straddling val's critical points).
4. **Decimate** to a target 3D arc-length step `stepMm` — `decimateContours`
   (lines 202-217): keeps endpoints + every vertex ≥`stepMm` (3D, via the analytic radius
   function) from the last kept one. This is ALONG-contour spacing; it does not control the
   ACROSS-band facet size at the knee (that is set by `featureLevel`, §2.5).
5. **Placement validation**: `isoResidual3D` (lines 294-328) — a genuinely independent 3D
   nearest-isolevel bounded local search (NOT a single Newton step, which was found to blow up to
   ~85mm at `∇val→0` saddle *validator* artifacts in an earlier round — a bounded box-refine
   search is required).

**Constants used (the pre-registered, measured design point)**:
`nu=nt=1200, polishIters=40, valTol=1e-4, stepMm=0.15, placementSampleN=2000`
(`GBE_EXTRACT_DEFAULT`, `_gyroid_bandedge_lib.ts:111-113`). Result at these constants (both
isolevels, `research/lab/E-2026-07-10-GYROID-BANDEDGE-prereg.md:342-356`):

| isolevel | raw pts (marched+linked) | dropped | kept | decimated @0.15 | placement max/p99 `disp3D` |
|---|---|---|---|---|---|
| inner `\|val\|=0.135` | 25,381 | 0 | 25,381 | 14,480 | **0.000000mm** / 0.000000mm |
| outer `\|val\|=0.15` | 25,274 | 0 | 25,274 | 14,305 | **0.000000mm** / 0.000000mm |

Zero drops, machine-precision placement (sampled 2,069/2,044 pts respectively, deterministic
stride, far under the 0.001mm gate). Total: **28,785 points across ~2,045 polylines**, extracted
in **10.4s**. A bounded retry at `stepMm=0.08` (39,849 total points, 20,001+19,848, zero drops,
again 0.000000mm placement) is **fidelity-equivalent** to 0.15 (Newton-worst bit-identical to 6
significant figures — the physically same worst locus survives both pickets; §5) but leaves one
fewer non-manifold locus. **Prefer stepMm≈0.15** (fewer points, and the residual crack is the
same deterministic class regardless — the kernel fix in §1.5 is the actual lever, not picket
density).

### 2.3 How the curves feed the per-cell CDT

```ts
// research/bridge/_gyroid_bandedge_lib.ts:201-207 (contoursToFeatureLines)
function contoursToFeatureLines(contours: Contour[], label: string): FeatureLine[] {
  return contours.map((c, i) => ({
    kind: 'general-curve' as const,          // SAME kind production's val=0 trace already emits
    points: c.pts.map(([u, t]) => ({ u, t })),
    label: `${label}[${i}]`,
  }));
}
const generalCurves = [
  ...contoursToFeatureLines(inner135Contours, 'bandedge-inner'),
  ...contoursToFeatureLines(outer150Contours, 'bandedge-outer'),
];
```
This substitutes 1:1 at the `outerFeatureLines` field of `AssemblyWallOptions`
(`WatertightAssembly.ts:255`), passed to `assembleWatertight` → `buildConformingWall`
(`ConformingWall.ts:106` `ConformingWallOptions.featureLines`). Downstream, unconditionally (no
`kind` branch anywhere in the consuming path — verified by direct read):
```
clipFeaturesToBox(opts.featureLines, uMargin, tMargin)     // ConformingWall.ts:587, called :804
  → buildFeatureIntersector(clippedFeatures)                // ConformingWall.ts:642
  → triangulateQuadtreeWithFeatures(qt, clippedFeatures, {featureLevel, ...})  // :745
      → triangulateConstrainedCell(...)   // ConstrainedCellTriangulator.ts — local CDT per cell
```
`hasFeatures = generalCurves.length > 0` (true, same `computeUBias` GATE-B-capped anisotropy path
Gyroid already exercises with its 14-line `val=0` trace today — `uBias=1` in both the baseline
and the band-edge twin, unchanged).

### 2.4 Pin locations / locator method for the knee population

**Locator method actually used (§V11aa, proven on the lab's non-production kernel — see gap
in §4):** empirical, two-pass. (1) Run a verdict pass (radial-prefilter + Newton) on the doubled-
contour mesh to find each surviving outlier's worst-sag 3D point. (2) Newton-project that 3D
point back onto the true analytic surface to recover its `(u,t)`. (3) Inject a pinned cluster —
the knee point itself plus a 6-point ring at radius `spread=0.0008` (in (u,t)) — held fixed
against any smoothing/optimize sweep via a `pinInjected` flag on the kernel's point list.

**Untested alternative (named as a "NEXT" item, not built or measured — OPEN):** pre-seed the
knee `(u,t)` **analytically**, from the isolevel-corner locus itself (the smoothstep
curvature-peak — i.e. directly from `wallIsolevels()` and the curve's own parametrization) rather
than from a prior verdict pass's worst-sag point. This would make the mechanism single-pass
(no build→verdict→rebuild loop) but has never been attempted
(`EXPERIMENT-REGISTRY.md:5854`, "consider whether the 5 spots can be pre-seeded from the analytic
knee locus... WITHOUT a prior verdict pass — would make it single-pass").

Constants: `spread=0.0008` (u,t units), ring count 6 (+1 knee point = 7 pts/spot),
`chordTolMm=0.0015` on the **background mesh** at the point this recipe was proven (the lab's
`buildInhouseMetricMesh` kernel, chord-Steiner splitter — see §4 for why this constant does not
directly transfer to the production kernel, which has no chord-Steiner lever at all).

### 2.5 Sizing interplay — Gyroid is `J≡1`; warp-Jacobian composition does NOT apply

The fleet-wide **warp-Jacobian-aware sizing** lever (the mechanism that closed SpiralRidges 81×,
`E-2026-07-10-JACOBIAN-SIZING`) corrects sizing for the *compression* introduced by the
`CreaseUWarp`/`CreaseTWarp`/`CreaseHelixWarp` post-triangulation domain-remapping family — it
composes `max(1, Ju²)` into the analytic curvature floor. Gyroid's own conforming recipe routes
its sharp feature through **general-curve embedding** (this champion), not through that warp
family at all: `extractWarpChoices` (mirroring `prepareTwinInputs`) finds **zero**
vertical-crease/horizontal-band/helical-crease lines for Gyroid at any tested parameter point —
`creaseChoice`/`creaseTChoice`/`helixChoice` are all `identity` (verified independently in three
places: `_gyroid_prodclose_lib.ts:720-726`, `_gyroid_bandedge_lib.ts:241-246`, and the dedicated
fleet-diagnostic measurement below). Direct measurement
(`research/lab/E-2026-07-10-JACOBIAN-SIZING-prereg.md:119-140`, dense 2048×512 `J²` field at
SpiralRidges' body dims):

| style | branch | maxJ² | p99J² | meanJ² | area J²>1 |
|---|---|---|---|---|---|
| SpiralRidges | helix | 3.1605 | 3.1605 | 1.0864 | 12.50% |
| **GyroidManifold** | **identity** | **1.0** | **1.0** | **1.0** | **0%** |
| DragonScales | identity | 1.0 | 1.0 | 1.0 | 0% |

> "**Scope note:** WARP-JACOBIAN SAG DILUTION is a warp-family-style mechanism, not a universal
> sharp-feature mechanism — 'fleet-wide' = every style whose recipe uses the crease/helix warp
> layer." (`E-2026-07-10-JACOBIAN-SIZING-prereg.md:341-342`)

**What sizing Gyroid actually uses**, all confirmed live/default in production:
1. **Plain curvature-based `MetricSizingField`/`SurfaceMetricTensor`** (`principalCurvatureMax`)
   at the production sizing grid `resU=resT=128` (`AF_PROD_OPTS.resU/resT`,
   `_analytic_floor_lib.ts:68-69`) — band-limited by grid resolution, blind to sub-cell relief
   (the LAB-CHEATSHEET's stated metric-mesh gotcha). **No analytic curvature floor is applied** —
   `E-2026-07-10-GYROID-PRODCLOSE` (KILL-A) proved the floor lever is dominated by the band-edge
   contour mechanism (§1.3 A/B table) and is mechanistically incapable of reaching the knee
   regardless of resolution (`h(κ≥2.4)=minEdgeMm` binds exactly at the knee's κ up to 1049.9 —
   `E-2026-07-10-GYROID-PRODCLOSE-prereg.md:290-298`). Production's own curvature-floor hook
   (`outerCurvatureFloor`/`outerMaxKappa`, `WatertightAssembly.ts:225-227`) is real and wired but
   sits behind the `__pfConformingAnalyticFloor` dev flag
   (`ParametricExportComputer.ts:2830-2831`, default OFF) and — per this recipe — **should stay
   unused for Gyroid**, not because it's unwired but because it is measured strictly dominated.
2. **`computeUBias` GATE B** relief-anisotropy bias, `hasFeatures`-capped at ≤2
   (`WatertightAssembly.ts:118-166`) — resolves to `uBias=1` at production defaults (unchanged by
   this recipe: the val=0 trace and the band-edge traces both set `hasFeatures=true` identically).
3. **Forced `featureLevel=11` uniform refinement** on any quadtree cell a general-curve line
   crosses (`AF_PROD_OPTS.featureLevel=11`, confirmed the REAL production value
   at `ParametricExportComputer.ts:2906-2907`, dev-overridable via `__pfFidelityFeatureLevel`).
   This is a **fixed level**, not sizing-field-driven — it is why the across-band facet size at
   the knee is essentially constant regardless of the sizing grid, and is the structural reason
   the residual needs a *pin*, not a *sizing* fix. Independently measured
   (`ParametricExportComputer.ts:2896-2901`, 2026-06-23, extractor-independent): "L11 collapses
   the near-feature flank radial p99 — CelticKnot 0.18→0.013mm, **Gyroid 0.31→~0.05mm**, Voronoi
   cell-interior 0.078→0.018mm — at ~2× tris" — this is the SAME order of magnitude as the
   measured production Newton-worst (0.0576/0.0590) under the OLD val=0 trace, corroborating that
   `featureLevel=11` is already doing real work; the fix in this recipe is *which curve* gets
   that L11 treatment, not the level itself.

No warp-Jacobian composition, no per-style curvature floor, no new sizing-grid resolution is part
of this recipe. The champion is a **locus fix inside the existing sizing/refinement stack**.

### 2.6 Every constant, with citation

| constant | value | source |
|---|---|---|
| `th` (wall band outer edge) | `0.15` = `gm_thickness·1.5` | `_gyroidContourLib.ts:50`, `gm_thickness=0.1` default `registry.ts:329` |
| `inner` isolevel | `0.135` = `th·(1−gm_sharpness)` | `_gyroidContourLib.ts:51`, `gm_sharpness=0.1` default `registry.ts:330` |
| `outer` isolevel | `0.15` = `th` | `_gyroidContourLib.ts:52` |
| `mid` (NEVER embed alone) | `0.1425` | `_gyroidContourLib.ts:53` |
| `gm_scale` (fScale) | `4.0` (registry default; packer's dead fallback is `3.5`) | `registry.ts:328`; divergence trail `E-2026-07-10-GYROID-PRODCLOSE-prereg.md:256-271` |
| extraction grid | `nu=nt=1200` | `_gyroid_bandedge_lib.ts:112`, matches lab's own §V11o extraction grid |
| root-polish iters | `polishIters=40` | `_gyroid_bandedge_lib.ts:112` |
| isolevel filter tol | `valTol=1e-4` | `_gyroid_bandedge_lib.ts:112` |
| decimation step | `stepMm=0.15` (0.08 fidelity-equivalent, worse watertight) | `_gyroid_bandedge_lib.ts:112`; A/B `E-2026-07-10-GYROID-BANDEDGE-prereg.md:405-422` |
| placement gate | `≤0.001mm` max `disp3D` | `E-2026-07-10-GYROID-BANDEDGE-prereg.md:104-110` (KILL-E); achieved `0.000000mm` |
| sizing grid | `resU=resT=128` | `AF_PROD_OPTS`, `_analytic_floor_lib.ts:68-69` |
| feature refine level | `featureLevel=11` | REAL production value, `ParametricExportComputer.ts:2906-2907` |
| `maxSagMm` / `maxEdgeMm` / `minEdgeMm` / `gradeRatio` / `maxLevel` | `0.003 / 1 / 0.1 / 2 / 16` | `AF_PROD_OPTS`, `_analytic_floor_lib.ts:63-67` |
| `nRing` / `targetTriangles` / `budgetMode` | `2048 / 16,000,000 / 'cap'` | `AF_PROD_OPTS`, `_analytic_floor_lib.ts:70-72` |
| `maxKappa` (floor cap, unused in this recipe) | `2.4 mm⁻¹ = 8·maxSagMm/minEdgeMm²` | `_gyroid_prodclose_lib.ts:531-533`; style-independent formula |
| knee-pin ring `spread` | `0.0008` (u,t) | `EXPERIMENT-REGISTRY.md:5840-5844` (§V11aa, lab kernel) |
| knee-pin ring count | `6` satellites + 1 knee pt = 7/spot | `EXPERIMENT-REGISTRY.md:5840` |
| lab's chord-Steiner tol at literal-0 (K0c, non-production kernel) | `chordTolMm=0.0015`, picket `0.10→0.04` | `EXPERIMENT-REGISTRY.md:5801` (L0c row) |

---

## 3. EXISTING CODE ARTIFACTS

### 3.1 Production per-cell general-curve CDT path (`src/renderers/webgpu/parametric/conforming/`)

All of the following are **already shipped, unconditional production default** — none behind a
Tier-C flag or styleId allow-list (that distinction matters for §4):

| file | role | key anchors |
|---|---|---|
| `FeatureLineGraph.ts` | Per-style feature extraction dispatch + the Gyroid extractor itself | `extractGyroidManifold` (**needs the fix**, lines 603-607); `FeatureLine`/`FeatureLineKind` types (lines 130-151, `'general-curve'` is the catch-all kind for "arbitrary (u,t) polyline... no constant-u/-t/-single-slope decomposition"); per-style dispatch table incl. `GyroidManifold: extractGyroidManifold` (line ~919) |
| `WatertightAssembly.ts` | Whole-pot assembly; owns `AssemblyWallOptions` (the twin-injection seam) | `outerFeatureLines`/`outerCreaseLines`/`outerCurvatureFloor`/`outerMaxKappa`/`resU`/`resT`/`featureLevel` fields (lines 185-259); `computeUBias` GATE A/B (lines 118-166) |
| `ConformingWall.ts` | Per-wall conforming build; owns `ConformingWallOptions`, clips + dispatches to the CDT | `featureLines`/`featureTMargin`/`featureLevel`/`railLines`/`bandRegions` fields (lines 91-198); `clipFeaturesToBox` (587), `buildFeatureIntersector` (642), the `triangulateQuadtreeWithFeatures` call (745), `uMargin = 1.5/(1<<featureLevel)` u-seam clip margin (803-804) |
| `FeatureConformingTriangulator.ts` | The actual per-cell constrained-CDT insertion (feature-aware variant of the plain quadtree triangulator) | module doc lines 1-27 ("Builds the same periodic, 2:1-balanced, T-junction-free triangle mesh... EXCEPT that every cell a feature curve passes through is locally re-triangulated... so the curve becomes real mesh edges"); `BandRegion` (71-74) |
| `ConstrainedCellTriangulator.ts` | Local constrained-Delaunay per cell | `CdtStats` interface (line 67) |
| `ParametricExportComputer.ts` | Real production wiring — style-agnostic, no `styleId===` branch anywhere in this block | `extractAnalyticFeatures` call + `generalCurves` filter (lines 2670-2748); `outerFeatureLines`/`featureLevel: 11` assembly (lines 2890-2918); `analyticFloor` dev-flag gate (`__pfConformingAnalyticFloor`, 2830-2831) |

**Status:** the CDT machinery is proven-correct at ~150× its native point density (28,785 pts
vs. production's native 14-line trace) with only the 2-locus defect (§1.5) as residue —
i.e. this layer needs a **small, localized kernel fix**, not a rewrite. `extractGyroidManifold`
is the ONE function that needs to change (trace `wallIsolevels()`'s two isolevels instead of
`val=0`) — everything downstream of `outerFeatureLines` already works.

### 3.2 Lab libraries already implementing the mechanism

| file | implements | status |
|---|---|---|
| `research/bridge/_gyroidContourLib.ts` | Extraction primitives: `gyroidVal`, `wallIsolevels`, `marchAbsIso`, `linkSegments`, `refineAndFilterContours`, `decimateContours`, `isoResidual3D`, `gyroidGradMag`, `decimateContoursAdaptive` (region-adaptive step, unused by the champion recipe), `buildMidRung` (REFUTED lever, kept for the record), `contoursToConstraints` | Committed, read-only, dev-only lab file (`research/`, never imported by `src/`). Production-parity verified formula-exact against `rOuterGyroidManifold`. |
| `research/bridge/_gyroid_prodclose_lib.ts` | The Δ2-exact production twin (`prepareGpcTwinInputs`, `buildGpcTwin`), the analytic curvature-floor derivation + validation (`buildGyroidCurvatureFloor`, `validateGyroidFloor`, `gyroidValDerivs`/`shapeDerivs`/`rDerivs`/`gyroidAnalyticCurvature` — exact closed-form partials, no FD noise), and the shared scoring machinery (`gpcPrescreenCount/Detail`, `gpcStratifiedNewton`, `gpcScoreForward`, `gpcScoreCoverage`, `auditWatertight`, `zeroAreaCount`) | KILL-A verdict banked (floor dominated). Scoring fns re-exported READ-ONLY by `_gyroid_bandedge_lib.ts` — no ruler was re-invented for the champion measurement. |
| `research/bridge/_gyroid_bandedge_lib.ts` | Stage-E extraction orchestration (`extractIsolevel`, `extractBandedgeContours`), the `contoursToFeatureLines` seam substitution, Stage-B twin build with overridden `generalCurves` (`prepareGbeTwinInputs`, `buildGbeTwin`), and the Map-free non-manifold locus classifier (`classifyNonManLoci`) | **The champion's proof file.** Verdict banked, mechanism CONFIRMED on the production kernel. |
| `research/bridge/_gyroid_literal0.test.ts` + `research/bridge/inhouseMetricMesh.ts` / `research/bridge/featureConformingMesh.ts` (`buildInhouseMetricMesh`, `buildFeatureConformingMeshB`) | The §V11o/q/w chord-Steiner ladder AND the §V11aa knee-pin mechanism (`EXPERIMENT-REGISTRY.md:5760-5857`) | **DIFFERENT KERNEL** — see §4.1. Proven on the lab's own legacy in-house mesher, NOT on `ConformingWall.ts`/`WatertightAssembly.ts`. Never ported to or re-validated against the Δ2-exact production twin. |

### 3.3 The chip task (named, tracked informally — no formal ticket ID exists)

Referenced identically in three places (`research/lab/2026-07-10-program-consolidation.md:62-65`,
`research/lab/2026-07-11-tierc-productionization-charter.md:80`, and inline in the BANDEDGE
verdict's RECOMMENDATION, `E-2026-07-10-GYROID-BANDEDGE-prereg.md:467-487`) as **"Gyroid
completion chip (pins + 2-locus CDT fan defect)"**. There is no separate ticket file (checked:
no `task_*` file exists anywhere under `research/` referencing Gyroid; this differs from the
`FeatureLineGraph.ts` stale-hash22 chip, which DOES have a named `task_c0c837ec`,
`CROSS-WORKSTREAM-NOTES.md:67-74` — that chip is unrelated, it concerns the Voronoi extractor).
The chip's two named halves, both **status: not started** in production code:
1. **Knee-pin mechanism** — port §V11aa's pin concept into `AssemblyWallOptions`/
   `ConformingWallOptions` (no `pin`/`injectedPoints`/`pinnedPoints` field exists in either
   interface today — confirmed by direct grep, zero hits for `injectedPoints|pinInjected|
   pinnedPoint` in `ConformingWall.ts`, `WatertightAssembly.ts`, or `FeatureConformingTriangulator.ts`;
   the only `pin` hits in those files are the *unrelated* "pin the wall to a shared nRing ring
   count" usage, a false cognate).
2. **2-locus per-cell-CDT fan defect** — the named remedies in §1.5, neither implemented.

---

## 4. GAPS NOT CLOSED

### 4.1 The single biggest gap: the knee-pin mechanism was never proven on the production kernel

This is the load-bearing distinction a fresh implementer must not miss. Two genuinely different
meshing kernels exist in this codebase:

- **Production kernel**: `src/renderers/webgpu/parametric/conforming/{WatertightAssembly,
  ConformingWall, FeatureConformingTriangulator, ConstrainedCellTriangulator, QuadtreeTriangulator,
  PeriodicBalancedQuadtree}.ts`. This is what `assembleWatertight` calls, what the Δ2-exact twins
  (`_gyroid_prodclose_lib.ts`, `_gyroid_bandedge_lib.ts`) build against, and what the **band-edge
  contour champion (§1.3) was proven on**.
- **Legacy research kernel**: `research/bridge/{inhouseMetricMesh, featureConformingMesh,
  incrementalRefine}.ts` (`buildInhouseMetricMesh`, `buildFeatureConformingMeshB`,
  `buildInhouseMetricMeshIncremental`). This is what `_gyroid_literal0.test.ts` used, and what the
  **§V11aa knee-pin mechanism (§1.4) was proven on**. It has a fundamentally different sizing
  model (`InhouseMeshOpts`: `tolMm`, `chordTolMm`, `sizeRes`, `splitThresh`, `optimizeSweeps` — a
  chord-Steiner splitter with an explicit `chordTolMm` lever) that the production kernel does not
  share at all.

**These two facts have never been combined.** The knee-pin mechanism closed a **10-outlier /
5-spot** residual on the legacy kernel, and only *after* a chord-refine ladder had already reduced
the population from ~2,133 (§V11o) → ~583 (§V11q) → 10 (§V11w, `chordTolMm` driven
`0.003→0.0015`). Production's twin residual under the SAME doubled-contour embed is **~31,114**
knee-adjacent facets (est., §5), measured with **zero chord-refine** applied (the production
kernel has no `chordTolMm`-equivalent lever at all — confirmed, `AssemblyWallOptions`/
`ConformingWallOptions` expose no chord-based post-triangulation Steiner-insertion knob;
`featureLevel` is a fixed uniform-refinement level, not an adaptive chord-driven splitter). So
three separate open questions are bundled under "port the pins":
1. Does a `chordTolMm`-style adaptive splitter need to be **built from scratch** in the production
   kernel before pins are even worth trying (the lab's own ladder needed both), or can pins alone
   close a residual two orders of magnitude larger than what they were proven against?
2. Does the empirical worst-sag-Newton-recovery locator scale to ~31k facets (thousands of
   distinct spots, not 5), or does the population turn out to concentrate along the *entire*
   contour length (band-edge curve, not isolated knee points) — in which case the fix is
   structurally an **edge** treatment (denser feature-adjacent refinement along the whole curve),
   not a handful of point clusters? This was explicitly flagged as untested in
   `E-2026-07-10-GYROID-BANDEDGE-prereg.md:476-481` ("est ~31k knee-adjacent facets remain...
   production's analog needs both a chord lever near embedded curves... AND a pin mechanism
   (production has neither exposed). This is the named engineering item for the next arm").
3. The untested analytic pre-seed alternative (§2.4) would sidestep the locator-scaling question
   entirely if it works, but has zero measurement behind it.

**None of this is answered by existing evidence.** It is the correct target for the first Phase-1
prereg on this style (see §5).

### 4.2 The 2-locus non-manifold defect is unfixed and blocks any real ship

Per the project's hard gate (charter G4: "zero non-manifold and zero zero-area faces"), the
current champion recipe **cannot ship as-is** — it produces 2-3 raw non-manifold edges (§1.5) on
the one parameter point tested. The named remedies are un-implemented design sketches, not code.
This is a small, bounded fix (2-3 loci, deterministic, fully characterized `(u,t)` locations) but
it is a gate blocker, not a nice-to-have.

### 4.3 Dispatch — smaller gap than it looks, but not zero

Unlike Gothic/GeoStar's Tier-C path (flag-gated, `styleId` allow-list, "V12b" —
`5f9e642a`/`project_perfect_mesher.md` memory), Gyroid's general-curve conforming path is **already
the unconditional production default** — no new dispatch entry, flag, or allow-list addition is
needed to make the CDT machinery see the right curves; only `extractGyroidManifold`'s function
body needs to change (trace `wallIsolevels()`'s two isolevels instead of `val=0`). This makes the
integration *simpler* than DragonScales/Gothic's champion ports, but the charter's hard rule
("Never change production export behavior except behind a default-off flag; byte-identical-when-off")
still applies: shipping the swap means either (a) gating it behind a new dev flag until §4.1/§4.2
close, matching the project's existing `__pfConforming*` lever convention, or (b) folding it into
the region-based Tier-C mesher this charter is designing, dispatched by the per-style manifest
(`research/lab/2026-07-10-program-consolidation.md:22-42`, `StyleManifest.features.extractors`)
rather than editing `extractGyroidManifold` in place. **Which of these two integration points is
correct is an open architecture call for D0.3, not decided by this document.**

### 4.4 Budget accounting — outer-wall-only, single dims/param point

The measured `+18.5%` is **outer-wall tris only** (1,892,112 → 2,242,987), at ONE dims/style-param
point (`H120/Rt50/Rb40/expn1`, all `gm_*` at registry defaults). The **full-pot** delta is smaller
(baseline full 4,014,802-4,014,814 → band-edge full 4,365,677, **+8.7%**, since inner
wall/rim/base/drain are untouched) — well inside any plausible `≤10M full-pot` budget policy
(`2026-07-09-drive-final-scorecard.md:12`). But this has never been checked: (a) at other
dims (short-wide triggers `computeUBias` GATE A, a materially different code path); (b) across
the `gm_scale∈[1,12]`/`gm_thickness∈[0.01,2.0]`/`gm_sharpness∈[0.01,1.0]` parameter envelope
(`registry.ts:328-330`) where the contour count and band width both change; (c) combined with
the knee-pin mechanism's own triangle cost once built (measured negligible on the legacy kernel,
**net −3k** at the literal-0 point — but that was a 5-spot, not a 31k-facet, residual, so this
number does not extrapolate).

### 4.5 Seam interaction

The locus classifier explicitly checked `nearUSeam` (within the `featureLevel`-11 u-seam clip
margin, `ConformingWall.ts:803-804`, `1.5/(1<<11) ≈ 7.3e-4`) for all 5 non-manifold loci and found
**false in every case** — the 2-locus defect is not a seam artifact at this parameter point. This
is a clean negative result, not a proof of absence at other parameter points (the seam sits at
`u=0/1`; whether either isolevel contour ever threads near the seam depends on `gm_scale`/phase,
untested).

### 4.6 Parameter envelope — birth/death events: entirely OPEN, no measurement exists

Confirmed by direct search: **no birth/death sweep for GyroidManifold exists anywhere in
`research/`** (the only "birth"/"death" language near Gyroid in the corpus is the charter's
generic architecture vocabulary — `FeatureAnatomyProvider`'s "birth/death events over the
envelope", charter §5 — never instantiated for this style). Every number in this document is at
a single point in the registry-default parameter space. Genuinely open questions with zero
evidence:
- As `gm_sharpness → 1` the band width `th·smoothVal` widens materially — does the doubled-contour
  mechanism (and the knee-pin locator) still apply, or does a wide band behave more like the
  REFUTED single-midline case (§1.2) at some threshold?
- As `gm_sharpness → 0` the band narrows toward a true discontinuity (a C0 edge, not a smoothstep
  knee) — does the knee-curvature floor argument (§1.4, `h(κ≥2.4)=minEdge`) even still hold, or
  does the defect class change entirely (toward the project's C0/CLIFF-class family, cf.
  Crystalline §V11ad/ae, `2026-07-04-perfect-mesher-spec.md:2821-2913`)?
- Does either isolevel ever vanish, split, or merge (a genuine topological birth/death event) as
  `gm_scale`/`gm_thickness`/`gm_z_stretch` vary? `marchAbsIso`'s output count is a direct function
  of these params; no sweep has characterized it.
- `gm_curve` (packed slot `gmCurve`, non-default values raise `shape` to a power ≠1,
  `shapeDerivs`'s `curve` branch, `_gyroid_prodclose_lib.ts:302-322`) changes the smoothstep's
  curvature profile at the knee entirely — completely untested for this recipe.

---

## 5. REPRODUCE-TARGETS (for the Phase-1 prereg)

### 5.1 The exact −67.6%/+18.5% row (the number to reproduce first)

Source: `E-2026-07-10-GYROID-BANDEDGE` STAGE V, config **band-edge step 0.15**
(`E-2026-07-10-GYROID-BANDEDGE-prereg.md:405-422`), Δ2-exact production twin, dims
`H120/Rt50/Rb40/expn1`, style defaults, production config (`resU=resT=128, featureLevel=11`, no
curvature floor):

```
outer tris:               1,892,112 → 2,242,987        (+18.5%)
full tris:                 ~4,014,808 → 4,365,677        (+8.7%)
radial survivors:            141,147 → 236,185           (+67.4%, NOT a verdict signal — V11b saturation)
est. true outliers (strat):  ~96,012 → ~31,114            (−67.6%, 3.1×)
Newton-worst (Newton-conf.):  0.0576 → 0.024917           (−56.8%, 2.3×)
coverage max / p99:      0.0987/0.0036 → 0.0253/0.0009    (−74% / −75%)
knee-adjacent fraction of confirmed outliers:  372/372 → 410/410  (100% both)
off-band / wall-band fraction:                     0/0 →   0/0  (clean both — no new failure mode)
watertight (nonManRawBig, non-vacuous):                0 →      3  (the 2-locus defect, must be 0 to ship)
zeroArea:                                              0 →      0
build wall time:                       ~115-229s (baseline) →   92.5s assembly + 4.8s audit
```

At `stepMm=0.08` (bounded retry, fidelity-equivalent — the same physical worst locus, Newton-worst
bit-identical `0.02491654414922634`): outer tris 2,259,855 (+19.4%), est. outliers ~36,610
(within the stratified estimator's own ±9% validated noise band of the 0.15 figure — **not** a
real difference), nonManRawBig **2** (one of the three step-0.15 loci self-resolves at the finer
picket; the other two are step-invariant). **Reproduce target: within ±5% on tris, ±15% on the
stratified outlier estimate** (the estimator's own validated precision against the literal
baseline was −8.7%/−2.4%, `E-2026-07-10-GYROID-PRODCLOSE-prereg.md:336-338`), **exact** on
Newton-worst if the same worst-locus geometry is reproduced (it is a single deterministic point,
not a statistical estimate).

### 5.2 The knee-population size (the number the pin mechanism must close)

**~31,114 (step 0.15) / ~36,610 (step 0.08)** — both are **stratified estimates**
(`gpcStratifiedNewton`, plan `{topExhaustive:200, strata:8, perStratum:225}`, ~2,000 Newton
queries, deterministic `mulberry32(0xC0FFEE)`), **not a literal count** — the literal every-facet
scan (236,185 survivors at step 0.15) was deliberately not run ("the stratified classification
decided the fork without the 10-20 CPU-h literal", `E-2026-07-10-GYROID-BANDEDGE-prereg.md:514-515`).
The FAST-HONEST-RULER shard levers (`PF_GBE_SHARD`/`PF_GBE_NSHARDS`) are implemented in
`_gyroid_bandedge.test.ts` and unused — ready if a Phase-1 arm needs the literal number. **100%**
of every Newton-confirmed sample (410/410 at step 0.15, 445/445 at step 0.08) classifies
knee-adjacent (`dEdge≤0.005` from the nearest band edge) — **zero** off-band, **zero** mid-wall-band
in either config. A Phase-1 reproduction should report **both** the stratified estimate (cheap,
~6min) and, if pursuing acceptance, the literal shard-scored count (expensive, ~10-20 CPU-h at
this population size) rather than treating the stratified figure as the acceptance basis.

### 5.3 Target end-state — what "Gyroid closed" means numerically

Two reference points, genuinely different scale and kernel — a Phase-1 implementer must pick
which one is the actual target and say so:

**(a) The mission's own pre-registered acceptance bar** (both GYROID-PRODCLOSE and
GYROID-BANDEDGE, identical wording): **every-facet ≤0.01mm on the Newton basis** (every dense-45-
flagged facet Newton-rescored, exact population, stride 1) **at outer ≤7.0M tris**, watertight
(`nonManRawBig` non-vacuous = 0) + `zeroArea=0` + coverage max ≤0.01mm. **Not yet reached** by any
measured config (band-edge step 0.15 is the closest: 2.24M tris, well under budget, but Newton-worst
0.0249 ≫ 0.01 and ~31k facets remain over tol).

**(b) The lab's own literal-0 ceiling** (§V11aa K0c, **non-production kernel** — a north star to
beat or match on the production kernel, not a like-for-like number): **literal whole-mesh
Newton-0** (0 facets over tol, exact basis, no sampling) at **6,612,759 tris** (research-kernel
full-pot-equivalent basis — note this is NOT directly comparable to the production twin's
~4.37M-full/2.24M-outer split; the lab kernel's tri accounting differs), trueMax exactly 0,
truep50/p90/p99 0.00226/0.00386/0.0061, watertight (`nonManIdx=0`, cracked-control 3 = non-vacuous),
zeroArea 0, 14.1min build. This required: doubled band-edge contours (proven transferable, §1.3) +
a chord-Steiner ladder down to `chordTolMm=0.0015` (**not present in the production kernel at
all** — §4.1) + 35 pinned knee points (**not present in the production kernel at all** — §4.1).

**A concrete, honest Phase-1 target**, synthesizing both: reproduce (a) if reachable within
≤7.0M outer tris using ONLY mechanisms proven to exist or be buildable in the production kernel
(band-edge contours [done] + a NEW production chord/pin layer [not built] + the 2-locus CDT fix
[not built]); if (a) is not reachable in budget, report the priced frontier curve (tris vs.
outliers/worst/coverage at 2-3 design points on the production kernel, mirroring the
`E-2026-07-10-GYROID-BANDEDGE` stratified-classification discipline) and classify the residual
exactly as this document does (100% knee-adjacent, X remaining, worst Y) rather than declaring an
unmeasured win.

### 5.4 Specific numbers a Phase-1 prereg should commit to reproducing (checklist)

1. Band-edge extraction: **28,785 pts / ~2,045 polylines** at `stepMm=0.15`, placement
   `≤0.001mm` (measured `0.000000mm`) — this is a pure-geometry check, independent of any mesher,
   and should be the FIRST thing re-verified in the new region-based mesher's extraction stage.
2. Outer tris **2,242,987 ± ~5%** at the stated dims/params, **+18.5% ± ~3pp** vs. the val=0-trace
   baseline **1,892,112**.
3. Stratified true-outlier estimate **~31,114 ± 15%**, Newton-worst **0.024917** (exact, if the
   same worst locus reproduces), coverage max **0.0253 ± 10%**.
4. **100%** knee-adjacent classification, **0** off-band, **0** wall-band — a regression on this
   split (any off-band population reappearing) is the pre-registered K3 single-midline-trap
   signature (§1.2) and should immediately halt and reclassify, not be averaged away.
5. Non-manifold count **≤3** raw-index (and ideally **0**, once §1.5's fix lands) — this is a
   hard gate (G4), not a soft target.
6. If the pin mechanism is ported: report the literal (not stratified) before/after count on
   whatever residual population the production-kernel band-edge mesh actually has, at whatever
   scale that turns out to be — do not assume the lab's 5-spot/35-point recipe scales unchanged
   to production's (much larger) knee population without measuring it first (§4.1).

---

## Citation index (files referenced in this document)

**Lab experiment docs:** `research/lab/E-2026-07-10-GYROID-BANDEDGE-prereg.md` (pre-reg `3c996af8`,
verdict `39ad7939`); `research/lab/E-2026-07-10-GYROID-PRODCLOSE-prereg.md` (pre-reg `2285fd02`,
verdict `66c6735e`); `research/lab/2026-07-04-perfect-mesher-spec.md` §V11j (L2197)/§V11o
(L2247)/§V11q (L2301) (extractor commit `aaf8f629`, build+verdict `8f578d4e`, polish instruments
`4375de12`); `research/EXPERIMENT-REGISTRY.md` L5760-5857 (`E-2026-07-08-GYROID-LITERAL0` §V11w +
`E-2026-07-08-GYROID-KNEE` §V11aa, commit `011cfd08`); `research/lab/2026-07-09-drive-final-scorecard.md`
(commit `83fe4c36`); `research/lab/2026-07-10-program-consolidation.md` (commit `4dad7528`);
`research/lab/E-2026-07-10-JACOBIAN-SIZING-prereg.md`; `research/CROSS-WORKSTREAM-NOTES.md`;
`research/lab/2026-07-11-tierc-productionization-charter.md`.

**Lab libraries:** `research/bridge/_gyroidContourLib.ts`; `research/bridge/_gyroid_prodclose_lib.ts`;
`research/bridge/_gyroid_bandedge_lib.ts`; `research/bridge/_analytic_floor_lib.ts`;
`research/bridge/inhouseMetricMesh.ts`; `research/bridge/featureConformingMesh.ts`.

**Gitignored data:** `research/exchange/_gyroid_bandedge/{run.log, rows.ndjson, contours_bandedge*.json,
build_meta*.json, verdict_strat*.json, nonman_loci.json}`; `research/exchange/_gyroid_knee/`;
`research/exchange/_gyroid_prodclose/`.

**Production code:** `src/renderers/webgpu/parametric/conforming/{FeatureLineGraph,
WatertightAssembly, ConformingWall, FeatureConformingTriangulator, ConstrainedCellTriangulator}.ts`;
`src/renderers/webgpu/ParametricExportComputer.ts`; `src/styles/registry.ts`;
`src/geometry/styles.ts` (`rOuterGyroidManifold`, parity reference, not separately re-read line-by-line
in this document — cited by the contour lib's own header comment matching it exactly).
