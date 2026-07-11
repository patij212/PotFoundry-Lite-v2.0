# Arm D quality-miss diagnosis — NOISE (with a diagnosis-discovered evaluator bug)

**Program:** PROD-TIERC Phase 1, E-2026-07-11-TIERC-HEADTOHEAD Arm D (coordinator follow-up to the
recorded FAIL verdict; scored row `armD-FourierBloom-1783776573731` in
`research/exchange/tierc/gates.ndjson`).
**Question (coordinator):** is the +0.1pp %<20° miss float-provenance noise (GPU-f32 captured
baseline vs CPU-f64 twin flipping bin-edge triangles) or a structural quality difference in the
region-layer build?
**Method:** `research/bridge/_tierc_armD_qualdiag.test.ts` (env-gated `PF_TIERC_ARMD_QUALDIAG=1`,
config `vitest.tierc_armD_qualdiag.config.ts`) — full min-angle populations for the captured
production artifact vs the region-layer twin, on each mesh's own scored evaluator basis, replicating
`triangleQualityDistribution`'s exact math (metrics.ts:768-837) UNROUNDED; 0.5°-bin histograms;
quantized-centroid triangle correspondence (cell 5e-4mm, 27-neighbour complete, primary tol 1e-4mm).
Raw numbers: `research/exchange/tierc/armD_qualdiag.json` (v2). Nothing scored was changed; Arm D was
NOT re-run; the twin rebuild is hash-asserted (`bf78f51f-693eeace`) against the scored run's own
build crumb — the diagnosis provably measured the scored mesh.

---

## 1. Executive answer

**NOISE — and not even primarily float noise.** The reported +0.1pp decomposes into three stacked
mechanisms, none of them a structural quality difference in the region-layer build:

1. **Reporting quantization (the amplifier).** `triangleQualityDistribution` rounds `pctBelow*` to
   ONE decimal (`round1`, metrics.ts:824). Unrounded scored-basis values: captured **16.7445%** vs
   twin **16.7545%** — a **+0.0101pp** true gap straddling the 16.75 rounding boundary, displayed as
   16.7 vs 16.8. The reported gap is ~10× the real one.
2. **A diagnosis-discovered evaluator bug in the twin (the entire remaining +0.0101pp).** The
   region layer's full-mesh evaluator (`evaluatePackedAssemblyToXyz`, tierc_regionLayer.ts) applies
   the inner-wall z-mapping TWICE for INNER and BOTTOM-TOP vertices (§3). With a corrected evaluator
   on the byte-identical packed assembly, the gap at 20° collapses to **−0.0002pp** (twin marginally
   BETTER).
3. **True cross-provenance float noise (the residual): one triangle.** On the corrected basis,
   exactly **1** matched triangle in 3.14M crosses the 20° boundary between the GPU-f32 captured
   artifact and the CPU-f64→f32 twin; worst matched-pair angle delta **0.0117°**; **zero** pairs
   differ by >0.5°.

The region-layer BUILD is quality-identical to production: the packed assembly is hash-identical to
a direct twin build, 99.9947% of triangles correspond 1:1 within 1e-4mm, and the sub-populations
that don't (the +42-triangle structural delta, 166 vs 124 triangles) contain **zero** triangles
below 20°.

## 2. The +0.1pp decomposed (unrounded checkpoints, full mesh, metric-identical math)

| checkpoint | captured (prod artifact) | scored twin (= Arm D row basis) | Δ (scored) | corrected twin | Δ (corrected) |
|---|---|---|---|---|---|
| %<10° | 9.6338% (302,801) | 9.6572% (303,541) | **+0.0234pp** | 9.6337% (302,803) | **−0.0001pp** |
| %<20° | 16.7445% (526,296) | 16.7545% (526,620) | **+0.0101pp** | 16.7443% (526,297) | **−0.0002pp** |
| %<30° | 36.8366% (1,157,814) | 36.7119% (1,153,908) | **−0.1248pp** | 36.8373% (1,157,850) | **+0.0007pp** |

The coordinator's proposed bin-edge signature test (boundary-distant checkpoints matching while 20°
differs) reads differently than anticipated, and more decisively: the scored basis is NOT clean at
10° and 30° either (+0.023pp / −0.125pp, both spurious — §3), while the corrected basis matches at
ALL THREE checkpoints to ≤0.0007pp. Below-1° counts are **exactly equal** (4,096 both meshes);
below-5° counts differ by 2 (captured 55,548 / corrected twin 55,550) — vs the scored basis's
bug-inflated 56,286 (+738 spurious sub-5° triangles).

## 3. The evaluator bug (found BY this diagnosis; fix identified, deliberately NOT applied)

**Symptom that exposed it:** the v1 correspondence came back bimodal — 49.4% of triangles matched
within 1e-4mm, only 0.34% in (1e-4, 5e-4], 50.3% beyond 5e-4mm. Smooth float noise cannot produce an
empty middle band; a whole surface population was systematically displaced.

**Mechanism** (`tierc_regionLayer.ts`, `evaluatePackedAssemblyToXyz`): the helper
`innerR(theta, t)` internally maps `t → tBottom + t·(H−tBottom)` before evaluating `rA` (:220-221).
The INNER branch (:238-245) passes `tRadius = zHeight/H` into it — so the radius is evaluated at
`z' = tBottom + (zHeight/H)·(H−tBottom)` instead of `zHeight`: a **double application of the
inner-wall z-mapping**. Same for BOTTOM-TOP (:261-268, evaluates at 5.925mm instead of 3mm at the
pinned dims). RIM is accidentally correct (t=1 is the double-map's fixed point). The WGSL reference
(`adaptive_mesh.wgsl:790-800, 830-847`; `compute_inner_radius(θ,t) = compute_outer_radius(θ,t) −
tWall` at `z = t·H`) applies the mapping once.

**Measured magnitude:** 795,088 of 1,571,574 packed vertices (50.6% — the inner wall + bottom-top
population) displaced, max **0.787mm**, tapering to 0 at the rim.

**Why the mesh still passed every hard gate:** the mesher's SAMPLERS (`buildRegionWallGridCPU`)
apply the mapping once — correct, matching `buildWallGridCPU` and the WGSL — so topology, refinement,
and the packed (u,t,sid) assembly are production-faithful (hash-proven). Only the final 3D
evaluation of inner/bottom-top vertices is wrong, and it is wrong CONSISTENTLY on index-shared rings,
so watertightness/orientation are legitimately preserved (G3/G7 zeros are real). The distortion is a
smooth low-gradient radius error, which is why quality moved only ~0.01pp — it redistributed mass
inside 15-30° (see §4's fine table: the 22-23° rows lose ~1,600 triangles on the scored basis) and
minted the +738 spurious sub-5° slivers.

**Taint inventory for the scored Arm D row** (`armD-FourierBloom-1783776573731`):

| field | status |
|---|---|
| g1_forward, g2_reverse | UNTAINTED (outer wall evaluated on the separate, correct path) |
| g6_budget, g3 nonMan/orientation, g7 boundaryEdges | UNTAINTED (index/topology-based; consistency argument above) |
| g3 signedVolumeMm3 = 106,900 | TAINTED (bench-row baseline 110,606; −3.35% — enlarged cavity from inner radii evaluated at higher z) |
| g4 zeroArea/degenerate = 0/0 | value unchanged in practice, basis tainted in principle |
| quality (ALL fields) | TAINTED — measured on the distorted inner wall; corrected-basis values in §2/§4 |

**Exact fix (for the coordinator's decision — not applied, per the no-scored-file-changes rail):**
make the inner helper take z directly: `innerRAtZ(θ, z) = max(rA(θ, z) − tWall, 0.5)`; INNER branch
calls it with `zHeight`; BOTTOM-TOP with `tBottom`; RIM with `H` (unchanged semantics). The corrected
evaluator in `_tierc_armD_qualdiag.test.ts` (`evalPackedCorrected`) is exactly this and is the
validated reference. **Why TDD missed it:** the region-layer suite verifies dispatch/topology
(count-equality vs a direct build) — no test compared evaluated inner-wall positions against an
independent formula. The fix should land with a regression test asserting per-vertex agreement of
`evaluatePackedAssemblyToXyz` with the WGSL formulas on a few packed vertices per surfaceId.

## 4. Histograms (min interior angle, full mesh; counts of triangles)

Coarse, 5° rows:

| angle | captured | scored twin | corrected twin | corrected − captured |
|---|---|---|---|---|
| 0–5° | 55,548 | 56,286 | 55,550 | +2 |
| 5–10° | 247,253 | 247,255 | 247,253 | 0 |
| 10–15° | 179,875 | 180,139 | 179,873 | −2 |
| 15–20° | 43,620 | 42,940 | 43,621 | +1 |
| 20–25° | 60,508 | 56,990 | 60,507 | −1 |
| 25–30° | 571,010 | 570,298 | 571,046 | +36 |
| 30–35° | 780,125 | 778,308 | 780,086 | −39 |
| 35–40° | 582,366 | 585,472 | 582,392 | +26 |
| 40–45° | 409,744 | 412,752 | 409,748 | +4 |
| 45–50° | 189,845 | 189,812 | 189,857 | +12 |
| 50–55° | 20,884 | 20,516 | 20,886 | +2 |
| 55–60° | 2,328 | 2,380 | 2,329 | +1 |

Fine, 0.5° rows, 15–25° (the boundary neighbourhood):

| angle | captured | scored twin | corrected twin |
|---|---|---|---|
| 15.0–15.5 | 7,557 | 7,477 | 7,559 |
| 15.5–16.0 | 6,589 | 6,578 | 6,587 |
| 16.0–16.5 | 5,815 | 5,762 | 5,812 |
| 16.5–17.0 | 5,040 | 5,023 | 5,043 |
| 17.0–17.5 | 4,469 | 4,399 | 4,468 |
| 17.5–18.0 | 3,892 | 3,839 | 3,893 |
| 18.0–18.5 | 3,299 | 3,229 | 3,299 |
| 18.5–19.0 | 2,811 | 2,688 | 2,813 |
| 19.0–19.5 | 2,310 | 2,179 | 2,306 |
| 19.5–20.0 | 1,838 | 1,766 | 1,841 |
| 20.0–20.5 | 1,530 | 1,490 | 1,530 |
| 20.5–21.0 | 1,223 | 1,195 | 1,222 |
| 21.0–21.5 | 922 | 914 | 924 |
| 21.5–22.0 | 755 | 687 | 753 |
| 22.0–22.5 | 1,917 | 1,182 | 1,915 |
| 22.5–23.0 | 4,739 | 3,898 | 4,739 |
| 23.0–23.5 | 6,341 | 6,305 | 6,340 |
| 23.5–24.0 | 9,500 | 9,345 | 9,504 |
| 24.0–24.5 | 14,828 | 13,938 | 14,827 |
| 24.5–25.0 | 18,753 | 18,036 | 18,753 |

Reading: the corrected twin tracks the captured artifact within ±4 triangles in EVERY fine row —
there is no band around 20° where mass moved, and no new low-angle population anywhere (the (a)/(b)
signatures both come back clean on the corrected basis). The scored twin's deviations (e.g.
22.0–23.0° losing ~1,576, sub-5° gaining +738) are the bug's smooth inner-wall distortion, not the
region layer.

## 5. Triangle correspondence (quantized centroid, primary tol 1e-4mm)

| basis | matched | (1e-4,5e-4] band | unmatched twin | unmatched captured | pairs \|Δangle\|>0.5° | worst Δangle |
|---|---|---|---|---|---|---|
| captured ↔ scored twin | 1,551,635 (49.4%) | 10,775 | 1,591,513 | 1,591,471 | 23 | — |
| captured ↔ corrected twin | **3,142,982 (99.9947%)** | 0 | **166** | **124** | **0** | **0.0117°** |

Boundary-crossing flows (matched pairs) + unmatched contributions, corrected basis:

| threshold | captured≥T → twin<T | captured<T → twin≥T | unmatched twin <T | unmatched captured <T |
|---|---|---|---|---|
| 10° | 4 | 2 | 0 | 0 |
| 20° | **1** | **0** | **0** | **0** |
| 30° | 83 | 43 | 26 | 30 |

The scored basis's entire +324-triangle net gain below 20° sat in its (bug-displaced) unmatched
population (257,952 vs 257,628); its matched pairs had 0/0 straddle at 20°. The corrected basis's
unmatched populations — the real ±42-triangle structural build delta plus its re-meshed
neighbourhood — contain **zero** triangles below 20° on either side.

## 6. VERDICT: NOISE

- The true region-layer-vs-production quality difference at 20°, measured on a corrected common
  basis, is **−0.0002pp** (one boundary-crossing triangle, in the twin's favour); at 10°/30° it is
  −0.0001pp/+0.0007pp. There is **no structural quality difference**: no new low-angle mass
  (below-1° exactly equal; below-5° within 2 of 3.14M), no fine-histogram band displaced, zero
  matched pairs with angle change >0.5°, and the 42-triangle topology delta contributes nothing
  below 20°.
- The scored row's apparent +0.1pp was manufactured by two artifacts stacked: a real-but-spurious
  +0.0101pp from the twin evaluator's double z-mapping bug (§3), amplified 10× by `round1` display
  quantization straddling 16.75.
- Float provenance (GPU-f32 vs CPU-f64→f32) is measurable but negligible: worst matched-pair angle
  delta 0.0117°, single-triangle flows at the 10°/20° boundaries.

Standing consequence for the Arm D FAIL: the failed sub-criterion (`pctBelow20NotWorse`) compared a
bug-distorted twin quality row against a differently-rounded banked row. Whether to re-run Arm D
after fixing `evaluatePackedAssemblyToXyz` is the coordinator's call (a re-run was explicitly out of
this diagnosis's scope); on this evidence a corrected re-run passes the prereg's quality clause with
margin ~500× the measured noise floor.

## 7. Recommended parity criterion (for the prereg amendment)

**Primary — same-provenance comparison (recommended).** Score the region-layer twin against a
twin-built baseline, not the GPU capture:

- For the smooth control this is maximally strong and CHEAP: the region layer's packed assembly is
  **hash-identical** to a direct `assembleWatertight` twin build (`bf78f51f-693eeace`, asserted twice
  — the scored run and this diagnosis). The null-case parity criterion should therefore be **packed
  assembly hash identity** (byte-level, no tolerance to argue about), with the quality row reported
  on one evaluation basis for the record. A region layer that changes ANYTHING fails it; ours passes
  it today.
- For champion arms (where the region layer intentionally changes the build), baseline = the
  corresponding same-provenance twin (e.g. the GBE twin for Gyroid) — any quality delta is then
  attributable to the region layer's own mechanisms, not to evaluation provenance.
- Grounding: this diagnosis measured the cross-provenance comparison's noise floor at ≤0.0007pp —
  harmless — but the capture-based baseline forced the comparison through round1-quantized banked
  values whose 0.1pp quantum is ~100× that floor and produced this false FAIL.

**Fallback — tolerance criterion (when only a production capture exists).** The load-bearing fix is
**comparing UNROUNDED percentages** (recompute from the mesh or extend the harness row; never compare
round1 display values — rounding alone manufactured this miss). Then: unrounded pctBelow20 not worse
by >0.1pp AND unrounded pctBelow10 not worse by >0.05pp AND no new low-angle mass (count of
minAngle<5° not exceeding baseline by >0.01pp of the population, ≈314 triangles here). Grounding:
0.1pp sits ~500× above the measured provenance floor (0.0002pp) yet far below real quality-regression
signatures (the B0 uBias incident moved sliver populations by whole percentage points and minAngle to
0.0015°); the coordinator's proposed 0.5pp bound is safe but ~2,500× the floor — looser than needed.
The 5° clause pins the one failure class a single-threshold criterion could miss (new sliver mass
well below the 20° boundary), and this run shows its natural false-positive rate is ~2 triangles.

## 8. Reproduction

- Probe: `research/bridge/_tierc_armD_qualdiag.test.ts` + `vitest.tierc_armD_qualdiag.config.ts`
  (new files; diagnosis-only). Run:
  `NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_ARMD_QUALDIAG=1 node node_modules/vitest/vitest.mjs run --config vitest.tierc_armD_qualdiag.config.ts`
  (~57s total: 24s assembly rebuild, 3 angle scans, 2 correspondences).
- Raw output: `research/exchange/tierc/armD_qualdiag.json` (v2 — three bases, histograms,
  correspondence, bug magnitude).
- Inputs: `research/exchange/_prod_truth/FourierBloom/{full.xyz.bin,full.idx.bin}` (captured);
  packed assembly rebuilt deterministically (hash-asserted) via the exported region-layer/twin
  building blocks; scored-basis evaluation via the UNMODIFIED `evaluatePackedAssemblyToXyz` import.

---

## ADDENDUM (post-fix verification, coordinator-directed — Prereg Addendum 2 / 5f4a959e)

The §3 fix has now LANDED in `tierc_regionLayer.ts` (`innerRAtZ(θ,z)` single-mapping helper; INNER
evaluates at `zHeight`, BOTTOM-TOP at `tBottom`, RIM at `H`), coordinator-directed. Verification
chain, in TDD order:

1. **Regression tests RED-then-GREEN** (`tierc_regionLayer.test.ts`, new block "single z-mapping
   (run-1 bug regression)": 6 tests pinning all six surfaceIds against a strongly z-dependent
   `rA(θ,z)=10+0.5z`). Against the pre-fix evaluator, the two discriminators failed with EXACTLY the
   predicted buggy value (x=9.7750 vs expected 8.5, the double-mapped z'=5.55 evaluation — Δ=1.275mm);
   post-fix the full suite is 12/12 green.
2. **Qualdiag re-run post-fix** (JSON v3; run-1 buggy-basis record preserved as
   `research/exchange/tierc/armD_qualdiag.run1.json`): `movedVerts=0/1,571,574, maxDispMm=0.0000`
   (the production evaluator now IS the corrected mapping), and the imported-evaluator arm reproduces
   §2's corrected numbers verbatim — pctBelow10/20/30 = 9.6337/16.7443/36.8373% (Δ vs captured
   −0.0001/−0.0002/+0.0007pp), correspondence matched=3,142,982, straddle@20 = 1/0, worst matched
   Δangle 0.0117°.
3. **Arm D RUN 2** (`research/bridge/_tierc_armD_run2.test.ts` — a NEW labeled arm per the honesty
   rail, run 1 untouched; run=2 encoded in the runId `armD-run2-FourierBloom-<ts>`, GatesRow schema
   untouched) — scored under Addendum 2: PRIMARY same-provenance packed-assembly hash identity
   (region layer vs in-run direct twin, both asserted, plus identity with run 1's fingerprint
   `bf78f51f-693eeace` since the evaluator fix must not change the assembly), hard gates, and the
   unrounded fallback numbers computed fresh in-run for the record. Row appended to
   `research/exchange/tierc/gates.ndjson`; verdict in the run log/crumbs and the session report.
