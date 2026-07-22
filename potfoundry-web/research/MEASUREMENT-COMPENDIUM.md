# PotFoundry Measurement Compendium — the Rulers

_Compiled 2026-07-22 from a 7-agent deep audit of the measurement infrastructure
(reports archived in the session scratchpad `audit/`). Companion to
`LAB-CHEATSHEET.md` (the field discipline) and `FRONTIER-KNOWLEDGE.md` (the meshing
SOTA). This document is the **catalog of rulers**: every instrument that measures
how faithful a mesh is, with its algorithm, precision floor, speed, **failure
modes**, **when/how to use it**, and where it breaks by shape._

> **Why this exists.** The overarching goal is **shape-agnostic 0.01mm-precision
> meshing of true-3D objects**. You cannot hit a tolerance you cannot measure. The
> project accreted ~a dozen distance rulers, four quality/topology rulers, and one
> rigorous certificate engine — spread across three non-sharing stacks
> (`src/fidelity`, `src/geometry/targetSolid`, `research/bridge/labkit`). Several
> rulers silently violate the 0.01mm-MAX-vs-exact-analytic standard. This is the
> map so you reach for the right one and know exactly how it can lie to you.

---

## 0. The 60-second mental model

A **ruler** answers: *how far is this triangle mesh from the true surface the style
defines?* Two things make that question subtle.

**Two error channels (never conflate — LAB-CHEATSHEET).**
- **VERTEX / placement error** — are the mesh vertices ON the true surface?
  Density-**invariant**. When the mesher places vertices exactly at their `(u,t)`
  this reads the f32 floor (~0.5µm). A nonzero vertex error is a *placement* bug
  (wrong sampler, crest-blind bilinear grid).
- **CHORD / tessellation error** — does the flat triangle *interior* bridge away
  from a curved/creased surface? Density-**responsive** (reducible by adding
  triangles / `chordTolMm`). This is the one-sided **Hausdorff** distance our
  exported facets must satisfy — the literature's `hausd` knob (MMG/mmgs; see
  FRONTIER-KNOWLEDGE §6). A flat facet chord-cutting a sharp crest is the classic
  chord error.

**The distance is directional.** Almost every ruler here is **one-sided
mesh→surface** (sample the mesh, measure to the surface). That is blind to
**missing** surface (a hole in the mesh emits no sample). Only `scoreCoverage`
(PEC twin) and the rigorous `target→mesh` direction close that gap — and the
latter is only *assumed* sound (`geometricImageManifoldProven:false`).

**The reference is the hard part.** "The true surface" has three representations,
and picking the wrong one for the shape is the #1 way a ruler lies (see §3):
1. **Grid-bound** — a binned/bilinear reference built *from a mesh*. Wrong surface.
2. **Exact analytic** — `rA(θ,z)`, the continuous per-style radius. Right for
   single-valued walls; **cannot represent** a double-valued (over/under) wall.
3. **Validated interval program** — the target as an outward-rounded SSA program.
   Rigorous, picometre floor; the certificate.

---

## 1. The golden rules (the discipline every ruler obeys or violates)

1. **Certify on MAX, never p99 alone.** p99 hides the single worst facet
   (scale-tip cones read 0.10–0.13mm while p99 says 0.009 — the "DS false-cert"
   that masked a 12× MAX violation). p99/RMS are for *diagnosis*.
2. **Score vs the EXACT ANALYTIC surface, not a grid.** A binned/bilinear
   reference is band-limited + bin-quantized; it averages crests below bin size and
   dilation-fabricates empty bins. (`project_analytic_scoring_principle`.)
3. **Pick the reference by shape class** (§3). A single-valued `rA` reference on a
   double-valued weave produces a **reference artifact** (BasketWeave vertexMax
   2.0mm is the *ruler*, not the mesh).
4. **RADIAL is a screen, not a verdict.** The radial residual `|hypot(x,y) −
   rA(θ,z)|` **overstates** steep/tilted relief **2–370×** (ArtDeco radial 3.35mm ≙
   true-3D 0.039mm). Use it only as a cheap upper bound; use perpendicular/interval
   for verdicts.
5. **Slivers by minAngle (depth-invariant), never %<20° (dilutes under density).**
6. **Watertight by INDEX (3D-weld), non-vacuously** (an injected crack must move the
   count) — and cap-safe (the string-Map path dies at V8's ~16.7M-entry cap).
7. **Sample so MAX survives.** A strided subsample or loci-only sampling can *miss*
   the worst facet entirely — MAX-masking in the sampling dimension.

---

## 2. Statistic → failure-mode map

The statistic you headline **determines the failure mode you can catch**. This is
why "which number" matters as much as "which ruler".

| Statistic | Catches | BLIND to | Verdict role |
|---|---|---|---|
| **MAX** | the single worst facet; scale-tip cones; knife-edge cusps | nothing — but noisy (one facet) | **THE certification headline @ 0.01mm** |
| **p99** | robust worst (ignores a handful of outliers) | scale-tip spikes (few facets); under-tessellation | diagnosis only — **never certify** |
| **p999** | rarer spikes than p99 | the very worst 0.1% | a middle diagnostic |
| **RMS / mean** | broad **under-tessellation** (mushed relief) p99 misses | localized spikes; **straddle-masked** (a crest drowns under smooth walls) | health signal; sample **on feature loci**, not globally |
| **minAngleDeg** | the worst sliver; **depth-INVARIANT** (ours ~2° vs SOTA 14–20° at any density) | fidelity (a well-shaped facet can still chord) | **THE sliver headline** |
| **%<20° / pctBelow20** | rough sliver population | **DILUTES under refinement** (interior triangles swamp a fixed fan) | context only — **never gate** |
| **certifies-at (µm)** | rigorous per-triangle MAX bound to the analytic target | styles with missing curtains → INCONCLUSIVE | the rigorous certificate |

**Corollary:** report the *whole vector* `{max, p999, p99, rms, mean, minAngle,
pctBelow20, watertight}` and certify on `max ≤ tol ∧ watertight`. Never let one
scalar stand in for the mesh.

---

## 3. Reference-representation decision (shape-agnostic measurement)

The one decision that makes measurement shape-agnostic: **select the reference by
the style's surface class**, then apply the matching distance.

| Shape class | Styles (examples) | Reference | Distance ruler | Notes / traps |
|---|---|---|---|---|
| **Single-valued radial** | smooth pots, GothicArches, HarmonicRipple, Bamboo, ArtDeco, GeometricStar risers | exact `rA(θ,z)` (`buildAnalyticRadiusFn`) | perpendicular GN (§4.5) or interval program (§4.9) | risers/creases are **designed C0 steps**: measure the plateaus, treat the cliff as a *feature to mesh*, NOT an accept-band to exclude (`feedback_export_standard`). |
| **Steep tangled lattice** | GyroidManifold, Voronoi, CelticTriquetra, Crystalline | exact `rA(θ,z)` | perpendicular GN **with global (full-azimuth+z) seeding** — plain GN overstates ~7× (wrong well, §4.5) | fast path stalls in the wrong basin; today mitigated by the slow brute twin (§4.7). |
| **Multi-valued (over/under)** | BasketWeave, CelticKnot, DragonScales rings | **post-warp GPU surface** OR multi-patch target — **NOT `rA`** | perpendicular to the *nearest sheet*, or interval multi-patch | `rA` is a 2.5D proxy that cannot store the overhang; a large vertexMax there is a **reference artifact** (`project_export_endgame_design`). |
| **Any (rigorous)** | all 20 (single-valued outer wall) | validated interval **target program** (`styleOuterWallTargetRegistry`) | continuous mapped-patch interval bound (§4.9) | fail-closed; missing per-style discontinuity **curtains** → INCONCLUSIVE (HexagonalHive/BasketWeave/CelticKnot/SpiralRidges). |

---

## 4. The distance rulers (catalog)

Each entry: **Where · Measures · Algorithm · Precision floor · Speed · Failure
modes · When/how · Shape.** Line numbers are `src/…` unless noted.

### 4.1 `buildRadialReference` + `sagDeviation` — grid-bound sag
- **Where:** `src/fidelity/metrics.ts:44` (`buildRadialReference`), `:479` (`sagDeviation`). Feeds the persisted `FidelityMetrics.maxSagMm`.
- **Measures:** deviation (mm) of facet samples from a **binned mean-radius** reference `RTrue(θ,z)`.
- **Algorithm:** dense vertices mean-binned into **720×400** `(θ,z)` cells; empty cells **dilation-filled**; bilinear interp. `sagDeviation` classifies each facet by normal: near-vertical → radial residual; non-vertical → `buildNearestSurface`.
- **Precision floor:** the bin — `binθ ≈ 0.0087 rad` (~0.35mm arc @R=40), `binZ ≈ 0.25mm`/100mm pot. **Cannot resolve a feature narrower than one bin**; crests are averaged *below* their peak.
- **Speed:** O(dense) bin; dilation `.slice()`-allocs the 288k grid up to 1120×.
- **Failure modes:** ① **dilation FABRICATES** reference radii for any connected empty region (only *disconnected* holes throw) — an under-θ-sampled or tip-cone reference is *invented*; ② **mean, not analytic** → the wrong surface; ③ single-valued only.
- **When/how:** cheap smooth-wall screening. **Never** a 0.01mm crest/tip verdict.
- **Shape:** assumes single-valued radial; collapses lattice/weave branches; drops caps/base.

### 4.2 `buildNearestSurface` — 3D nearest-triangle distance
- **Where:** `metrics.ts:266`. Exact closest-point via Ericson (`closestPtTriDist2:416`, the one unambiguously-correct primitive).
- **Measures:** squared 3D distance to the closest *indexed reference triangle*.
- **Algorithm:** reference triangles hashed into a 3D grid (2mm cells, XY+Z key); query expands cube shells `ring 0..2`, +1 safety shell; empty → strided **4096-triangle fallback**.
- **Precision floor:** the **reference chord error** (a flat-triangulated reference; a point on the *true* convex surface reads the reference's own sag). To certify 0.01mm the reference chord must be ≪0.01mm.
- **Speed:** build O(refTris); query O(cells·tris/cell). Fine.
- **Failure modes:** it is a **min over a subset ⇒ an UPPER bound** (never under-reports the indexed set) — *but* ① **fallback false-positives**: on a downsampled index sparse cells fire the fallback → distance to an arbitrary far triangle → spurious spike; ② **lateral blindness**: a point slid *along* the surface reads ~0 (this is why walls use radial); routing the tip cone here **under-reports** its crest error.
- **When/how:** caps/base/drain/fillet where radial is degenerate. Pair with radial on walls. Keep the reference chord ≪ tol and don't downsample it for a MAX run.
- **Shape:** the metric is shape-agnostic 3D; its *use* is gated by a per-facet normal test that is not.

### 4.3 `wallDeviation` / `wallChordError` — radial wall serration
- **Where:** `metrics.ts:571` (`wallDeviation`), `:1674` (`wallChordError`).
- **Measures:** WALL-restricted radial deviation `{max, rms, p99}`; `wallChordError` targets the crest band.
- **Algorithm:** rebuild its own `buildRadialReference`; keep near-vertical (`|n_z|/|n|<0.35`) triangles; exclude drain by `r<0.5·rt`; **p99 via a 0.05mm-bucket histogram**.
- **Precision floor — the p99 quantization bug:** `BUCKETS=400, BW=0.05`, `p99 = bucket·0.05` (the **lower** edge). **True p99 in [0,0.05) reports 0.00**; 0.099 reports 0.05. **5× coarser than the 0.01mm target and under-reports by up to a full bucket.** (max/rms are exact.) Same bug duplicated in `wallChordError:1711`.
- **Speed:** rebuilds the whole reference per call (should reuse).
- **Failure modes:** the p99 quantization above; the `r<0.5·rt` drain exclusion is a **shape assumption** (a thin-walled pot's inner wall is *not* excluded → pollutes max/rms); drops all conical/bowl walls (near-vertical filter).
- **When/how:** crest-serration screening only. Read **max**, not the quantized p99.
- **Shape:** radial + near-vertical + cylinder-ish. Not shape-agnostic.

### 4.4 `radialAnalyticDeviation` — radial vs EXACT analytic
- **Where:** `src/fidelity/analyticSurfaceGate.ts:546`.
- **Measures:** `|hypot(x,y) − rA(θ,z)|` against the exact analytic `rA` (no grid), two channels (vertex + dense chord), with seam/riser/crease exclusions.
- **Precision floor:** exact `rA` (un-gridded) — no reference floor. But the *radial* residual **overstates** steep/tilted relief **2–370×** (it measures to the surface point at P's OWN azimuth, not the nearest).
- **Speed:** fast (one `rA` eval per sample).
- **When/how:** the cheap **upper-bound screen** and the pre-filter bound for the perpendicular metric (perp ≤ radial always). Never a steep-relief verdict.
- **Shape:** single-valued radial.

### 4.5 `perpendicular3DDeviation` + `projectPointToRadialSurface` — the honest true-3D workhorse
- **Where:** `analyticSurfaceGate.ts:569` (metric), `:194` (projector). Re-exported through `labkit` and tested by `perpendicular3DDeviation.test.ts`. **20 direct callers, HIGH-impact symbol.**
- **Measures:** shortest **perpendicular** 3D distance from each flat-facet sample to the analytic surface `S(θ,z)=(r cosθ, r sinθ, z)` — the honest "is this triangle faithful" chord error. Result carries an honest `maxDevMm` (`:521`).
- **Algorithm:** Gauss-Newton on `(θ,z)` seeded at the radial foot, `r`-derivatives by central FD, backtracking line search; a **coarse global search** kicks in above `coarseTrigger=0.1mm` over a **±0.22 rad × ±11mm LOCAL** window (49×25), GN-polishes top-4.
- **Precision floor:** FD step (`hθ=1e-5, hZ=1e-4`) + the GN tolerance; on smooth surfaces sub-µm (validated by the cone/normal-offset closed-form oracles).
- **Failure modes:**
  - **① Wrong-well overstatement (~7×) on tangled lattices.** The coarse search is **azimuth-LOCAL (±0.22 rad)**; when the true nearest foot sits in a different `(θ,z)` basin farther away (Gyroid/Voronoi/CelticTriquetra), single-GN stalls and **overstates** (Gyroid GN 0.644 ≙ brute 0.092). Reproduces on the real 2D-tangled surface, NOT on a 1D flute (the coarse search handles those). Today mitigated only by the slow brute twin (§4.7).
  - **② The VERTEX channel is still RADIAL** (`:575`) even in the "perpendicular" metric — only the chord channel is perpendicular.
  - **③ Centroid pre-filter breaks "exact MAX."** Facets whose *centroid* radial bound ≤ `preFilterMm=0.04` skip the dense scan and are recorded at the **radial bound**. The bound is at the centroid only — a feature-adjacent facet whose *corner* rides a crest can spike off-centroid and be **understated**; and every sub-0.04 facet's distribution is the loose radial over-estimate, not the honest perpendicular. `coarseTrigger=0.1` and `preFilterMm=0.04` are both **calibrated to a 0.1mm regime** — wrong for a 0.01mm bar.
  - **④ NaN poisoning:** an unguarded NaN chord dev poisons `rmsDevMm → null` (`:478,505`, SFB).
  - **⑤ Its regression test seeds inside the 0.22-rad window** → it green-lights the untrustworthy wrong-well path.
- **When/how:** the true-3D fidelity verdict on single-valued styles at density. Read `chordMaxMm` and `vertexMaxMm` separately. On steep lattices **anchor with the brute twin** (§4.7) or use global seeding. Scale `coarseTrigger`/`preFilterMm` with `tolMm` for a 0.01 bar.
- **Shape:** single-valued radial; discontinuous styles are **excluded** (seam/riser/crease bands, tracked in `creaseBandMaxMm`, **never gated**) — it structurally scores only the smooth complement.

### 4.6 `featureLineChord3D` / `perFaceTrue3DSag` — labkit true-3D
- **Where:** `research/bridge/labkit.ts` (barrel), `featureLocalizedFidelity.ts:720`.
- **Measures:** `featureLineChord3D` = exact 3D distance from analytic feature-loci points to the nearest mesh triangle (**truth→mesh**, one-sided, on loci). `perFaceTrue3DSag` = facet→nearest-surface (mesh→truth), the default honest heatmap ruler.
- **Failure modes:** **fl3d loci-only sampling is BLIND (not diluted) to non-locus MAX spikes** — a scale-tip cone carries no feature locus, so it is **never sampled**. This is *worse* than p99-masking. `perFaceTrue3DSag` inherits the GN wrong-well (§4.5①).
- **When/how:** `featureLineChord3D` for crest/valley fidelity where the feature is; `perFaceTrue3DSag` for the whole-wall heatmap. **Add a non-locus MAX pass** (facet or interval) for scale-tips.
- **Shape:** single-valued radial (uses `rA`).

### 4.7 `bruteNearestOnRadialSurface` / `bruteAnchoredRedPerp` — the trusted brute twin
- **Where:** `labkit.ts:232` (`bruteNearestOnRadialSurface`), `bruteAnchoredRedPerp`.
- **Measures:** the **trusted** nearest foot by a **full 2D scan** (θ 2048–8192 × z 400–1600) — the ground truth the GN projector is checked against. `bruteAnchoredRedPerp` folds it into the worst-N red facets and keeps `min(GN, brute)`.
- **Precision floor:** the scan grid + polish — ≪1e-6mm.
- **Speed:** **expensive.** Worst-40 facets = seconds; **whole-mesh = ~3.4h (infeasible)**. Applied only to the worst facets (the p99 signal lives there).
- **When/how:** the steep-lattice **verdict twin**. When GN and brute disagree, brute wins. `bruteAnchoredRedPerp` returns `gnP99`, `trustedP99`, `gnOver` so you can *see* the overstatement. `trustedP99` is **centroid-anchored** ⇒ ≤ the 4-point `perFaceTrue3DSag` (it corrects GN's centroid overstatement, not the worst-interior).
- **Shape:** single-valued radial.

### 4.8 `sampleTrueRadius` — sampler inversion
- **Where:** `metrics.ts:1503`. Recovers `R(θ,z)` from the `PositionSampler` the mesher uses, by 2D LM-Newton.
- **Failure modes:** Newton on a **non-monotone** wall (twist, double-valued) can converge to the **wrong branch**; no convergence guarantee (keeps best-error iterate); its truth is only as good as the sampler (if that sampler is a bilinear grid, it's grid-bound again — "it fooled a prior session").
- **When/how:** when you must measure against the *exact sampler the mesher used* (CPU↔WGSL parity), not the analytic. Otherwise prefer `rA`.
- **Shape:** single-valued; branch-risk on twist.

### 4.9 `certifyContinuousMappedPatchDistance` / `validatedResidualProgram` — the rigorous certificate
- **Where:** `src/geometry/targetSolid/continuousMappedPatchDistance.ts:625`, `validatedResidualProgram.ts` (mean-value core `:4484`, decimal authority `:1602`), registry `styleOuterWallTargetRegistry.ts`.
- **Measures:** a **rigorous outward-rounded interval bound** on `max |target(u,v) − affineArtifact(u,v)|` over a patch — **continuous**, no sampling, **no nearest-point search** (so it *sidesteps* the GN wrong-well entirely).
- **Algorithm:** verify an exact **dyadic partition** of the unit square into cells mapped 1:1 to artifact triangles; adaptively subdivide; enclose the residual per cell with **two** enclosures over one compiled SSA program — a **decimal authority** (decimal.js, outward→binary64) and a **float64 centered mean-value screen** `r(x) ⊆ r(c) + J(box)·(x−c)`. Accept ≤ budget; over-budget → subdivide; screen-unavailable/max-depth → decimal; still over at max depth → **INCONCLUSIVE (fail-closed)**.
- **Precision floor:** **~1 picometre** (`ceil(mm·1e9)` + binary64 spacing). Walls (affine in height) certify essentially exactly. Limited by **interval blow-up on high-frequency styles**, not arithmetic.
- **Soundness:** outward widening (4·2⁻⁵²; libm 8·2⁻⁵²), error-free add/sub, **Clarke subgradient** for C0 kinks, value-jump straddle → `hullOnly` → forced subdivision. Faithful to the hashed proof text. **Only unsound paths:** platform libm exceeding 8·2⁻⁵² on the acceptance screen (guarded by a ~900-sample test), and the `target→mesh` direction (`geometricImageManifoldProven:false`, assumed).
- **Speed:** per-patch; small/gentle at default budgets; **high-frequency walls exhaust the 6M-cell/100M-unit budget → INCONCLUSIVE.**
- **When/how:** the **certification of record** at 0.01mm and below, per patch. When it says "certifies-at 10µm" it is *guaranteed*, not sampled.
- **Shape:** registry **statically exhaustive over all 20 styles** for the single-valued outer wall; but per-style **discontinuity curtains** are missing for several (HexagonalHive/BasketWeave/CelticKnot/SpiralRidges → fail-closed); closed six-patch solid accepts only discontinuity-free + positive-drain. **Now wired to a LIVE always-on CI gate** (`research/bridge/exactCertGate.ts` — MAX-first, fail-closed `certified = unconvergedCount === 0 && maxCertifiesAtMm ≤ tolMm`, patch-scoped to the outer wall so the rigorous proof runs in ~17s vs ~85s whole-solid). **Now cross-validated against the sampled ruler** (`research/bridge/certCrossValidate.test.ts`, R7 DONE): on the same outer-wall mesh, `measureRadialFidelity.chordMaxMm ≤ max(certifiesAt)` — measured chordMax 0.0168 ≤ cert 0.02 (SOUND), ratio 0.84 (TIGHT). It also proved `buildAnalyticRadiusFn` (src, camelCase params) and the prover's target (canonical-input, snake_case UI params) are the **same surface**. Still **not on the app export path** (a production gate would port `atlas`/`bakeCertifiesAtErrors` to src).

### 4.10 GPU preview raycast — a convergence self-check, NOT a fidelity oracle
- **Where:** `src/renderers/webgpu/raycast/RaycastController.ts`, `preview_raycast.wgsl`.
- **Measures:** ray-marches the exact analytic solid for the **preview render**. Its only self-check (`e2e/_raycast_quality_diag.mjs`) compares two ray-cast hit fields of the **same** solid — **convergence/self-consistency, never mesh-vs-solid.**
- **Failure modes:** the **stationary-camera trap** — never take hit-field readbacks after a mouse drag; camera inertia keeps drifting between reads and fabricates huge phantom "wrong surface" rates. Under-convergence looks like error ("perf IS correctness"; ring-batch `RC_RING=4` cut convergence 877→132ms).
- **When/how:** visual verification of the *analytic solid* (not the mesh). It is **not** a mesh fidelity ruler. **The right GPU oracle — facet→GPU-ray→perpendicular-gap, whole-solid, double-valued-capable, GPU-speed, independent of the CPU tessellation — was never built** (highest-leverage gap, Agent D).
- **Shape:** the solid march is fully 3D (handles overhang) — which is exactly why it would make the best shape-agnostic oracle if turned mesh-vs-solid.

### 4.11 Python oracle — an external SOTA mesher, not a ruler
- **Where:** `research/oracle/oracle.py` (+ adapters), driven by `runStyle.ts`.
- **Measures:** nothing — it **meshes** the `(u,t)` square with gmsh (Frontal-Delaunay/BAMG/embed/quad) + Shewchuk Triangle to feed *alternative* meshes into the TS rulers for "ours-vs-SOTA". The measurement is still done by `perpendicular3DDeviation` (§4.5).
- **When/how:** benchmarking the in-house mesher against SOTA. Not a fidelity oracle.

---

## 5. Quality rulers

### 5.1 `triangleQualityDistribution` — min-angle distribution (the sliver instrument)
- **Where:** `metrics.ts:768`. `{min, p5, median, mean, %below 10/20/30}` via a 0–60° integer-degree histogram.
- **Precision:** 1° (adequate). **Fully shape-agnostic** (pure connectivity/positions).
- **When/how:** gate on **`minAngleDeg`** (depth-invariant). Report `pctBelow20` as *context only* (it dilutes under density).

### 5.2 `triangleQuality3D` / `triMinAngleAndAspect` — aspect + min angle
- **Where:** `metrics.ts:676`, `:962`. `aspect = longest²·√3/(4·area)` (1=equilateral); sliver = `aspect > ASPECT_MAX(100)`.
- **Failure modes:** **divergent degenerate sentinels** — `DEGENERATE_ASPECT=1e9` (JSON-safe) in one, `Infinity` (JSON→`null`) in the other (`:972`): a footgun — serialize bucket *counts*, never raw aspects. `barycentricSamples(4)` = **3 interior points, no centroid** (the comment "15" is wrong) — the worst chord dip near the centroid is under-sampled. In `computeFidelityMetrics` quality runs on a **256k subsample** then extrapolates → the true worst sliver angle is masked.
- **When/how:** the aspect sliver gate. Run on the **full mesh** for the true min; `ASPECT_MAX=100` is a loose bar — minAngle is the real signal.

---

## 6. Topology / watertight / self-intersection rulers

### 6.1 `topologyMetric` — welded directed-edge accounting (the good one)
- **Where:** `metrics.ts:1037` + `buildWeldRemapFast:1105`. `{boundaryEdges, nonManifoldEdges, orientationMismatches}`.
- **Algorithm:** weld by position quantization; pack edge key `lo·2²⁷+hi` into f64 (exact for `lo,hi<2²⁶`), sort, count. **Fixes the real 2²⁴ Map-cap crash** on 8M+ tri meshes; fuzz-verified vs the naive reference incl. an 11.5M-tri case.
- **Failure modes:** welds by **grid cell, not distance** — two vertices `<tol` apart in adjacent cells don't weld (false boundary); the mechanism behind "UV-only tests overstate seam cracks". Consistent across weld paths (not a divergence).
- **When/how:** the watertight/orientation verdict. **The one metric already meeting the shape-agnostic/by-index bar.**
- **Shape:** fully general (index-based).

### 6.2 `topologyDiagnostics` / `collectTopologyUses` / `nonManRawBig` — the diagnostic path
- **Where:** `metrics.ts:1146,1176`; `nonManRawBig`/`nonManRawBigStats` in labkit.
- **Failure modes:** the diagnostic path still builds a full `Map<string>` first → the **27.3s / 2²⁴-cap risk persists** on multi-million-tri meshes (only the *count* path was hardened). Use labkit's `nonManRawBig` (sorted-key run-length, no cap) for large meshes.

### 6.3 `selfIntersection` — bounded self-intersection detection
- **Where:** `src/geometry/selfIntersection.ts`. Set-cap crash (2²³/2²⁴) **fixed** (dedup confirmed-only, `maxPairs=10000`, scale-tested).
- **Failure modes:** can **under-count** (saturates at the cap; skips shared-vertex folds) — never over-counts. Cell size = mean AABB extent → a few big cap triangles in a fine mesh cause a **binning perf cliff** (cost, not memory).
- **When/how:** an export sanity check; treat a nonzero count as "definitely bad", a zero as "no *detected* intersection up to the cap".

### 6.4 `exportValidation` — the blocking download gate
- **Where:** `src/geometry/exportValidation.ts`.
- **Failure modes:** ① **re-implements** boundary/non-manifold counting with the **un-fixed `Map<string>`** (`:238`) — the same `RangeError: Map maximum size exceeded` / 27s-stall the `topologyMetric` fast path already solved, on the **blocking download path**; ② **watertight tolerance diverges 10×** from the internal gate: `1e-3` here vs `WELD_TOL_MM=1e-4` internally, and `types.ts:68`'s comment **falsely claims they match** — a 0.1–1µm seam passes one gate and fails the other.
- **When/how:** the pre-download guard. **Share the numeric-key path** from `metrics.ts`; reconcile the tolerance.

---

## 7. Certification harnesses (what wraps the rulers into a verdict)

| Harness | Where | Measures which mesh, with which ruler | Traps |
|---|---|---|---|
| `featConformAll20` (fl3d) | `research/bridge/featConformAll20.test.ts` | the **inhouse lab kernel** mesh, via `featureLineChord3D` | **no fidelity gate; prints p99 first** — the exact shape of the DS "0.009" false-cert; loci-blind to scale-tips (§4.6). |
| `_breadth*` | `research/bridge/_breadth*.test.ts` | a **structured lab wall**, via `perFaceTrue3DSag` | facet-sampled; inherits GN wrong-well. |
| certifies-at bake (`bakeCertifiesAtErrors`) | `research/bridge/_certifiesAtBakeLib.ts`, roster `_certRoster.ts` | the **annular certified STL**, via the rigorous interval bound (§4.9) | rigorous MAX-gate @0.01mm — but a **linear ladder walk** (not bisection, despite the doc) on a **fixed** mesh; roster = **12 small/gentle pots, 11 styles**, 9 hard styles absent, **zero at production-default scale**; roster is a **hand-copy** of `CERTIFIED_POTS` with no sync test. |
| `_analytic_floor` (PEC twin) | `research/bridge/_analytic_floor_lib.ts` | the **production twin**, via `scoreForward`+`scoreCoverage` (both directions + Newton) | SpiralRidges only. |
| `dualGate` (the one CI magnitude gate) | `src/fidelity/dualGate.test.ts` | a **static baseline JSON** | certifies on **p99**, excludes **6/20 styles by hardcoded name**. |
| ceilings/floors (`crestAlignedCeiling`, `warpDomainCeiling`, `capJunctionFloor`, …) | `src/fidelity/*Ceiling.ts` | dev-build instruments | many **pass-shape-only** (assert structure, log magnitude, never gate it — false "quality green"). Solid exceptions: `crestLateralDeviation`, `snapPlacementAudit`, `dyadicWarpFloor` (real 15° floor), `verify_degenerate_coverage`. |

**Governance reality:** **no gate is wired into production.** Every gate lives in dev-only `windowHook.ts` (`import.meta.env.DEV`); production `tierC` imports only the `AnalyticRadiusFn` *type*. "Certification" = CPU instruments + one CI test pinned to a frozen baseline + numbers a human copies into a registry. Until recently there was **no live true-3D MAX gate anywhere**; `research/bridge/exactCertGate.test.ts` now adds one — an always-on CI gate running the rigorous interval prover on a gentle outer wall at 0.01mm (fail-closed) — but it is **one config, not all-style / all-scale / on the app export path**. The four sampled true-3D harnesses still **each measure a different mesh**, but the unified `measureRadialFidelity` is now **soundness-cross-validated against the rigorous prover** on the same mesh (`certCrossValidate.test.ts`, R7): sampled ≤ certifiesAt, tight (ratio 0.84).

---

## 8. potscope — the STL-level session tool
- **Where:** `research/tools/potscope/potscope.mjs`.
- `view --error`: renders a per-triangle **certifies-at** overlay — the smallest ladder rung {2.5,5,10,20,…640}µm at which a triangle is *guaranteed* (interval, §4.9) within the exact analytic target. Ground truth = the prover reading the float32 STL bytes; bound to the STL by 3 SHA-256 + a viewer count guard. **Single source of truth**, no metric duplication.
- **float32 STL is a non-issue at 0.01mm:** half-ULP for a 150mm pot ≈ 0.0076µm/coord (≤0.013µm 3D, ~750× below the 10µm bar) and it's *inside* the certified bound. `.pack` round-trips exactly.
- **Traps:** `decode` is hard-coded to the GothicArches model (silently applies it to any style); `--error` covers only the enumerated roster.

---

## 9. Failure-mode index (fast lookup)

| Failure mode | Afflicts | Mechanism | Mitigation |
|---|---|---|---|
| **p99-masking** | dualGate, featConformAll20, wall p99 | p99 hides the worst 1% (scale-tip cones) | certify on MAX |
| **MAX-masking by sampling** | `computeFidelityMetrics` (64k), quality (256k) | strided subsample of a structured mesh aliases; max over a subset ≤ true max | MAX on full mesh |
| **loci-blind MAX** | `featureLineChord3D`/fl3d | non-locus facets (tip cones) carry no locus → never sampled | add a facet/interval MAX pass |
| **p99 quantization** | `wallDeviation`, `wallChordError` | 0.05mm histogram buckets, lower-edge report | exact percentile / ≤0.002mm bins |
| **grid-bound reference** | `buildRadialReference`/sag | 720×400 mean bins + dilation fabrication | score vs exact `rA` / interval |
| **radial overstatement (2–370×)** | radial rulers on steep relief | distance to P's own azimuth, not nearest | perpendicular / interval |
| **GN wrong-well (~7×)** | `projectPointToRadialSurface` on lattices | coarse search azimuth-local (±0.22 rad) | global seeding / brute twin |
| **centroid pre-filter understatement** | perpendicular chord MAX | bound taken at centroid only, sub-0.04 recorded at radial bound | facet-wide bound, scale with tol |
| **reference artifact (multi-valued)** | `rA` on weave/braid | 2.5D proxy can't store overhang | post-warp GPU / multi-patch |
| **tracked-not-gated exclusions** | analyticSurfaceGate crease bands | cliff facets dropped into `creaseBandMaxMm`, never failed | gate the band (cliffs are features) |
| **Map-cap crash** | `exportValidation`, `topologyDiagnostics` | V8 ~16.7M-entry `Map<string>` cap | numeric packed-key path / `nonManRawBig` |
| **watertight tol divergence** | export gates | `1e-3` download vs `1e-4` internal | reconcile; fix `types.ts:68` comment |
| **stationary-camera phantom** | GPU preview readback | camera inertia between reads | measure stationary, never after a drag |
| **INCONCLUSIVE blow-up** | interval prover on high-freq | interval width explodes past budget | raise budget / curtains / accept INCONCLUSIVE |
| **libm over-accept** | interval acceptance screen | platform libm > 8·2⁻⁵² | widen guard; expand the ULP test |

---

## 10. Which ruler do I reach for? (decision tree)

```
Need a fidelity number?
├─ Just a fast screen while iterating?           → radialAnalyticDeviation (§4.4)  [read MAX, it's an upper bound]
├─ A true-3D verdict on a single-valued style?
│   ├─ smooth / thin-ridge at density            → perpendicular3DDeviation (§4.5)  [chordMax + vertexMax, scale tol]
│   └─ steep tangled lattice (Gyroid/Voronoi/…)  → perpendicular + brute anchor (§4.7)  [GN alone overstates ~7×]
├─ A multi-valued (weave/braid/DS-ring) style?   → measure vs POST-WARP GPU surface or multi-patch, NOT rA (§3)
├─ A RIGOROUS, certificate-grade bound?          → certifyContinuousMappedPatchDistance (§4.9)  [per patch; may be INCONCLUSIVE]
└─ Where does the error concentrate?             → featureLineChord3D on loci (§4.6) + a non-locus MAX pass

Need quality?                                     → triangleQualityDistribution.minAngleDeg (§5.1)  [never %<20°]
Need watertight?                                  → topologyMetric (§6.1); large mesh → nonManRawBig (§6.2)
Need to look at it?                               → potscope view --error (§8)  [certifies-at overlay]
```

---

## 11. Known precision bugs vs the 0.01mm bar (the fix list)

Confirmed by code-read + audit; ranked by impact. (Tracked for the unification work
in `docs/superpowers/specs/2026-07-22-unified-ruler-design.md`.)

1. `computeFidelityMetrics` sags a **64k strided subsample** → `maxSagMm` is not the true max (`metrics.ts:1331`).
2. p99 **0.05mm-quantized** in `wallDeviation` (`:584`) and `wallChordError` (`:1711`).
3. `buildRadialReference` **grid-bound + dilation-fabricated** (`:44`); the persisted `FidelityMetrics` row still uses it.
4. `NEAR_VERTICAL_COS=0.35` routes tip cones onto the **laterally-blind** nearest path and drops conical walls (`:237`).
5. Perpendicular `coarseTrigger=0.1` / `preFilterMm=0.04` **calibrated to 0.1mm**, wrong for 0.01mm; centroid-only pre-filter understates MAX (`analyticSurfaceGate.ts:263,379`).
6. GN **wrong-well ~7×** on lattices (`analyticSurfaceGate.ts:264`, coarse search azimuth-local).
7. NaN chord dev → `rmsDevMm: null` (`analyticSurfaceGate.ts:478,505`).
8. `exportValidation` Map-cap crash on the **download path** (`:238`); watertight tol `1e-3` vs `1e-4` + false `types.ts:68` comment.
9. `barycentricSamples(4)` = 3 interior points, no centroid; comments say "15" (`metrics.ts:212`).
10. Tolerance anchors pinned to 0.1mm: `SAG_TOL_MM`, `SERRATION_TOL_MM`, `REFERENCE_PARITY_EPS_MM=0.05` — 5–10× loose.
11. The rigorous certificate is **not cross-validated** against the sampled rulers (no `perFaceTrue3DSag ≤ certifiedUpperPm` test).

---

## 12. Glossary

- **fl3d** — feature-line 3D chord: exact distance from analytic feature-loci points to the nearest mesh triangle (truth→mesh).
- **chord vs vertex channel** — interior-facet error vs vertex-placement error (§0).
- **ruler floor** — the smallest error a ruler can resolve (its reference's own discretization).
- **wrong-well** — a GN projection stalling in a non-global local minimum → distance overstated.
- **p99-masking** — headlining p99 so the worst few facets (scale-tip cones) don't fail a MAX bar.
- **certifies-at** — the smallest tolerance at which a triangle is *rigorously guaranteed* faithful (interval bound).
- **curtain** — a per-style value-discontinuity handler in the interval prover; absent → fail-closed INCONCLUSIVE.
- **post-warp surface** — the true multi-valued embedding captured after the conforming warp; the correct reference for over/under weaves.

---

_Audit provenance: 7 parallel deep-read agents (CPU core, perpendicular/analytic,
gates/ceilings, oracles, bridge cert, potscope/STL, targetSolid interval prover),
cross-checked against source and against `LAB-CHEATSHEET.md` /
`FRONTIER-KNOWLEDGE.md` / project memory. No production code changed to produce this
document._
