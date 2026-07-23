# Production Export Truth audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure — through the real in-app export pipeline on real WebGPU, MAX-first, at production dims + registry defaults — what a user actually gets today (flag-OFF) versus the flag-ON structured mesher, for the 9 closed-and-wired styles, and stamp each closure CLOSED-holds / CLOSED-refuted.

**Architecture:** One new **dev-gated** diagnostic (`diagnoseExportTruth`) on the existing `window.__pfFidelity` hook does one `generateMesh` and returns the full audit row: MAX-first true-3D fidelity (via the shipped `measureRadialFidelity` — global-correct radial projector + honest perpendicular chord, **no exclusion loci** so cliffs are measured), full-mesh watertight (`topologyMetric`), and the real production download gate (`validateMeshForExport`). A Playwright harness toggles the per-style flag map OFF/ON and records the rows. The one geometric risk — that a single-valued radial ruler is honest on the two multi-valued styles (DragonScales, BambooSegments) — is fenced by an **offline Vitest cross-validation** that reproduces the bridge campaign's known MAX (DS ≈0.005, Bamboo ≈0.0074) before any GPU run.

**Tech Stack:** TypeScript, Vitest (unit), Playwright + `--enable-unsafe-webgpu` (e2e driver, `.cjs`), the existing `src/fidelity` rulers.

## Global Constraints

- **Measurement only.** No production code path changes; no flag flips; no new/modified mesher. The sole code touch is the dev-gated hook + its test. `flagOff.byteIdentical.test.ts` and the full suite MUST stay green.
- **Dev-gate parity.** The new hook method lives inside `createFidelityApi`, reachable only under `import.meta.env.DEV || ?fidelity=1` (production imports only types). Byte-identical in production.
- **GitNexus discipline (CLAUDE.md).** Before editing `createFidelityApi` / `diagnoseSurfaceFidelity`, run `impact({target, direction:"upstream"})` and report blast radius. Do not proceed past HIGH/CRITICAL without noting it.
- **ESLint 0-warnings.** The PostToolUse hook runs `eslint --max-warnings=0` on every `.ts` edit; fix all warnings before commit.
- **Vitest location caveat (memory `project_measurement_infra_audit`).** A vitest-version/jsdom breakage was observed running from `potfoundry-web`. Confirm the working command at Task 1 Step 3: try `npm run test -- <file>` in `potfoundry-web`; if it dies on jsdom, run vitest from the repo root config. Record which works.
- **Production geometry.** OD140/H120 defaults ⇒ `H=120, Rb=45, Rt=70`, `expn` = registry default; store dims `{H:120, top_od:140, bottom_od:90, r_drain:10}`. Registry-default style params (no overrides).
- **MAX-first.** Certify on `maxMm ≤ 0.01 ∧ boundaryEdges === 0`. p99/rms are diagnosis only. `nonFiniteCount > 0` or `referenceTrusted === false` ⇒ the row is INCONCLUSIVE, never a confident pass.
- **Git concurrency (memory `feedback_git_concurrency_hazard`).** Concurrent agents move HEAD; `git add` only the exact files each task names (absolute paths), never `git add -A`/`.`.

---

### Task 1: `diagnoseExportTruth` dev hook (fidelity + watertight + download gate in one build)

**Files:**
- Modify: `potfoundry-web/src/fidelity/windowHook.ts` (extract a private `buildRAFromStyleState`; add the `FidelityExportTruthDiagnostics` interface, the `PfFidelityApi.diagnoseExportTruth` signature, and its implementation in `createFidelityApi`)
- Test: `potfoundry-web/src/fidelity/windowHook.exportTruth.test.ts`

**Interfaces:**
- Consumes: `measureRadialFidelity(mesh, ut, rA, {H, tolMm, globalProjector})→RadialFidelityReport` (`src/fidelity/measureRadialFidelity.ts`); `topologyMetric(mesh, weldTol)→{boundaryEdges,nonManifoldEdges,orientationMismatches}` and `triangleQualityDistribution(mesh)→{minAngleDeg,pctBelow20,...}` (`src/fidelity/metrics.ts`); `validateMeshForExport(mesh: MeshData, opts?)→MeshExportValidationReport` (`src/geometry/exportValidation.ts`); `buildAnalyticRadiusFn(styleId, params, {H,Rb,Rt,expn?})` (`src/geometry/analyticRadius.ts`); the existing `getLastConformingAssemblyUT()`, `deps.getStyleState()`, `deps.generateMesh()`, `REFERENCE_PARITY_EPS_MM`, `WELD_TOL_MM`.
- Produces: `PfFidelityApi.diagnoseExportTruth(opts?: FidelityExportTruthDiagnosticOptions): Promise<FidelityExportTruthDiagnostics>` returning
  `{ styleId, triangleCount, vertexCount, maxMm, chordMaxMm, chordP99Mm, vertexMaxMm, referenceTrusted, minAngleDeg, boundaryEdges, nonManifoldEdges, orientationMismatches, downloadOk, downloadErrors, nonFiniteCount }` — the harness (Task 3) consumes exactly these field names.

- [ ] **Step 1: GitNexus impact check (report, do not skip)**

Run `impact({target: "diagnoseSurfaceFidelity", direction: "upstream"})` and `impact({target: "createFidelityApi", direction: "upstream"})`. Report direct callers + risk to the user. The extraction below is a pure lift of the `rAnalytic` construction (windowHook.ts ~L911–944), so expect LOW risk; if impact says otherwise, stop and report.

- [ ] **Step 2: Write the failing test**

```ts
// potfoundry-web/src/fidelity/windowHook.exportTruth.test.ts
import { describe, it, expect } from 'vitest';
import { createFidelityApi, type FidelityHookDeps } from './windowHook';
import type { MeshData } from '../geometry/types';

// A tiny watertight-ish outer-wall square grid (u,t)→3D on a plain cylinder so the
// analytic radius is exact: r0=50, H=120. Two rows × two cols → 1 quad, 2 tris.
function fakeCylinderMesh(): { mesh: MeshData; ut: number[] } {
  const r = 50, H = 120;
  const uts = [ [0,0],[0.5,0],[0,1],[0.5,1] ];
  const verts: number[] = [];
  const ut: number[] = [];
  for (const [u,t] of uts) {
    const th = u * Math.PI * 2;
    verts.push(r*Math.cos(th), r*Math.sin(th), t*H);
    ut.push(u, t, 0); // (u,t,surfaceId) triplet stash shape
  }
  return {
    mesh: { vertices: new Float32Array(verts), indices: new Uint32Array([0,1,3, 0,3,2]),
            vertexCount: 4, triangleCount: 2 } as MeshData,
    ut,
  };
}

function fakeDeps(mesh: MeshData, ut: number[]): FidelityHookDeps {
  // The hook reads the ut stash from getLastConformingAssemblyUT(); the test
  // sets it through the module's stash setter used by the conforming pipeline.
  // (See Step 4: the test imports and calls that setter.)
  return {
    setStyle: () => {}, setDimensions: () => {}, setStyleParams: () => {},
    isAvailable: () => true, isReferenceAvailable: () => true,
    generateMesh: async () => mesh,
    generateReference: async () => null,
    getStyleState: () => ({ opts: {}, H: 120, r0: 50, spinTurns: 0, spinPhaseDeg: 0,
      spinCurveExp: 1, Rt: 50, Rb: 50, expn: 1 }),
  };
}

describe('diagnoseExportTruth', () => {
  it('reports MAX-first fidelity + watertight + download gate for a clean cylinder wall', async () => {
    const { mesh, ut } = fakeCylinderMesh();
    // stash the ut so getLastConformingAssemblyUT() returns it (Step 4 exposes the setter)
    const { __setConformingAssemblyUTForTest } = await import('../renderers/webgpu/ParametricExportComputer');
    __setConformingAssemblyUTForTest(new Float32Array(ut));
    const api = createFidelityApi(fakeDeps(mesh, ut));
    const r = await api.diagnoseExportTruth({ targetTriangles: 100 });
    expect(r.styleId).toBeDefined();
    expect(r.triangleCount).toBe(2);
    expect(Number.isFinite(r.maxMm)).toBe(true);
    expect(r.vertexMaxMm).toBeLessThan(0.01);      // vertices ON the cylinder
    expect(r.referenceTrusted).toBe(true);
    expect(typeof r.downloadOk).toBe('boolean');
    expect(Array.isArray(r.downloadErrors)).toBe(true);
    expect(r.boundaryEdges).toBeGreaterThan(0);    // an open 2-tri patch is not closed
  });
});
```

- [ ] **Step 3: Run the test — verify it fails**

Run (try potfoundry-web first, fall back to repo root per Global Constraints):
`cd potfoundry-web && npx vitest run src/fidelity/windowHook.exportTruth.test.ts`
Expected: FAIL — `api.diagnoseExportTruth is not a function` (and possibly `__setConformingAssemblyUTForTest` missing, added in Step 4).

- [ ] **Step 4: Implement — extract rA helper, add the test-only ut setter, add the method**

In `ParametricExportComputer.ts`, next to the existing `getLastConformingAssemblyUT`, add a dev/test setter (guard so it never ships behavior):
```ts
export function __setConformingAssemblyUTForTest(ut: Float32Array | null): void {
  LAST_CONFORMING_ASSEMBLY_UT = ut; // the same module-level var getLastConformingAssemblyUT reads
}
```

In `windowHook.ts`, lift the `rAnalytic`/`referenceMode` construction currently inline in `diagnoseSurfaceFidelity` (~L911–944) into a module-scope helper, and call it from BOTH sites (DRY):
```ts
function buildRAFromStyleState(
  styleId: string,
  style: NonNullable<ReturnType<NonNullable<FidelityHookDeps['getStyleState']>>>,
): AnalyticRadiusFn {
  const H = style.H, Rt = style.Rt!, Rb = style.Rb!, expn = style.expn!;
  const bellOpts: StyleOptions = { bellAmp: style.bellAmp ?? 0, bellCenter: style.bellCenter ?? 0.5, bellWidth: style.bellWidth ?? 0.22 };
  const r0Of = (t: number): number => baseRadius(t * H, H, Rb, Rt, expn, bellOpts);
  if (styleId === 'SuperformulaBlossom') {
    const [, packed] = buildStyleParamPayload(styleId, style.opts as Record<string, unknown>);
    const p = Float32Array.from(packed);
    const strength = Math.max(0, Math.min(1, p[0]));
    return (theta, z) => { const t = z / H; const r0 = r0Of(t);
      const sf = r0 * (0.9 + 0.35 * sfRf(((theta / TAU) % 1 + 1) % 1, t, p)); return r0 + (sf - r0) * strength; };
  }
  const toCamel = (s: string): string => s.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  const styleOptions: Record<string, number> = {};
  for (const [key, value] of Object.entries(style.opts)) {
    if (typeof value !== 'number') continue; styleOptions[key] = value;
    const camel = toCamel(key); if (camel !== key) styleOptions[camel] = value;
  }
  const fn = getStyleFunction(styleId as StyleId);
  return (theta, z) => { const r = fn(theta, z, r0Of(z / H), H, styleOptions as StyleOptions);
    return Number.isFinite(r) ? r : r0Of(z / H); };
}
```
Refactor `diagnoseSurfaceFidelity` to call `buildRAFromStyleState(styleId, style)` where it built `rAnalytic` (keep its SFB `referenceMode` label logic; only the closure construction moves). Then add the interface + method:
```ts
export interface FidelityExportTruthDiagnosticOptions {
  targetTriangles?: number; tolMm?: number; projectorNTheta?: number; projectorNZ?: number;
}
export interface FidelityExportTruthDiagnostics {
  styleId: string; triangleCount: number; vertexCount: number;
  maxMm: number; chordMaxMm: number; chordP99Mm: number; vertexMaxMm: number; referenceTrusted: boolean;
  minAngleDeg: number; boundaryEdges: number; nonManifoldEdges: number; orientationMismatches: number;
  downloadOk: boolean; downloadErrors: string[]; nonFiniteCount: number;
}
```
```ts
// inside createFidelityApi's returned object:
async diagnoseExportTruth(opts: FidelityExportTruthDiagnosticOptions = {}): Promise<FidelityExportTruthDiagnostics> {
  const styleId = currentStyleId();
  const mesh = await deps.generateMesh(opts.targetTriangles);
  if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
  const view = { vertices: mesh.vertices, indices: mesh.indices };
  const topo = topologyMetric(view, WELD_TOL_MM);
  const q = triangleQualityDistribution(view);
  const dl = validateMeshForExport(mesh);
  const ut = getLastConformingAssemblyUT();
  const style = deps.getStyleState?.() ?? null;
  let fid: import('./measureRadialFidelity').RadialFidelityReport | null = null;
  if (ut && style && ut.length === mesh.vertices.length && Number.isFinite(style.H) && style.H > 0
      && style.spinTurns === 0 && style.spinPhaseDeg === 0
      && style.Rt !== undefined && style.Rb !== undefined && style.expn !== undefined) {
    const rA = buildRAFromStyleState(styleId, style);
    fid = measureRadialFidelity(view, ut, rA, {
      H: style.H, tolMm: opts.tolMm ?? 0.01,
      globalProjector: { nTheta: opts.projectorNTheta ?? 2048, nZ: opts.projectorNZ ?? 512 },
    });
  }
  return {
    styleId, triangleCount: Math.floor(mesh.indices.length / 3), vertexCount: Math.floor(mesh.vertices.length / 3),
    maxMm: fid?.maxMm ?? NaN, chordMaxMm: fid?.chordMaxMm ?? NaN, chordP99Mm: fid?.chordP99Mm ?? NaN,
    vertexMaxMm: fid?.vertexMaxMm ?? NaN, referenceTrusted: fid ? fid.vertexMaxMm <= REFERENCE_PARITY_EPS_MM : false,
    minAngleDeg: q.minAngleDeg, boundaryEdges: topo.boundaryEdges, nonManifoldEdges: topo.nonManifoldEdges,
    orientationMismatches: topo.orientationMismatches, downloadOk: dl.ok, downloadErrors: dl.errors,
    nonFiniteCount: fid?.nonFiniteCount ?? -1,
  };
}
```
Add imports at the top of `windowHook.ts`: `measureRadialFidelity`, `topologyMetric` (already imported), `validateMeshForExport` from `../geometry/exportValidation`, `AnalyticRadiusFn` (already imported). Add `diagnoseExportTruth` to the `PfFidelityApi` interface with the same signature.

- [ ] **Step 5: Run the test — verify it passes**

Run: `cd potfoundry-web && npx vitest run src/fidelity/windowHook.exportTruth.test.ts`
Expected: PASS.

- [ ] **Step 6: Guard rails — lint + the byte-identical + existing fidelity tests stay green**

Run: `cd potfoundry-web && npx eslint src/fidelity/windowHook.ts src/renderers/webgpu/ParametricExportComputer.ts src/fidelity/windowHook.exportTruth.test.ts --max-warnings=0`
Run: `cd potfoundry-web && npx vitest run src/fidelity/windowHook.test.ts src/renderers/webgpu/parametric/conforming/tierC/flagOff.byteIdentical.test.ts`
Expected: lint clean; both suites PASS (the extraction did not change `diagnoseSurfaceFidelity` behavior).

- [ ] **Step 7: Commit**

```bash
git add potfoundry-web/src/fidelity/windowHook.ts potfoundry-web/src/fidelity/windowHook.exportTruth.test.ts potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "feat(fidelity): diagnoseExportTruth dev hook — MAX-first fidelity + watertight + download gate in one build"
```

---

### Task 2: Offline cross-validation — the ruler is honest on the two multi-valued styles

**Files:**
- Test: `potfoundry-web/src/fidelity/exportTruthRuler.crossval.test.ts`

**Interfaces:**
- Consumes: `buildDsConeFanWallGeometric(analyticRA, H, nU)→DsRingStripWall` and `buildBambooRingStripWallGeometric(analyticRA, H, nU, {sagTolMm,nodeCount?})→DsRingStripWall` (exported from `tierC` barrel — each carries 3D `vertices` + flat `ut`); `buildAnalyticRadiusFn(styleId, params, {H,Rb,Rt,expn})`; `measureRadialFidelity`.
- Produces: nothing consumed downstream — this is the trust gate for the multi-valued rows.

**Why:** `measureRadialFidelity` is single-valued-radial scope. The two multi-valued styles are the only place it could silently mis-measure. Both emitters build their walls by evaluating a single-valued `analyticRA`, so measuring their 3D `vertices` against that SAME `rA` with a fine grid and no exclusion loci must reproduce the campaign's honest MAX. If it does, the GPU-run numbers for these styles are trustworthy; if not, the multi-valued rows are stamped INCONCLUSIVE and escalated to `buildParametricSurfaceProjector` (a follow-up, out of this plan).

- [ ] **Step 1: Write the failing test**

```ts
// potfoundry-web/src/fidelity/exportTruthRuler.crossval.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../geometry/analyticRadius';
import { measureRadialFidelity } from './measureRadialFidelity';
import {
  buildDsConeFanWallGeometric, buildBambooRingStripWallGeometric,
} from '../renderers/webgpu/parametric/conforming/tierC';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const GP = { nTheta: 4096, nZ: 1024 }; // fine enough to resolve the ring/tread cliffs

describe('exportTruth ruler cross-validation vs the bridge closures', () => {
  it('DragonScales cone-fan reproduces the bridge MAX (~0.005mm)', () => {
    const rA = buildAnalyticRadiusFn('DragonScales', {}, DIMS);
    const wall = buildDsConeFanWallGeometric(rA, DIMS.H, 4096);
    const r = measureRadialFidelity(
      { vertices: wall.vertices, indices: wall.indices }, wall.ut, rA,
      { H: DIMS.H, tolMm: 0.01, globalProjector: GP },
    );
    expect(r.nonFiniteCount).toBe(0);
    expect(r.vertexMaxMm).toBeLessThan(0.01);         // cone-fan places vertices on rA
    expect(r.maxMm).toBeLessThan(0.012);              // bridge honest MAX 0.005, allow ruler slack
  });

  it('BambooSegments ring-strip reproduces the bridge MAX (~0.0074mm)', () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    const wall = buildBambooRingStripWallGeometric(rA, DIMS.H, 1408, { sagTolMm: 0.004, nodeCount: 5 });
    const r = measureRadialFidelity(
      { vertices: wall.vertices, indices: wall.indices }, wall.ut, rA,
      { H: DIMS.H, tolMm: 0.01, globalProjector: GP },
    );
    expect(r.nonFiniteCount).toBe(0);
    expect(r.vertexMaxMm).toBeLessThan(0.01);
    expect(r.maxMm).toBeLessThan(0.012);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd potfoundry-web && npx vitest run src/fidelity/exportTruthRuler.crossval.test.ts`
Expected outcomes and what each means:
- **PASS** → the single-valued ruler is honest on DS/Bamboo; trust their GPU-run rows.
- **maxMm ≫ 0.012 while vertexMax is tiny** → the projector grid is too coarse to resolve the cliff (raise `GP.nTheta/nZ`); re-run.
- **maxMm ≫ 0.012 AND vertexMax large** → `rA` cannot represent the surface (genuine multi-valued) → mark DS/Bamboo INCONCLUSIVE in the deliverable and open the `buildParametricSurfaceProjector` follow-up. Do NOT fabricate a number.

- [ ] **Step 3: Commit (with the measured verdict in the message)**

```bash
git add potfoundry-web/src/fidelity/exportTruthRuler.crossval.test.ts
git commit -m "test(fidelity): cross-validate the export-truth ruler vs the DS/Bamboo bridge closures"
```

---

### Task 3: The audit harness (`_production_export_truth.cjs`)

**Files:**
- Create: `potfoundry-web/e2e/_production_export_truth.cjs`

**Interfaces:**
- Consumes: `window.__pfFidelity.setStyle/setDimensions/setStyleParams/isReady/diagnoseExportTruth` (Task 1); the flag globals set via `page.addInitScript`.
- Produces: `potfoundry-web/e2e/baselines/production-export-truth-pass1.json` — `{ measuredAt, dims, rows: [{ style, state:'off'|'on', ...FidelityExportTruthDiagnostics, buildMs, flagsApplied, error? }] }`.

- [ ] **Step 1: Write the harness (built on `_authoritative_matrix.cjs` + `_fidelity_flag_validate.cjs`)**

```js
// potfoundry-web/e2e/_production_export_truth.cjs
// Pass-1: the 9 closed-and-wired styles, OFF vs ON, production dims+defaults, real WebGPU.
// Usage: (dev server up on :3001)  node e2e/_production_export_truth.cjs
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 4000000); // production-scale budget
const OUT = process.env.PF_OUT || 'e2e/baselines/production-export-truth-pass1.json';
const DIMS = { H: 120, top_od: 140, bottom_od: 90, r_drain: 10 };
// style -> the ON flag map (all ON runs also set __pfPerfectMesher). See tierC/index.ts.
const ON_FLAGS = {
  HarmonicRipple:     { __pfSmoothGrid: true },
  SuperellipseMorph:  { __pfSmoothGrid: true },
  FourierBloom:       { __pfSmoothGrid: true },
  SpiralRidges:       { __pfSmoothGrid: true },
  SuperformulaBlossom:{ __pfSmoothGrid: true },
  WaveInterference:   { __pfSmoothGrid: true },
  LowPolyFacet:       { __pfSmoothGrid: true },                                   // facet-aligned via FACET_GRID_ALIGN_NU
  DragonScales:       { __pfRegionLayer: true, __pfDsConeFan: true },
  BambooSegments:     { __pfBamboo: true },
};
const STYLES = (process.env.PF_STYLES || Object.keys(ON_FLAGS).join(',')).split(',');
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
const rows = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify({ measuredAt: 'pass1', dims: DIMS, target: TARGET, rows }, null, 2));

async function runState(browser, style, state) {
  const page = await browser.newPage();
  if (state === 'on') {
    const flags = { __pfConforming: true, __pfPerfectMesher: true, ...ON_FLAGS[style] };
    await page.addInitScript((f) => { Object.assign(window, f); }, flags);
  } else {
    await page.addInitScript(() => { window.__pfConforming = true; });
  }
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wt(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 150000, 'setStyle');
  await wt(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIMS), 40000, 'setDims');
  const t0 = Date.now();
  const r = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseExportTruth({ targetTriangles: t }), TARGET), 900000, 'exportTruth');
  const buildMs = Date.now() - t0;
  await page.close();
  return { ...r, buildMs, flagsApplied: state === 'on' ? { __pfPerfectMesher: true, ...ON_FLAGS[style] } : {} };
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 200)); process.exit(3); }
  try {
    for (const style of STYLES) {
      for (const state of ['off', 'on']) {
        try {
          const row = await runState(browser, style, state);
          rows.push({ style, state, ...row });
          console.log(`${style}/${state}: maxMm=${row.maxMm} boundary=${row.boundaryEdges} tris=${row.triangleCount} dl=${row.downloadOk} (${row.buildMs}ms)`);
        } catch (e) {
          rows.push({ style, state, error: String(e.message).slice(0, 200) });
          console.log(`${style}/${state}: ERROR ${String(e.message).slice(0, 120)}`);
        }
        save();
      }
      // flag-plumbing check: ON must differ from OFF (tris or routing) for a wired emitter.
      const off = rows.find((r) => r.style === style && r.state === 'off' && !r.error);
      const on = rows.find((r) => r.style === style && r.state === 'on' && !r.error);
      if (off && on) console.log(`  plumbing ${style}: tris ${off.triangleCount}->${on.triangleCount} ${on.triangleCount !== off.triangleCount ? 'WIRED' : 'UNCHANGED(!)'}`);
    }
  } finally { await browser.close(); save(); }
})();
```

- [ ] **Step 2: Lint the harness (cjs is eslint-checked too if configured; at minimum node-parse it)**

Run: `cd potfoundry-web && node --check e2e/_production_export_truth.cjs`
Expected: no syntax error (exit 0).

- [ ] **Step 3: Commit**

```bash
git add potfoundry-web/e2e/_production_export_truth.cjs
git commit -m "test(e2e): production-export-truth audit harness (9 closed styles, OFF/ON, real WebGPU)"
```

---

### Task 4: Smoke — prove the real-GPU path in this environment (or hand off)

**Files:** none (a run + a recorded finding).

- [ ] **Step 1: Start the dev server (background)**

Run: `cd potfoundry-web && npm run dev` (note the port; harness default expects 3001 — override `PF_BASE_URL` if it is 3000).

- [ ] **Step 2: Run the smoke — one style, both states**

Run: `cd potfoundry-web && PF_STYLES=HarmonicRipple PF_BASE_URL="http://127.0.0.1:3000/?fidelity=1" node e2e/_production_export_truth.cjs`
Expected (feasibility branches):
- **Rows produced** with finite `maxMm`, `boundaryEdges` reported, and `off.triangleCount !== on.triangleCount` (WIRED) → real-GPU path works here; proceed to Task 5.
- **`LAUNCH_FAILED` / exit 3** → headed WebGPU cannot launch in this sandbox. STOP automating the run; hand the harness to the user to run on the real machine (`node e2e/_production_export_truth.cjs`), and record that the deliverable will be filled from their run. The code deliverables (Tasks 1–3) are complete and independently valid.
- **ON `boundaryEdges > 0` or `downloadOk === false`** → a real finding (the emitter mesh is not watertight / fails the production gate through the real pipeline). Record it verbatim; it is exactly the kind of truth this audit exists to surface.

- [ ] **Step 3: Record the smoke verdict** in the run log / to the user (feasibility + the HarmonicRipple OFF/ON row). No commit (no files changed).

---

### Task 5: Full Pass-1 run + render the deliverable table

**Files:**
- Create: `potfoundry-web/research/lab/2026-07-22-production-export-truth.md` (the committed table)
- Output: `potfoundry-web/e2e/baselines/production-export-truth-pass1.json`

- [ ] **Step 1: Run all 9 styles (resumable)**

Run: `cd potfoundry-web && node e2e/_production_export_truth.cjs` (≈30–40 min; each cell saves incrementally to the JSON, so an interrupt can be resumed by re-running with `PF_STYLES` narrowed to the unfinished styles).

- [ ] **Step 2: Render the table from the JSON**

Write `research/lab/2026-07-22-production-export-truth.md` with one row per style:

| Style | OFF maxMm · boundary · tris · dl | ON maxMm · boundary · tris · dl · buildMs | referenceTrusted | verdict |

Fill `verdict` per style: **CLOSED-holds** iff `on.maxMm ≤ 0.01 ∧ on.boundaryEdges === 0 ∧ on.downloadOk ∧ referenceTrusted`; else **CLOSED-refuted (**`gap {on.maxMm}mm` / `non-watertight boundary={on.boundaryEdges}` / `download-gate: {on.downloadErrors[0]}`**)**. For DragonScales/BambooSegments, prefix the verdict with **INCONCLUSIVE** if Task 2's cross-val did not pass. Include the OFF column as the "what users get today" baseline. Note any `off.triangleCount === on.triangleCount` as a **flag-plumbing failure** (emitter not reaching `generateMesh`).

- [ ] **Step 3: Commit the deliverable**

```bash
git add potfoundry-web/research/lab/2026-07-22-production-export-truth.md potfoundry-web/e2e/baselines/production-export-truth-pass1.json
git commit -m "docs(audit): production export truth — Pass-1 (9 closed styles, real-pipeline OFF/ON)"
```

- [ ] **Step 4: Report to the user** — the table + the headline (how many closures actually hold in the real pipeline), and the recommended next increment (enable the holds / fix the refutes / Pass-2 open styles).

---

## Self-Review

**Spec coverage:** deliverable table (Task 5) ✓; real-pipeline MAX-first measurement (Task 1 `diagnoseExportTruth` via `measureRadialFidelity`) ✓; style→flag map (Task 3 `ON_FLAGS`, cross-checked vs `tierC/index.ts`) ✓; multi-valued honesty via cross-validation gate (Task 2) ✓ — **refines the spec's `diagnoseParametricFidelity`/`buildParametricSurfaceProjector` to `measureRadialFidelity` (global-correct, in-`src`) with the parametric projector kept as the documented fallback when Task 2 fails**; flag-plumbing check (Task 3 + Task 4) ✓; download-gate pass (`validateMeshForExport` in Task 1) ✓; empirical feasibility + handoff (Task 4) ✓; non-goals held (no flag flip, no mesher change, dev-gated only) ✓.

**Placeholder scan:** no "TBD/handle-edge-cases"; every code step carries real code; the Task 2/4 branches are *measured verdict routing* (an audit's legitimate output), not deferred work.

**Type consistency:** `FidelityExportTruthDiagnostics` field names are identical in Task 1 (definition), Task 3 (harness reads `maxMm/boundaryEdges/triangleCount/downloadOk`), and Task 5 (table). `measureRadialFidelity` return fields (`maxMm/chordMaxMm/chordP99Mm/vertexMaxMm/minAngleDeg/nonFiniteCount`) match its source. `DsRingStripWall.{vertices,ut,indices}` used in Task 2 match the interface.
