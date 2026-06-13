# Surface-Fidelity Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every exported mesh lie on the true mathematical surface (deviation ≤ tolerance, default 0.05mm; target the f32 floor) — sharp where the model is sharp, smooth where it is smooth — slivers acceptable.

**Architecture:** Three relief-independent fixes (from `docs/superpowers/specs/2026-06-13-surface-fidelity-export-design.md`): (1) **exact per-vertex GPU evaluation** of final positions (replaces the bilinear-256 sampler — the dominant, refinement-immune error); (2) **complete feature extractors** so every sharp feature is a real mesh edge (un-defer born petals; build the missing ArtDeco + Crystalline extractors; complete the partial ones; `CreaseTWarp` t-bands); (3) **curvature-adaptive density referenced against the exact surface**. Budget targets the f32 floor, hard-capped at the slicer limit (~20M tris) with honest refusal. Watertight by construction (no repair). Flag-gated.

**Tech Stack:** TypeScript; the conforming mesher (`src/renderers/webgpu/parametric/conforming/`); the WGSL style shaders + `ParametricExportComputer`; Vitest (CPU fidelity probes in `src/fidelity/`); Playwright/WebGPU (e2e). No new deps.

**Pre-registered gates:** the spec's §8 Stage-0 gates. CPU gates run `npx vitest run src/fidelity/<probe>.test.ts` from `potfoundry-web/`; the e2e gate runs real WebGPU.

**Testability note (honest):** extractor + un-defer + sizing-reference tasks are CPU-analytic → fully TDD'd against the fidelity probes. The exact-eval pass is GPU → its deep gate is e2e; its CPU unit coverage is the flag-wiring + watertight + byte-identical-off contract. Tasks 2–5 (analytic loci derivation for new extractors) are the load-bearing unknowns; each is defined by its measured gate.

---

## File Structure

- Modify: `src/renderers/webgpu/parametric/contracts.ts` — add `surfaceFidelityExact` flag.
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts` — exact per-vertex eval pass (replaces bilinear final positions under the flag); thread exact-curvature into the sizing field.
- Modify: `src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts` — un-defer SFB born petals; add `extractArtDeco`, `extractCrystalline`; complete partial extractors; register in `EXTRACTORS`.
- Modify: `src/renderers/webgpu/parametric/conforming/ConformingWall.ts` — sizing field reads exact curvature; thread `CreaseTWarp` band edges for segmented styles.
- Reuse (gates): `src/fidelity/verify_exportSurfaceFidelity.test.ts`, `verify_crossStyleFidelity.test.ts`, `verify_worstTriangle.test.ts`, `verify_chordConvergence.test.ts`, `verify_maxSagReferenceDomination.test.ts`, `verify_junctionFidelity.test.ts` (+ new per-task gate probes).
- Create: `src/fidelity/fidelityGate.ts` — a shared, exact-surface deviation gate used by every task (DRY: one faithful `deviationVsTrueSurface(mesh, styleId, opts)` + per-style true-surface eval).

---

### Task 0: Feature flag scaffolding (reversible, no behavior change)

**Files:** Modify `src/renderers/webgpu/parametric/contracts.ts`; Test `contracts.test.ts`.

- [ ] **Step 1: Failing test** (add to contracts.test.ts)

```ts
it('surfaceFidelityExact defaults OFF and is overridable (reversibility)', () => {
  expect(DEFAULT_FEATURE_FLAGS.surfaceFidelityExact).toBe(false);
  expect(resolveFeatureFlags(undefined).surfaceFidelityExact).toBe(false);
  expect(resolveFeatureFlags({ surfaceFidelityExact: true }).surfaceFidelityExact).toBe(true);
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/renderers/webgpu/parametric/contracts.test.ts` → FAIL (undefined).
- [ ] **Step 3: Add the flag** — in `contracts.ts`: `readonly surfaceFidelityExact?: boolean;` on `FeatureFlags`; `surfaceFidelityExact: false` in `DEFAULT_FEATURE_FLAGS`; in `resolveFeatureFlags` `surfaceFidelityExact: overrides.surfaceFidelityExact ?? DEFAULT_FEATURE_FLAGS.surfaceFidelityExact` (use `??`, not `Boolean()`).
- [ ] **Step 4: Run, verify PASS** + `npx eslint src/renderers/webgpu/parametric/contracts.ts --max-warnings=0`.
- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/parametric/contracts.ts src/renderers/webgpu/parametric/contracts.test.ts
git commit -m "feat(fidelity): add surfaceFidelityExact flag (default off, reversible)"
```

---

### Task 1: Shared exact-surface fidelity gate (DRY foundation for every later gate)

**Files:** Create `src/fidelity/fidelityGate.ts` + `fidelityGate.test.ts`.

Centralize the faithful deviation metric so every task gates identically: per-style true surface (CPU mirror via `STYLE_FUNCTIONS`), dense barycentric chord sampling (N≥16), seam + u-wrap excluded, returns `{maxMm, p99Mm, fracAboveTol, worst:{u,t}}`.

- [ ] **Step 1: Failing test** — assert the gate reproduces the known SFB@1 baseline (max ~3.4mm on the current bilinear path) and ~0 for an exact-vertex mesh of a flat style.

```ts
import { deviationVsTrueSurface } from './fidelityGate';
it('reproduces the SFB@1 current-path max and ~0 for exact-eval', () => {
  const cur = deviationVsTrueSurface(currentSfbMesh, 'SuperformulaBlossom', {}, { tolMm: 0.05 });
  expect(cur.maxMm).toBeGreaterThan(1.0); // bilinear path is far off true
  const exactMesh = exactEvalCopy(currentSfbMesh, 'SuperformulaBlossom');
  expect(deviationVsTrueSurface(exactMesh, 'SuperformulaBlossom', {}, { tolMm: 0.05 }).maxMm)
    .toBeLessThan(0.20); // vertices exact ⇒ only chord remains
});
```

- [ ] **Step 2: Run, FAIL** (module missing).
- [ ] **Step 3: Implement** `deviationVsTrueSurface` by extracting the dense-sampling + seam-exclusion logic already proven in `verify_chordConvergence.test.ts`/`verify_exportSurfaceFidelity.test.ts`, parameterized by `styleId` via `STYLE_FUNCTIONS` for the true surface. (Lift, don't reinvent — those probes are the validated reference.)
- [ ] **Step 4: Run, PASS** + eslint.
- [ ] **Step 5: Commit** `test(fidelity): shared exact-surface deviation gate (fidelityGate)`.

---

### Task 2: Exact per-vertex evaluation pass (the dominant fix)

**Files:** Modify `ParametricExportComputer.ts` (conforming branch final-position step); e2e gate in `potfoundry-web/e2e/`.

Replace the bilinear-256 final vertex positions with **exact GPU evaluation at each emitted vertex's (u,t)** under `surfaceFidelityExact`. Reuse the style WGSL surface eval (the same `r_outer`/`style_param` the grid sampler uses) dispatched over the conforming vertex `(u,t)` list (mirror `ExportComputer.calc_vertices`, evaluating at arbitrary `(u,t)`, not a grid). Sizing/extraction may keep the grid; only FINAL positions become exact. Connectivity untouched ⇒ watertight preserved.

- [ ] **Step 1: Failing e2e gate** — `e2e/surfaceFidelityExact.spec.ts`: real WebGPU export of SFB@1 with the flag ON; sample the exported mesh vs the analytic surface (via the `__pfFidelity` hooks). Expected (pre-impl): FAIL (still bilinear, max ~1–3mm).
- [ ] **Step 2: CPU contract test** — `ParametricExportComputer` under the flag routes final positions through the exact evaluator, not the bilinear sampler (assert the code path / a seam in the pipeline); flag OFF ⇒ byte-identical hash.
- [ ] **Step 3: Implement** the exact per-vertex GPU eval pass (flag-gated); wire it as the final-position source for conforming vertices.
- [ ] **Step 4: Run gates** — e2e: vertex-placement deviation → ≤ f32 floor (~tens of µm) on SFB@1; CPU: flag-off byte-identical; `assertMeshExportable` passes (watertight). Expected: PASS.
- [ ] **Step 5: Commit** `feat(fidelity): exact per-vertex GPU evaluation of final positions (flag-gated)`.

**Gate (spec §8.1):** vertex-placement deviation grid-independent ≈ 0; watertight unchanged; flag-off byte-identical. *Discovery risk: the GPU per-vertex pass must match the sizing surface — see spec §9.*

---

### Task 3: Un-defer SuperformulaBlossom born petals

**Files:** Modify `FeatureLineGraph.ts` (`extractSuperformulaBlossom`, `SF_CREST_FULL_HEIGHT_SPAN`); Test via `fidelityGate` + a new `verify_sfbBornPetals.test.ts`.

The 3.4mm SFB worst case is born outer petals being dropped (`SF_CREST_FULL_HEIGHT_SPAN=0.85` filters to full-height crests). Insert ALL crests (born ones too), with exact endpoints at their birth `t` (solve `m(t)=j−0.5` by bisection, as `sfClosedFormParamRidge` already does) terminating on the clip boundary.

- [ ] **Step 1: Failing test** — with flag ON, SFB@1 has NO triangle straddling a crest locus (extend `verify_worstTriangle`'s straddle classifier); current → fails (1889 straddles / 3.4mm).
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** — lower `SF_CREST_FULL_HEIGHT_SPAN` to ~0.05 (keep the `SF_CREST_MIN_STRENGTH` gate), insert born crests with exact birth-point endpoints; harden the extraction to the closed-form loci (`sfClosedFormCrestLoci`) so endpoints land on grid lines (watertight, `SuperformulaBornCrests.test.ts` pattern).
- [ ] **Step 4: Run, PASS** — 0 crest-straddling triangles; `fidelityGate` SFB@1 max drops to the flank/exact-eval floor; topology zeros (`assertMeshExportable`); flag-off byte-identical.
- [ ] **Step 5: Commit** `feat(fidelity): insert SFB born petals as edges (un-defer) — kills crest straddle`.

**Gate (spec §8.3, SFB):** no straddled crest; deviation at crests ≤ tol after exact eval + density.

---

### Task 4: ArtDeco feature extractor (the worst un-covered style)

**Files:** Modify `FeatureLineGraph.ts` (add `extractArtDeco`, register in `EXTRACTORS`); reference `geometry/styles.ts:rOuterArtDeco` for the loci; Test `verify_artDecoFidelity.test.ts` (`fidelityGate`).

ArtDeco has NO extractor (`()=>[]`) → 4.6mm/p99 3.6mm pervasive. Derive its sharp-feature loci analytically from `rOuterArtDeco` (the crease set where `∂r/∂u` is discontinuous / a marching-squares trace of its scalar, like `extractHexagonalHive`/`extractVoronoi`), emit as general-curve `FeatureLine`s.

- [ ] **Step 1: Failing test** — `fidelityGate('ArtDeco')` max > 1mm now (no edges); target ≤ tol after.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement `extractArtDeco`** — derive the feature loci (the load-bearing analytic work; model on the existing general-curve extractors), register in `EXTRACTORS`. Honest-empty fallback if a config has no sharp features.
- [ ] **Step 4: Run, PASS** — ArtDeco features inserted (count > 0, ground-truth matched); `fidelityGate('ArtDeco')` max ≤ tol (with exact eval + density); topology zeros; other styles byte-identical.
- [ ] **Step 5: Commit** `feat(fidelity): ArtDeco feature extractor (closes the worst fidelity gap)`.

**Gate (spec §8.3, ArtDeco):** features inserted; deviation ≤ tol. *Discovery risk: the loci derivation (spec §9).*

---

### Task 5: Crystalline helical-crease extractor

**Files:** Modify `FeatureLineGraph.ts` (`extractCrystalline`); reuse `chooseHelixGrid` + `CreaseHelixWarp` (per the documented gap + crest-elimination blueprint); Test `verify_crystallineFidelity.test.ts`.

Crystalline `()=>[]` is a documented GAP (k=24 helical crease family, turns=0.8, ~26.9° dihedral). Insert the 12 main apex creases via the helical-crease family (`chooseHelixGrid`/`CreaseHelixWarp`), guards from the blueprint (derive k/turns from live params, refuse non-integer subFacets).

- [ ] **Step 1–5:** as Task 4, gated by `fidelityGate('Crystalline')` ≤ tol + topology zeros + byte-identical elsewhere.
- [ ] **Commit** `feat(fidelity): Crystalline helical-crease extractor`.

---

### Task 6: Complete partial extractors + t-band edges

**Files:** Modify `FeatureLineGraph.ts` (BasketWeave non-axis, CelticTriquetra braid/medallion, GothicArches full, BambooSegments t-bands), `ConformingWall.ts` (`CreaseTWarp` threading for segmented styles); Test per-style `fidelityGate`.

- [ ] **Step 1: Failing tests** — `fidelityGate` for BasketWeave / CelticTriquetra / GothicArches / BambooSegments > tol where features are dropped today.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** — complete each partial extractor (general-curve for braided/cellular; `CreaseTWarp` band edges for z-steps), register/thread.
- [ ] **Step 4: Run, PASS** — each style's straddles eliminated; `fidelityGate` ≤ tol; topology zeros.
- [ ] **Step 5: Commit** `feat(fidelity): complete partial extractors + t-band edges`.

**Gate (spec §8.3):** all sharp styles' features inserted (no straddle).

---

### Task 7: Exact-referenced adaptive density + budget/honest-refusal

**Files:** Modify `ConformingWall.ts` (sizing/`maxSag` curvature input → exact surface) and the budget logic (slicer cap + honest refusal).

The `maxSag` refinement currently reads the bilinear-256 surface → under-refines crests (`verify_maxSagReferenceDomination`). Feed it exact curvature (exact eval or a sufficiently-dense probe of the true surface) so it refines crests correctly; spend budget to the f32 floor, capped at the slicer limit (~20M tris); honest refusal beyond.

- [ ] **Step 1: Failing test** — `verify_maxSagReferenceDomination`-style: refinement driven by exact curvature drives residual chord < tol where bilinear-driven leaves >tol; and a budget test: a config that can't reach tol within 20M tris returns the honest-refusal report (not a silent over-budget/low-fidelity mesh).
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** — exact-curvature sizing input; budget ceiling = slicer cap; honest-refusal contract (export best-achievable + warning).
- [ ] **Step 4: Run, PASS** — residual chord < tol within cap; honest refusal fires correctly; topology zeros.
- [ ] **Step 5: Commit** `feat(fidelity): exact-referenced adaptive density + slicer-cap honest refusal`.

**Gate (spec §8.4):** residual chord < tol within 20M tris; honest refusal otherwise.

---

### Task 8: End-to-end real-GPU fidelity gate + cross-style sweep (the ship gate)

**Files:** `potfoundry-web/e2e/surfaceFidelity.spec.ts`; reuse `fidelityGate` semantics on the real exported mesh.

- [ ] **Step 1: Implement the e2e gate** — real WebGPU export of each style at default + high-relief; sample the actual exported mesh vs the analytic surface; assert max deviation ≤ tol (or honest-refusal recorded), watertight, ≤ 20M tris. This is spec §8.6 (the #2 end-to-end gate) + §8.2 (high-relief) + §8.5 (watertight).
- [ ] **Step 2: Run** — `npm run dev` then `npx playwright test e2e/surfaceFidelity.spec.ts`.
- [ ] **Step 3: Visual confirmation** — export a sharp style (SFB / ArtDeco) `.3mf` with the flag ON; confirm the surface matches the true model (no flattened crests / serration).
- [ ] **Step 4: Cross-style CPU sweep** — re-run `verify_crossStyleFidelity` with exact eval + extractors: every style ≤ tol (or honest-refusal), vs the 15/20-over-0.1mm baseline.
- [ ] **Step 5: Commit** `test(fidelity): e2e real-GPU + cross-style fidelity gate (ship gate)`.

**Gate (spec §8.6):** real exported mesh ≤ tol from the true surface, every style, watertight, within the slicer cap.

---

## Self-Review

- **Spec coverage:** §3.1 exact eval → Task 2; §3.2 extractors → Tasks 3 (SFB born), 4 (ArtDeco), 5 (Crystalline), 6 (partials + t-bands); §3.3 density → Task 7; flag (§1/§5 reversibility) → Task 0; gate infra → Task 1; §8 gates → embedded per task + Task 8 (end-to-end #6, high-relief, watertight). All covered.
- **Ordering:** flag → gate infra → exact eval (broadest fix) → SFB born (quick high-value) → ArtDeco/Crystalline (worst gaps) → partials → density → e2e ship gate. Impact + de-risking ordered; the discovery-heavy tasks (2,4,5) are isolated and each gated.
- **Types/consistency:** `surfaceFidelityExact` flag name consistent (Tasks 0,2); `deviationVsTrueSurface` signature consistent (Task 1 → all gates); `fidelityGate` reused everywhere (DRY).
- **No-placeholder honesty:** mechanical tasks (0,1,3) carry code; the analytic-loci tasks (4,5,6) and the GPU pass (2) give exact files + approach + the measured gate that defines done (the loci derivation is genuine discovery, not a placeholder — the gate is the spec). Flagged in the Testability note + spec §9.
- **Watertight + reversible:** every task asserts `assertMeshExportable` (topology zeros) and flag-off byte-identical; no post-hoc repair anywhere.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-surface-fidelity-export.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints for review.

**Which approach?**
