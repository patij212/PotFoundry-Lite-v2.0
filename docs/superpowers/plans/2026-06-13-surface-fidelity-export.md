# Surface-Fidelity Export Implementation Plan (REVISION 2 — post red-team + re-baseline)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every exported mesh lie on the true mathematical surface (deviation ≤ tolerance, default 0.05mm; target the f32 floor) — sharp where the model is sharp, smooth where it is smooth — slivers acceptable.

**Architecture (REVISION 3 — edges-only):** Two prior "fixes" were measured away — exact per-vertex eval is a no-op (positions already exact) AND analytic-curvature sizing is a no-op (de-risk + `verify_edgeVsFlank_adaptive`: of 6,786 tris >0.1mm, 96.7% EDGE-attributable, 3.3% out-of-scope seam, 0.06% = 4 tris true sizing residual). **The fix is feature EDGES**: un-defer SFB born petals (the dominant 3.39mm straddle), build the missing ArtDeco (C0 t-step) + Crystalline (12-crease) extractors, complete the partial ones, add inner-wall edges. Plus four cross-cutting correctness defects the red-team found (independent of the above): config-blind gate truth, a 6M-not-20M budget with silent degraders, no geometric-validity gate, and a ship gate that measures a GPU-grid reference instead of the analytic surface. See `docs/superpowers/specs/2026-06-13-surface-fidelity-export-design.md` (Revision 3).

**Tech Stack:** TypeScript; the conforming mesher (`src/renderers/webgpu/parametric/conforming/`); `ParametricExportComputer`; Vitest (CPU fidelity probes in `src/fidelity/`); Playwright/WebGPU (e2e). No new deps.

**Pre-registered gates:** the spec's §8 Stage-0 gates. CPU gates run `npx vitest run src/fidelity/<probe>.test.ts` from `potfoundry-web/`; the e2e/byte gate runs real WebGPU.

**Testability note (honest):** edge + sizing + gate-infra tasks are CPU-analytic → fully TDD'd against the fidelity probes (the dominant fixes). The exact-eval-contract + finiteness pass + budget + geometric-validity are CPU-testable. Only the final byte-level real-GPU export gate (Task 11) is hardware-gated. The analytic-loci derivations (Tasks 5/6) and the per-style `curvatureFloor` (Task 3) are the load-bearing unknowns; each is defined by its measured gate.

---

## File Structure

- Modify: `src/renderers/webgpu/parametric/contracts.ts` — add `surfaceFidelityExact` flag to `PipelineFeatureFlags`.
- Create: `src/fidelity/fidelityGate.ts` — the shared, config-aware, exact-surface deviation gate (DRY): `deviationVsTrueSurface(mesh, styleId, packedParams, dims, opts)` with seam/wrap exclusion + `foldedTriangles` + `minVertexSpacing3D` + boundary-band metric.
- Modify: `src/renderers/webgpu/parametric/conforming/MetricSizingField` usage in `ConformingWall.ts` — wire `curvatureFloor`/`maxKappa`; thread exact curvature into `PeriodicBalancedQuadtree`'s cell-size test.
- Modify: `src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts` — un-defer SFB born petals; add `extractArtDeco` (t-step band) + `extractCrystalline` (12 creases); complete partial extractors; correct the misdoc header; register in `EXTRACTORS`.
- Modify: `src/renderers/webgpu/parametric/conforming/ConformingWall.ts` — `CreaseTWarp` threading for segmented styles; inner-wall feature channel.
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts` — exact-eval contract assertion + finiteness-refusal pass; budget-honesty (decouple fidelity ceiling, refusal, telemetry fix).
- Modify: `src/geometry/stlExport.ts` / `src/renderers/webgpu/parametric/exportValidation.ts` — weld-tolerance reconciliation; `foldedTriangles` gate.
- Create: `e2e/surfaceFidelity.spec.ts` — analytic-truth, byte-level, all-surfaceId ship gate.
- Reuse (gates): `src/fidelity/verify_rebaseline_realpath.test.ts`, `verify_worstTriangle.test.ts`, `verify_chordConvergence.test.ts` + new per-task probes.

---

### Task 0: Feature flag scaffolding (reversible, no behavior change)

**Files:** Modify `src/renderers/webgpu/parametric/contracts.ts`; Test `contracts.test.ts`.

- [ ] **Step 1: Failing test** (add to `contracts.test.ts`) — note the interface is `PipelineFeatureFlags` (`contracts.ts:313`), and exercise the override-spread branch, not just the undefined early-return:

```ts
it('surfaceFidelityExact defaults OFF and the override branch is honored', () => {
  expect(DEFAULT_FEATURE_FLAGS.surfaceFidelityExact).toBe(false);
  expect(resolveFeatureFlags(undefined).surfaceFidelityExact).toBe(false);
  expect(resolveFeatureFlags({ surfaceFidelityExact: true }).surfaceFidelityExact).toBe(true);
  // override-spread must not drop the flag when OTHER overrides are present:
  expect(resolveFeatureFlags({ conformingMesher: true, surfaceFidelityExact: true }).surfaceFidelityExact).toBe(true);
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/renderers/webgpu/parametric/contracts.test.ts` → FAIL (undefined).
- [ ] **Step 3: Add the flag** — in `contracts.ts`: `readonly surfaceFidelityExact?: boolean;` on `PipelineFeatureFlags`; `surfaceFidelityExact: false` in `DEFAULT_FEATURE_FLAGS`; in `resolveFeatureFlags` `surfaceFidelityExact: overrides.surfaceFidelityExact ?? DEFAULT_FEATURE_FLAGS.surfaceFidelityExact` (use `??`, not `Boolean()`).
- [ ] **Step 4: Run, verify PASS** + `npx eslint src/renderers/webgpu/parametric/contracts.ts --max-warnings=0`.
- [ ] **Step 5: Commit** `feat(fidelity): add surfaceFidelityExact flag (default off, reversible)`.

---

### Task 1: Shared config-aware fidelity gate (DRY foundation)

**Files:** Create `src/fidelity/fidelityGate.ts` + `fidelityGate.test.ts`.

Centralize the faithful deviation metric. Truth = the export's CONFIG (packed params + dims), NOT `STYLE_FUNCTIONS({})` (BLOCKING-2: that reports 17.5mm spurious on a default SFB). Bake in: seam/wrap exclusion (band sized from the mesh's finest seam cell), dense barycentric chord sampling (N≥12), `foldedTriangles` (signed normal vs area-weighted pseudo-normal), `minVertexSpacing3D`, and a boundary-band sub-metric. Returns `{ maxMm, p99Mm, fracAboveTol, foldedTris, minSpacingMm, worst:{u,t}, seamBandMaxMm }`.

- [ ] **Step 1: Failing test** — reproduce the SFB@1 straddle baseline against the CONFIG-AWARE truth, and assert ~0 spurious for a flat style:

```ts
import { deviationVsTrueSurface } from './fidelityGate';
import { SFB1_PACKED, SFB_DIMS } from './snapPlacementAudit';
it('reproduces the SFB@1 straddle baseline against config-aware truth', () => {
  const dev = deviationVsTrueSurface(sfbAt1Mesh, 'SuperformulaBlossom', SFB1_PACKED, SFB_DIMS, { tolMm: 0.05 });
  expect(dev.maxMm).toBeGreaterThan(1.0);   // born-petal straddle survives exact vertices
  expect(dev.foldedTris).toBe(0);            // current mesh is not folded
});
```

- [ ] **Step 2: Run, FAIL** (module missing).
- [ ] **Step 3: Implement** `deviationVsTrueSurface` by lifting the dense-sampling + seam-exclusion + straddle logic already proven in `verify_worstTriangle.test.ts` / `verify_rebaseline_realpath.test.ts`, parameterized by `(styleId, packedParams, dims)` for the true surface (reuse the `SfbWallSampler`/`sfRf` packed-array pattern, generalized per style). Add `countFoldedTriangles` (lift the conforming one, run unconditionally).
- [ ] **Step 4: Run, PASS** + eslint.
- [ ] **Step 5: Commit** `test(fidelity): shared config-aware exact-surface gate (fidelityGate)`.

---

### Task 2: Premise verification + re-baseline (BLOCKING — formalize the corrected baseline)

**Files:** Promote `src/fidelity/verify_rebaseline_realpath.test.ts` to a pinned gate; Create `src/fidelity/verify_cpuGpuParity.test.ts`.

The re-baseline (already measured) proves: vertices exact (Task 8 is a contract, not a fix); dominant residual = straddle (3.39mm); sizing under-refines crests (PART B); default SFB is a smooth pot (PART D). Lock these as the corrected baseline and add the CPU-vs-GPU truth-parity probe the red-team requires before building on the CPU truth.

- [ ] **Step 1: Pin re-baseline** — assert in `verify_rebaseline_realpath` that production vertex-placement error < 1e-9mm (exact), straddle fraction > 0 (dominant), and PART D spurious > 1mm (config-blindness). (Already present; confirm green.)
- [ ] **Step 2: Failing test** — `verify_cpuGpuParity.test.ts`: the CPU packed-param surface (`fidelityGate`'s truth) equals the GPU `evaluate_vertices` surface to ≤ 1e-3mm at sampled `(u,t)` for SFB at default AND `@1`. (Run against a committed GPU-eval fixture if no GPU in vitest; mark the GPU side as a fixture.)
- [ ] **Step 3: Implement** the parity probe (CPU truth vs the committed GPU fixture); document any divergence (twist/bell excluded per spec §6).
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** `test(fidelity): pin corrected re-baseline + CPU/GPU truth parity`.

---

### Task 3: ~~Exact-curvature adaptive sizing~~ — **CUT (measured no-op)**

**De-risked + refuted** (`verify_task3_curvatureFloor.test.ts` + `verify_edgeVsFlank_adaptive.test.ts`): production adaptive sizing already meets tolerance on crest flanks (0.006mm median, 1% over); the analytic `curvatureFloor` changes it 1%→1% (+0.24 quadtree levels); the true in-scope sizing residual is **4 triangles (0.06%)** at the base junction. The Rev-2 "0.48mm/100% over" was sampling at the singular cusp tip (an inserted edge, not a cell). **No sizing work is planned.** The dormant `curvatureFloor`/`maxKappa` hooks stay available; wire them ONLY if the cross-style edge-vs-flank probe later surfaces a real clean-body flank residual for some style (gated by that measurement). Edge tasks (4-7) below are the fix.

---

### Task 4: Un-defer SuperformulaBlossom born petals (the dominant straddle)

**Files:** Modify `FeatureLineGraph.ts` (`extractSuperformulaBlossom`, `SF_CREST_FULL_HEIGHT_SPAN`); Test `verify_sfbBornPetals.test.ts` (via `fidelityGate`).

The 3.39mm SFB worst case (26% of >0.1mm triangles straddle) is born outer petals dropped (`SF_CREST_FULL_HEIGHT_SPAN=0.85`). Insert ALL crests with exact birth-`t` endpoints (solve `m(t)=j−0.5` by bisection, as `sfClosedFormParamRidge` does) on grid lines (watertight, `SuperformulaBornCrests.test.ts` pattern).

- [ ] **Step 1: Failing test** — with flag ON, SFB@1 has NO triangle straddling a crest locus (extend `verify_worstTriangle`'s straddle classifier); current → 2168 straddles / 3.39mm.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** — lower `SF_CREST_FULL_HEIGHT_SPAN` to ~0.05 (keep `SF_CREST_MIN_STRENGTH`), insert born crests with exact birth-point endpoints on grid lines.
- [ ] **Step 4: Run, PASS** — 0 crest-straddling triangles; `fidelityGate` SFB@1 max drops to the flank/sizing floor; topology zeros; flag-off byte-identical.
- [ ] **Step 5: Commit** `feat(fidelity): insert SFB born petals as edges — kills the dominant straddle`.

**Gate (spec §8.1, SFB).**

---

> **Cross-style edge-gap evidence** (`verify_crossStyleEdgeGap.test.ts`, uniform-L7/uBias-2, real extractors, exact eval, seam excl — a relative yardstick, not production density). Ranked withFeat max / p99 mm: **ArtDeco 4.69/4.23 (0 feats — TOP gap)**, SFB 3.39/0.39 (born dropped), Bamboo 2.30, BasketWeave 2.00, CelticKnot 1.80 (⚠ consistency CHECK — config-suspect), DragonScales 1.64, GeometricStar 1.60, CelticTriquetra 1.53, Gothic 1.43, Gyroid 1.35, Voronoi 1.02, **Crystalline 0.785/0.40 (0 feats — density-class, DEMOTED)**, Hive 0.59, SpiralRidges 0.12, LowPolyFacet 0.02; smooth (Harmonic/Fourier/Ripple/Wave/Superellipse) ≤0.08 (confirmed no edges). Implementation order: **Task 4 (SFB born) + Task 5 (ArtDeco) first**, then Task 7 partials; Crystalline re-evaluated; CelticKnot needs a config-parity fix before its number is trusted.

### Task 5: ArtDeco feature extractor (C0 t-step band — corrected mechanism) — **TOP edge gap (4.69mm, pervasive p99 4.23, no extractor)**

**Files:** Modify `FeatureLineGraph.ts` (add `extractArtDeco`, fix the `:53-57` "smooth" misdoc, register in `EXTRACTORS`); reference `styles.ts` ArtDeco branch; Test `verify_artDecoFidelity.test.ts`.

ArtDeco's dominant feature is a **C0 radius jump in t** (horizontal band at `t=(tier+0.1)/stepCount` and `(tier+0.9)/stepCount`, `styles.wgsl:632`), invisible to `marchingSquares(∂r/∂u)`. Emit horizontal-band step edges (model on `extractDragonScales` `horizontalLine`, route through the `CreaseTWarp` t-band family of Task 7), PLUS in-u fan + diagonal chevron cusps only where amplitude > tol after Task 3 sizing.

- [ ] **Step 1: Measure first** — `verify_styleSharpnessClass` ArtDeco uStep/tStep (≈0.92mm u / ≈5.8mm t) to fix `groundTruthCount` (t-bands + fan + chevron) before the gate can mean anything.
- [ ] **Step 2: Failing test** — `fidelityGate('ArtDeco', packed, dims)`: zero triangles straddle an inserted t-band locus (interim straddle gate, runnable NOW); current → straddles > 0.
- [ ] **Step 3: Run, FAIL.**
- [ ] **Step 4: Implement `extractArtDeco`** — horizontal-band C0 emitter (+ fan/chevron as needed), register, correct the header. Honest-empty fallback if a config has no sharp features.
- [ ] **Step 5: Run, PASS** — t-bands inserted (count = groundTruth), no straddle; topology zeros; other styles byte-identical.
- [ ] **Step 6: Commit** `feat(fidelity): ArtDeco C0 t-step extractor (corrected mechanism)`.

**Gate (spec §8.1, ArtDeco).** *Discovery risk: the fan/chevron decomposition (spec §9).*

---

### Task 6: Crystalline — **DEMOTED (re-evaluate; measured residual 0.785mm, density-class)**

**Measured (`verify_crossStyleEdgeGap`): Crystalline withFeat max 0.785 / p99 0.40 (uniform-L7) — far below the ArtDeco/SFB/partials gaps.** The red-team's "8.5mm ripple" was the radius AMPLITUDE, not chord deviation: the 17-fold `crAsymmetry` ripple (`styles.wgsl:599`) is SMOOTH and largely density-handled (74k cells >0.1mm but each small). So Crystalline is a DENSITY style, not an urgent edge build.

- [ ] **Step 1: Measure first** — run the SFB-style edge-vs-flank probe on Crystalline's REAL ADAPTIVE mesh (`verify_edgeVsFlank_adaptive` generalized). Decide:
  - if the adaptive sizing already brings it ≤ tol (like SFB) → **NO extractor needed** (close this task);
  - if the band-limited sampler under-reads the 17-fold ripple (clean-body flank residual >tol) → this is the ONE style that needs the dormant `curvatureFloor`/`maxKappa` (the spec §3.2 contingency) — wire it for Crystalline only, gated by this measurement;
  - only if a real C1 crease dihedral straddles → add the 12-crease helical insertion (k=`crFacetCount`, turns=`crHeightPhase·crSubFacets`; `crHeightPhase≈0 → CreaseUWarp` branch).
- [ ] **Step 2-5:** implement only the branch the measurement selects; gate `≤ tol`; topology zeros; byte-identical elsewhere; commit.

**Gate (spec §8.1/§8.2 as selected).** *Lower priority than Tasks 4/5/7 per the cross-style data.*

---

### Task 7: Complete partial extractors + t-bands + inner wall

**Files:** Modify `FeatureLineGraph.ts` (BasketWeave non-axis, CelticTriquetra braid/medallion, GothicArches full, BambooSegments t-bands), `ConformingWall.ts` (`CreaseTWarp` threading; inner-wall feature channel); Test per-style `fidelityGate`.

- [ ] **Step 1: Measure inner straddle first** — extend `fidelityGate` to sample `surfaceId=1` (inner wall); quantify which general-curve styles straddle on the inner wall (the real residual is narrow — warps already pin warp-styles' inner creases, and exact eval lands inner vertices on the true surface).
- [ ] **Step 2: Failing tests** — `fidelityGate` for BasketWeave / CelticTriquetra / GothicArches / BambooSegments (outer) + the measured inner-straddle styles: straddles > 0 where features dropped today.
- [ ] **Step 3: Run, FAIL.**
- [ ] **Step 4: Implement** — complete each partial extractor (general-curve for braided/cellular; `CreaseTWarp` band edges for z-steps); add an `innerFeatureLines` channel for the measured inner-straddle styles only.
- [ ] **Step 5: Run, PASS** — outer + inner straddles eliminated; `fidelityGate` ≤ tol (after Tasks 3–6); topology zeros.
- [ ] **Step 6: Commit** `feat(fidelity): complete partial extractors + t-bands + inner-wall edges`.

**Gate (spec §8.1).**

---

### Task 8: Verify-and-lock the exact-eval contract + finiteness refusal

**Files:** Modify `ParametricExportComputer.ts` (conforming branch: a contract assertion + a finiteness pass on `pos3D`); Test `verify_exactEvalContract.test.ts`.

Production final positions are ALREADY exact GPU eval (`:2701`) — do NOT re-implement. Lock the contract and close the silent `[0,0,0]` origin-collapse (`stlExport.ts:380-382`).

- [ ] **Step 1: Failing test** — assert (a) the evaluated `(u,t)` list == `mesh.vertices` u,t columns (a seam in the pipeline / a CPU mirror of the contract); (b) a synthetic non-finite `pos3D` triggers honest refusal, not a `[0,0,0]` spike.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** — a contract assertion (dev-mode) + a finiteness pass that routes non-finite `pos3D` to the honest-refusal report (Task 9's contract).
- [ ] **Step 4: Run, PASS** — contract holds; non-finite → refusal; flag-off byte-identical.
- [ ] **Step 5: Commit** `feat(fidelity): lock exact-eval contract + finiteness-refusal pass`.

**Gate (spec §8.3).**

---

### Task 9: Budget honesty (decouple ceiling, refusal, telemetry fix)

**Files:** Modify `ParametricExportComputer.ts` + `ConformingWall.ts` (budget logic); Test `verify_budgetHonesty.test.ts`.

The binding ceiling is the 6M profile budget, not 20M; cap-coarsening (≤4× sag) + decimation (0.2mm) degrade fidelity silently (BLOCKING-3).

- [ ] **Step 1: Failing test** — under `surfaceFidelityExact`: (a) the fidelity ceiling is decoupled from the 6M profile budget (raised toward `MAX_BINARY_STL_TRIANGLES`); (b) a config that can't reach tol within the ceiling returns an honest-refusal report (not a silent over-tol/decimated mesh); (c) `effectiveMaxSagMm` reflects sag ∝ edge² (not the linear `capScale·qMaxSag`).
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** — decouple the fidelity ceiling; treat `capScale>1`/`capSaturated` and decimation-beyond-tol as fidelity-refusal triggers; set the decimation error ceiling to the resolved tolerance; re-gate decimation acceptance on `fidelityGate.maxMm ≤ tol`; fix the telemetry.
- [ ] **Step 4: Run, PASS** — refusal fires correctly; ceiling honest; topology zeros.
- [ ] **Step 5: Commit** `feat(fidelity): budget honesty — decouple fidelity ceiling + honest refusal`.

**Gate (spec §8.6, measured on the FINAL post-cap/post-decimation mesh at default `high`).**

---

### Task 10: Geometric validity + weld reconciliation + high-relief sweep

**Files:** Modify `exportValidation.ts` (add `foldedTriangles`; thread `WELD_TOL_MM`); Modify `stlExport.ts` (reconcile the 0.001mm orient-weld); Test `verify_geometricValidity.test.ts`.

`assertMeshExportable` is topology-only (BLOCKING-4); the STL writer re-welds 10× looser than construction (SHOULD-ADDRESS).

- [ ] **Step 1: Failing test** — (a) a hand-built folded triangle is caught by `foldedTriangles>0`; (b) construction-weld == export-gate weld (no manufactured boundary edge); (c) per style at CRANKED relief/twist, `fidelityGate` (fold + deviation) holds.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** — `foldedTriangles` (unconditional) in the gate; thread `topologyWeldToleranceMm: WELD_TOL_MM` into the conforming export's `assertMeshExportable`; `detectSelfIntersections` as a warning; a high-relief/twist sweep harness.
- [ ] **Step 4: Run, PASS** — fold gate fires; welds reconciled; high-relief holds; topology zeros.
- [ ] **Step 5: Commit** `feat(fidelity): geometric-validity gate + weld reconciliation + high-relief sweep`.

**Gate (spec §8.5 + §8 high-relief).**

---

### Task 11: Corrected end-to-end ship gate (analytic truth, STL bytes, all surfaceIds)

**Files:** Create `e2e/surfaceFidelity.spec.ts`; add `__pfFidelity.diagnoseSurfaceFidelity` (analytic) to the in-page hook; reuse `fidelityGate` semantics on the round-tripped bytes.

The current `__pfFidelity` measures vs a GPU-grid mesh (BLOCKING-5) — re-point it at the analytic surface and the STL/3MF BYTES.

- [ ] **Step 1: Implement the analytic in-page metric** — `diagnoseSurfaceFidelity` runs `fidelityGate` over the REAL exported mesh's emitted vertices vs the analytic (config-aware) surface; DELETE the "via `__pfFidelity` hooks" path that resolves to `measure()`/`diagnoseWallFidelity` (the GPU-grid reference).
- [ ] **Step 2: Byte-level gate** — sample the round-tripped STL/3MF bytes (`parseBinarySTL`) vs the analytic surface; assert ≤ tol (or honest-refusal recorded), watertight, `foldedTriangles=0`, within the resolved ceiling, all surfaceIds (outer + inner + caps).
- [ ] **Step 3: Run** — `npm run dev` then `npx playwright test e2e/surfaceFidelity.spec.ts` (real WebGPU; headed/GPU runner) for each style at default + high-relief. If no GPU runner: capture a real export once, commit as a fixture, gate the bytes in CI.
- [ ] **Step 4: Cross-style sweep** — config-aware `fidelityGate` for every style (seam excluded): every style ≤ tol (or honest-refusal), vs the corrected re-baseline.
- [ ] **Step 5: Visual confirmation** — export SFB / ArtDeco `.3mf` with the flag ON; confirm the surface matches the true model (no flattened crests / straddle / serration).
- [ ] **Step 6: Commit** `test(fidelity): e2e analytic-truth + byte-level ship gate (all surfaceIds)`.

**Gate (spec §8.7).**

---

## Self-Review

- **Spec coverage:** §3.1 edges → Tasks 4 (born), 5 (ArtDeco), 6 (Crystalline), 7 (partials + inner); §3.2 exact-curvature sizing → Task 3; §3.3 exact-eval contract + finiteness → Task 8; §3.4 cross-cutting → Task 1 (config-aware gate + fold), Task 9 (budget), Task 10 (validity + weld), Task 11 (analytic + byte ship gate). Flag → Task 0; re-baseline → Task 2. All §8 gates owned.
- **Ordering (Rev 3):** flag → gate infra → premise lock → ~~sizing~~ (CUT) → **edges (the fix: Task 4 born petals = dominant 3.39mm straddle, then ArtDeco, Crystalline, partials+inner)** → exact-eval contract → budget honesty → geometric validity → ship gate. Impact-ordered; the discovery-heavy tasks (5, 6) are isolated and each gated. Tasks 4–7 gate on the INTERIM straddle classifier (runnable at position); the `≤tol` surface gate is the post-edges cross-style checkpoint (Task 11), so no task gates on a not-yet-built dependency.
- **Types/consistency:** `surfaceFidelityExact` flag (Tasks 0,3,8); `deviationVsTrueSurface(mesh, styleId, packedParams, dims, opts)` signature (Task 1 → all gates); `fidelityGate` reused everywhere (DRY); `PipelineFeatureFlags` (not `FeatureFlags`).
- **No-placeholder honesty:** mechanical tasks carry code; the analytic-loci tasks (5,6) + per-style curvature (3) give exact files + corrected mechanism + the measured gate that defines done (genuine discovery, flagged in the Testability note + spec §9).
- **Watertight + reversible:** every task asserts `assertMeshExportable` (topology zeros) + `foldedTriangles=0` + flag-off byte-identical; no post-hoc repair; the export-boundary weld is reconciled (Task 10).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-surface-fidelity-export.md` (Revision 2). Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints for review.

**Which approach?**
