# Surface-Fidelity Export — Red-Team Review (2026-06-13)

**Artifacts under review:**
- `docs/superpowers/specs/2026-06-13-surface-fidelity-export-design.md` (design spec)
- `docs/superpowers/plans/2026-06-13-surface-fidelity-export.md` (9-task plan, Tasks 0–8)

**Method:** every claim is grounded in `file:line` read in the production tree
(`potfoundry-web/src/...`). Ten attack dimensions + a completeness pass + adversarial
re-verdicts on the high/critical findings. Refuted findings are listed once so we
know they were checked.

---

## 1. Executive verdict

**REWORK before execution.** The plan is well-structured, gated, and reversible, but it
rests on a **factually wrong dominant premise**: that production places final wall
vertices via a bilinear `GpuSurfaceSampler` at DENSE_RES=256, and that "exact per-vertex
eval" (Task 2, the sequenced first/broadest fix) is the load-bearing correction. The
conforming production branch — the default since e60c224 — **already** evaluates every
emitted `(u,t,surfaceId)` vertex exactly on the GPU (`ParametricExportComputer.ts:2702`
→ `evaluate_vertices` in `adaptive_mesh.wgsl:763-789`, `compute_outer_radius`→`style_radius`,
no grid lookup). The "1.35mm/3.4mm" baseline comes from CPU probes that *simulate* a
bilinear path production never takes for positions. Consequently Task 2 is largely a
no-op, its §8.1 gate is self-passing (flag-on == flag-off), and the genuinely dominant,
*unfixed* mechanisms are mis-prioritized: (a) the **sizing/curvature field really does
read the bilinear-256 sampler** so refinement under-resolves crests (Task 7, currently
last), and (b) **straddle from missing/partial feature edges** (Tasks 3–6). Layered on
top are two independently fatal measurement-validity defects: the gate's "true surface"
is config-blind (`STYLE_FUNCTIONS({})` = full-petal SFB, but the **default export** packs
`sf_strength=0` = a smooth pot — the gate would false-fail forever), and the budget
contract is wrong (production caps at the **6M `high`-profile budget**, not 20M, and
silently coarsens/decimates below it). Fix the premises, re-order the tasks, and pin one
canonical truth/measurement target, and the plan becomes sound.

---

## 2. "Is there anything we missed?" — genuinely new gaps (most important first)

These are angles **none of the ten dimensions poked**, surfaced by the completeness pass
and confirmed against code this session:

- **The e2e ship gate measures against a SECOND GPU grid mesh, not the analytic surface.**
  The plan says Task 2/8 "sample the exported mesh vs the analytic surface (via the
  `__pfFidelity` hooks)" (plan:86,173). But `__pfFidelity.measure()` builds its reference
  from `deps.generateReference()` → `gpuExport.generateMesh()`
  (`FidelityHookMount.tsx:75`), a **GPU uniform-grid `ExportComputer` mesh** at
  `FIDELITY_REF_N_THETA=1280 / N_Z=720` (~1.84M tris, `FidelityHookMount.tsx:30-31`),
  then resamples both into a 720×400 radial bin grid (`:27-28`). That reference is itself
  band-limited bilinear at 1280-θ (a sharp cusp is flattened in the *reference* too) and
  routes through `useGPUExport`'s own Z-LUT/tiling/decimation. So Task 8 measures
  "conforming mesh vs a 1280-θ grid mesh," not "vs `exactSurface(u,t)`." This is the
  single most dangerous miss: the ship gate cannot certify §1 as written.

- **STL export silently re-welds + re-orients every mesh (`orientMeshForSTL`), violating
  "no post-hoc repair / connectivity untouched" at the export boundary.**
  `generateBinarySTL` → `orientMeshForSTL(mesh)` runs on **every** STL export
  (`stlExport.ts:350`), building a *separate* `0.001mm` position weld
  (`buildOrientationVertexRemap`, `:240`, `STL_ORIENTATION_WELD_TOLERANCE_MM=0.001` at
  `:53`) and flipping winding by BFS + per-component signed-volume sign (`:304-325`). The
  plan's "no weld anywhere" self-review (plan:189) is false for the bytes written to disk;
  on deep-relief configs the 0.001mm weld can merge near-coincident wall/feature vertices
  the mesher kept distinct (`uses.length !== 2` → BFS orientation silently breaks, `:271-277`).

- **Binary-STL `float32` quantization + per-face normal recompute is an un-gated deviation
  source.** Every coordinate is stored via `setFloat32` (`stlExport.ts:399-416`) and the
  face normal is recomputed from the *quantized* vertices (`:391`). The gate measures the
  in-memory f64/GPU-f32 mesh, never the round-tripped STL bytes — so "drive to the f32
  floor (~tens of µm)" is never tested on the artifact that ships. A near-degenerate sliver
  (explicitly "accepted") can flip normal sign under quantization.

- **The conforming `pos3D` path has NO finiteness guard; a non-finite eval ships into the
  writer's silent `[0,0,0]` origin-collapse.** The legacy path strips non-finite values;
  the conforming branch flows `pos3D` straight to `conformingMesh` with no pass. The only
  backstop is `getVert`'s `[0,0,0]` map (`stlExport.ts:380-382`) — teleporting a wall vertex
  to the pot axis = a spike triangle that passes `assertMeshExportable`. High-relief/
  twisted/belled configs (the §8.2 gate's regime) are exactly where overflow is reachable.

- **WRONG PREMISE (dominant): Task 2 is a near no-op — production final positions are
  already exact GPU eval.** (See §3, Blocking-1.) This is the spec's headline mechanism and
  it is factually wrong for the conforming default path.

- **WRONG PREMISE (foundational): the gate's "true surface" is not the default-export
  surface.** `STYLE_FUNCTIONS('SuperformulaBlossom', {})` = full petals (strength=1), but
  registry default `sf_strength=0.0` flows verbatim into the export → GPU evaluates a smooth
  pot. The gate compares exact-eval(smooth pot) vs true(full petals) → reports ~8mm forever.
  (See §3, Blocking-2.)

- **WRONG PREMISE: the budget ceiling is 6M (profile `high`), not 20M.** Two
  fidelity-degrading actuators (cap-mode coarsening to ≤4× sag; decimation to a 0.2mm error
  ceiling) fire below 6M and are unmentioned. (See §3, Blocking-3.)

- **No signed/geometric validity gate exists** — `assertMeshExportable` is topology-only;
  a folded/inverted/self-intersecting triangle ships green (`exportValidation.ts:312-340`;
  `selfIntersection.ts` is dead code). The warps + exact-eval move geometry twice with only
  parameter-space monotonicity as the safety argument. (See §3, Blocking-4.)

- **Inner wall has zero feature-edge coverage and the plan has zero inner-wall tasks.**
  `compute_inner_radius = compute_outer_radius − tWall` (`adaptive_mesh.wgsl:132-134`):
  full sharp relief, no smoothing — but `WatertightAssembly` gives it no feature/crease
  lines on a false "inner wall is smooth" premise. (See §4.)

---

## 3. BLOCKING issues (fix the spec/plan BEFORE executing)

Only verified high/critical findings + wrong premises. Each has the hole, evidence, and the
exact amendment.

### BLOCKING-1 — Task 2 ("the dominant fix") is a near no-op; production final positions are already exact GPU eval
*(dimensions: watertight-geometry-2, exact-eval-coverage-1/3/4, mechanism-order-1/2/4 — all confirmed; corrected severity high–critical)*

- **Hole:** Spec §2.1/§3.1 and plan Task 2 attribute the 1.35/3.4mm baseline to bilinear-256
  *vertex flattening* and make exact per-vertex eval the broadest, first fix. The conforming
  branch already does exact eval; there is nothing to replace. §8.1 ("vertex-placement
  deviation → ~0 with exact eval") passes with the flag **OFF** and cannot fail — it proves
  nothing. The actual residuals (sizing reads bilinear → under-refined crests; straddle from
  missing edges) are mis-prioritized.
- **Evidence:** `ParametricExportComputer.ts:2702` `pos3D = await this.evaluatePoints(asm.vertices,…)`
  → `:2800-2805` `conformingMesh.vertices = pos3D`. `asm.vertices` = packed `(u,t,surfaceId)`
  (`WatertightAssembly.ts:280`). `evaluatePoints` entryPoint `evaluate_vertices`
  (`:1708-1711`) = `adaptive_mesh.wgsl:763-789`, `compute_outer_radius`→`style_radius`
  (`:126-130`), no grid lookup. Bilinear `GpuSurfaceSampler` (`:2316-2325`) feeds only sizing
  (`ConformingWall.ts:250` `MetricSizingField(sampler)`). Default flag `conformingMesher:true`
  (`contracts.ts:422`). Probes that produce the baseline model production as bilinear:
  `verify_exportSurfaceFidelity.test.ts:106-108`, `verify_maxSagReferenceDomination.test.ts:87-88`.
  Project's own handoff: `NEXT-SESSION-CREST-FIDELITY.md:108` "Final vertices ARE GPU-evaluated
  on the TRUE surface … positions are exact; the defect is topology/orientation, not position."
- **Amendment:**
  - Insert **Task 1.5 (premise verification, BLOCKING):** read the "FIXED/exact" column of
    `verify_exportSurfaceFidelity` (= real production vertices) and confirm vertex deviation
    is already ≈ f32 floor. Re-baseline the headline numbers against the exact column
    (~0.14mm p99 at L8, not 1.35mm).
  - **Re-scope Task 2** from "replace bilinear final positions" to "verify-and-lock the
    exact-eval contract that already ships" (CPU contract: the `(u,t)` list dispatched ==
    `mesh.vertices` u,t columns, connectivity unchanged). Move the `surfaceFidelityExact`
    flag's *real* gating target to the **sizing-surface** change (merge with Task 7), where
    flag-off/on genuinely differ.
  - **Re-order:** promote Task 7 (exact-referenced sizing) and Tasks 3–6 (extractors) ahead
    of Task 2. Feed Task 7 curvature from a direct analytic/dense probe, NOT Task 2's vertex
    eval (which doesn't move positions). Reuse the dormant `MetricSizingField.curvatureFloor`/
    `maxKappa` hooks (`MetricSizingField.ts:42-55`, unwired at `ConformingWall.ts:250`).
  - **Rewrite spec §2.1/§3.1 and §8.1**: state the production residual is (1a) SIZING reads
    bilinear-256 and (1b) straddle from missing edges; demote/delete "vertex flattening."

### BLOCKING-2 — The gate's "true surface" ≠ the default-export surface (SFB strength-0); §8.1/§8.3 SFB gates unsatisfiable
*(dimension: cpu-gpu-truth-divergence-1 confirmed/partial; corrected severity high–critical)*

- **Hole:** Task 1 defines the true surface as `STYLE_FUNCTIONS(styleId, {})`. For
  SuperformulaBlossom the CPU function has **no strength term** → always full petals
  (strength=1). But the default export packs `sf_strength=0.0` → GPU `mix(r0, sf_result, 0)=r0`
  = a smooth pot, and the extractor returns `[]`. The gate compares exact-eval(smooth pot) vs
  true(full petals) and reports the full ~8mm petal amplitude as "deviation" forever; Task 3
  ("no triangle straddling a crest") is vacuous at strength 0 (no crests) yet the gate still
  reports 8mm.
- **Evidence:** GPU `styles.wgsl:53,101-102` (`strength=clamp(p0,0,1)`; `mix(r0,sf,strength)`).
  Registry default `registry.ts:27` `sf_strength:0.0`; store seeds opts from registry
  (`style.ts:65`); export copies opts verbatim (`useParametricExport.ts:312-318`); packer
  defaults `sf_strength` to 0 (`styleParams.ts:93`). Extractor empty at strength 0
  (`FeatureLineGraph.ts:724-725`). CPU truth full petals (`styles.ts:172`, no strength;
  `verify_crossStyleFidelity.test.ts:31` `fn(…,{})`). Note: the spec's pinned SFB@1 numbers
  (`SFB1_PACKED`, `snapPlacementAudit.ts:647`) ARE strength=1 and self-consistent — the bug is
  config-blindness, not that "@1" is dishonest.
- **Amendment:**
  - **Task 1:** make `deviationVsTrueSurface(mesh, styleId, packedParams, dims)` evaluate the
    true surface from the **same packed param representation + dims the export uses** (reuse
    the `SfbWallSampler`/`sfRf` packed-array pattern, generalized), NOT `STYLE_FUNCTIONS({})`.
    Make the config an explicit, echoed gate argument.
  - **Task 0/1.5 (BLOCKING precondition):** a CPU-mirror-vs-GPU-packed truth-parity probe per
    style at BOTH default and cranked configs — quantify divergence before building on it.
  - **Add an explicit gate that the DEFAULT (strength-0) SFB export is faithful to the SMOOTH
    pot** — otherwise "every exported mesh represents the true surface" is untested for the
    config users actually ship by default.
  - Fix spec §9's backwards claim that GPU-exact "avoids" the divergence for default configs
    (for default SFB it is *maximal*: GPU=smooth pot, CPU-{}=full petals).

### BLOCKING-3 — Budget contract is wrong: ceiling is 6M (profile `high`), not 20M; two silent fidelity-degraders unaddressed
*(dimensions: budget-refusal-decimation-1 confirmed-high, -2 confirmed-high; -3 partial-low)*

- **Hole:** Spec §1 says "the only hard cap is the slicer (20M); spend to the f32 floor." The
  binding adaptive ceiling is the quality profile's `maxTriangleBudget` = **6M** for the
  export default `high`. Below it, two actuators degrade fidelity with no refusal: (a)
  construction-time **cap-mode coarsening** (`budgetMode:'cap'`) raises the sag edge-target up
  to `MAX_BUDGET_SCALE=4` → `effectiveMaxSagMm` up to ~0.2mm (4× the 0.05mm tolerance), silent
  telemetry only; (b) **decimation** to a `decErrCeil` default 0.2mm. Tasks 2–6 grow the
  natural mesh, making the 6M cap bite harder → fidelity fixes silently undone.
- **Evidence:** `QualityProfiles.ts:27` default `high`; `:96` `HIGH.maxTriangleBudget=6_000_000`;
  `:17` `MAX_BINARY_STL_TRIANGLES≈21.4M`; `:265-273` `resolveTriangleBudget=min(target,profileMax)`.
  `ParametricExportComputer.ts:1991,2375-2380` `conformingBudget=targetTris`; `:2596`
  `budgetMode:'cap'`; `:2812` `effectiveMaxSagMm=capScale*qMaxSag` (telemetry only); `:2817`
  `if(triCount>conformingBudget)` → decimate. `ConformingWall.ts:221` `MAX_BUDGET_SCALE=4`;
  `:305-339` cap search; `:99-102` "cap is the production default". `decimateConforming.ts:211`
  ceiling `≥0.2`. `ExportPanel.tsx:301` default export → `qualityProfile:'high'`. Spec/plan
  grep: zero hits for `decimat|maxTriangleBudget|6M|budgetMode|capScale`.
- **Amendment:**
  - **Split Task 7 → 7a (sizing) + 7b (budget honesty).** 7b must: under `surfaceFidelityExact`
    decouple the fidelity ceiling from the 6M profile budget (raise to `MAX_BINARY_STL_TRIANGLES`
    or make §1 honest); treat `capScale>1`/`capSaturated` as a **fidelity-refusal trigger**
    (export best-achievable + warning), the same class as decimation refusal; set the decimation
    error ceiling to the resolved tolerance (not 0.2mm) and re-gate decimation acceptance on
    `fidelityGate.maxMm ≤ tol`, not the triangle-quality/topology deltas (which are out of scope
    per the reframe).
  - **Fix the telemetry bug:** `effectiveMaxSagMm = capScale·qMaxSag` is *linear* but sagitta
    ∝ edge², so the reported effective sag is optimistic by up to ~capScale. Drive the refusal
    threshold off the measured `fidelityGate` deviation, not the analytic estimate.
  - **§8.4 must be measured on the FINAL post-cap, post-decimation mesh at the DEFAULT `high`
    profile**, not the pre-budget natural mesh (otherwise the gate is self-certifying).
  - Correct spec §1 with the real chain (6M profile → cap-coarsen ≤4× sag → 0.2mm-bounded
    decimate-or-refuse → 20M slicer write gate).

### BLOCKING-4 — No signed/geometric validity gate; topology-watertight ≠ printable solid
*(dimension: watertight-geometry-1 confirmed; corrected severity high)*

- **Hole:** `assertMeshExportable` (the only blocking export gate) is purely topological
  (boundary/non-manifold/orientation via directed-edge + degeneracy + global signed-volume).
  None detect a locally folded/inverted triangle or geometric self-intersection. `orientOutward`
  makes every triangle edge-consistent by flood-fill regardless of 3D geometry, so a cusp fold
  passes orientation. The construction mesh has no fold check; `selfIntersection.ts` is dead
  code; `decimateConforming`'s fold guard is over-budget-only + delta-gated. The warps + exact
  eval move geometry twice with only (u,t)-monotonicity as the validity argument.
- **Evidence:** `exportValidation.ts:312-340,368-378` (topology only); `WatertightAssembly.ts:738-844`
  `orientOutward` (directed-edge); `ParametricExportComputer.ts:2890` "Validation here is
  REPORTING, not gating"; `decimateConforming.ts:175-192,225,241,316-318` (fold guard
  over-budget + delta-gated); `selfIntersection.ts:11-16` non-blocking, imported only by its own
  test. Warps: `ParametricExportComputer.ts:2636-2699` (u/t/helix mutate `(u,t)` in place).
- **Amendment:** Add `foldedTriangles == 0` (signed 3D per-triangle normal vs area-weighted
  pseudo-normal — reuse `countFoldedTriangles` **unconditionally**, not delta-gated) to the
  shared **Task 1 `fidelityGate`** so Tasks 2–6 inherit it (fold risk is exact-eval + edge
  insertion + warps, not decimation). Run it on the warped+evaluated mesh for each new
  extractor's high-relief case (Tasks 4/5/6). Surface `detectSelfIntersections` as a warning
  (not a hard gate — tolerant/perf-costly at 20M). Add `foldedTriangles=selfIntersections=0`
  to spec §8.5.

### BLOCKING-5 — The e2e ship gate measures vs a GPU grid mesh, not the analytic surface (and can't run in CI)
*(dimensions: plan-tdd-rigor-1 confirmed-high, gpu-unit-testability-1 partial-high, -6 medium; + completeness critic)*

- **Hole:** Plan Task 2/8 "sample vs the analytic surface via `__pfFidelity`." No such
  whole-mesh analytic method exists; `measure()`/`diagnoseWallFidelity` compare against
  `gpuExport.generateMesh()` = a 1280×720 GPU uniform-grid mesh (band-limited, with its own
  decimator), resampled into a 720×400 bin grid → **GPU-vs-GPU**, blind to common-mode kernel
  bugs and flattening the same cusps in the reference. The only analytic instrument
  (`diagnoseCrestLateralDeviation`) is crest-only and refuses on spin/twist. Separately, the
  e2e harness needs a **headed** browser with a real GPU adapter (`playwright.config.ts:27-32`
  "headless Chromium exposes NO WebGPU adapter on Windows"), so the spec's "differential-CI
  gate" (§8.6) cannot run in standard CI.
- **Evidence:** `FidelityHookMount.tsx:75` `generateReference: () => gpuExport.generateMesh()`;
  `:30-31` `FIDELITY_REF_N_THETA=1280/N_Z=720`; `:27-28` 720×400 bin resample.
  `windowHook.ts:548-602` (`measure` compares to `denseVertices`), `:686-696` (`diagnoseWallFidelity`
  same), `:773-774` crest instrument refuses on spin/twist. `export-fidelity.spec.ts:49-53`
  "dense R_true reference is built on the fast GPU uniform grid … not analytic."
- **Amendment:**
  - **Fold into Task 1, not a new task:** extend `fidelityGate` to produce both the CPU
    `deviationVsTrueSurface` AND a thin in-page `__pfFidelity.diagnoseSurfaceFidelity` that runs
    the *same* metric over the REAL exported mesh's emitted vertices against the **analytic**
    surface (CPU `STYLE_FUNCTIONS` mirror or a super-dense GPU-exact grid until deviation
    plateaus), with a red test reproducing the SFB@1 baseline against TRUTH (not the GPU grid).
  - **Re-point Tasks 2 and 8** at `diagnoseSurfaceFidelity`; DELETE the "via the `__pfFidelity`
    hooks" wording that today resolves to `measure()`/`diagnoseWallFidelity`.
  - **CI:** either provision a GPU-capable headed runner (or document a required runner), OR
    capture a real GPU export once, commit it as a fixture, and gate the **STL bytes** in CI
    via `fidelityGate(parseBinarySTL(...))`. Re-label §8.6 as "manual/hardware-gated" until a
    runner exists.
  - **Bring forward a minimal real-GPU smoke** (1 sharp style, flag ON, vs analytic oracle)
    right after the re-scoped Task 2/Task 7, not dead last.

### BLOCKING-6 — Tasks 4/5/6 gates are conditioned on "exact eval + density" (Tasks 2/7) → unrunnable at their position
*(dimension: plan-tdd-rigor-3 confirmed-high)*

- **Hole:** Each extractor task gates on `fidelityGate(style) ≤ tol (with exact eval + density)`
  (plan:121,134,146), but density is Task 7 (after) and the residual over tol is dominated by
  non-extractor flank/chord error. Measured: L7 SFB has 7906 tris >0.1mm, of which only ~1889
  (24%) are extractor-removable straddles; 76% are flank/chord that only Task 7 density fixes.
  The `≤tol` gate is green-by-aspiration at task position.
- **Evidence:** `verify_worstTriangle.test.ts` (1889 straddles / 6017 flank at L7);
  `verify_chordConvergence.test.ts` PART A (L7 5.7% >0.1mm clean flanks); plan gates 121/134/146
  conditioned on density that runs later.
- **Amendment:** Split each extractor gate into (a) an **interim runnable-now** gate = "all
  extracted loci inserted as edges (count>0, ground-truth matched) AND zero triangles straddle
  an inserted locus" (the `verify_worstTriangle` straddle classifier, exact CPU eval, current
  mesh — genuinely red→green), and (b) a `≤tol` surface gate **deferred** to a single
  post-Task-7 cross-style checkpoint (Task 7 or Task 8). Note Task 3 already conforms (Step 4 =
  "flank/exact-eval floor"); only its headline line 108 needs the deferral made explicit.

### BLOCKING-7 — ArtDeco's dominant feature is a C0 t-step JUMP; Task 4's prescribed extractor mechanism cannot extract it
*(dimensions: extractor-feasibility-1 confirmed-high, plan-tdd-rigor-2 confirmed-high, cpu-gpu-truth-divergence-5 medium)*

- **Hole:** Task 4 derives ArtDeco loci "where ∂r/∂u is discontinuous / a marching-squares
  trace, like extractHexagonalHive/extractVoronoi." ArtDeco's largest feature is a hard **C0
  radius jump in the t-direction** (~4.8mm, matching the spec's 4.6mm worst), a horizontal BAND
  (two loci per tier at stepLocal 0.1 and 0.9), invisible to `marchingSquaresZero(∂r/∂u)` (∂r/∂u
  has no sign-cross at the step). The correct template is the analytic horizontal-line family
  (`extractDragonScales`/`extractBambooSegments`). The file's own header even misclassifies
  ArtDeco as "smooth … honestly EMPTY" — an internal contradiction.
- **Evidence:** `styles.wgsl:632` `step_edge=select(0,1, step_local<0.1||step_local>0.9)`,
  `:633` `step_factor=1-step_depth*step_edge` (t-only ⇒ horizontal locus); `styles.ts:950-951`
  same; defaults `types.ts:661-668` (`adStepCount=4, adStepDepth=0.08`). `extractDragonScales`
  `FeatureLineGraph.ts:359-366` (horizontalLine template); `horizontalLine` helper `:232-238`.
  `marchingSquaresZero` `SampledFeatureExtractor.ts:36` (zero-set of continuous field only).
  Misdoc `FeatureLineGraph.ts:53-57`.
- **Amendment:** Rewrite Task 4: (a) emit horizontal-band C0 step edges at
  `t=(tier+0.1)/stepCount` and `(tier+0.9)/stepCount` (model on `extractDragonScales`); route
  these through Task 6's t-band family (`CreaseTWarp` is the downstream pin, the extraction is a
  `horizontalLine` emitter). (b) Add the in-u **fan (vertical) + chevron (diagonal/helical)**
  cusps via marching-squares on ∂r/∂u only if their amplitude exceeds tol after exact eval —
  the chevron is diagonal, so it may need a helix-family pin, not a single general curve. Drop
  the "like Hive/Voronoi" guidance for the dominant feature. Correct the
  `FeatureLineGraph.ts:53-57` "smooth" header. Define `groundTruthCount` (t-bands + fan + chevron)
  before the Step-4 gate can mean anything. First MEASURE the family decomposition (the
  `verify_styleSharpnessClass` uStep/tStep classifier already does this: ArtDeco uStep≈0.92mm,
  tStep≈5.8mm).

### BLOCKING-8 — Crystalline's dominant relief is a non-helical ~8.5mm asymmetry ripple; 12 helical creases can't meet the gate
*(dimensions: extractor-feasibility-3 partial-high, -4 partial-medium)*

- **Hole:** Task 5 reduces Crystalline to "insert the 12 main apex creases via the helical
  family" gated `≤tol`. At defaults the radius has ~38 ∂r/∂u extrema across u, dominated by a
  17-fold **smooth** `crAsymmetry` ripple of ~8.5mm amplitude (phase-independent of the facet
  helices) plus 24 sub-facet cusps. Only 12 of those are true C1 creases; the ripple + sub-cusps
  are tangent-continuous → a DENSITY problem, not an edge problem. Also `k=24/turns=0.8` are
  default-only artifacts (real: `k=crFacetCount=12`, `turns=crHeightPhase·crSubFacets`); at the
  slider-minimum `crHeightPhase=0` the helix slope is 0 → `chooseHelixGrid` REFUSES and the
  creases must route to `CreaseUWarp` (a guard the plan dropped from the blueprint).
- **Evidence:** `styles.wgsl:599` `asym_var=sin(theta*17+t*23)*asymmetry`; `types.ts:656`
  `crAsymmetry:0.15`; measured 38 extrema / exactly 12 C1 creases. `CreaseHelixWarp.ts:151-155`
  IDENTITY when `|turns|<1e-9`; `registry.ts:204` `cr_height_phase` min 0. Dormant sizing levers
  `MetricSizingField.ts:49,55` unwired (`ConformingWall.ts:250`). Blueprint guard dropped (plan:132).
- **Amendment:** Split Task 5: **5a** helical insertion of the 12 main grooves (k=crFacetCount,
  turns=crHeightPhase·crSubFacets from live params), with an explicit `crHeightPhase≈0` →
  `vertical-crease`/`CreaseUWarp` branch (kind selection rule + unit test); **5b** resolve the
  asymmetry ripple + sub-facets via §3.3 density — but this REQUIRES wiring the dormant
  `curvatureFloor`/`maxKappa` (the band-limited sampler under-reads the 17-fold ripple by
  ~1000×), not a generic "exact curvature"; **5c** gate Crystalline `≤tol` only after 5a+2+7,
  with a measurement step confirming the 8.5mm/17-fold ripple is density-resolvable within the
  20M cap, else honest-refusal. Drop the over-conservative "refuse non-integer subFacets"
  (subFacets doesn't control the helix slope). Exercise `crHeightPhase` extremes in the §8.2 gate.

### BLOCKING-9 — Seam handling: §8.1 gate unachievable at seam-adjacent vertices; cross-style baseline double-counts the out-of-scope seam cliff
*(dimensions: seam-closure-1 partial-low, -2 confirmed-medium)*

- **Hole:** `evaluate_vertices` wraps `u_wrapped=u-floor(u)`, so the welded seam vertex carries
  u=0 (one cliff side). §8.1 ("deviation → ~0, grid-independent") is stated with no seam
  exclusion → unpassable on non-periodic styles. Worse, `verify_crossStyleFidelity` (the source
  of "15/20 >0.1mm" and the Task 8 ship gate) sweeps all u in [0,1) with **no** seam/wrap
  exclusion, while every other probe excludes it — so the baseline over-states the in-scope
  deficit and Task 8 will fail for the explicitly out-of-scope seam cliff.
- **Evidence:** `adaptive_mesh.wgsl:775` `u_wrapped=u-floor(u)`; `verify_crossStyleFidelity.test.ts:47-59`
  (no seam exclusion) vs `verify_worstTriangle.test.ts:73,85-86` / `verify_chordConvergence.test.ts:85`
  (DO exclude `cu<seam||cu>1-seam` and u-span>0.5). `GpuSurfaceSampler.ts:89-93` (last cell wraps).
  SFB interior ≈2.66mm but the seam cell ≈6.83mm; SFB max 8.21mm yet p99 only 0.48mm.
- **Amendment:** Bake the seam/wrap exclusion into Task 1's `deviationVsTrueSurface` as the
  single source of truth (exclude any triangle with a vertex at u<seam or u>1−seam OR u-span>0.5;
  size the band from the mesh's actual finest seam-cell, since adaptive meshes are mixed-level).
  Route the Task 8 cross-style sweep through it (don't re-run `verify_crossStyleFidelity` as-is).
  Report the seam band separately so the accepted cliff is tracked, not silently dropped. State
  §8.1 as "deviation → ~0 on all NON-seam triangles." Fix the spec/probe contradiction.

---

## 4. SHOULD-ADDRESS (fix during execution)

- **Inner wall has no feature-edge coverage; plan has 0 inner-wall tasks.** *(coverage-gaps-1,
  partial-medium.)* `compute_inner_radius = compute_outer_radius − tWall` carries full sharp
  relief (`adaptive_mesh.wgsl:132-134`); `WatertightAssembly.ts:230,474` omit features on a false
  "smooth offset" premise. NOTE the warps + shared `minUniformLevel` DO pin inner-wall creases for
  warp-pinned styles, and Task 2's exact eval already lands inner vertices on the true surface —
  so the *real* residual is narrow: inner-wall straddle of **general-curve/CDT** styles
  (HexagonalHive/CelticKnot/Gyroid/Voronoi/SFB-born). **Fix:** first extend `fidelityGate`/Task 8
  to sample `surfaceId=1` (make the hole measurable); then add an `innerFeatureLines` channel only
  to the general-curve tasks (4/5/6), gated by the new inner metric. Measure before adding.

- **STL `orientMeshForSTL` re-weld + re-orient + float32 quantization on every export.**
  *(completeness critic.)* Add a Task-8 sub-step that runs `fidelityGate` + a normal-consistency
  check on the **bytes out of `generateBinarySTL`/`exportTo3MF`** (round-trip via the existing
  `stlRoundTrip.test.ts`), not just the in-memory `MeshData`. Pin the conforming-path behavior of
  the 0.001mm orientation weld vs the 1e-4mm construction weld.

- **Export-gate weld tolerance (1e-3) is 10× looser than construction (1e-4).** *(watertight-geometry-3,
  partial-medium.)* `exportValidation.ts:29` `DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM=0.001` vs
  `fidelity/types.ts:69` `WELD_TOL_MM=1e-4`. Exact-eval onto a cusp can land distinct vertices in
  (1e-4, 1e-3) → the export gate welds them → a manufactured boundary edge that `assertMeshExportable`
  THROWS on, while every plan/e2e gate (which welds at 1e-4) blesses the mesh. **Fix:** add
  `minVertexSpacing3D` to Task 1's gate; thread `topologyWeldToleranceMm: WELD_TOL_MM` into the
  conforming export's `assertMeshExportable`, and assert construction-weld == export-gate weld.

- **Clip-margin straddle band at the shared base/rim rings.** *(watertight-geometry-4, confirmed-medium.)*
  `clipFeaturesToBox` (`ConformingWall.ts:421-431`) strips features within `uMargin/tMargin` of the
  boundary, so a boundary-row flat triangle bridges the cusp even after exact eval + complete
  extractors — contradicting §8.3 "no straddled feature." Measured rim band ≈2.4mm after born
  petals + exact eval. **Fix:** add a band-specific metric (max deviation in t<tMargin / t>1−tMargin)
  to Task 1; either snap crest endpoints onto the shared ring vertices or document the band as an
  accepted residual and exclude it from the Task-3 straddle gate explicitly.

- **Smooth high-frequency styles' density is driven by the band-limited sampler.** *(coverage-gaps-4,
  confirmed-high.)* `MetricSizingField` reads κ off the bilinear-256 sampler with 1/256 FD steps;
  FourierBloom (cos 22θ), WaveInterference, RippleInterference carry mm relief but are filed "chord
  only (small)." Task 7's exact-curvature input must replace κ for ALL styles **and** the quadtree's
  own cell-size test (`PeriodicBalancedQuadtree.ts:348` reads the same sampler). NOTE the finding's
  "curvatureFloor wired only for SFB" is wrong — it is wired for NO production path. Add explicit
  Fourier/Wave/Ripple fidelity cases to Task 7/8; Task 8's gate must measure CHORD on the refined
  mesh, not vertex placement (`verify_crossStyleFidelity` measures placement and cannot detect
  under-refinement).

- **High-relief gate (§8.2) is ownerless; inner-wall fold under deep relief is unguarded.**
  *(coverage-gaps-5, partial-medium.)* No task systematically cranks relief and measures; the legacy
  Laplacian inner-smoothing (`meshBuilder.ts:139-180`) has no conforming analog. A folded inner wall
  is a **self-intersection** that passes topology (`selfIntersection.ts:6-16`), so §8.5 will NOT
  catch it. **Fix:** split a "High-relief + inner-fold sweep" task out of Task 8 owning §8.2; its
  detector must be the 3D fold/self-intersection check (BLOCKING-4), not topology counts; a
  GPU-side curvature-aware inner-offset clamp is cleaner than porting the CPU Laplacian.

- **CPU-vs-GPU truth parity is unverified; twist/bell omitted from the CPU mirror.**
  *(gpu-unit-testability-4 confirmed-high; cpu-gpu-truth-divergence-4 medium.)* The 5.3e-6mm
  "sampler faithful" number is CPU-vs-CPU. Add a Task-8 (or Task-1) CPU-vs-GPU parity gate at
  default AND twisted/belled presets, and either extend the f64 mirror to include `compute_twist`
  + `bellAmp` (promote spec §6 #3 from FUTURE) or assert spin/bell=0 for any CPU-mirror-gated config.

- **`evaluatePoints` readback/TDR cost at 20M is unbudgeted.** *(exact-eval-coverage-6, medium.)*
  `MAX_PARAMETRIC_EVAL_VERTICES_PER_DISPATCH≈4.19M` → ≥5 serial dispatches + a 240MB position
  readback at the cap. Add a Task-7 feasibility sub-gate (readback time/peak buffer/TDR at the
  ceiling); fold a memory/TDR limit into honest refusal.

- **Conforming `pos3D` has no finiteness guard.** *(completeness critic, watertight-geometry-5
  medium.)* Add a finiteness pass on `pos3D` that **refuses/reports** (honest-refusal) rather than
  relying on the writer's silent `[0,0,0]` origin-collapse; add a degenerate/extreme-param probe to
  Task 8.

- **SpiralRidges is absent from the entire design.** *(coverage-gaps-2, partial-low.)* Registered
  style id=2 with a complete helix extractor + live warp, but in no §4 row and no task. Its measured
  deviation is density-resolvable (0.238mm→0.015mm@1024), so add it to the SMOOTH/density row (with
  FourierBloom). The one untested interaction is helix-WARP ∘ exact-per-vertex-eval composition — add
  a SpiralRidges case to Task 2 and the §8.2 sweep. Do NOT build a new extractor.

---

## 5. NICE-TO-HAVE / accepted-risk

- **Cap/drain/foot have no fidelity treatment.** *(coverage-gaps-6, medium.)* The drain is a cylinder
  and the foot can be a sloped frustum; their cap-interior tessellation is `nRing`-driven, not
  curvature-adaptive. Optionally extend `fidelityGate` to sample all surfaceIds; at minimum make the
  spec's "caps carry ~0 error" a *measured* claim.
- **Task 0 type-name nit:** the interface is `PipelineFeatureFlags` (`contracts.ts:313`), not
  `FeatureFlags`; the red test must compile. Add a test that the override-spread branch
  (`resolveFeatureFlags({surfaceFidelityExact:true})`) is exercised, not just the undefined
  early-return. *(plan-tdd-rigor-5, medium.)*
- **f32 quantization at H≈120mm** stays under tens of µm per ULP, so the floor is reachable — but
  only if measured post-quantization (covered by the §4 STL-bytes gate). *(accepted with the gate.)*
- **Cross-style "other styles byte-identical" guard** for extractor tasks has no committed CPU probe;
  point it at `e2e/_mesh_hash.cjs` (e2e) and add a CPU golden for `extractAnalyticFeatures` output.
  *(plan-tdd-rigor-10, low.)*

### Refuted / non-issues (checked, dropped)

- **cpu-gpu-truth-divergence-2 (REFUTED):** the two truth conventions (`SfbWallSampler/SFB1_PACKED`
  vs `STYLE_FUNCTIONS`) are the **same surface** for SFB and already reconciled by
  `verify_cross_consistency` (≤19nm). Only the config-blindness (BLOCKING-2) is real.
- **coverage-gaps-3 (REFUTED):** global twist/bell do NOT move sharp features in (u,t) — `compute_twist`
  is an azimuth-only post-radius rotation (`adaptive_mesh.wgsl:118-124,784-789`); `bellAmp` is a
  t-only radial scale (`styles.wgsl:7-27`). Extractors emitting (u,t) loci are correct under global
  twist/bell; threading global twist into them would be harmful. (Per-STYLE packed twist —
  BasketWeave/SpiralRidges — IS in scope and already received by extractors.)
- **budget-refusal-decimation-3 (downgraded to low):** decimation never ships "applied" today
  (budget-honesty baseline: 0 applied / 17 refused / 25 not-needed); the real degrader is cap-mode
  coarsening (BLOCKING-3), not decimation.
- **plan-tdd-rigor-4 (downgraded to low):** the SFB@1 3.4mm IS reproducible (packed and {} surfaces
  coincide for SFB); add one equivalence-pin test rather than two divergent truth paths.
- **mechanism-order-3 (downgraded to low):** Task 2 is a prerequisite for Task 7's curvature input
  in the spec's framing; the worst case is a straddle owned by Tasks 3–6, so no re-order is needed
  *for this finding alone* (the re-order is driven by BLOCKING-1/3).

---

## 6. Recommended REVISED task ordering / new tasks

Mapping to the existing Task 0–8, with insertions:

0. **Task 0 — flag scaffolding.** Fix type name → `PipelineFeatureFlags`; add override-branch test.
1. **Task 1 — shared `fidelityGate` (EXPANDED).** Truth = **packed-param/WGSL-faithful** surface
   (not `STYLE_FUNCTIONS({})`), config as explicit arg; bake in seam/wrap exclusion +
   `minVertexSpacing3D` + `foldedTriangles==0` + boundary-band metric; provide BOTH a CPU oracle and
   an in-page `__pfFidelity.diagnoseSurfaceFidelity` (analytic, vs the real exported mesh).
1.5 **NEW Task 1.5 — premise verification (BLOCKING).** Confirm production vertices are already exact
   (re-baseline numbers); CPU-mirror-vs-GPU-packed truth-parity per style at default + cranked;
   default-vs-packed config audit + task re-rank.
2. **Task 7a (was 7) — exact-referenced sizing — PROMOTED to here.** Wire dormant
   `curvatureFloor`/`maxKappa`; feed exact/dense curvature to MetricSizingField **and** the quadtree
   cell-size test; flip `verify_maxSagReferenceDomination`.
3. **Task 3 — SFB born petals** (interim straddle gate only; config-pinned; seam/band excluded).
4. **Task 4 — ArtDeco** (t-band horizontal-line emitter via Task 6 family + fan/chevron; measured
   family decomposition first; header fix).
5. **Task 5a/5b/5c — Crystalline** (helix 12 grooves + crHeightPhase=0→CreaseUWarp branch;
   density via curvatureFloor for the ripple; gate after 5a+2+7).
6. **Task 6 — partial extractors + t-bands** (interim straddle gates).
7. **Task 2 (re-scoped) — verify/lock exact-eval contract + finiteness-refusal pass** (no
   position-eval re-implementation; flag now gates the sizing change). Add a real-GPU smoke vs the
   analytic oracle here.
7b. **NEW Task 7b — budget honesty.** Decouple fidelity ceiling from the 6M profile; cap-coarsen +
   decimation → fidelity-refusal on `>tol`; fix `effectiveMaxSagMm` (sag∝edge²); STL-size honest
   refusal (no throw); readback/TDR feasibility gate.
7.5 **NEW Task 7.5 — geometric validity + high-relief/inner-fold sweep.** Fold gate +
   self-intersection warning on the FINAL mesh; crank relief/twist per style; inner-wall fold
   detector + offset clamp; own §8.2.
8. **Task 8 — ship gate (CORRECTED).** Analytic `diagnoseSurfaceFidelity` (not the GPU grid ref);
   measure on the **STL/3MF bytes** (round-trip); all surfaceIds (outer+inner+caps); seam-excluded
   cross-style sweep; CI runner or committed-fixture byte gate.

---

## 7. Dimension scoreboard

| # | Dimension | Headline finding | Status |
|---|---|---|---|
| 1 | watertight-geometry | No signed fold/self-intersection gate; topology ≠ printable; export-weld 10× looser than construction | **Confirmed** (mixed: -3 partial) |
| 2 | exact-eval-coverage | Task 2 is a near no-op — final positions already exact GPU eval; baseline is a CPU bilinear phantom | **Confirmed** |
| 3 | gpu-unit-testability | Dominant fix has no CPU correctness gate; e2e is GPU-vs-GPU and CI can't run it | **Confirmed** (mixed: -2 low) |
| 4 | cpu-gpu-truth-divergence | Gate truth ≠ default-export surface (SFB strength-0); §8.1/§8.3 unsatisfiable | **Confirmed** (mixed: -2 refuted, -3 partial) |
| 5 | extractor-feasibility | ArtDeco = C0 t-step (wrong template); Crystalline = non-helical 8.5mm ripple (gate unmeetable by 12 creases) | **Confirmed** (mixed: -2 medium, -4/-5 partial) |
| 6 | seam-closure | Cross-style baseline double-counts the out-of-scope seam cliff; §8.1 has no seam exclusion | **Mixed** (-2 confirmed, -1 low) |
| 7 | budget-refusal-decimation | "20M only cap" is wrong (6M profile + cap-coarsen ≤4× sag + 0.2mm decimate, all silent) | **Confirmed** (mixed: -3 low, -6 low) |
| 8 | mechanism-order | Exact eval mis-sequenced as dominant; the true dominant fix is the sizing/eval split (Task 7) | **Confirmed** (mixed: -3 low, -5 low) |
| 9 | plan-tdd-rigor | e2e gate samples a non-analytic reference; Tasks 4/5/6 gates conditioned on later tasks; byte-identical is GPU-only | **Confirmed** (mixed: -4/-5/-9 low–medium) |
| 10 | coverage-gaps | Inner wall has zero feature coverage; SpiralRidges absent; smooth high-freq density sampler-blind | **Confirmed** (mixed: -2/-3 partial/refuted) |
| + | completeness critic | Ship gate's "true surface" is a 1280×720 GPU grid mesh, not analytic; STL writer re-welds/re-orients/quantizes | **Confirmed (new)** |

---

**Blocking issue count: 9.**
