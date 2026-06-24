# Dense-Truth Validation Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the partial-reference precision/recall gate with a complete, independent dense-truth gate, so the detector's precision/recall become meaningful.

**Architecture:** A new brute-force `groundTruth.ts` extracts the surface's true feature loci (curvature ridges ∪ normal creases ∪ relief-boundary walls) at uniform high resolution using the SAME signal thresholds as the detector but NONE of its machinery (no two-scale, no fired-cell, no connected-components, no unifier). `validation.test.ts` is rewired to score the detector against this truth, with a calibrated tight tolerance + a tolerance sweep.

**Tech Stack:** TypeScript, Vitest (jsdom), the existing `featureGraph/` module.

## Global Constraints

- Files ONLY under `src/renderers/webgpu/parametric/conforming/featureGraph/`. NO edits to the detector code (Tasks 1–6: `detectFeatures.ts`, the 3 detectors, `unify.ts`, `sampleFields.ts`, `types.ts`) — this is VALIDATION ONLY. NO edits outside featureGraph/ (read-only consumers of `SampledFeatureExtractor`, `SurfaceMetricTensor`, `FeatureLineGraph`, `styles.ts`).
- ESLint 0 warnings (CI fails on any warning). TDD: write the failing test, run it red, implement minimally, run green, commit.
- The truth is **detector-matched-threshold, brute-force-machinery** (spec §3): same `kappaFloor`/`minAngleDeg`/relief-indicator definitions; independence comes ONLY from the brute-force single-scale machinery. Do NOT import or call the detector's tracing/unifier/fired-cell code — reimplement the brute-force extraction simply and obviously-correctly.
- The truth must be **style-agnostic**: no `styleId` branch, no per-style constants anywhere in `groundTruth.ts`.
- Report ACTUAL measured numbers; the controller re-runs the gate and verifies. An honest partial (misses documented with `it.skip` + measured reason) is acceptable; a gamed pass is not. Do NOT weaken the tolerance or metric to pass.
- Reuse where it does NOT compromise independence: `sampleFeatureFields` (field sampling) and `marchingSquaresZero` (the relief contour primitive) are SHARED low-level primitives, fine to reuse. The DETECTOR'S ridge/crease tracers and unifier are NOT — reimplement brute-force.

**Interfaces confirmed from the codebase (use verbatim):**
- `sampleFeatureFields(sampler: SurfaceSampler, opts: {resU:number; resT:number}): Fields` — `Fields` has `kappa: Float64Array`, `nx/ny/nz: Float64Array`, grid row-major node `(i,j)` at `u=i/resU`, `t=j/(resT-1)`, index `j*resU+i` (see `sampleFields.ts`, `types.ts`).
- `marchingSquaresZero(field: (u,t)=>number, resU:number, resT:number, periodicU=false): ContourSegment[]` (see `SampledFeatureExtractor.ts:36`; `ContourSegment` = `{ a:{u,t}; b:{u,t} }` — confirm the exact shape there).
- `FeatureLine` (from `FeatureLineGraph.ts`) has `points: {u:number; t:number}[]`. The metric (`validation.test.ts` `computeMetrics(refLines: FeatureLine[], edges: FeatureEdge[])`, `densify`, `coveredLen`) densifies `line.points` into sub-segments — so the truth must be returned as `FeatureLine[]` (each a 2-point segment or a short polyline). Read the exact `FeatureLine` type and construct minimal compatible objects.
- The detector's relief indicator + `kappaFloor` derivation: replicate the EXACT formula already in `validation.test.ts` (`makeReliefIndicator`, `RELIEF_*` consts) and the detector's `RIDGE_KAPPA_FACTOR/Rchar` kappaFloor (read `detectFeatures.ts`). Truth must use the SAME numbers.

---

### Task 1: Dense relief-wall truth + validate-the-validator

**Files:**
- Create: `src/renderers/webgpu/parametric/conforming/featureGraph/groundTruth.ts`
- Test: `src/renderers/webgpu/parametric/conforming/featureGraph/groundTruth.test.ts`

**Interfaces:**
- Consumes: `marchingSquaresZero` (`SampledFeatureExtractor.ts`), a `reliefIndicator: (u,t)=>number` (same formula as `validation.test.ts` `makeReliefIndicator`), `FeatureLine` (`FeatureLineGraph.ts`), `SurfaceSampler`.
- Produces: `denseReliefWallTruth(reliefIndicator: (u:number,t:number)=>number, res: number): FeatureLine[]` — runs `marchingSquaresZero(reliefIndicator, res, res, /*periodicU*/ true)` and converts each `ContourSegment` into a 2-point `FeatureLine` (`{points:[seg.a, seg.b]}`, plus any other required FeatureLine fields at safe defaults). This is the relief-boundary wall locus at uniform high res — the brute-force global version of what the detector's component-boundary traces only inside fired components.
  - Also export a helper to build the truth's relief indicator from a sampler IDENTICAL to the detector's: copy the `makeReliefIndicator` formula (RELIEF_MEAN_SAMPLES=256, RELIEF_ALPHA=0.5, RELIEF_ABS_FLOOR_MM=1e-3, `|r−meanU(r)|−floor(t)`) into `groundTruth.ts` (or a shared helper) so truth and detector use the same field.

- [ ] **Step 1: Write the failing test — synthetic relief ring.**
Build a CPU `SurfaceSampler` for a smooth cylinder of base radius R0=40 with a single raised ring band at t∈[0.45,0.55] (relief +3mm) — position(u,t) = `[r·cos(2πu), r·sin(2πu), t·H]`, r = R0 + (band? 3 : 0). Assert `denseReliefWallTruth(makeReliefIndicator(sampler), 256)` returns FeatureLines whose points cluster at t≈0.45 and t≈0.55 (the two ring edges), total arclength > 0; and a SMOOTH cylinder (no band) returns ≈ empty (≤ a tiny noise budget).

```ts
// groundTruth.test.ts (intent — fill in exact helpers)
it('relief-wall truth traces a raised ring band edges and is silent on a smooth wall', () => {
  const ring = cylinderWithRingSampler(40, 100, /*bandT*/[0.45,0.55], /*relief*/3);
  const lines = denseReliefWallTruth(makeReliefIndicator(ring), 256);
  const ts = lines.flatMap(l => l.points.map(p => p.t));
  expect(ts.some(t => Math.abs(t-0.45) < 0.03)).toBe(true);
  expect(ts.some(t => Math.abs(t-0.55) < 0.03)).toBe(true);
  const flat = cylinderWithRingSampler(40, 100, [0,0], 0);
  expect(denseReliefWallTruth(makeReliefIndicator(flat), 256).length).toBe(0);
});
```

- [ ] **Step 2: Run → FAIL** (`denseReliefWallTruth` not defined). `npx vitest run src/renderers/webgpu/parametric/conforming/featureGraph/groundTruth.test.ts`
- [ ] **Step 3: Implement `denseReliefWallTruth` + `makeReliefIndicator`** in `groundTruth.ts` (copy the indicator formula from `validation.test.ts` verbatim; call `marchingSquaresZero(..., true)`; map segments→FeatureLine).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Write the validate-the-validator test (cross-check vs exact loci).**
For Voronoi (and Gyroid, HexagonalHive), build the style sampler (reuse `styleSampler` — but it lives in `validation.test.ts`; either export it or build the equivalent `GpuSurfaceSampler` here from `styleSampler`'s logic — read how `validation.test.ts` builds it). Compute `denseReliefWallTruth` and compare to `extractAnalyticFeatures(styleId).lines` (the EXACT worley/TPMS web) using the same arclength-coverage metric: assert mutual coverage (truth-covers-exact AND exact-covers-truth) ≥ 0.8 within a tol (~2mm). This proves the truth machinery reproduces a known-exact locus.

```ts
it('relief-wall truth matches the exact Voronoi web (validate the validator)', () => {
  const s = voronoiSampler();
  const truth = denseReliefWallTruth(makeReliefIndicator(s), 384);
  const exact = extractAnalyticFeatures('Voronoi', packedDefaultParams('Voronoi'), DIMS).lines;
  expect(coverage(exact, truth)).toBeGreaterThanOrEqual(0.8); // exact covered by truth
  expect(coverage(truth, exact)).toBeGreaterThanOrEqual(0.8); // truth covered by exact
});
```

- [ ] **Step 6: Run → PASS** (if it fails, the truth machinery is wrong — fix the extractor, not the test). 
- [ ] **Step 7: Commit** `test(featureGraph): dense relief-wall ground-truth + exact-locus cross-check`.

---

### Task 2: Dense ridge + crease truth (brute-force, detector-independent)

**Files:**
- Modify: `groundTruth.ts`
- Test: `groundTruth.test.ts`

**Interfaces:**
- Consumes: `Fields` from `sampleFeatureFields`.
- Produces:
  - `denseRidgeTruth(fields: Fields, kappaFloor: number): FeatureLine[]` — brute-force ridge: for each node `(i,j)`, mark as a ridge point iff `kappa[idx] ≥ kappaFloor` AND `kappa` is a 1D LOCAL MAX across u (i±1, periodic) OR across t (j±1, clamped). Connect a marked node to its marked 4-neighbours (periodic u) as 2-point FeatureLines. Simple, obviously-correct; do NOT call `curvatureRidge.ts`.
  - `denseCreaseTruth(fields: Fields, minAngleDeg: number): FeatureLine[]` — brute-force crease: for each grid edge (node (i,j)↔(i+1,j) periodic, and (i,j)↔(i,j+1)), compute the angle between the two unit normals (`nx/ny/nz`); if `> minAngleDeg`, emit that edge as a 2-point FeatureLine. Do NOT call `normalDiscontinuity.ts`.

- [ ] **Step 1: Write the failing tests.**
(a) Ridge: a cosine ripple surface `r = R0 + amp·cos(2π·k·u)` (k=6, amp=4) → `sampleFeatureFields` at res 256 → `denseRidgeTruth(fields, kappaFloor)` returns ridge lines clustering at the 6 crest u-positions (`u = m/6`) and 6 valley positions; a smooth cylinder → empty.
(b) Crease: a surface with a sharp V-groove across t at t=0.5 (normal flips) → `denseCreaseTruth(fields, 28)` returns lines clustering at t≈0.5; smooth → empty.
Use a kappaFloor computed the SAME way the detector does (`RIDGE_KAPPA_FACTOR/Rchar`, Rchar from circumference/2π — read `detectFeatures.ts`).

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `denseRidgeTruth` + `denseCreaseTruth` (plain loops over the Fields grid; periodic u, clamped t).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `test(featureGraph): brute-force dense ridge + crease ground-truth`.

---

### Task 3: `denseFeatureGroundTruth` — union + the detector-matched config

**Files:**
- Modify: `groundTruth.ts`
- Test: `groundTruth.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 + `sampleFeatureFields` + `SurfaceSampler`.
- Produces: `denseFeatureGroundTruth(sampler: SurfaceSampler, opts: { res: number; uToMm: number; tToMm: number }): FeatureLine[]` — (1) sample fields at `res×res`; (2) derive `kappaFloor` (detector-matched: `RIDGE_KAPPA_FACTOR/Rchar`, measure Rchar from the sampler exactly as `detectFeatures` does), `minAngleDeg=28`, and the relief indicator from the sampler; (3) return the UNION of `denseRidgeTruth ∪ denseCreaseTruth ∪ denseReliefWallTruth` as one `FeatureLine[]`. No styleId, one config for all styles. (Coincident loci across families need NOT be deduped — the arclength-coverage metric is robust to overlap; keep it simple.)

- [ ] **Step 1: Write the failing test** — a synthetic surface combining the k=6 ripple (ridges) + a V-groove (crease) + a raised band (relief wall): assert `denseFeatureGroundTruth(sampler, {res:256, uToMm, tToMm})` contains all three families (ridge lines near `u=m/6`, crease near the groove, wall near the band edges), and a smooth cylinder returns ≈ empty. Density check: the truth's total arclength is stable (±~10%) between res 192 and 320 (not blowing up = it traces real loci, not noise).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `denseFeatureGroundTruth` (sample fields once at `res`; build kappaFloor/relief indicator; union the three families).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(featureGraph): denseFeatureGroundTruth = union of ridge+crease+wall truth`.

---

### Task 4: Rewire the gate — score detector vs dense truth, tol-sweep, honest 20-style table

**Files:**
- Modify: `src/renderers/webgpu/parametric/conforming/featureGraph/validation.test.ts`

**Interfaces:**
- Consumes: `denseFeatureGroundTruth` (Task 3), the existing metric helpers (`computeMetrics`, `densify`, `coveredLen`) and harness (`styleSampler`, `globalOpts`, `STYLE_IDS`, `runStyle`).

- [ ] **Step 1: Swap the reference truth.** In `runStyle`/`computeMetrics`, replace `referenceLines(styleId)` as the metric's reference with `denseFeatureGroundTruth(sampler, { res: TRUTH_RES, uToMm: U_TO_MM, tToMm: T_TO_MM })`. Keep `referenceLines` available as a SECONDARY logged cross-reference column (not the gate truth). Pick `TRUTH_RES` ≥ 3× the detector fineRes (start 384; tune down only if a style is intractable — see Step 4). NOTE: the `styleSampler` `GpuSurfaceSampler` grid resolution must be ≥ `TRUTH_RES` so the truth isn't band-limited below its sampling res — confirm/raise the grid res `styleSampler` builds (read its current grid size; raise to ≥ TRUTH_RES if needed).
- [ ] **Step 2: Add the tolerance sweep.** Parameterize the metric by `tol` (currently the module-const `TOL_MM=2.5`). Report each style's recall/precision at tol ∈ {0.5, 1.0, 1.8, 2.5} mm in the logged table. Set the GATE tol to the calibrated value `CAL_TOL = U_TO_MM/fineRes ≈ 1.83` (one fine cell — document the reasoning inline, mirroring the existing TOL_MM comment but tightened and justified against the dense truth).
- [ ] **Step 3: Write/Update the gate assertions + table.** Emit a per-style table: `style | recall | precision | #edges | #truthLoci | (sweep cols)`. Assert the gate `recall ≥ 0.9 AND precision ≥ 0.9` at `CAL_TOL` for each style; where a style genuinely cannot meet it, mark `it.skip` (or record) with a SPECIFIC measured reason. Add an assertion that the FLAT cone still yields ≈ 0 detected edges (no-hallucination, unchanged).
- [ ] **Step 4: Run → measure.** `npx vitest run src/renderers/webgpu/parametric/conforming/featureGraph/validation.test.ts`. If a style is intractable at TRUTH_RES (>~20s or OOM), lower TRUTH_RES (but keep ≥ 2× fineRes) and note it. Record the honest table + which styles pass / which are documented misses. Do NOT weaken tol/metric to force passes.
- [ ] **Step 5: Run the whole module** `npx vitest run src/renderers/webgpu/parametric/conforming/featureGraph/` → confirm all green/skip, ESLint 0.
- [ ] **Step 6: Commit** `test(featureGraph): score detector vs dense-truth gate (tol-sweep, 20 styles)`.

---

## Post-plan (controller, not a task)

After Task 4: dispatch the FINAL whole-branch review (most-capable model) over the full sub-project-1 diff (`git merge-base apply/streamlit-fix HEAD`..HEAD), then write the detector result record / GO–NO-GO doc from the dense-truth table, then superpowers:finishing-a-development-branch.

## Self-review

- **Spec coverage:** §3 detector-matched-threshold brute-force truth → Tasks 1–3; §4 extractor module → Tasks 1–3; §5 metric+tol-sweep → Task 4 Steps 2–3; §6 validate-the-validator → Task 1 Steps 5–6; §7 honest table/pass bar → Task 4 Steps 3–4; §8 scope (validation only, this branch) → Global Constraints. Covered.
- **Type consistency:** `denseReliefWallTruth`/`denseRidgeTruth`/`denseCreaseTruth`/`denseFeatureGroundTruth` all return `FeatureLine[]`, consumed by the existing `computeMetrics(FeatureLine[], FeatureEdge[])`. `Fields`/`sampleFeatureFields`/`marchingSquaresZero` signatures match the codebase reads above.
- **No placeholders:** each task has concrete test intent + algorithm + exact reuse/avoid list. The two implementation parameters (TRUTH_RES, CAL_TOL) are given concrete starting values with tuning rules.
