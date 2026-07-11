# E-2026-07-11-TIERC-HEADTOHEAD — pre-registration

**Program:** PROD-TIERC Phase 1 (charter `65f85bbe`; Phase-0 specs `a17ee380`; architecture v1
`5120d1f4`; production baseline = E-2026-07-10-PROD-BATCH verdict `9d3933f7`).
**Registered:** 2026-07-11, BEFORE any scored run. Committed by the coordinator session.
**Question:** does ONE region-based Tier-C implementation (orchestration layer over kernels
K1/K2/K3 per architecture v1 §1) reproduce the DragonScales, Gyroid, and Gothic champions while a
smooth control stays clean, watertight, and in budget — all under the composite gates harness?
**Decision rule (user's, charter §6):** all three champions reproduced + control clean ⇒
architecture PROVEN ⇒ Phase 2. Any failure ⇒ mechanism-level diagnosis naming the failed
contract/kernel/service; iterate or KILL that arm with the named mechanism. No silent scope-shrink.

## Common configuration (pinned)

- Dims `H=120, top_od=100, bottom_od=80 (Rt=50, Rb=40), expn=1, spinTurns=0`; DEFAULT style params
  (`{}`) for every arm. tol = 0.01mm. Tree basis recorded per-row (label uncommitted deltas).
- Harness: S-GATES per `tierc/gates-harness-spec.md` §3 — research metrology stack (decision A3),
  row schema §3.3 verbatim, `PF_PT_SHARD/NSHARDS` sharding, `PF_PT_BREADCRUMB` 30s ticks (A10),
  zeroArea floor 1e-12 (A4), weld tolerance stated per-row (default labkit 1e-4), OPEN fields
  written as null/"OPEN" — never fabricated. Non-vacuity witnesses (nonMan control-moved, locator
  self-check <1e-9) mandatory on every row; a row without them is VOID.
- G2 reverse coverage runs for EVERY arm (first time for the Gothic mechanism family).
- Integration seam: the region layer replaces the OUTER-WALL build only, behind a NEW dev flag
  (default OFF); flag-off byte-identity proven by the rebaseline pattern BEFORE any scored arm.
  Inner wall/rim/base/cap/weld = `WatertightAssembly` unchanged.
- Ops: coordinator hosts all runners; per-shard timeout wrappers; stage-aware watchdog at 600s
  against the 30s tick cadence; AboveNormal only; max 4 concurrent heavy forks; direct
  `node node_modules/vitest/vitest.mjs` invocation.

## Baseline rows to beat (production, E-2026-07-10-PROD-BATCH `9d3933f7`)

| style | verdict | forward | Newton-worst | coverage max | basis |
|---|---|---|---|---|---|
| FourierBloom (control) | SHIPPED-CLEAN | 0 over | ≤tol | ≤tol | literal |
| GyroidManifold | REGRESSION | 105,107 literal | 0.0590 | 0.0987 | literal carried (FAST-HONEST-RULER) |
| DragonScales | special-ruler | body 6,158 literal / ring 71,355 @8/16 (6.353%, max 0.0700) | — | wall 72.1% area >tol | V11g composite two-population |
| GothicArches | REGRESSION | 33,345 @stride 4 | 0.3460 (max-across-shards) | **1.2318** (batch-largest) | fresh, merged 4 shards |

## Arms (run order D → A → B → C; each arm's scored run only after its build items land)

**Arm D — smooth control (FourierBloom).** One R-CDT region, zero curves, zero pins, standard
assembly. PASS = every gate green at tol; outer tris within ±5% of production; quality
distribution not worse than production's on p5MinAngle/%<20°; G7 full-pot. FAIL here kills the
orchestration layer itself (null case) — nothing else runs until D passes.

**Arm A — Gyroid.**
- A1 (locus fix through the manifest anatomy provider, decision A7): reproduce
  `champion-spec-gyroid.md` §5.4 — extraction 28,785 pts/~2,045 polylines @stepMm 0.15, placement
  ≤0.001mm; outer 2,242,987 ±5% (+18.5% ±3pp vs 1,892,112 baseline); stratified outliers
  ~31,114 ±15%; Newton-worst 0.024917 (exact if same locus); coverage max 0.0253 ±10%; 100%
  knee-adjacent / 0 off-band / 0 wall-band (any off-band reappearance = the K3 single-midline-trap
  signature ⇒ HALT and reclassify).
- A2 (2-locus CDT fan fix; G4 blocker): nonManRawBig 0 (non-vacuous) on both stepMm configs, TDD
  on the two banked step-invariant loci (u,t)=(0.6448,0.8931),(0.4384,0.4421). Remedy order:
  force-refine multi-curve cells to featureLevel+1 first; fan-consistency post-pass if that fails.
- A3 (pins at scale — S-RESIDUAL; own sub-prereg appended here before it runs): primary design =
  analytic knee pre-seed from `wallIsolevels()` loci (untested; single-pass); fallback =
  worst-sag Newton recovery (§V11aa recipe: knee + 6-ring spread 0.0008, pinInjected). Report
  LITERAL before/after counts. Pre-named redirect: if the residual proves edge-class
  (contour-length-distributed, not isolated spots), A3 KILLs and redirects to a chord-ladder
  lever, priced separately — that outcome is a finding, not a failure of this prereg.
- Arm A "reproduced" = A1 within tolerances AND A2 green. A3 reports its own verdict
  (target: literal every-facet ≤0.01 at outer ≤7.0M tris, per gyroid-spec §5.3(a); if unreachable,
  the priced frontier curve + exact residual classification).

**Arm B — DragonScales.**
- B0 (boundary-contract toy, decision A2 — runs BEFORE B1): one ring at z=60 between two body
  bands; contracts (a) structured transition band, (b) railLines force-registration, (c) reversed
  adoption — tried in that order until one passes: watertight non-vacuous 0, ZERO T-junctions on
  the seam chains, riser serration ≤0.001mm on the embedded ring. If none passes, Arm B KILLs
  with the contract named — the architecture claim for R-STRUCT↔R-CDT adoption fails, and that is
  the finding.
- B1 (full outer wall: 7 R-STRUCT ring bands + 8 R-CDT body bands + standard assembly), scored on
  the V11g composite ruler, two populations never blended: **T1** ring-band ≤3,300 outliers +
  ≤100 C0-straddle tail, max ≤0.05, rate ≤1.0%, wall-coverage-over ≤10% (vs 72.1%); **T4** outer
  ≤4,549,600 tris AND ring-local density (tris per 1mm z-bin at rings) measurably DOWN vs
  production's 130–175k; **T5** nonMan 0 / zeroArea 0 / %<20° <10% / serration ≤0.001mm.
  Report T2 (body ≤6,200), T3 (total ≤10,000), T6 (rim-attachment max ≤0.02 reported separately),
  T7 (generate time, honest) regardless. **DS "reproduced" = T1∧T4∧T5** (ds-spec §5 kill rule).
  The 0.0461 sheet cliff floor is REPORTED as the known frontier — not claimed, not hidden.
- Deviation note (pre-declared): B1's body uses K1 adaptive machinery, NOT the champion's uniform
  sheet (decision A6, measured basis ds-spec §4.7). T1's ring numbers remain the champion's.

**Arm C — Gothic (patch scope, decision A5).**
- C1: region layer dispatches the patch domain to K2; reproduce the CI gate exactly —
  u∈[0,0.125], t∈[0.48,0.52], bgArc 0.6, ruler nTheta 512: outliers 0 (every free facet), max
  ≤0.0101, watertight non-vacuous, tris ≤9,917 / passes ≤7 to match; PLUS the quality report the
  current suite omits (triangleQualityDistribution + needleCount) and G2 coverage on the patch.
- C2 (recommended): 2-bay research build to literal 0 at ≤30,323 tris; %<20° reported against the
  banked 19.0%/minAngle-0° concession. The concession is a REPORTED comparison, not a gate — the
  element-level fix is Phase-2 research (13 levers refuted).
- The 0.117 production-band frontier is explicitly OUT (Phase-3-adjacent; requires un-wired
  flankBand + seam-share). G7 for Arm C = patch-NA, declared here.

## Build items gating the arms (architecture v1 §6)

1→2 (harness: new `research/bridge/tierc_gatesHarness.ts` + TDD; zeroArea canonical local until
labkit quiets; needleCount exposed) → 3 (manifest v1, 4 styles) → 4 (region layer core + dev flag
+ byte-identical-off gate) → 5 (B0 toy) → 6 (A2 fan fix) → 7 (A3 pin plumbing) → arm runs.
Shared-file discipline: labkit.ts / metrics.ts / conforming/* hold other sessions' uncommitted
work — new-file-first; any shared-file edit needs GitNexus impact analysis (index fresh as of
2026-07-11, 49,448 nodes) + constructed-blob staging.

## Honesty rails

Stratified estimates never serve as acceptance bases (literal shard runs for verdicts). Any
config/tolerance change after first scored run = a new labeled arm, never an edit. Every
kill names its mechanism. Control-arm regressions outrank champion wins — a champion "win" that
degrades D is an architecture failure. All rows carry tree-basis labels.

---

## ADDENDUM 1 (2026-07-11, BEFORE any scored run) — integration seam moved research-side for Phase 1

The "Common configuration" bullet "the region layer replaces the OUTER-WALL build only, behind a
NEW dev flag (default OFF); flag-off byte-identity proven by the rebaseline pattern BEFORE any
scored arm" is amended: Phase-1 arms run the region layer ENTIRELY RESEARCH-SIDE, driving the
production kernels through the proven twin-injection seam (AssemblyWallOptions — the same
mechanism as the Delta-2-exact Gyroid twins and Arm B0). No src/ dev flag, no production edit for
the scored arms; byte-identity of production is satisfied trivially (nothing changes). The src
integration seam moves to Phase 2/3 (production wiring of a PROVEN region layer). Rationale:
strict risk reduction with identical evidentiary value — the kernels exercised are the real
production kernels either way. The A2 fan-fix `multiCurveCellPolicy` option (default 'off',
byte-identical off) is unaffected: it is a kernel bug fix, not the region-layer seam. Recorded
before the first scored run per the honesty rails; no scored configuration is altered by this
addendum.

---

## ADDENDUM 2 (2026-07-11, after Arm D run 1 FAIL, BEFORE Arm D run 2) — quality-parity criterion corrected

Arm D run 1 (committed 80b2a3fb) FAILED on "quality distribution not worse than production's on
p5MinAngle/%<20°" by a displayed +0.1pp. Mechanism-level diagnosis
(research/lab/tierc/armD-quality-diagnosis.md): (1) round1 display quantization amplified a
0.0101pp unrounded gap 10x across the 16.75 display boundary; (2) the SCORING-PATH evaluator
(evaluatePackedAssemblyToXyz) double-applied the inner-wall z-mapping on INNER/BOTTOM-TOP vertices
— an instrument bug tainting quality/signedVolume fields only (topology, G1, G2, G6, watertight
provably untainted; the mesher itself was never at fault); (3) true float-provenance noise on the
corrected basis = ONE triangle crossing 20°, worst matched-pair Δangle 0.0117°, below-1° counts
exactly equal. The run-1 FAIL row stands as recorded.

AMENDED QUALITY-PARITY CRITERION (applies to Arm D run 2 and all subsequent arms):
- PRIMARY (same-provenance): for the smooth control, packed-assembly HASH IDENTITY vs a direct
  twin build (no tolerance; already asserted twice, passes). Champion arms baseline quality on
  their same-provenance twins so deltas attribute to region-layer mechanisms, not float pipelines.
- FALLBACK (capture-only baselines): compare UNROUNDED percentages; pctBelow20 ≤ +0.1pp,
  pctBelow10 ≤ +0.05pp, no-new-mass-below-5° ≤ +0.01pp of population — each grounded against the
  measured 0.0002–0.0007pp provenance floor (~150–500x headroom).
- The evaluator one-line fix (validated by the diagnosis probe's evalPackedCorrected reference,
  hash-asserted against the scored mesh) is applied before run 2; run 2 is labeled run=2 in its
  row. Recorded before the re-run per the honesty rails.

---

## ADDENDUM 3 (2026-07-11, after Arm A1) — band-edge SOLID-WATERTIGHTNESS sub-target

Arm A1 reproduced the Gyroid band-edge champion bit-for-bit (3-way hash identity; every fidelity
number Δ0% vs banked). But the composite gates harness's G3 (orientation) + G7 (boundary) coverage
— which no prior Gyroid verdict measured (`_prod_truth` probe and A2 acceptance check only
`nonManRawBig` + `zeroArea`) — revealed that the doubled band-edge construction carries **360
boundary (hole) edges + ~652 orientation-mismatched facets**, PRE-EXISTING at policy OFF, real by
index (weld=0 == weld=1e-4), and ABSENT from the val=0 shipping export (0/0/0). See
`research/lab/tierc/A1-gyroid-reproduction-verdict.md`.

CONSEQUENCE: "Arm A reproduced = A1 ∧ A2" is amended. A1 (fidelity) and A2 (non-manifold) both
PASS, but the band-edge champion mesh is **not yet a watertight, consistently-oriented solid** —
360 holes make it unprintable regardless of fidelity. A new named sub-target A4 is added:

**A4 (band-edge solid watertightness):** close the 360 boundary edges + ~652 orientation
mismatches in the doubled band-edge general-curve CDT. Gate: on the band-edge full assembly,
boundaryEdges 0, orientationMismatches 0, nonManifold 0 (with fanRepair), zeroArea 0 — all
by-index non-vacuous — WITHOUT regressing the A1 fidelity numbers (outer tris ±0.5%, Newton-worst
±5%, coverage ±10%, knee-class 100%). Diagnosis first (why does the per-cell CDT emit open/mis-wound
facets when fed 28,785 doubled-curve points — cell-tiling gaps at near-tangent passes? seam/clip?
sliver drops?), then the minimal fix. **Arm A is NOT "reproduced" until A1 ∧ A2 ∧ A4.**

This does not alter any prior scored row; it names a defect the broader gate coverage exposed.
Recorded per the honesty rails — the harness earned its keep on its first champion run.

---

## ADDENDUM 4 (2026-07-11, after A4 diagnosis) — A4 SPLIT into two pre-registered fix arms

A4 diagnosis (`research/lab/tierc/A4-diagnosis.md`) reproduced the 360/652/3 exactly and SPLIT the
defect: boundary holes 91.4% (329/360) = the near-tangent doubled-curve registry mechanism (A2's
root cause, ~20x wider extent than the 2 known loci, ~65 spots); orientation 98.9% (645/652) = a
DISTINCT u=0/1 seam wrap-stitch defect (one t~0.31-0.33 band, forward/forward seam edge). CdtStats.outer
{inversions:0, drops:0} rules out per-cell CDT drops for both. fanRepair (mult>2 only) structurally
cannot reach mult=1 holes or mult=2 mis-wound edges — hence A1's 360→360 / 652→651.

**A4a (orientation seam — CHEAPEST FIRST, research-side).** Hypothesis: making
`_gyroidContourLib.ts` `linkSegments` periodic-u-aware (stop tearing contours at u=0/1) collapses
the 645-member seam cluster. GATE: orientationMismatches 652 → ≤15 (allow the ~7 genuine
cross-isolevel ones), boundaryEdges UNCHANGED (different mechanism — a drop here would mean
mis-diagnosis, HALT+reclassify), nonMan unchanged, fidelity Δ0% (outer tris, Newton-worst,
coverage, knee-class all unmoved — hash the outer wall). If `linkSegments` is already periodic-aware,
the tear is elsewhere (report where). Verify blast radius before editing the shared lib; prefer an
option/wrapper if wide.

**A4b (boundary holes — kernel, after A4a).** Hypothesis: a `multiCurveCellPolicy: 'snapMerge'`
variant (reuse forceRefineMultiCurveLeaves's same-cell/2-distinct-label detection; WIDEN the
boundary-vertex weld radius in flagged cells; add NO new constraint line — V11q-safe) closes the
329 near-tangent holes. GATE: boundaryEdges 360 → ≤31 (the non-near-tangent remainder), nonMan 0
non-vacuous, zeroArea 0, fidelity Δ0%, default 'off' byte-identical (the A2 hard rule). Impact
analysis on every touched kernel symbol; default-off proven byte-identical before acceptance.

**Arm A "reproduced" = A1 ∧ A2 ∧ A4a ∧ A4b.** Each fix is its own experiment with the kill-criteria
above; a fix that regresses fidelity or the other mechanism's count is a FAIL, reported not tuned.

---

## ADDENDUM 5 (2026-07-11, after A4a) — A4a refuted research-side; both A4 fixes are kernel-layer

A4a (research-side periodic-u contour link) FAILED with proof: `linkSegments` is non-periodic but
NOT the binding gate — `ConformingWall.ts`'s `uMargin` clip (`clipFeaturesToBox`/`clipLineToInterval`)
closes each contour at the seam boundary unconditionally downstream, so a research-side weld can't
help (orientation 652→654; boundary drifted 360→345, tripping the HALT). See A4a-verdict.md. The
proven-safe opt-in `linkSegments(…, periodicU=false)` param is retained as a prerequisite the kernel
fix may consume.

REVISED A4 plan — both remedies are KERNEL-LAYER, on the same conforming region, best batched:
- **A4-orient (was A4a):** `ConformingWall.ts` `clipFeaturesToBox`/`uMargin` + `wrapsSeam` must
  become periodic-aware (mirror constraint points across u±1 / seam-aware winding). Fixture-first
  (synthetic seam-wrapping curve), GitNexus impact (shared by every feature-carrying style),
  default-off/opt-in, byte-identical when off.
- **A4b (holes):** `multiCurveCellPolicy:'snapMerge'` weld-widen in near-tangent multi-curve cells.

SEQUENCING DECISION (coordinator): Gyroid is banked at **fidelity-proven (A1 bit-exact) +
non-manifold-fixed (A2) + watertightness precisely localized to 2 pre-registered kernel fixes**. The
program pivots to BREADTH — C1 (Gothic patch, K2 kernel, cheap CI-scale) then B1 (DS full wall) —
before the Gyroid kernel-watertightness batch, because (a) the decision rule needs all three
champions reproduced, and (b) the harness's G3/G7 coverage on B1/C1 will reveal whether the
seam/boundary defect class is Gyroid-specific or shared kernel behavior — which informs the kernel
fix's scope. A4-orient + A4b run as one focused kernel batch after the breadth pass.

---

## ADDENDUM 6 (2026-07-11, after C1) — Gothic reproduction PASS; two findings; C2 sampler-fidelity sub-target

C1 (Gothic patch, K2/R-REFINE via the region layer) — see `research/lab/tierc/C1-gothic-verdict.md`:

- **Reproduction PASS.** Region-layer R-REFINE dispatch native, bit-identical to K2-direct,
  reproduces the live CI gate exactly (9917 tris / 7 passes / 0 outliers / max 0.0099 @sampler).
- **Finding 1 — seam/boundary defect is GYROID-BAND-EDGE-SPECIFIC.** Gothic K2 patch is clean
  (orient 0, nonMan 0, 239 boundary edges ALL on the patch rim, 0 interior). The Gyroid A4 kernel
  seam-fix is therefore narrow (band-edge CDT only), NOT shared-machinery. Cross-style question closed.
- **Finding 2 — Gothic "literal-0" is faithful-to-the-512²-sampler, not analytic (CAUSE B).** The K2
  kernel meshes+scores against a 512² styleSampler grid that chords the knife-edge crests; the mesh
  is ≤tol on that grid but ~0.17mm off the exact analytic `rA` at crests (3 independent confirmations;
  the sampler grid itself is up to 1.35mm off analytic at 512², shrinking with resolution). The live
  `wholeMesh0Outlier.test.ts` gate asserts faithful-to-grid, not faithful-to-analytic — invisible to
  every prior Gothic verdict.

NEW SUB-TARGET **C2 (Gothic sampler-fidelity):** make the K2 mesh faithful-to-analytic so it meets
the true-analytic 0.01mm standard at the crests. Options (design in the verdict): (a) raise
styleSampler gridRes for knife-edge styles until sampler≈analytic; (b) lift refine-inserted vertices
via analytic `rA` instead of `sampler.position` (elegant, faithful-by-construction). Plus a harness
basis fix: for R-REFINE regions, score G1 against `radialSurfaceFromSampler` OR carry both bases
labeled, never conflated. **Gothic "reproduced" = C1 (done) ∧ C2 (analytic-faithful, new).**

RUNNING TALLY — architecture reproduction is proven across all three kernels (Gyroid K1 bit-exact,
Gothic K2 CI-exact, DS boundary contract confirmed); but the composite harness (true-analytic +
G3/G7) has exposed that each champion carried a previously-unmeasured gap vs the shippable standard:
Gyroid = band-edge holes/orientation (kernel A4-orient + A4b), Gothic = sampler-fidelity at crests
(kernel C2). B1 (DS full wall) remains, then the kernel-fix batch. The audit-first ruler keeps
finding the honest floor below the celebrated wins — exactly its job.

---

## ADDENDUM 7 (2026-07-11, after B1) — DS chain mechanism works; NOT-REPRODUCED (config-explained) + 3 findings; reproduction phase CLOSED

B1 (DragonScales full wall) — see `research/lab/tierc/B1-dragonscales-verdict.md`:
- **Chain mechanism WORKS** — native N=15 R-STRUCT/R-CDT dispatch built end-to-end (first time), 0
  interior boundary holes (DS does NOT carry Gyroid's band-edge hole defect — 4th style confirming
  that defect is band-edge-CDT-specific).
- **NOT REPRODUCED (T1∧T4∧T5 fail)** — but T1/T2/T3 are CONFIG-EXPLAINED (built at K1_TOY_DEFAULTS
  loose sag, no relief-conforming — not a real DS-champion fidelity reading). T4 PASSES.
- **Finding 1 (fix proven, applied):** manifest domain-overlap bug — body regions must stop at
  ringZ∓DS_RING_HALF_BAND_MM, not at ringZ (drives nonManifoldEdges 3584→0).
- **Finding 2:** per-seam winding defect (orientationMismatches 7168 = 7×2×512) at the R-STRUCT↔R-CDT
  adoption boundary — B0's gates never checked winding. Kin to Gyroid A4-orient; needs diagnosis.
- **Finding 3:** undiagnosed 73%+ %<20° quality collapse (both configs — not the overlap bug).

**REPRODUCTION PHASE CLOSED. Head-to-head architecture verdict:** the region-orchestration
architecture is PROVEN to reproduce all three champion kernels through one general path (Gyroid K1
bit-exact, Gothic K2 CI-exact, DS R-STRUCT/R-CDT chain builds + 0 interior holes) + the smooth
control is clean. BUT full "reproduced-to-the-shippable-standard" is achieved by NONE yet — the
composite harness (true-analytic + G3/G7, measuring what no prior gate did) exposed a
characterized gap per champion:
- Gyroid: band-edge 360 holes + 652 orientation (kernel A4-orient + A4b).
- Gothic: 0.17mm off analytic at crests, faithful-to-512²-sampler not analytic (kernel C2).
- DS: manifest overlap (fixed) + seam winding 7168 + 73% quality collapse + needs tight-sizing rerun.

The architecture bet holds; the champions are mechanism-reproducible but each needs its characterized
fix set to meet the true 0.01mm-analytic-watertight-oriented standard. NEXT PHASE = the per-style fix
batches (task #16 + DS Findings 2/3), each with GitNexus impact + default-off byte-identity +
fidelity-Δ0 discipline. The audit-first ruler kept finding the honest floor below the celebrated wins
— across all four arms — which is exactly its job.

---

## ADDENDUM 8 (2026-07-11, after A4b) — snapMerge REFUTED (measured-negative); Gyroid watertightness both blockers open

A4b ('snapMerge' weld-widen for the 360 band-edge holes) — see `research/lab/tierc/A4b-snapmerge-verdict.md`.
FAIL: boundaryEdges 360→426 (WRONG direction, +66). Default-off byte-identical + fidelity bit-identical
(gating correct, merge geometrically harmless where it fires) but the target regressed. Root cause:
`regAddResolve`'s widen search is bounded in absolute (u,t) but not scoped to the flagged leaf's edge
extent — on Gyroid's long near-parallel doubled contours it merges onto topologically-unrelated nearby
points, relocating holes instead of closing them. Committed default-off as a labeled measured-negative
(preserves detectMultiCurveLeaves factoring + the result). **A4b-v2 (untried):** scope the merge
candidate to points registered while processing the SAME flagged leaf (provenance-tagged), not merely
nearby on the grid line. Possibly the same root as A4-orient (cross-cell registry disagreement) —
check during A4-orient.

GYROID WATERTIGHTNESS STATE: 360 boundary holes (A4b-v2 open) + 652 orientation (A4-orient open) — both
remain. Fidelity (A1) + non-manifold (A2 fanRepair) are the only closed pieces. FIX-PHASE TALLY: Gothic
C2 PASS (analytic lever, mechanism-proven, full-patch scale deferred); Gyroid A4b REFUTED-v1;
A4-orient + DS-Finding-2 (winding, may share root) + A4b-v2 + DS-Finding-1/3 remain.
