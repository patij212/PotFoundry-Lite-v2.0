# Perfect-Mesher Back-Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage a flag-gated, default-off, byte-identical-when-off back-port of the proven perfect-mesher kernel (whole-mesh 0-outlier on the count-unstable styles Gothic/GeoStar) into the production conforming export pipeline — without shipping it (the flag never flips this plan).

**Architecture:** The production conforming outer-wall mesher (`src/renderers/webgpu/parametric/conforming/`, entry `buildConformingOuterWall`) already handles Tier-A/B styles. This plan adds a **Tier-C closer** — a Morse-ridge-graph-protected, no-bridge, honest-brute whole-mesh interior-refinement path — that fires **only** for count-unstable styles **and only behind a default-off flag**. When the flag is off, dispatch never selects Tier-C and the output is byte-for-byte identical to today. The proven algorithms live in `research/bridge/_pf_perfect_*.test.ts` (+ the FGJ Morse extractor) and are the source-of-truth to port; the production work is extraction into `conforming/tierC/` modules + flag wiring + tests + the CLAUDE.md impact discipline.

**Tech Stack:** TypeScript, Vitest (jsdom), the existing `conforming/` modules (`featureGraph/`, `MetricSizingField`, `ConstrainedCellTriangulator`, `WatertightAssembly`), labkit rulers ported as production test helpers. No new deps.

## Global Constraints

- **Default-OFF flag; byte-identical when off** — the zero-regression guarantee. Verified by a hash test on all 20 styles (flag-off output === current output).
- **Tier-C fires only for count-unstable styles** (Gothic, GeometricStar) AND only when the flag is on.
- **The whole-mesh acceptance guard is MANDATORY** — every free facet's honest interior deviation, NO top-N-gradU population (that guard was measured blind: it read 0 while 32/791 facets were outliers). Ref spec §VALIDATION 7.
- **Collapse-degenerate-faces is a universal post-pass** (welds UV-collinear zero-area faces → slicer-safe).
- **A full 20-style whole-mesh re-baseline is the final gate** before any flag-flip. This plan does NOT flip the flag: it stays STAGED until slivers close or the print-safe needle concession is formally accepted (both out of scope here).
- **CLAUDE.md discipline:** run `gitnexus_impact({target, direction:"upstream"})` before editing ANY production symbol; report blast radius; run `gitnexus_detect_changes()` before each commit; never edit a symbol without impact analysis; never `git add -A`.
- **`src/` never imports `research/`** — port the algorithms; do not import the dev-only probes.
- **Source-of-truth for the ported algorithms:** `research/lab/2026-07-04-perfect-mesher-spec.md` §4 (architecture) + §5-9 (validated behavior); probes `research/bridge/_pf_perfect_{gothic,geostar}*.test.ts` (whole-mesh kernel), FGJ Morse extractor + `planarizeMM`, collapse post-pass.

---

## File Structure

New Tier-C submodule (one responsibility each), plus minimal wiring into the existing entry points:

- **Create** `src/renderers/webgpu/parametric/conforming/tierC/index.ts` — barrel + the `buildTierCOuterWall(opts)` entry; the ONLY symbol the orchestrator calls.
- **Create** `tierC/countUnstable.ts` — `isCountUnstableStyle(styleId, featureGraph)`: the dispatch predicate (birth/merge count from the existing `featureGraph`).
- **Create** `tierC/morseComplex.ts` — port of the FGJ Morse ridge-graph extractor + `planarizeMM` → a residualCrossings-0 protected PSLG (reuse `featureGraph/detectFeatures` + `conditionGraph` where possible).
- **Create** `tierC/interiorRuler.ts` — the honest whole-mesh interior ruler (≥36-pt barycentric back-projected via full-azimuth nearest-point) + the **mandatory whole-mesh acceptance guard**. Ported from labkit `bruteNearestOnRadialSurface` + the whole-mesh guard.
- **Create** `tierC/noBridgeRefine.ts` — the no-bridge crest split + whole-mesh interior-deviation-driven arc-length Steiner refine loop (the fidelity core).
- **Create** `tierC/collapseDegenerate.ts` — the universal degenerate-face collapse post-pass.
- **Modify** `src/renderers/webgpu/parametric/conforming/index.ts` — re-export the tierC barrel.
- **Modify** `src/renderers/webgpu/ParametricExportComputer.ts` — read the flag; when on AND count-unstable, dispatch the outer wall to `buildTierCOuterWall` instead of `buildConformingOuterWall`; else unchanged.
- **Create** `tierC/rebaseline20.test.ts` — the 20-style whole-mesh re-baseline gate (the final go/no-go harness; runs but does NOT flip the flag).

The flag lives with the existing `__pfConforming*` dev levers (a `globalThis.__pfPerfectMesher` boolean + a plumbed export option), following that established pattern.

---

### Task 1: The flag + byte-identical-off delegation (the zero-regression foundation)

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts` (the outer-wall build call site — locate via `buildConformingOuterWall(`)
- Create: `src/renderers/webgpu/parametric/conforming/tierC/index.ts`
- Test: `src/renderers/webgpu/parametric/conforming/tierC/flagOff.byteIdentical.test.ts`

**Interfaces:**
- Consumes: the existing `buildConformingOuterWall(sampler, opts)` and its `ConformingOuterWallResult`.
- Produces: `buildTierCOuterWall(sampler, opts): ConformingOuterWallResult` (identical signature — a drop-in); `isPerfectMesherEnabled(): boolean` reading `globalThis.__pfPerfectMesher === true` plus the plumbed export option (default false).

- [ ] **Step 1: Write the failing test** — with the flag OFF, `buildTierCOuterWall` returns byte-identical output to `buildConformingOuterWall` for a representative style (hash `result.positions` + `result.indices`).

```ts
// flagOff.byteIdentical.test.ts
import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../SurfaceSampler';
import { buildConformingOuterWall } from '../ConformingOuterWall';
import { buildTierCOuterWall } from './index';
import { hashMesh } from './__testutil'; // simple FNV over Float32Array+indices

describe('Tier-C flag-off is byte-identical', () => {
  it('matches buildConformingOuterWall when flag off', () => {
    (globalThis as any).__pfPerfectMesher = false;
    const sampler = new SyntheticCylinderSampler();
    const opts = { maxSagMm: 0.1, maxEdgeMm: 8, minEdgeMm: 0.006, gradeRatio: 0.2, maxLevel: 10, resU: 256, resT: 256, targetTriangles: 200000 };
    const base = buildConformingOuterWall(sampler, opts);
    const tierC = buildTierCOuterWall(sampler, opts);
    expect(hashMesh(tierC)).toBe(hashMesh(base));
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run src/renderers/webgpu/parametric/conforming/tierC/flagOff.byteIdentical.test.ts`. Expected: FAIL ("buildTierCOuterWall is not a function").

- [ ] **Step 3: gitnexus impact + minimal implementation** — First: `gitnexus_impact({target:"buildConformingOuterWall", direction:"upstream"})` and record the blast radius in the task report. Then implement `buildTierCOuterWall` as a pure delegator: when `!isPerfectMesherEnabled()` return `buildConformingOuterWall(sampler, opts)` unchanged; the flag-on branch throws `Error('tierC not yet wired')` for now (proven unreachable in this test). Add `hashMesh` + `__testutil.ts`.

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS (byte-identical, flag off).

- [ ] **Step 5: Wire the call site behind the flag** — In `ParametricExportComputer.ts`, at the `buildConformingOuterWall(` call site, route through `buildTierCOuterWall` (same args). Run `gitnexus_impact` on the enclosing export function first; if HIGH/CRITICAL, STOP and surface to the human. Run the existing export unit tests to confirm no change.

- [ ] **Step 6: Commit** — `git add` only the touched files (never `-A`); `gitnexus_detect_changes()` first; message `feat(export): stage default-off perfect-mesher Tier-C flag (byte-identical when off)`.

---

### Task 2: Tier-C dispatch — count-unstable style detection

**Files:**
- Create: `tierC/countUnstable.ts`
- Test: `tierC/countUnstable.test.ts`

**Interfaces:**
- Consumes: the existing `featureGraph` output (`detectFeatures` → feature families + birth/merge nodes).
- Produces: `isCountUnstableStyle(styleId: StyleId, graph: FeatureGraph): boolean` — true iff the feature graph has ≥1 birth/merge node (the count-unstable signature; Gothic rib net + GeoStar chevron 6→32). Deterministic, unit-testable without WebGPU.

- [ ] **Step 1: Write the failing test** — asserts `isCountUnstableStyle` is true for a graph with birth/merge nodes, false for a stable/empty graph.

```ts
import { describe, it, expect } from 'vitest';
import { isCountUnstableStyle } from './countUnstable';
describe('count-unstable dispatch', () => {
  it('true when the feature graph has birth/merge nodes', () => {
    expect(isCountUnstableStyle('GothicArches', { families: 2, births: 96, merges: 72 } as any)).toBe(true);
  });
  it('false for a stable/empty graph (Tier-A/B)', () => {
    expect(isCountUnstableStyle('HarmonicRipple', { families: 0, births: 0, merges: 0 } as any)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run the test; Expected: FAIL (module missing).
- [ ] **Step 3: Implement** — `isCountUnstableStyle` returns `graph.births + graph.merges > 0`. (Style id is accepted for future overrides but the predicate is graph-driven, per spec §1 Tier-C definition.)
- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.
- [ ] **Step 5: Wire into the flag-on branch** — In `buildTierCOuterWall`, the flag-on branch: build the feature graph (existing detector), and if `!isCountUnstableStyle(...)` fall back to `buildConformingOuterWall` (Tier-A/B unchanged even with the flag on); only count-unstable styles proceed to the Tier-C pipeline (still throwing `not yet wired` until Task 4).
- [ ] **Step 6: Commit** — detect_changes; `feat(export): Tier-C dispatch predicate (count-unstable feature graph)`.

---

### Task 3: Port the Morse ridge-graph protected complex

**Files:**
- Create: `tierC/morseComplex.ts`
- Test: `tierC/morseComplex.test.ts`

**Interfaces:**
- Consumes: `featureGraph/detectFeatures` + `conditionGraph` (existing); the analytic style sampler.
- Produces: `buildProtectedComplex(sampler, styleId): { vertices: number[]; edges: [number,number][]; junctions: number[]; residualCrossings: number; recoveryPct: number }` — the multi-family Morse 1-skeleton planarized (FGJ `planarizeMM`) into a non-crossing PSLG with junction 0-cells.

- [ ] **Step 1: Write the failing test** — on a Gothic analytic sampler, `buildProtectedComplex` returns `residualCrossings === 0` (the FGJ-proven invariant). Port the exact assertion from `research/bridge/_pf_perfect_gothic*.test.ts`.
- [ ] **Step 2: Run to verify it fails** — module missing.
- [ ] **Step 3: gitnexus impact + port** — impact-check any existing `featureGraph` symbol you extend. Port the FGJ Morse extraction + `planarizeMM` from the research probe into `morseComplex.ts`, reusing `detectFeatures`/`conditionGraph`; do NOT import `research/`.
- [ ] **Step 4: Run to verify it passes** — `residualCrossings === 0`, `recoveryPct >= 99`.
- [ ] **Step 5: (no wiring yet)** — pure module; consumed in Task 4.
- [ ] **Step 6: Commit** — detect_changes; `feat(export): Tier-C Morse protected-complex extractor (residualCrossings 0)`.

---

### Task 4: No-bridge split + whole-mesh interior refine + MANDATORY whole-mesh guard

**Files:**
- Create: `tierC/interiorRuler.ts`, `tierC/noBridgeRefine.ts`
- Test: `tierC/wholeMesh0Outlier.test.ts`

**Interfaces:**
- Consumes: `buildProtectedComplex` (Task 3); `MetricSizingField` (existing); the analytic sampler.
- Produces: `refineToZeroOutliers(sampler, complex, opts): ConformingOuterWallResult` — seeds a metric-Delaunay mesh with the complex locked (no-bridge crest edges), then loops: while ANY free facet's whole-mesh interior deviation > tol, insert a surface-projected arc-length Steiner node + local re-triangulate; the acceptance guard `assertWholeMeshZero(mesh, sampler, tol)` scans EVERY free facet (≥36-pt lattice, full-azimuth nearest). Exposes `countInteriorOutliers(mesh, sampler, tol): number`.

- [ ] **Step 1: Write the failing test** — on a real single-arch Gothic patch, `countInteriorOutliers(refined, sampler, 0.01) === 0` over the WHOLE mesh (every facet), AND `auditNonManByIndex(...) === 0` non-vacuous. Mirror `research/bridge/_pf_perfect_gothic*` VALIDATION-7 assertions (Gothic 32→0, GeoStar 791→0).

```ts
it('Gothic whole-mesh: 0 interior outliers (every facet), watertight', () => {
  const sampler = gothicPatchSampler(/* 4-bay */);
  const complex = buildProtectedComplex(sampler, 'GothicArches');
  const mesh = refineToZeroOutliers(sampler, complex, { tolMm: 0.01 });
  expect(countInteriorOutliers(mesh, sampler, 0.01)).toBe(0); // WHOLE mesh, not top-N
  expect(auditNonManByIndex(mesh.positions, mesh.indices)).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails** — modules missing.
- [ ] **Step 3: gitnexus impact + port** — port the interior ruler (from labkit `bruteNearestOnRadialSurface`) and the no-bridge refine loop; **the guard MUST iterate every free facet** (add a regression test that a top-N-only guard would read 0 while the whole-mesh count is >0, guarding against the VALIDATION-7 blind-spot).
- [ ] **Step 4: Run to verify it passes** — whole-mesh 0 outliers + watertight, both a Gothic and a GeoStar patch fixture.
- [ ] **Step 5: Wire into `buildTierCOuterWall`** — flag-on + count-unstable → `refineToZeroOutliers`; replace the `not yet wired` throw. Re-run the Task-1 byte-identical test (flag off unaffected).
- [ ] **Step 6: Commit** — detect_changes; `feat(export): Tier-C no-bridge whole-mesh 0-outlier refine + mandatory guard`.

---

### Task 5: Collapse-degenerate-faces post-pass (slicer-safe)

**Files:**
- Create: `tierC/collapseDegenerate.ts`
- Test: `tierC/collapseDegenerate.test.ts`

**Interfaces:**
- Consumes: a `ConformingOuterWallResult`.
- Produces: `collapseDegenerateFaces(mesh, epsAreaMm2): ConformingOuterWallResult` — welds UV-collinear/zero-area faces (Gothic's 36) so `zeroAreaFaces === 0`, holding 0-outlier + watertight.

- [ ] **Step 1: Write the failing test** — a mesh with N injected zero-area faces → `collapseDegenerateFaces` yields 0 zero-area faces, unchanged `countInteriorOutliers`, `auditNonManByIndex === 0`.
- [ ] **Step 2: Run to verify it fails** — module missing.
- [ ] **Step 3: Implement** — port the collapse (weld coincident/collinear verts) from the VALIDATION-6 probe.
- [ ] **Step 4: Run to verify it passes** — zeroArea 0, fidelity + watertight held.
- [ ] **Step 5: Wire as the final Tier-C post-pass** in `buildTierCOuterWall`.
- [ ] **Step 6: Commit** — detect_changes; `feat(export): Tier-C degenerate-face collapse post-pass`.

---

### Task 6: The 20-style whole-mesh re-baseline gate (final go/no-go; flag stays off)

**Files:**
- Create: `tierC/rebaseline20.test.ts`
- Modify: `docs/superpowers/plans/2026-07-05-perfect-mesher-backport.md` (append the recorded gate result) — or a sibling results doc.

**Interfaces:**
- Consumes: the full flag-on Tier-C + the existing Tier-A/B path.
- Produces: a test that, with the flag ON, runs all 20 styles and asserts: (a) the 18 Tier-A/B styles are byte-identical to flag-off (dispatch fell back), (b) Gothic + GeoStar are whole-mesh 0-outlier + watertight. Records `%<20` slivers per style as a REPORT (not a gate — the sliver concession is documented, not blocking this staged plan).

- [ ] **Step 1: Write the gate test** — the 20-style loop with the two assertions above + the sliver report. Mark it `it.skip` by default (heavy) with an env gate `PF_REBASELINE20=1`, per the resumable-probe convention.
- [ ] **Step 2: Run it under the env gate** — `PF_REBASELINE20=1 npx vitest run .../rebaseline20.test.ts`. Expected: 18 Tier-A/B byte-identical, Gothic/GeoStar whole-mesh 0-outlier.
- [ ] **Step 3: Record the result + sliver concession** — append the measured 20-style table + the explicit note: *"the flag stays default-OFF; Gothic/GeoStar carry a documented print-safe finite-area needle concession (12 sliver levers refuted); flip is blocked pending sliver close or formal concession acceptance."*
- [ ] **Step 4: Commit** — detect_changes; `test(export): Tier-C 20-style whole-mesh re-baseline gate (flag stays off)`.

---

## Self-Review

**1. Spec coverage (§6 6-task plan):** (1) closer-off M-mesh delegation → Task 1; (2) Tier-C topology (FGJ→planarizeMM→no-bridge) → Tasks 3-4; (3) Tier-C fidelity loop + MANDATORY whole-mesh guard → Task 4; (4) collapse post-pass → Task 5; (5) block-on-slivers → enforced by NOT flipping the flag (Global Constraints + Task 6); (6) 20-style re-baseline before flip → Task 6. All covered.

**2. Placeholder scan:** algorithm bodies reference the proven research probes as source-of-truth (honest — they are validated dev-only; the production work is extraction + flag-gating + tests). Interfaces, tests, flag-gating, and the gate are exact. No "TBD"/"handle edge cases".

**3. Type consistency:** `buildTierCOuterWall` mirrors `buildConformingOuterWall`'s signature + `ConformingOuterWallResult`; `countInteriorOutliers`/`assertWholeMeshZero`/`collapseDegenerateFaces` names are consistent across Tasks 4-6.

**Note on the honest limit of this plan:** the ported algorithms are proven at PATCH scale (Gothic 4-bay / GeoStar multi-bay). Full-pot-scale (>4-bay, full z-height) performance + the Tier-A/B byte-identical guarantee at production density are validated by Task 1 + Task 6; if Task 6 surfaces a full-scale regression, that is a new finding to escalate, not silently absorb.
