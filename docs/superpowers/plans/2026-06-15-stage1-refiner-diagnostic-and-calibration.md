# Stage 1 — Refiner Diagnostic & Gate Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the committed, measured *gate-input* for the CAD-grade export work — an authoritative dual-gate (chord + triangle-quality) baseline for all 20 styles, a decisive forced-uniform-density experiment that classifies each lattice/weave/braid style as fixable-by-refiner (Option A) vs needs-remesh (Option C), and the calibrated tolerance constants `τ(p)`, `θ_min`, `A_max`.

**Architecture:** This stage is **measurement-first and almost entirely additive** — new e2e probes + recorded data + one small, flag-gated diagnostic dev-global (`__pfConformingUniformLevel`). Production export stays **byte-identical** (the new global defaults off; nothing else in the production path changes). The only TDD unit-test target is the tiny pure resolver for that global; everything else is instrument → run → record → commit.

**Tech Stack:** TypeScript, Vite, Vitest (unit), Playwright + headless Chromium with `--enable-unsafe-webgpu` (e2e probes that drive the real GPU export), the existing `__pfFidelity` window API (`diagnoseSurfaceFidelity`, `diagnoseCrestQuality`).

**Design references:** `docs/superpowers/specs/2026-06-15-cad-grade-dual-gate-export-design.md` (the spec this implements), `docs/superpowers/specs/2026-06-15-perpendicular-3d-rebaseline-findings.md` (the prior perp-3D matrix).

---

## Why this stage exists (the confirmed root cause)

`PeriodicBalancedQuadtree.shouldRefine()` (`src/renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree.ts:336-355`) samples the surface metric **at the cell center only** and compares physical cell size to a target edge length from `MetricSizingField`, which derives that target from **curvature read off a band-limited `resU×resT` grid** (`MetricSizingField.ts:99-104`). A lattice/weave/braid wall passing *between* the cell center and the coarse curvature samples is invisible to the refiner, so it never requests density there. That is why `__pfConformingMaxSag`/`__pfConformingNRing` leave Gyroid wall-triangle count flat (683k→683k): the mesh is "sag-saturated" because the curvature estimate reads ≈0 at the wall, not because a budget cap is hit.

The topology *can* hold more triangles — `minUniformLevel` already forces uniform refinement and is tested (`PeriodicBalancedQuadtree.test.ts:136-151`). The decisive Stage-1 question is therefore: **if we force uniform densification (bypassing the curvature grid), does the perpendicular-3D chord on the lattice styles drop under tolerance with acceptable triangle quality?**
- **Yes** → Option A is viable (the fix is making the refiner *request* the density it already can produce).
- **No / wrecks aspect / explodes triangles** → that style escalates to Option C (Delaunay-refinement remesh).

That experiment is Task 2. Tasks 1, 3, 4 surround it with an authoritative baseline and the calibrated gate.

---

## File structure (what this stage creates/touches)

- **Create** `potfoundry-web/e2e/_fidelity_dualgate_baseline.cjs` — per-style probe: perpendicular-3D chord **and** triangle-quality (min-angle) in one run; emits a machine-readable table + a JSON artifact. (Task 1)
- **Create** `potfoundry-web/src/renderers/webgpu/parametric/conforming/uniformLevelOverride.ts` — tiny pure resolver for the new dev-global (isolated so it unit-tests without importing the heavy export module). (Task 2)
- **Create** `potfoundry-web/src/renderers/webgpu/parametric/conforming/uniformLevelOverride.test.ts` — its unit test. (Task 2)
- **Modify** `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts` — read `__pfConformingUniformLevel` in the existing dev-override block (`:2366`) and feed it into the `minUniformLevel` passed to `assembleWatertight` (`:2629`). (Task 2)
- **Create** `potfoundry-web/e2e/_fidelity_uniform_sweep.cjs` — sweeps `__pfConformingUniformLevel` on the 5 gap styles, measuring perp-chord + min-angle + wallTris. (Task 2)
- **Create** `potfoundry-web/src/fidelity/gateThresholds.ts` — the calibrated `τ(p)` (curvature-relative sag), `θ_min`, `A_max` as a small tested pure module the probes import to print PASS/FAIL. (Task 3)
- **Create** `potfoundry-web/src/fidelity/gateThresholds.test.ts` — pins the calibrated constants on representative inputs. (Task 3)
- **Create** `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-gate-input.md` + the committed JSON artifacts under the same evidence dir — the deliverable that unblocks Stages 2–4. (Tasks 1, 2, 4)

---

## Pre-flight (do once before any task)

- [ ] **P1: Confirm the dev server and clean GPU.** In `potfoundry-web/`, start the dev server in its own terminal: `npm run dev` (serves `http://localhost:3000`; the probes default to `http://127.0.0.1:3000/?fidelity=1`). Leave it running for every probe task.

- [ ] **P2: GPU hygiene contract.** The probes launch `chromium` with `headless: false` and `--enable-unsafe-webgpu` (WebGPU needs a real GPU context). **Never hard-kill a probe's node process** — it orphans the Chromium GPU processes and degrades the GPU ~3× for the rest of the session. Let each probe reach `browser.close()`. If a run is stuck, close the Chromium window or `Stop-Process -Name chrome -Force` afterward. Sanity: a 250k-triangle export should finish in ~50s on a healthy GPU.

- [ ] **P3: Baseline green.** Run `npm run typecheck` and `npm run test` once and confirm they pass before changing anything, so later failures are attributable.

---

## Task 1: Authoritative dual-gate baseline (chord + triangle-quality), recorded & committed

**Why:** Per the project's measurement-first rule, the gate-input must be committed measured data, not prose. The prior perp-3D table exists only in a findings doc and lacks the triangle-quality dimension. This task produces one committed artifact carrying both gates for all 20 styles at a **fixed** sampling resolution (the handoff's hard lesson: never vary `denseN` within a comparison).

**Files:**
- Create: `potfoundry-web/e2e/_fidelity_dualgate_baseline.cjs`
- Create (output): `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-dualgate-baseline.json`

- [ ] **Step 1: Write the dual-gate probe.**

Create `potfoundry-web/e2e/_fidelity_dualgate_baseline.cjs`:

```javascript
// STAGE-1 DUAL-GATE BASELINE — perpendicular-3D chord AND reference-free triangle
// quality (min interior angle) per style, in ONE deterministic build each, at a
// FIXED denseN (never vary sampling within a comparison). Emits a table + JSON.
//
// Usage: node e2e/_fidelity_dualgate_baseline.cjs                  (dev server up)
//        PF_STYLES=GyroidManifold,BasketWeave node e2e/_fidelity_dualgate_baseline.cjs
//        PF_DENSE_N=6 PF_TARGET_TRIS=1000000 node e2e/_fidelity_dualgate_baseline.cjs
const fs = require('fs');
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);
const DENSE_N = Number(process.env.PF_DENSE_N || 6);   // FIXED thorough sampling
const ANGLE_BAR = Number(process.env.PF_ANGLE_BAR || 20); // min-angle bar (deg)
const REF_RES = Number(process.env.PF_REF_RES || 512);
const OUT = process.env.PF_OUT ||
  '../docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-dualgate-baseline.json';
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 600000);
const ALL_STYLES = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph',
  'HarmonicRipple', 'LowPolyFacet', 'GothicArches', 'WaveInterference',
  'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments',
  'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra',
];
const ONLY = (process.env.PF_STYLES || '').split(',').map((s) => s.trim()).filter(Boolean);
const STYLES = ONLY.length ? ONLY : ALL_STYLES;

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runStyle(browser, style) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(([refRes]) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (refRes > 0) { window.__pfReferenceDenseRes = refRes; window.__pfReferenceBicubic = true; }
    }, [REF_RES]);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    if (style === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'params');
    const perp = await withTimeout(page.evaluate(([tgt, dn]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: tgt, denseN: dn, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'perp');
    const qual = await withTimeout(page.evaluate(([tgt, bar]) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: tgt, angleBarDeg: bar }), [TARGET, ANGLE_BAR]), DIAG_TIMEOUT, 'quality');
    return { perp, qual };
  } finally {
    await page.close();
  }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== STAGE-1 DUAL-GATE BASELINE (denseN=${DENSE_N}, targetTris=${TARGET}, angleBar=${ANGLE_BAR}deg) ===`);
  console.log('style                | perpChord | perp_p99 | nAbove%  | vtxMax  | worstMinAng | p1MinAng | %<bar  | wallTris');
  const rows = [];
  for (const style of STYLES) {
    let r = null, err = null;
    try { r = await runStyle(browser, style); }
    catch (e) { err = String(e.message).slice(0, 80); }
    if (err || !r || !r.perp) { console.log(`${style.padEnd(20)} | ERROR ${err || 'null'}`); rows.push({ style, error: err || 'null' }); continue; }
    const p = r.perp, q = r.qual || {};
    const naPct = (100 * (p.nAbove || 0) / Math.max(1, p.samples)).toFixed(3);
    console.log(
      `${style.padEnd(20)} | ${(p.chordMaxMm).toFixed(4)} | ${(p.p99DevMm).toFixed(4)} | ${naPct.padStart(7)}% | ${(p.vertexMaxMm).toFixed(4)} | ${(q.worstMinAngleDeg ?? -1).toFixed(2).padStart(10)} | ${(q.p1MinAngleDeg ?? -1).toFixed(2).padStart(7)} | ${(q.pctBelow15 ?? -1).toFixed(2).padStart(5)}% | ${p.wallTriangles}`);
    rows.push({
      style,
      perpChordMaxMm: p.chordMaxMm, perpP99Mm: p.p99DevMm, nAbove: p.nAbove, samples: p.samples,
      vertexMaxMm: p.vertexMaxMm, referenceTrusted: p.referenceTrusted, wallTriangles: p.wallTriangles,
      worstMinAngleDeg: q.worstMinAngleDeg, p1MinAngleDeg: q.p1MinAngleDeg, pctBelowBar: q.pctBelow15, angleBarDeg: q.angleBarDeg,
    });
  }
  await browser.close();
  fs.writeFileSync(require('path').resolve(__dirname, OUT), JSON.stringify({ target: TARGET, denseN: DENSE_N, angleBar: ANGLE_BAR, rows }, null, 2));
  console.log(`\nWrote ${rows.length} rows → ${OUT}`);
})();
```

- [ ] **Step 2: Smoke-run the probe on two fast styles to verify the API shape.**

Run (dev server up, from `potfoundry-web/`):
```bash
PF_STYLES=HarmonicRipple,GeometricStar node e2e/_fidelity_dualgate_baseline.cjs
```
Expected: two table rows print with non-error numeric columns (e.g. HarmonicRipple `perpChord ~0.068`, a `worstMinAng` and `p1MinAng` in degrees, `%<bar` a small percentage), and `Wrote 2 rows`. If `diagnoseCrestQuality` returns null, stop and check the method name against `src/fidelity/windowHook.ts` (it should be `diagnoseCrestQuality`).

- [ ] **Step 3: Run the full 20-style baseline.**

Run (this is the slow authoritative pass — denseN=6 across 20 styles can take ~45–60 min; let it finish, do not kill):
```bash
node e2e/_fidelity_dualgate_baseline.cjs
```
Expected: 20 rows, the JSON artifact written to `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-dualgate-baseline.json`. Spot-check that the 5 known gap styles (GyroidManifold, BasketWeave, CelticTriquetra, CelticKnot, GothicArches) show `perp_p99` in the 0.16–0.49 range consistent with the prior re-baseline, and that `vtxMax` is ~f32 floor (< 0.01) everywhere except Voronoi.

- [ ] **Step 4: Commit the probe + the baseline artifact.**

```bash
git add potfoundry-web/e2e/_fidelity_dualgate_baseline.cjs docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-dualgate-baseline.json
git commit -m "test(fidelity): Stage-1 dual-gate baseline (perp-3D chord + min-angle, 20 styles)"
```

(No production symbol changed → `gitnexus_detect_changes` will show only the new probe; run it to confirm scope before committing if the harness mandates it.)

---

## Task 2: Forced-uniform-density discriminator (`__pfConformingUniformLevel`) — the A-vs-C fork

**Why:** Decide, per gap style, whether isotropic densification (which the topology already supports via `minUniformLevel`) closes the perpendicular-3D chord with acceptable triangle quality. This is the single experiment that routes each style to Stage 3 (A) or Stage 4 (C).

**Files:**
- Create: `potfoundry-web/src/renderers/webgpu/parametric/conforming/uniformLevelOverride.ts`
- Create: `potfoundry-web/src/renderers/webgpu/parametric/conforming/uniformLevelOverride.test.ts`
- Modify: `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts:2366` (dev-override cast) and `:2629` (the `minUniformLevel` passed to `assembleWatertight`)
- Create: `potfoundry-web/e2e/_fidelity_uniform_sweep.cjs`
- Create (output): `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-uniform-sweep.json`

- [ ] **Step 1: Write the failing unit test for the pure resolver.**

Create `potfoundry-web/src/renderers/webgpu/parametric/conforming/uniformLevelOverride.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveUniformLevelOverride } from './uniformLevelOverride';

describe('resolveUniformLevelOverride', () => {
  it('returns undefined when neither crease-derived level nor override is set', () => {
    expect(resolveUniformLevelOverride(0, 0)).toBeUndefined();
  });
  it('returns the crease-derived level when no override (production byte-identical)', () => {
    expect(resolveUniformLevelOverride(5, 0)).toBe(5);
  });
  it('returns the override when it exceeds the crease-derived level', () => {
    expect(resolveUniformLevelOverride(0, 8)).toBe(8);
    expect(resolveUniformLevelOverride(5, 8)).toBe(8);
  });
  it('never lowers the crease-derived floor', () => {
    expect(resolveUniformLevelOverride(7, 3)).toBe(7);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run:
```bash
npx vitest run src/renderers/webgpu/parametric/conforming/uniformLevelOverride.test.ts
```
Expected: FAIL — `Cannot find module './uniformLevelOverride'`.

- [ ] **Step 3: Implement the pure resolver.**

Create `potfoundry-web/src/renderers/webgpu/parametric/conforming/uniformLevelOverride.ts`:

```typescript
/**
 * Resolves the quadtree `minUniformLevel` from the production crease-derived floor
 * and the diagnostic `__pfConformingUniformLevel` override. The override only ever
 * RAISES the uniform floor (never lowers the crease pin), and is 0/unset in
 * production so this returns the crease-derived value unchanged → byte-identical.
 *
 * Diagnostic use only (Stage-1 A-vs-C discriminator): forcing a high uniform level
 * bypasses the curvature-grid refiner to test whether isotropic densification closes
 * the perpendicular-3D chord gap on lattice/weave/braid styles.
 */
export function resolveUniformLevelOverride(
  creaseDerivedLevel: number,
  override: number,
): number | undefined {
  const base = Math.max(creaseDerivedLevel, override);
  return base > 0 ? base : undefined;
}
```

- [ ] **Step 4: Run the test and confirm it passes.**

Run:
```bash
npx vitest run src/renderers/webgpu/parametric/conforming/uniformLevelOverride.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Run impact analysis before editing the export module (CLAUDE.md mandate).**

Run `gitnexus_impact({ target: "summarizeConformingValidation", direction: "upstream" })` is NOT the target; the edit touches the `compute` flow in `ParametricExportComputer.ts`. Run impact on the enclosing exported symbol you are about to modify (the conforming compute path) and report the blast radius. Expected: MEDIUM/internal (diagnostic-gated). If HIGH/CRITICAL, stop and surface to the user before continuing.

- [ ] **Step 6: Wire the dev-global into the export path.**

In `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts`, add the import near the other conforming imports at the top of the file:

```typescript
import { resolveUniformLevelOverride } from './parametric/conforming/uniformLevelOverride';
```

In the dev-override cast block (the `const qOv = globalThis as unknown as { ... }` starting at line 2365), add the new optional field alongside `__pfConformingNRing`:

```typescript
                    __pfConformingMaxEdge?: number; __pfConformingNRing?: number;
                    // Stage-1 diagnostic: force a uniform quadtree floor to test
                    // whether isotropic densification closes the perp-3D chord gap
                    // on lattice styles (A-vs-C fork). 0/unset in production.
                    __pfConformingUniformLevel?: number;
```

Immediately after the `qNRing` computation (the block ending around line 2431), add:

```typescript
                const qUniformLevel =
                    typeof qOv.__pfConformingUniformLevel === 'number' && qOv.__pfConformingUniformLevel > 0
                        ? Math.round(qOv.__pfConformingUniformLevel)
                        : 0;
```

At the `assembleWatertight(...)` call, replace the existing `minUniformLevel:` property (lines ~2629-2632, currently the `Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level) > 0 ? ... : undefined` ternary) with:

```typescript
                        minUniformLevel: resolveUniformLevelOverride(
                            Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level),
                            qUniformLevel,
                        ),
```

(The PostToolUse ESLint hook runs on save; fix any warning — 0-warnings is CI-enforced.)

- [ ] **Step 7: Verify byte-identical-when-off and types.**

Run:
```bash
npm run typecheck && npm run test
```
Expected: PASS. The existing conforming/validation tests must be unchanged (the override is 0/unset → `resolveUniformLevelOverride` returns the same value the old ternary did). If any conforming snapshot test changes, stop — the wiring altered the default path and is not byte-identical.

- [ ] **Step 8: Commit the diagnostic lever.**

Run `gitnexus_detect_changes()` and confirm only the intended symbols/flow changed, then:
```bash
git add potfoundry-web/src/renderers/webgpu/parametric/conforming/uniformLevelOverride.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/uniformLevelOverride.test.ts potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "feat(fidelity): __pfConformingUniformLevel diagnostic lever (flag-gated, byte-identical off)"
```

- [ ] **Step 9: Write the uniform-sweep probe.**

Create `potfoundry-web/e2e/_fidelity_uniform_sweep.cjs`:

```javascript
// STAGE-1 A-vs-C DISCRIMINATOR — force uniform quadtree density (bypassing the
// curvature-grid refiner) on the lattice/weave/braid gap styles and measure whether
// the perpendicular-3D chord drops under tol WITH acceptable triangle quality.
//   drops + quality OK  -> Option A (refiner just needs to request density)
//   flat / quality bad / tris explode -> Option C (remesh)
//
// Usage: PF_STYLE=GyroidManifold PF_LEVELS=0,7,8,9 node e2e/_fidelity_uniform_sweep.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'GyroidManifold';
const LEVELS = (process.env.PF_LEVELS || '0,7,8,9').split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
const TARGET = Number(process.env.PF_TARGET_TRIS || 4000000); // generous; uniform forcing needs headroom
const DENSE_N = Number(process.env.PF_DENSE_N || 6);          // FIXED
const ANGLE_BAR = Number(process.env.PF_ANGLE_BAR || 20);
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 600000);

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runLevel(browser, level) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(([lvl]) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (lvl > 0) window.__pfConformingUniformLevel = lvl; // 0 = profile default (baseline)
    }, [level]);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    const perp = await withTimeout(page.evaluate(([t, d]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: d, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'perp');
    const qual = await withTimeout(page.evaluate(([t, b]) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: b }), [TARGET, ANGLE_BAR]), DIAG_TIMEOUT, 'qual');
    return { perp, qual };
  } finally { await page.close(); }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== UNIFORM SWEEP ${STYLE} (denseN=${DENSE_N}, target=${TARGET}) ===`);
  console.log('uniformLvl | perpChord | perp_p99 | nAbove%  | worstMinAng | p1MinAng | %<bar  | wallTris');
  for (const lvl of LEVELS) {
    let r = null, err = null;
    try { r = await runLevel(browser, lvl); } catch (e) { err = String(e.message).slice(0, 60); }
    if (err || !r || !r.perp) { console.log(`${String(lvl).padStart(10)} | ERROR ${err || 'null'}`); continue; }
    const p = r.perp, q = r.qual || {};
    const naPct = (100 * (p.nAbove || 0) / Math.max(1, p.samples)).toFixed(3);
    console.log(`${String(lvl).padStart(10)} | ${(p.chordMaxMm).toFixed(4)} | ${(p.p99DevMm).toFixed(4)} | ${naPct.padStart(7)}% | ${(q.worstMinAngleDeg ?? -1).toFixed(2).padStart(10)} | ${(q.p1MinAngleDeg ?? -1).toFixed(2).padStart(7)} | ${(q.pctBelow15 ?? -1).toFixed(2).padStart(5)}% | ${p.wallTriangles}`);
  }
  await browser.close();
})();
```

- [ ] **Step 10: Run the discriminator on all 5 gap styles, recording each sweep.**

Run, per style, capturing stdout (do not kill mid-run):
```bash
PF_STYLE=GyroidManifold  PF_LEVELS=0,7,8,9 node e2e/_fidelity_uniform_sweep.cjs
PF_STYLE=BasketWeave     PF_LEVELS=0,7,8,9 node e2e/_fidelity_uniform_sweep.cjs
PF_STYLE=CelticTriquetra PF_LEVELS=0,7,8,9 node e2e/_fidelity_uniform_sweep.cjs
PF_STYLE=CelticKnot      PF_LEVELS=0,7,8,9 node e2e/_fidelity_uniform_sweep.cjs
PF_STYLE=GothicArches    PF_LEVELS=0,7,8,9 node e2e/_fidelity_uniform_sweep.cjs
```
Expected per style: a monotone(ish) table where `uniformLvl=0` reproduces the baseline `perp_p99`, and higher levels either (a) drive `perp_p99` under the chord tol while `worstMinAng`/`%<bar` stay healthy → **A**, or (b) stall / wreck min-angle / blow up `wallTris` → **C**. Record the verdict per style.

- [ ] **Step 11: Persist the sweep results.**

Paste each style's table into `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-uniform-sweep.json` (or a `.md` table) with a one-line A/C verdict per style and the level at which the chord crossed tol (if it did).

- [ ] **Step 12: Commit the probe + recorded sweep.**

```bash
git add potfoundry-web/e2e/_fidelity_uniform_sweep.cjs docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-uniform-sweep.json
git commit -m "test(fidelity): Stage-1 uniform-density A-vs-C discriminator + recorded sweep"
```

---

## Task 3: Calibrate and pin `τ(p)`, `θ_min`, `A_max`

**Why:** Turn the qualitative bar ("CAD-grade, no slivers, no stretched facets") into a tested, code-shared gate the probes and (later) CI assert against. Calibrate from Task 1/2 data so the already-clean styles pass comfortably and the bar still catches the gaps.

**Files:**
- Create: `potfoundry-web/src/fidelity/gateThresholds.ts`
- Create: `potfoundry-web/src/fidelity/gateThresholds.test.ts`

- [ ] **Step 1: Derive the constants from the recorded data (analysis, write the numbers down first).**

From `stage1-dualgate-baseline.json`:
- **`θ_min` (min-angle bar):** the clean styles' `worstMinAngleDeg` / `p1MinAngleDeg` set the achievable floor. Choose `θ_min` = the largest round value (e.g. 20°) such that the already-clean styles pass and the slivered styles (the 9/20 from the uBias re-baseline, SpiralRidges) fail. Record the chosen value + which styles sit just above/below it.
- **`A_max` (aspect bar):** a sliver has both small min-angle and high aspect; set `A_max` consistent with `θ_min` for an isotropic triangle (e.g. `A_max ≈ 1 / (2·sin(θ_min))` as a guide). Record the value.
- **`τ(p)` (curvature-relative sag):** a chord-height tolerance whose allowance scales with local feature size, clamped: `τ(p) = clamp(epsRel * featureSizeMm(p), tauFloorMm, tauCeilMm)`. Set `tauCeilMm` to the CAD-interchange bar (start from the perp-baseline's CAD line, `PF_CHORD_TOL_MM` default 0.1mm, tighten toward 0.05 if the clean styles already clear it), `tauFloorMm` near the f32/sampling floor (~0.005mm), and `epsRel` so the smooth styles pass with margin. **Pin exact numbers from the data, not guesses**, and record the rationale.

- [ ] **Step 2: Write the failing test that pins the constants and the τ function.**

Create `potfoundry-web/src/fidelity/gateThresholds.test.ts` (fill the numeric expectations with the values chosen in Step 1 — example values shown; replace with the calibrated ones):

```typescript
import { describe, it, expect } from 'vitest';
import { GATE_THRESHOLDS, chordToleranceMm } from './gateThresholds';

describe('gateThresholds', () => {
  it('pins the calibrated quality bars', () => {
    expect(GATE_THRESHOLDS.minAngleDeg).toBe(20);     // ← replace with calibrated θ_min
    expect(GATE_THRESHOLDS.maxAspect).toBeCloseTo(1.46, 2); // ← calibrated A_max
  });
  it('chord tolerance clamps to the ceiling on large smooth features', () => {
    expect(chordToleranceMm(1000)).toBeCloseTo(GATE_THRESHOLDS.tauCeilMm, 6);
  });
  it('chord tolerance clamps to the floor on tiny sharp features', () => {
    expect(chordToleranceMm(0.0001)).toBeCloseTo(GATE_THRESHOLDS.tauFloorMm, 6);
  });
  it('chord tolerance scales with feature size in the mid band', () => {
    const mid = chordToleranceMm(0.5);
    expect(mid).toBeGreaterThan(GATE_THRESHOLDS.tauFloorMm);
    expect(mid).toBeLessThan(GATE_THRESHOLDS.tauCeilMm);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails.**

```bash
npx vitest run src/fidelity/gateThresholds.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the calibrated module (substitute the Step-1 numbers).**

Create `potfoundry-web/src/fidelity/gateThresholds.ts`:

```typescript
/**
 * Calibrated CAD-grade dual-gate thresholds (Stage 1 output). Numbers pinned from
 * the committed baseline (stage1-dualgate-baseline.json) + uniform sweep. Consumed
 * by the fidelity probes (and, in Stage 5, the CI gate) — NOT wired into the
 * production export path in Stage 1.
 */
export const GATE_THRESHOLDS = {
  minAngleDeg: 20,     // θ_min — replace with calibrated value
  maxAspect: 1.46,     // A_max — replace with calibrated value
  epsRel: 0.05,        // curvature-relative sag fraction — calibrated
  tauFloorMm: 0.005,   // absolute floor (f32/sampling) — calibrated
  tauCeilMm: 0.1,      // CAD-interchange ceiling — calibrated
} as const;

/** Curvature-relative chord (sag) tolerance at a point with the given local feature size (mm). */
export function chordToleranceMm(featureSizeMm: number): number {
  const t = GATE_THRESHOLDS.epsRel * featureSizeMm;
  return Math.min(GATE_THRESHOLDS.tauCeilMm, Math.max(GATE_THRESHOLDS.tauFloorMm, t));
}
```

- [ ] **Step 5: Run the test and confirm it passes; lint/typecheck clean.**

```bash
npx vitest run src/fidelity/gateThresholds.test.ts && npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add potfoundry-web/src/fidelity/gateThresholds.ts potfoundry-web/src/fidelity/gateThresholds.test.ts
git commit -m "feat(fidelity): calibrated dual-gate thresholds (tau curvature-relative, theta_min, A_max)"
```

---

## Task 4: Write & commit the Stage-1 gate-input document (unblocks Stages 2–4)

**Why:** Synthesize the measured artifacts into the single decision document the next stages consume: the per-style classification and the calibrated gate.

**Files:**
- Create: `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-gate-input.md`

- [ ] **Step 1: Write the gate-input document.**

Create `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-gate-input.md` containing, with numbers pulled from the committed JSON artifacts (no prose-only claims):

1. **The dual-gate baseline matrix** — one row per style: `perpChordMax`, `perpP99`, `nAbove%`, `vtxMax`, `worstMinAngle`, `p1MinAngle`, `%<θ_min`, `wallTris`. Annotate each row PASS/FAIL against the calibrated gate (`chordToleranceMm` + `θ_min`).
2. **Per-style classification** into `{already-passes, fixable-by-refiner (A), needs-remesh (C), irreducible-C0}` with the **evidence**: for the 5 gap styles, the uniform-sweep verdict (did forcing uniform density cross the chord tol with healthy min-angle, and at what level / triangle cost?).
3. **The calibrated gate** — `τ(p)` form + `epsRel/tauFloor/tauCeil`, `θ_min`, `A_max`, each with its data rationale.
4. **The Stage-2/3 decision** — whether the quality workstream (Stage 2) and the refiner fix (Stage 3) share one change or stay separate (informed by whether the slivered styles overlap the gap styles).
5. **Carry-forward risks** — any style where uniform density blew up `wallTris` (Option-C candidate + the triangle-budget concern for Stage 3), and the Voronoi ref-untrusted note.

- [ ] **Step 2: Commit the deliverable.**

```bash
git add docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-gate-input.md
git commit -m "docs(fidelity): Stage-1 gate-input — dual-gate baseline, A-vs-C classification, calibrated gate"
```

---

## Self-review (run before handing off)

- **Spec coverage:** Stage-1 spec items — authoritative baseline (Task 1), the A-vs-C diagnostic (Task 2), calibrated `τ(p)`/`θ_min`/`A_max` (Task 3), the gate-input doc (Task 4). All covered. The spec's "Stage 0" is already done (in the design doc), not repeated here.
- **Byte-identical guarantee:** the only production-path edit is Task 2's dev-global, proven byte-identical-when-off by Step 7 (existing conforming tests unchanged) and the pure-resolver unit test. No other task touches production code.
- **No placeholders:** every probe and module is shown in full. The ONE intentionally-deferred set of values is the calibrated constants in Task 3 — these are explicit measurement outputs (Step 1 derives them from committed data before the test pins them), not vague TBDs; the example numbers are flagged "replace with calibrated value."
- **Type/name consistency:** `resolveUniformLevelOverride` (Task 2) and `chordToleranceMm` / `GATE_THRESHOLDS` (Task 3) are referenced consistently. Probe API calls (`diagnoseSurfaceFidelity({metric:'perpendicular',denseN})`, `diagnoseCrestQuality({angleBarDeg})`) match the verified `__pfFidelity` signatures.
- **Project mandates baked in:** GitNexus `impact` before the export edit (Task 2 Step 5), `detect_changes` before commits, ESLint 0-warnings via the PostToolUse hook, fixed `denseN` per the handoff's confound lesson, and GPU hygiene (let probes finish).
```
