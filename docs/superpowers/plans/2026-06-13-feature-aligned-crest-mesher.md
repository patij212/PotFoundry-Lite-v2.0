# Feature-Aligned Crest Mesher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate sharp-crest serration in the conforming exporter by meshing feature crests/valleys with a feature-aligned lattice (min ≈17° 3D, 0% sub-15°, watertight by construction), flag-gated, starting with SuperformulaBlossom.

**Architecture:** A t-dependent periodic monotone u-warp (`CreasePetalWarp`, the t-parameterized generalization of `CreaseUWarp`) pins mesh columns onto the analytic crest+valley loci at every height, applied per-vertex AFTER triangulation so connectivity (hence watertightness) is byte-untouched; column density tracks `m(t)` via the existing 2:1 directional u-refine so every flank cell satisfies cross ≤ along. Seam = accepted cliff (out of scope). Full design + evidence: `docs/superpowers/specs/2026-06-13-feature-aligned-crest-mesher-design.md`.

**Tech Stack:** TypeScript, the conforming mesher (`src/renderers/webgpu/parametric/conforming/`), Vitest (CPU probes in `src/fidelity/`), Playwright/WebGPU (e2e export-fidelity). No new deps.

**Pre-registered gates:** the 9 committed fidelity probes are the acceptance gates. Run from `potfoundry-web/`: `npx vitest run src/fidelity/<probe>.test.ts`.

---

## File Structure

- Create: `src/renderers/webgpu/parametric/conforming/CreasePetalWarp.ts` — the t-dependent warp (reuses `buildCreaseUWarp`/`applyUWarp` per height). One responsibility: feature-aligned u-remap.
- Create: `src/renderers/webgpu/parametric/conforming/CreasePetalWarp.test.ts` — unit tests (monotone homeo per t, seam-fixed, refuse-on-unsafe, births, pins loci).
- Modify: `src/renderers/webgpu/parametric/contracts.ts` — add `featurePetalWarp` flag (default false) + resolve it (mirror `conformingMesher`).
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts` — apply `applyPetalWarp` in the warp sweep (where `applyHelixWarp`/`applyUWarp` run), flag-gated, SFB-class only.
- Modify: `src/renderers/webgpu/parametric/conforming/ConformingWall.ts` — thread feature-aware u-refine sizing so column density tracks `m(t)` (reuse directional u-refine).
- Create: `src/fidelity/petalWarpIntegration.test.ts` — Stage-3 gate: real `assembleWatertight` end-to-end (topology zeros + 3D floor + crest deviation).

---

### Task 0: Feature flag scaffolding (reversible, no behavior change)

**Files:**
- Modify: `src/renderers/webgpu/parametric/contracts.ts` (`FeatureFlags`, `DEFAULT_FEATURE_FLAGS`, `resolveFeatureFlags`)
- Test: `src/renderers/webgpu/parametric/contracts.test.ts`

- [ ] **Step 1: Write the failing test** (add to contracts.test.ts)

```ts
it('featurePetalWarp defaults OFF and is overridable (reversibility)', () => {
  expect(DEFAULT_FEATURE_FLAGS.featurePetalWarp).toBe(false);
  expect(resolveFeatureFlags(undefined).featurePetalWarp).toBe(false);
  expect(resolveFeatureFlags({ featurePetalWarp: true }).featurePetalWarp).toBe(true);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/renderers/webgpu/parametric/contracts.test.ts`
Expected: FAIL (`featurePetalWarp` undefined).

- [ ] **Step 3: Add the flag** — in `contracts.ts`: add `readonly featurePetalWarp?: boolean;` to `FeatureFlags`; `featurePetalWarp: false` to `DEFAULT_FEATURE_FLAGS`; and in `resolveFeatureFlags` add `featurePetalWarp: overrides.featurePetalWarp ?? DEFAULT_FEATURE_FLAGS.featurePetalWarp` (use `??`, NOT `Boolean()` — the conformingMesher lesson).

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/renderers/webgpu/parametric/contracts.test.ts` → PASS. Also `npx eslint src/renderers/webgpu/parametric/contracts.ts --max-warnings=0`.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/parametric/contracts.ts src/renderers/webgpu/parametric/contracts.test.ts
git commit -m "feat(petal-warp): add featurePetalWarp flag (default off, reversible)"
```

---

### Task 1: `CreasePetalWarp` — the t-dependent feature-aligned warp

**Files:**
- Create: `src/renderers/webgpu/parametric/conforming/CreasePetalWarp.ts`
- Test: `src/renderers/webgpu/parametric/conforming/CreasePetalWarp.test.ts`

Design: at height t, the SFB crest+valley loci are `u*_j(t)=(2j−1)/(2m(t))` (crest) and `j/m(t)` (valley) for every j whose locus < 1 (born). `buildPetalWarpAt(params, grid, t)` computes those loci and DELEGATES to the existing `buildCreaseUWarp(loci, grid)` — inheriting its monotone-homeo + refuse-on-unsafe + watertight contract. `applyPetalWarp` caches the per-t warp (vertices share t-rows). m(t) mirrors `sfMOf` (single source of truth = the closed-form ridge).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { applyUWarp } from './CreaseUWarp';
import { buildPetalWarpAt, applyPetalWarp } from './CreasePetalWarp';

const SFB1 = [1, 6, 10, 1.2, 0.35, 0.5, 0.8, 1.4, 0.8, 0.8, 1, 1];
const mOf = (t: number): number => 6 + 4 * Math.pow(Math.max(0, Math.min(1, t)), 1.2);

describe('CreasePetalWarp', () => {
  it('pins a column onto every born crest locus at a given t', () => {
    const t = 1; // m=10 → crests at (2j-1)/20
    const w = buildPetalWarpAt(SFB1, 2048, t);
    for (let j = 1; j <= 10; j++) {
      const crest = (2 * j - 1) / (2 * mOf(t));
      // some source column maps within one grid cell of the crest
      const nearest = Math.round(crest * 2048) / 2048;
      expect(Math.abs(applyUWarp(w, nearest) - crest)).toBeLessThan(1 / 2048);
    }
  });
  it('is a monotone circle homeomorphism with the seam fixed', () => {
    const w = buildPetalWarpAt(SFB1, 2048, 0.5);
    expect(applyUWarp(w, 0)).toBeCloseTo(0, 9);
    expect(applyUWarp(w, 1)).toBeCloseTo(1, 9);
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const v = applyUWarp(w, i / 1000);
      expect(v).toBeGreaterThan(prev); // strictly increasing
      prev = v;
    }
  });
  it('honours births: fewer pinned columns at the bottom (m=6) than the top (m=10)', () => {
    const bottom = buildPetalWarpAt(SFB1, 2048, 0).anchors.length;
    const top = buildPetalWarpAt(SFB1, 2048, 1).anchors.length;
    expect(top).toBeGreaterThan(bottom);
  });
  it('applyPetalWarp matches buildPetalWarpAt + applyUWarp (caching is transparent)', () => {
    const direct = applyUWarp(buildPetalWarpAt(SFB1, 2048, 0.3), 0.42);
    expect(applyPetalWarp(SFB1, 2048, 0.42, 0.3)).toBeCloseTo(direct, 12);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/renderers/webgpu/parametric/conforming/CreasePetalWarp.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `CreasePetalWarp.ts`**

```ts
/**
 * CreasePetalWarp.ts — t-dependent feature-aligned u-warp for styles whose
 * crest/valley loci move with height (e.g. SuperformulaBlossom, petal count
 * m(t)). The t-parameterized generalization of CreaseUWarp: at each t it pins
 * mesh columns onto the analytic loci and DELEGATES to buildCreaseUWarp, so it
 * inherits the monotone-homeomorphism + refuse-on-unsafe + watertight contract.
 * Applied per vertex AFTER triangulation ⇒ connectivity untouched.
 */
import { buildCreaseUWarp, applyUWarp, type UWarp } from './CreaseUWarp';

/** m(t) for SuperformulaBlossom (packed slots 1,2,3 = mBase,mTop,c). Mirrors
 *  sfMOf in crestLateralDeviation.ts — the closed-form ridge is the source of truth. */
function sfM(params: readonly number[], t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return params[1] + (params[2] - params[1]) * Math.pow(tc, Math.max(params[3], 1e-4));
}

/** Crest+valley loci (u in [0,1)) present at height t. Crests (2j−1)/(2m),
 *  valleys j/m; only loci < 1 exist (births as m grows). */
export function sfPetalLociAt(params: readonly number[], t: number): number[] {
  const m = sfM(params, t);
  if (!(m > 0) || !Number.isFinite(m)) return [];
  const out: number[] = [];
  for (let j = 1; (2 * j - 1) / (2 * m) < 1; j++) {
    out.push((2 * j - 1) / (2 * m)); // crest
    if (j / m < 1) out.push(j / m); // valley
    if (j > 4096) break; // bound pathological params
  }
  return out;
}

/** Build the feature-aligned warp at height t (delegates to buildCreaseUWarp). */
export function buildPetalWarpAt(params: readonly number[], grid: number, t: number): UWarp {
  return buildCreaseUWarp(sfPetalLociAt(params, t), grid);
}

/** Apply the warp at (u,t), caching the per-t warp (vertices share t-rows). The
 *  cache key quantizes t so a dyadic row reuses one warp build. */
const cache = new Map<string, UWarp>();
export function applyPetalWarp(params: readonly number[], grid: number, u: number, t: number): number {
  const key = `${grid}:${Math.round(t * (1 << 20))}`;
  let w = cache.get(key);
  if (!w) {
    w = buildPetalWarpAt(params, grid, t);
    if (cache.size > 4096) cache.clear();
    cache.set(key, w);
  }
  return applyUWarp(w, u);
}
```

- [ ] **Step 4: Run tests + lint, verify pass**

Run: `npx vitest run src/renderers/webgpu/parametric/conforming/CreasePetalWarp.test.ts` → PASS.
Run: `npx eslint src/renderers/webgpu/parametric/conforming/CreasePetalWarp.ts --max-warnings=0` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/parametric/conforming/CreasePetalWarp.ts src/renderers/webgpu/parametric/conforming/CreasePetalWarp.test.ts
git commit -m "feat(petal-warp): t-dependent feature-aligned u-warp (delegates to CreaseUWarp)"
```

---

### Task 2: Aspect-driven column density (cross ≤ along), Route-A decision gate

**Files:**
- Modify: `src/renderers/webgpu/parametric/conforming/ConformingWall.ts` (feature-aware u-refine sizing; reuse directional u-refine `PeriodicBalancedQuadtree.ts:929-960`)
- Gate: `src/fidelity/dyadicWarpFloor.test.ts` (already committed — the acceptance gate)

The warp pins crests onto columns, but the floor (Stage 6) requires enough columns that every flank cell has cross ≤ along. Drive the u-refinement from the feature-phase aspect so the column count tracks `m(t)`.

- [ ] **Step 1: Pin the gate as a guard (it already passes structurally; re-assert thresholds)**

The committed `dyadicWarpFloor.test.ts` already encodes the gate (worst ≥15° regular AND transition). Confirm it green as the baseline.
Run: `npx vitest run src/fidelity/dyadicWarpFloor.test.ts` → PASS (worst regular 17.15°, transition 17.23°).

- [ ] **Step 2: Implement feature-aware u-refine in `ConformingWall.ts`**

Where the wall builds its sizing field for the quadtree, add (flag-gated `featurePetalWarp`) a u-refinement term: for a cell at height t spanning `Δu`, require `Δu·|∂P/∂u| ≤ Δt·|∂P/∂t|` (cross ≤ along) using the existing surface tangents already sampled for the metric, raising the directional u-extra until satisfied (capped by `MAX_U_EXTRA`). This is the existing directional-u-refine mechanism (`PeriodicBalancedQuadtree.ts:929-960`) with the trigger driven by the feature-phase aspect instead of (or in addition to) the F-shear trigger. Sizing stays on the plain metric (the warp is post-triangulation).

- [ ] **Step 3: Add a CPU gate that builds the real quadtree under the flag and checks aspect**

Write `src/fidelity/petalAspectRefine.test.ts`: build the production quadtree for SFB@1 with the feature-aware u-refine ON, apply `applyPetalWarp` to leaf corners, and assert (3D, via `SfbWallSampler`) the per-cell `cross/along ≤ 1.0` at the worst crest row and the dyadicWarpFloor floor (worst ≥ 15°, 0% sub-15° on crest/valley/bulk). Reuse `polygonBestMinAngle3D`.

- [ ] **Step 4: Run gate + the floor probe**

Run: `npx vitest run src/fidelity/petalAspectRefine.test.ts src/fidelity/dyadicWarpFloor.test.ts` → PASS. **Route decision:** if the directional u-refine cannot hold cross ≤ 1 within `MAX_U_EXTRA` at acceptable triangle count, STOP and switch to Route B (feature-phase quadtree) — record the measured column-count cost first.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/parametric/conforming/ConformingWall.ts src/fidelity/petalAspectRefine.test.ts
git commit -m "feat(petal-warp): feature-aware u-refine so column density tracks m(t) (aspect<=1)"
```

---

### Task 3: Wire the warp into the export + integration gate (real `assembleWatertight`)

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts` (apply `applyPetalWarp` in the warp sweep, flag-gated, SFB-class only — grep `applyHelixWarp` for the sweep)
- Create: `src/fidelity/petalWarpIntegration.test.ts` (the end-to-end gate)

- [ ] **Step 1: Write the failing integration gate**

`petalWarpIntegration.test.ts`: run the real `assembleWatertight` for SFB@1 with `featurePetalWarp` ON; assert (a) topology zeros — boundaryEdges=0, nonManifold=0, orientation consistent (reuse the assembly's own checks / `assertMeshExportable`); (b) crest lateral deviation < 0.01 mm via `crestLateralDeviation` (the warp puts crests exactly on the analytic ridge); (c) 3D min-angle floor: 0% sub-15°, worst ≥ 15° over the wall (excluding the seam column); (d) flag OFF ⇒ byte-identical to current production (hash unchanged).

- [ ] **Step 2: Run, verify it fails** (warp not yet wired) — `npx vitest run src/fidelity/petalWarpIntegration.test.ts` → FAIL.

- [ ] **Step 3: Wire the warp**

In the warp sweep in `ParametricExportComputer.ts` (alongside `applyHelixWarp`/`applyUWarp`), when `flags.featurePetalWarp` AND the style is SFB-class, replace each vertex `u ← applyPetalWarp(params, grid, u, t)` (grid = the wall's column lattice / nRing·2^B). Guard: only when the style has petal loci; else no-op. Keep `t` untouched (caps stay index-shared).

- [ ] **Step 4: Run the integration gate + the full fidelity battery**

Run: `npx vitest run src/fidelity/` → all PASS (the 9 probes + integration). Run the byte-identity hash check (flag off). `npx eslint` clean.
Expected: topology zeros, crest deviation < 0.01 mm, 0% sub-15°, flag-off byte-identical.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/ParametricExportComputer.ts src/fidelity/petalWarpIntegration.test.ts
git commit -m "feat(petal-warp): wire CreasePetalWarp into the export (flag-gated) + integration gate"
```

---

### Task 4: Real-GPU export verification + e2e (the ship gate)

**Files:**
- Modify: `potfoundry-web/e2e/` export-fidelity harness (add an SFB@1 `featurePetalWarp` case)

- [ ] **Step 1: Add the e2e gate** — drive a real WebGPU export of SFB@1 at default 'high' with the flag ON; assert watertight (existing export-fidelity invariants) + capture the mesh for the crest-band 3D min-angle (reuse the `__pfFidelity` hooks). Pre-register: 0% sub-15° on the outer wall (seam column excluded), crest lateral deviation < 0.01 mm.

- [ ] **Step 2: Run e2e** — `npm run dev` (one terminal) then `npx playwright test e2e/<file>` (second). Expected: PASS.

- [ ] **Step 3: Visual confirmation** — export SFB@1 `.3mf` with the flag ON via the UI; confirm the crest serration is GONE (the user-facing acceptance). Compare against a flag-OFF export.

- [ ] **Step 4: Commit**

```bash
git add potfoundry-web/e2e
git commit -m "test(petal-warp): real-GPU e2e export-fidelity gate for SFB@1"
```

---

### Task 5 (separate, parallel-OK): cap-disc sliver — confirm + fix

NOT part of the crest cure (the warp is cap-neutral, Stage 8) but a real pre-existing item.

- [ ] **Step 1:** Confirm the cap-disc sliver against REAL `assembleWatertight` output (not the model) — extend `capJunctionFloor.test.ts` to read the actual assembled base triangles.
- [ ] **Step 2:** If confirmed, fix `emitRadialCap`/`radialBandCount` (WatertightAssembly.ts): coarsen tangentially toward the inner radius (drop ring vertices in concentric halving steps) and/or raise the 64-band clamp; gate: cap 3D min-angle 0% sub-15°.
- [ ] **Step 3:** Commit separately.

---

## Self-Review

- **Spec coverage:** §3.1 warp → Task 1; §3.2 aspect refine → Task 2; §4 watertight + §5 integration → Task 3; real-GPU gate → Task 4; §2 separate cap item → Task 5; flag (§5) → Task 0. All covered.
- **Types:** `UWarp`/`applyUWarp`/`buildCreaseUWarp` reused verbatim from CreaseUWarp.ts; `featurePetalWarp` flag name consistent across Tasks 0/3/4; `applyPetalWarp(params, grid, u, t)` signature consistent across Tasks 1/3.
- **Gates:** every task ends on a committed probe with a numeric threshold; Task 2 carries the explicit Route-A/B decision.
- **Discovery honesty:** Tasks 2–4 deliverables are DEFINED by their measurement gates (the precise integration code in ConformingWall/ParametricExportComputer is discovered against the real modules during the task); Tasks 0–1 carry full code.
