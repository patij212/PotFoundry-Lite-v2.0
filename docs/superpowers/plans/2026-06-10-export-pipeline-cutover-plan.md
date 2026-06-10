# Export Pipeline → Professional Rhino/Grasshopper Quality — Cutover Plan

> **SUPERSESSION NOTE (2026-06-10b):** The meshing work of Phase 1 is superseded by
> `docs/superpowers/specs/2026-06-10-export-metric-meshing-endgame-design.md`:
> Task 1.2 (GATE-A un-defer) stays deferred (wash, measured); Task 1.3 (rotated
> cells) is REJECTED (ArtDeco eUL-cascade evidence) — its successor is the spec's
> Stage 1/2 metric layer. Task 1.1 (CelticKnot bnd=6) moves to spec Stage 3.
> Task 2.3 (format bug) is already FIXED in live paths (verified at 407a091).
> NEW urgent Phase-2 item: the DEFAULT UI export never reaches the conforming
> mesher (classic default button → GPU-grid path; v2 StatusFooter → legacy
> battery) — the flag-source task must route ALL export paths. Phases 0/2/3/4/5
> remain valid and run in parallel with the spec's stages; the default flip uses
> the spec's Stage-6 dominance checkpoint.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the watertight-by-construction conforming mesher as the production export path at professional quality — clean (0 naked/non-manifold/sliver, smooth ridges, mm-scaled) across all 20 styles and the supported dimension space, in STL/3MF/OBJ, with automated gates so it cannot regress.

**Architecture:** The conforming mesher (`parametric/conforming/`) already produces a `MeshData` that flows through the existing `downloadMesh` → STL/3MF/OBJ writers. The work is (a) re-establish an authoritative measured baseline, (b) close the remaining topology residuals at extreme dimensions, (c) wire the integration plumbing (flag source, validation reporting, format selection, LOD, memory safety) and (d) stand up automated quality gates — then flip the default and retire the legacy repair battery.

**Tech Stack:** TypeScript, React, WebGPU (WGSL), Vite, Vitest (jsdom), Playwright (headed Chromium for WebGPU), meshoptimizer, JSZip.

---

## Current state (verified in code this session — trust + spot-check)

- **Conforming mesher: built, 234 unit tests, 20/20 watertight at DEFAULT dims** (`orient=bnd=nonMan=sliver=0`, `featDrop=0`). Evidence: `e2e/regress-20-2026-06-08l.log`, `e2e/final-matrix-2026-06-08i.log`.
- **It does NOT ship.** `conformingMesher` defaults `false` (`parametric/contracts.ts:412`) and the only enable paths are the e2e-only `window.__pfConforming` hatch or an `overrides.conformingMesher` that no UI/URL/settings/App code sets. Users get the **legacy** path.
- **Legacy path is below the bar:** `e2e/fidelity/baseline.json` (2026-06-05, legacy) shows 9/20 styles with 722–35,481 orientation mismatches and `maxAspect3D` up to ~35.8M (degenerate slivers). The STL writer reorients winding on write but does NOT remove slivers.
- **4 inserted styles fail at extreme dims:** short-wide Gyroid sliver=95, Voronoi sliver=63, Hex sliver=4, **CelticKnot `bnd=6` (a real naked-edge crack)** — `e2e/shortwide-inserted-ubias-2026-06-08n.log`.
- **Short-wide for non-inserted detail styles is unsettled in the logs** (mixed configs: `e2e/shortwide-directional-2026-06-09.log` shows Crystalline=55/ArtDeco timeout under directionalRefine-ON, which is OFF in production). No single authoritative production-opts matrix exists.
- **"CAD-grade ~0.08–0.13mm crestRms" is prose-only** — exists only in `docs/superpowers/NEXT-SESSION-CAD-FIDELITY.md`; no committed test/log/baseline records it; measured for ONE style (SuperformulaBlossom). Metric machinery (`src/fidelity/metrics.ts` `wallChordError`/`serrationScore`) is real and well-engineered.
- **Format-selection bug ships today:** on WebGPU, `parametricExport.exportSTL`/`gpuExport.exportSTL` hardcode binary STL; a user picking 3MF/OBJ gets `.stl`. Only the legacy ExportDialog and the WebGL CPU fallback honor format.
- **No CI gate touches a real exported mesh.** `ci.yml` runs typecheck/lint/vitest/build only; `export-fidelity.spec.ts` pins its invariants with `test.fail()`. The conforming path (the future default) has zero automated end-to-end coverage; all 26 conforming tests use synthetic CPU samplers.
- **Perf:** default builds 7–36s/style (NOT the docs' "1–6s"); soft budget cap (`MAX_BUDGET_SCALE=4`) can't bound short-wide meshes (1.5–2.9M slivers); no decimation/LOD/tiling on the conforming path.

## Output-target decision (recommended)

**Target: a watertight/manifold/oriented/sliver-free/mm-scaled, CAD-tolerance TRIANGLE mesh** (STL/3MF/OBJ). This is the correct "Rhino/Grasshopper quality" bar for a 3D-print product: Rhino meshes NURBS on STL export anyway, slicers never consume NURBS, and the pot styles are radial displacement fields that resist clean NURBS representation. **Do not build NURBS/.3dm/STEP** unless a designer/CNC segment explicitly demands re-editable surfaces — kept as the demand-gated, deferred **Phase 1.5** below (not scheduled).

---

## File structure (touch map)

| File | Responsibility | Phase |
|---|---|---|
| `potfoundry-web/e2e/_authoritative_matrix.cjs` (create) | One driver: 20 styles × dim-space → topology+fidelity+perf+serration → committed log | 0 |
| `potfoundry-web/e2e/baselines/authoritative-2026-06-10.json` (create) | The committed authoritative baseline artifact | 0 |
| `parametric/conforming/FeatureConformingTriangulator.ts` (modify) | Fix CelticKnot braid `bnd=6` crack (forced-crossing mirror under anisotropy) | 1 |
| `parametric/conforming/WatertightAssembly.ts` (modify) | Un-defer inserted-style uBias; anisotropic-cell integration | 1 |
| `parametric/conforming/PeriodicBalancedQuadtree.ts` (modify) | Metric-aligned / rotated cells (design-gated) | 1 |
| `src/ui/controls/ExportDialog.tsx` (modify) | Add `conformingMesher` Debug toggle | 2 |
| `src/renderers/webgpu/parametric/contracts.ts:412` (modify) | Flip default after gates green | 2 |
| `src/renderers/webgpu/ParametricExportComputer.ts:2423` (modify) | Populate `validationSummary` for conforming output | 2 |
| `src/hooks/useParametricExport.ts:452` (modify) | `exportSTL` accepts/forwards format + colors | 2 |
| `src/renderers/webgpu/useGPUExport.ts:399` (modify) | `exportSTL` accepts/forwards format | 2 |
| `src/ui/v2/layout/StatusFooter.tsx:107` (modify) | Pass `exportFormat`/colors into download | 2 |
| `parametric/conforming/decimateConforming.ts` (create) | lockBorders-safe decimation + hard budget ceiling for conforming output | 2 |
| `src/geometry/conformingTopologyGate.test.ts` (create) | Headless CPU goal-vector gate, all 20 styles | 3 |
| `src/geometry/realMeshExport.test.ts` (create) | `validateMeshForExport` on real `buildPotMesh` + conforming output | 3 |
| `src/geometry/stlRoundTrip.test.ts` (create) | Write→parse binary STL, assert count/coords/bbox | 3 |
| `src/geometry/exporters/export3MF.schema.test.ts` (create) | 3MF Core XSD validation of emitted model XML | 3 |
| `src/ui/controls/ExportIntegrityPanel.tsx` (create) | Surface naked-edges/non-manifold/watertight in UI | 4 |
| `src/geometry/selfIntersection.ts` (create) | Geometric self-intersection check | 4 |

---

## Phase 0 — Re-establish authoritative ground truth

*Rationale: the user rejects un-measured claims and the committed logs mix experiment configs. Pin the real residual list under PRODUCTION conforming opts before any fix. No production code changes.*

### Task 0.1: Authoritative matrix driver

**Files:**
- Create: `potfoundry-web/e2e/_authoritative_matrix.cjs`
- Reference (do not modify): `potfoundry-web/e2e/_conforming_full_probe.cjs`, `_conforming_sag_probe.cjs`, `_serration_probe.cjs`

- [ ] **Step 1: Write the driver** (a Node+Playwright script; mirrors the existing probe pattern — sets `window.__pfConforming=true` via `addInitScript`, does NOT set `__pfConformingDirectional`/`__pfConformingUBias` so it measures the true production config).

```js
// e2e/_authoritative_matrix.cjs — run from potfoundry-web/ with dev server on :3001
const { chromium } = require('@playwright/test');
const fs = require('fs');

const STYLES = ['SuperformulaBlossom','FourierBloom','SuperellipseMorph','HarmonicRipple','LowPolyFacet','GothicArches','WaveInterference','Crystalline','ArtDeco','DragonScales','BambooSegments','RippleInterference','GyroidManifold','Voronoi','BasketWeave','GeometricStar','HexagonalHive','CelticKnot','CelticTriquetra','SpiralRidges'];
// H/Rt/Rb in mm. default + the 4 dimension extremes from dimspace-findings.
const DIMS = {
  default:    { H: 120, Rt: 70, Rb: 45 },
  shortWide:  { H: 40,  Rt: 150, Rb: 150 },
  tallNarrow: { H: 220, Rt: 35, Rb: 30 },
  highFlare:  { H: 200, Rt: 120, Rb: 30 },
  noDrain:    { H: 120, Rt: 70, Rb: 45, rDrain: 0 },
};
const PER_BUILD_TIMEOUT_MS = 200000;

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage();
  await page.addInitScript(() => { window.__pfConforming = true; });
  await page.goto('http://localhost:3001/?fidelity=1');
  await page.waitForFunction(() => !!window.__pfFidelity, { timeout: 60000 });

  const results = [];
  for (const style of STYLES) {
    for (const [dimName, dim] of Object.entries(DIMS)) {
      const t0 = Date.now();
      let row;
      try {
        row = await Promise.race([
          page.evaluate(async ({ style, dim }) => {
            await window.__pfFidelity.setStyle(style);
            await window.__pfFidelity.setDimensions(dim);
            const topo = await window.__pfFidelity.diagnoseTopoQuality();
            const feat = await window.__pfFidelity.diagnoseFeatures();
            const serr = (dim.H === 120 && style.match(/Blossom|Bloom|Ripple|Crystalline|ArtDeco|DragonScales|Wave|Superellipse/))
              ? await window.__pfFidelity.diagnoseSerration().catch(() => null) : null;
            return { topo, feat, serr };
          }, { style, dim }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), PER_BUILD_TIMEOUT_MS)),
        ]);
        row = { style, dim: dimName, buildMs: Date.now() - t0, ...row, error: null };
      } catch (e) {
        row = { style, dim: dimName, buildMs: Date.now() - t0, error: String(e.message || e) };
      }
      results.push(row);
      console.log(JSON.stringify(row));
    }
  }
  fs.writeFileSync('e2e/baselines/authoritative-2026-06-10.json', JSON.stringify(results, null, 2));
  await browser.close();
})();
```

- [ ] **Step 2: Start dev server** (separate terminal): `cd potfoundry-web && npm run dev -- --port 3001` (if it hangs at isReady: `rm -rf node_modules/.vite` and restart).

- [ ] **Step 3: Run the driver**

Run: `cd potfoundry-web && node e2e/_authoritative_matrix.cjs`
Expected: a JSON line per (style, dim) and a written `e2e/baselines/authoritative-2026-06-10.json`. Large meshes take 30–90s; total run 30–60 min.

- [ ] **Step 4: Commit the artifact** (this is the new measured ground truth — the gate the rest of the plan asserts against)

```bash
git add potfoundry-web/e2e/_authoritative_matrix.cjs potfoundry-web/e2e/baselines/authoritative-2026-06-10.json
git commit -m "test(export): authoritative 20-style x dim-space conforming matrix (production opts)"
```

- [ ] **Step 5: Read the artifact and record the REAL residual list** to `docs/superpowers/NEXT-SESSION-HANDOFF.md` (which (style,dim) hit the goal vector; which fail with what numbers; per-style buildMs; serration where measured). This replaces the contradictory logs as the single source of truth. **GATE for Phase 1: the residual list is now measured, not claimed.**

### Task 0.2: Commit the serration evidence

- [ ] **Step 1:** Extend the driver's serration capture to sweep `sf_strength`/style-strength `0→1` for the 8 smooth styles at default dims and append `crestBandRmsMm`/`serrationScore`/`maxCrestDevMm` to the artifact.
- [ ] **Step 2:** Run, commit. **GATE:** the "CAD-grade" claim is now a committed, re-runnable number per smooth style — not prose. If `serrationScore ≥ 1` for any smooth style at full strength, that style joins the Phase 4 fidelity backlog.

---

## Phase 1 — Close conforming topology residuals (cutover blockers)

*These are genuine R&D. Per the project playbook, each is measurement-first: reproduce at the UNIT level (synthetic sampler, no GPU) → prove the mechanism → fix → re-measure against Task 0.1's matrix. A naked edge (`bnd>0`) at any supported dimension is disqualifying.*

### Task 1.1: Reproduce the CelticKnot braid `bnd=6` crack at unit level

**Files:**
- Test: `parametric/conforming/FeatureConformingTriangulator.test.ts` (add case)
- Reference: existing braid/crossing tests in that file; `WatertightAssembly.test.ts:184-356` (real CelticKnot 9-strand braid fixture)

- [ ] **Step 1: Write the failing repro test** — two arcs that CROSS (a braid planarization case) inserted into an **anisotropic** quadtree (uBias B≥1, the config the short-wide path forces), asserting `interiorBoundary===0` (T-junction-free) and `boundaryEdges===0`. The existing anisotropic-loop test has no crossings, which is why it missed this.

```ts
it('braid crossing stays watertight under uBias anisotropy (repro CelticKnot short-wide bnd=6)', () => {
  const sampler = new SyntheticCylinderSampler({ /* short-wide: Ro 150, H 40 */ });
  // two general-curves that cross near a shared cell edge → Steiner planarization
  const curves = makeCrossingBraidArcs(); // helper: returns two FeatureLine polylines that intersect
  const tree = buildAnisotropicQuadtree(sampler, { uBias: 2, featureLevel: 8 });
  const result = triangulateQuadtreeWithFeatures(tree, curves, sampler, { uBias: 2 });
  const audit = auditBoundary(result); // existing helper in the test file
  expect(audit.nonManifoldEdges).toBe(0);
  expect(audit.interiorBoundary).toBe(0); // T-junctions
  expect(audit.boundaryEdges).toBe(0);    // the crack
});
```

- [ ] **Step 2: Run to confirm it FAILS** (`boundaryEdges` or `interiorBoundary` > 0), reproducing the e2e `bnd=6` at the unit level.

Run: `cd potfoundry-web && npx vitest run src/renderers/webgpu/parametric/conforming/FeatureConformingTriangulator.test.ts -t "braid crossing"`
Expected: FAIL.

- [ ] **Step 3: Find the asymmetry** — the registry/Steiner interaction under `sizeU≠sizeT` (per `NEXT-SESSION-HANDOFF.md:106-115`: the forced-crossing mirror must register a crossing in BOTH adjacent cells regardless of which the curve enters; under anisotropy the crossing position quantization likely differs per axis). Instrument, do not guess.
- [ ] **Step 4: Fix** in `FeatureConformingTriangulator.ts` (per-axis crossing quantization + mirror), keep `uBias=0` byte-identical (existing tests guard this).
- [ ] **Step 5: Run the full conforming suite GREEN**, then commit.

Run: `npx vitest run src/renderers/webgpu/parametric/conforming/ src/fidelity/`
Expected: all PASS.

### Task 1.2: Un-defer inserted-style uBias + close inserted short-wide slivers

- [ ] **Step 1:** With 1.1 green, flip the `hasFeatures→uBias=0` defer (GATE A) in `WatertightAssembly.ts:144-160` for non-braid general curves; add a unit guard that Gyroid/Voronoi/Hex anisotropic insertion stays `sliver=0`.
- [ ] **Step 2:** Re-run Task 0.1 matrix for the 4 inserted styles at short-wide/twisted/high-flare/no-drain. **GATE:** all 4 reach `bnd=nonMan=orient=sliver=0` OR the residual is precisely localized and documented. Default dims stay byte-identical.

### Task 1.3: Anisotropic / metric-aligned cells (the foundation fix) — DESIGN-GATED

*This is the largest item and resolves both the short-wide sliver explosion (Crystalline/ArtDeco and ~12 styles) AND the perf/memory blowup. The directional-uExtra approach was already built and DISABLED (it handles u-long only, not F-shear; ArtDeco cascade → timeout). Do NOT re-attempt naively.*

- [ ] **Step 1:** Write the failing mechanism guard (mirror `Gap1FoundationAspect.test.ts`): a synthetic short-wide surface whose square-cell 3D aspect is high; assert a **rotated** cell (sides along the eigenvectors of `[[E,F],[F,G]]`, scaled to eigenvalues) gives aspect ≈ √3. `FShearDiagnostics.test.ts` already proves rotation is the right tool.
- [ ] **Step 2:** Orchestrate the rotated-cell architecture via a design+adversarial Workflow (the pattern that caught the periodicU/born-petal/uBias traps), output a blueprint to `docs/superpowers/plans/`. Key constraints to vet: the watertight grid-line vertex registry must survive rotated cells; the 2:1-balance/T-junction templates; bounded refinement (no ArtDeco vertical-stripe cascade).
- [ ] **Step 3:** Implement per the blueprint in `PeriodicBalancedQuadtree.ts`/`MetricSizingField.ts`, TDD against the Step-1 guard + the full conforming suite.
- [ ] **Step 4: GATE** — Task 0.1 matrix re-run: short-wide now `sliver=0` for the detail styles, no timeouts, default byte-identical (or re-baselined 6/6), `maxAspect3D < 100` everywhere. Commit per increment.

### Task 1.4: Tighten the unit suite to catch what e2e catches

- [ ] **Step 1:** `WatertightAssembly.test.ts` wide/flat case (`Ro=145,H=40`) currently asserts ONLY topology; add `expect(maxAspect3D).toBeLessThan(100)` so the sliver field can't pass unit tests. Add a short-wide F-shear fixture reproducing the ArtDeco condition under production opts (directionalRefine off, features deferred). Commit.

## Phase 1.5 — NURBS/.3dm/STEP (DEFERRED — demand-gated, NOT scheduled)

*Do not build unless a designer/CNC segment explicitly asks for re-editable surfaces. If triggered: lightest path = export the analytic revolve profile as a NURBS surface + smooth base as STEP via an OpenNURBS/WASM build; do NOT attempt to NURBS-ify the displacement field. Scope it as its own spec+plan at that time.*

---

## Phase 2 — Integration / cutover plumbing

*Concrete code. Can start in parallel with Phase 1 (independent). Tasks 2.3 are shipping-today bug fixes worth landing immediately regardless of cutover.*

### Task 2.1: Add a real flag source (Debug toggle)

**Files:**
- Modify: `src/ui/controls/ExportDialog.tsx:162-170` (DEFAULT_FLAGS), `:719-744` (Debug toggles)

- [ ] **Step 1: Write the failing test** (`ExportDialog.test.tsx`): render the dialog Debug tab, assert a "Conforming mesher" toggle exists and that toggling it sets `featureFlags.conformingMesher`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — add `conformingMesher: false` to `DEFAULT_FLAGS` and a `<Toggle label="Conforming mesher (watertight)" checked={flags.conformingMesher} ... />` in the Debug tab. It auto-flows via `buildOverrides → pipelineFeatureFlags → resolveFeatureFlags`.
- [ ] **Step 4: Run → PASS.** Commit. *(Default flip to `contracts.ts:412` is deferred to Phase 5, after gates are green.)*

### Task 2.2: Populate `validationSummary` for conforming output

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts:2423-2454`
- Reference: `src/fidelity/metrics.ts` topology/triangle-quality diagnostics; `src/geometry/exportValidation.ts:164`

- [ ] **Step 1: Write the failing test** — a CPU-assembled conforming mesh (reuse `WatertightAssembly.test.ts`'s CPU `evalSurface` pattern) run through the same validation, asserting `result.validationSummary` is populated (`valid`, `boundaryEdges`, `nonManifoldEdges`, `orientationMismatches`, `sliverCount`).
- [ ] **Step 2: Run → FAIL** (`validationSummary` is `undefined` today).
- [ ] **Step 3: Implement** — before the conforming return, compute a cheap manifold/orientation/sliver summary on `asm.indices`/`pos3D` and set `validationSummary`. Keep it O(N) (boundary/non-manifold via edge-pair hash; no full re-triangulation).
- [ ] **Step 4: Run → PASS.** Now the hook's invalid-mesh guard (`useParametricExport.ts:349`) and the UI validation panels function for conforming exports. Commit.

### Task 2.3: Fix the format-selection bug (ships today)

**Files:**
- Modify: `src/hooks/useParametricExport.ts:452-473`, `src/renderers/webgpu/useGPUExport.ts:399-422`, `src/ui/v2/layout/StatusFooter.tsx:107-117`
- Reference: `src/geometry/stlExport.ts:89-125` (`downloadMesh`), `src/hooks/useExport.ts:326-349` (the CPU path that already does it right)

- [ ] **Step 1: Write the failing test** (`useParametricExport.test.ts`): mock `downloadMesh`, call `exportSTL(filename, tris, { format: '3mf' })`, assert `downloadMesh` was called with `{ format: '3mf' }` (not `downloadSTL`).
- [ ] **Step 2: Run → FAIL** (today it calls `downloadSTL` unconditionally).
- [ ] **Step 3: Implement** — change `parametricExport.exportSTL` and `gpuExport.exportSTL` to accept `{ format, colors }` and call `downloadMesh(meshData, filename, { format, colors, name })`; update `StatusFooter.handleDownload` to read `ui.exportFormat` and (for 3mf) build colors from the appearance store, passing them into all branches.
- [ ] **Step 4: Run → PASS.** Manually verify in-app: pick 3MF → get a `.3mf`. Commit.

### Task 2.4: LOD/decimation + hard budget ceiling for conforming

**Files:**
- Create: `src/renderers/webgpu/parametric/conforming/decimateConforming.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts:2439` (call before return)
- Reference: `src/renderers/webgpu/ExportComputer.ts:887-980` (`decimateMesh`, `lockBorders:true`); `ConformingWall.ts:157` (`MAX_BUDGET_SCALE=4`)

- [ ] **Step 1: Write the failing test** — a synthetic over-budget mesh (3M tris); `decimateConforming(mesh, { target: 2_000_000 })` returns `triangleCount ≤ 2_000_000` AND preserves boundary vertices (lockBorders) AND stays watertight (`validateMeshForExport.ok`).
- [ ] **Step 2: Run → FAIL** (module doesn't exist).
- [ ] **Step 3: Implement** — wrap meshoptimizer `simplify` with `lockBorders:true` (the existing legacy pattern), invoked only when `triangleCount > budget`. This makes the budget a HARD ceiling (the `MAX_BUDGET_SCALE=4` soft cap can't bound short-wide today).
- [ ] **Step 4: Run → PASS.** Wire into the conforming return gated on `triangleCount > conformingBudget`. Re-run Task 0.1 to confirm no watertight/feature regression. Commit.

### Task 2.5: Large-mesh memory safety

- [ ] **Step 1:** Write a test asserting the conforming branch refuses (or downgrades the quality profile / decimates) when `vertexBytes + indexBytes > maxStorageBufferBindingSize`, reusing `ExportFeasibility.ts` + `QualityProfiles.downgradeProfile`.
- [ ] **Step 2:** Implement a post-assembly size re-check in `ParametricExportComputer.ts` before the single `evaluatePoints`. Commit. *(Full Z-tiling parity with `ExportComputer` is optional; the size-guard + decimation from 2.4 covers the OOM risk.)*

---

## Phase 3 — Automated quality gates (so it cannot regress)

*The single biggest hole: the future production path has zero automated end-to-end coverage. These run in CI WITHOUT a GPU by reusing the CPU `evalSurface` pattern the conforming unit tests already use.*

### Task 3.1: Headless CPU goal-vector gate, all 20 styles

**Files:**
- Create: `src/geometry/conformingTopologyGate.test.ts`
- Reference: `parametric/conforming/WatertightAssembly.test.ts:8-56` (CPU `evalSurface` re-impl), `src/fidelity/metrics.ts` topology diagnostics

- [ ] **Step 1: Write the test** — for each of the 20 styles, CPU-assemble the conforming wall at default dims and assert the goal vector: `boundaryEdges===0 && nonManifoldEdges===0 && orientationMismatches===0 && sliverCount===0 && featuresDropped===0`.

```ts
describe.each(ALL_20_STYLES)('conforming goal-vector: %s', (style) => {
  it('is watertight, manifold, oriented, sliver-free at default dims', () => {
    const asm = assembleConformingCPU(style, DEFAULT_DIMS); // CPU evalSurface, no GPU
    const m = topologyDiagnostics(asm.vertices, asm.indices);
    expect(m.boundaryEdges).toBe(0);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientationMismatches).toBe(0);
    expect(m.sliverCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run → likely PASS** at default (this CODIFIES the 20/20 claim into CI). If any FAIL, that's a real regression to fix.
- [ ] **Step 3: Commit.** This test is the gate that makes the default-flip safe.

### Task 3.2: Real-mesh export validation (legacy + conforming)

- [ ] **Step 1:** `src/geometry/realMeshExport.test.ts` — feed `buildPotMesh` (legacy) AND `assembleConformingCPU` (conforming) for all 20 styles through `validateMeshForExport`; assert `ok===true && boundaryEdges===0 && orientationMismatches===0`. *(This will FAIL for the 9 legacy styles with known orientation mismatches — that's the point: it documents the legacy defect as a `test.fail()` and the conforming as a hard gate.)*
- [ ] **Step 2:** Commit with conforming as hard assertions and legacy pinned `test.fail()` until retired.

### Task 3.3: STL round-trip + 3MF schema validation

- [ ] **Step 1:** `src/geometry/stlRoundTrip.test.ts` — write a real pot to binary STL, parse the 84+50n bytes back, assert triangle count, a coordinate checksum, and bbox in mm equals input dimensions.
- [ ] **Step 2:** `src/geometry/exporters/export3MF.schema.test.ts` — validate the emitted `3D/3dmodel.model` against the 3MF Core XSD (vendor the schema under `src/geometry/exporters/__fixtures__/3mf-core.xsd`), assert `_rels` Target/Id wiring and `<build>` objectid resolves. Commit.

### Task 3.4: Dimension-space robustness matrix (CI)

- [ ] **Step 1:** `src/geometry/conformingDimspace.test.ts` — a small grid of H/Rt/Rb extremes per style asserting the goal vector, replacing the manual `dimspace-*.log` probes. Seed it from Task 0.1's measured residual list (only assert PASS on configs Phase 1 has closed; pin the rest). Commit.

### Task 3.5: Make e2e fidelity gate, default orientation strict, enforce branch protection

- [ ] **Step 1:** Once Phase 1 lands, flip `export-fidelity.spec.ts:169-189` invariants from `test.fail()` to hard assertions; stand up real-WebGPU CI (Playwright headed under `xvfb-run`, or a SwiftShader-Vulkan/GPU runner) so the specs execute instead of timing out.
- [ ] **Step 2:** Default `requireConsistentOrientation` to `true` in `stlExport.ts:615` (STL soup tolerance becomes opt-in); fix any test fallout.
- [ ] **Step 3:** Set `required_status_checks` in `.github/workflows/enable-branch-protection.yml:39` to the real gate names. Commit.

---

## Phase 4 — Professional polish

### Task 4.1: Surface integrity in the export UI

- [ ] **Step 1:** `ExportIntegrityPanel.test.tsx` — given a `validationSummary`, the panel renders "Naked edges: 0", "Non-manifold: 0", "Watertight: yes" and a warning row when any is nonzero.
- [ ] **Step 2:** Implement `src/ui/controls/ExportIntegrityPanel.tsx`, mount it in the ExportDialog/ExportTab fed by Task 2.2's `validationSummary`. This is exactly the assurance Rhino's `CheckMesh`/`ShowEdges` gives professionals, and the validator already computes it. Commit.

### Task 4.2: Geometric self-intersection check

- [ ] **Step 1:** `src/geometry/selfIntersection.test.ts` — a known self-intersecting closed mesh returns `intersects:true`; a clean pot returns `false`. (BVH triangle-pair test; O(N log N).)
- [ ] **Step 2:** Implement `src/geometry/selfIntersection.ts`; surface as a non-blocking export warning (twisted/high-flare pots are the risk). Commit. *(Optional follow-on: min-wall-thickness / overhang printability warning.)*

### Task 4.3: Matrix-wide CAD-tolerance gate

- [ ] **Step 1:** Using Task 0.2's committed serration numbers, add an on-demand (or headed-CI) assertion that `serrationScore < 1` for all 8 smooth styles at full strength. Any style that fails gets a per-style crest-extraction/uBias follow-up (the `FeatureLineGraph` born-crest path is proven viable). Commit when matrix-wide green.

---

## Phase 5 — Flip the default & retire the legacy battery

### Task 5.1: Flip the default

- [ ] **Step 1:** With Phases 1+3 gates green, change `DEFAULT_FEATURE_FLAGS.conformingMesher` to `true` (`contracts.ts:412`) — single reversible line. Run the full vitest + Task 0.1 matrix + e2e for sign-off.
- [ ] **Step 2:** Ship behind a release; monitor. Keep the Debug toggle so it's reversible per-user.

### Task 5.2: Retire the legacy path (LAST, after N stable releases)

- [ ] **Step 1:** Excise the legacy surface loop + ~1100-line repair battery + `byConstructionAssembly` intermediate path from `ParametricExportComputer.ts`; split the file (it's 6000+ lines). Each removal its own commit, gated by the full suite. Update `ARCHITECTURE.md`/`CLAUDE.md`/`ROADMAP.md`.

---

## Cross-cutting playbook (NON-NEGOTIABLE — from NEXT-SESSION-HANDOFF §5/§7)

- **Measurement-first:** reproduce → prove root cause → fix → re-measure. Never claim done without probe output. The user rejects un-measured claims.
- **Strict gating every commit:** `npx vitest run src/renderers/webgpu/parametric/conforming/ src/fidelity/` green; `npm run typecheck` + `npm run lint` (0 warnings); the touched-style probe + canaries; no previously-passing style regresses; default stays byte-identical (or explicit re-baseline).
- **TDD:** failing test first, synthetic samplers (`SyntheticCylinderSampler`) where possible — no GPU needed for unit logic.
- **Scoped `git add` of explicit paths — NEVER `git add -A`** (tree has pre-existing dirty `CLAUDE.md`/`agents.md`/`playwright-report` + untracked `.txt`/`.log` scratch).
- **No repair/weld/T-junction-patch passes** on the conforming path — watertightness stays by-construction.
- **GitNexus MCP is unreliable** here — gate via the vitest/e2e/byte-identical suite, not `impact()`/`detect_changes`.
- **Environment:** dev server on :3001 (`npm run dev -- --port 3001`; clear `node_modules/.vite` if isReady hangs); background-task cwd resets to repo root (prefix absolute `cd .../potfoundry-web`); probes are headed Chromium (WebGPU).

## Definition of Done

All 20 styles, across the supported dimension space, exported via the **default** (now conforming) path:
`sliverCount=0, boundaryEdges=0, nonManifoldEdges=0, orientationMismatches=0, featuresDropped=0`, no timeouts, `serrationScore<1` for smooth styles at full strength, in STL/3MF/OBJ at correct mm scale — with CI gates (Tasks 3.1–3.5) enforcing each invariant, the integrity panel surfacing it to users, and the legacy battery retired. Authoritative matrix (Task 0.1 format) committed as the proof artifact and referenced from memory + handoff.

## Self-review notes

- **Spec coverage:** every gap from the state review maps to a task — wiring (2.1/2.2), topology residuals (1.1–1.4), format bug (2.3), perf/LOD/budget (2.4/2.5), CI holes (3.1–3.5), professional checks (4.1–4.3), legacy retirement (5.2), NURBS decision (1.5 deferred). Ground-truth/fidelity-verifiability gap → Phase 0.
- **Sequencing:** Phase 0 gates Phase 1 (measure before fix). Phase 2 is independent of Phase 1 and 2.3 is a ship-now bug fix. Phase 3 gates Phase 5 (the default flip). Phase 1.3 (rotated cells) is the long pole and is itself design-gated via a blueprint workflow.
- **Honesty:** Phase 1 tasks intentionally lead with a failing REPRO test rather than fabricated fix code — the fix design for 1.3 follows from measurement (rotated cells), consistent with how every prior foundation change in this project was handled.
