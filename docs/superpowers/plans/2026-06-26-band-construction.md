# Curvature-Aware Variable-Width Band Construction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a band-construction primitive that produces a feature-following ridge band whose (u,t) footprint is simple by construction, so every real feature edge welds into the multi-hole `corridorPaveMulti` interior with zero T-junctions.

**Architecture:** Cap each spine station's flank half-width by the local (metric) radius of curvature so the perpendicular offset cannot fold; sharp corners pinch to accept-class thin slivers; the crest stays the exact spine. A verify-and-shrink net guarantees a simple footprint. Reuses `paveRidge`'s proven post-offset assembly via an extracted shared helper.

**Tech Stack:** TypeScript, Vitest (jsdom), the existing `src/fidelity/bandRemesh/` primitives (`stitch.densifyRail`, `stations.buildStations`, `paver.paveBand`, `railKey.quantizeRailUT`, `seamFill.extractHoleBoundary`, `audit`).

**Spec:** `docs/superpowers/specs/2026-06-26-band-construction-design.md`

## Global Constraints

- Branch `refactor/core-migration` (the established working branch; no worktree).
- TDD: failing test first, watch it fail, minimal code, watch it pass, commit. Scope every `git add` — NEVER stage the 5 cellSamples-WIP files (`WatertightAssembly.ts`, `PeriodicBalancedQuadtree.ts`, `windowHook.ts`, `ParametricExportComputer.ts`, `ConformingWall.ts`).
- ESLint 0-warnings (the PostToolUse hook lints every `.ts` edit) — fix before commit.
- `paveRidge`'s observable behavior MUST stay unchanged (regression: `featureStrip.test.ts` 10/10 green after the Task-1 refactor).
- Heavy real-pipeline tests gated behind `PF_DERISK` (`describe.skipIf(!process.env.PF_DERISK)`), with the header comment `// Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.`
- Quantize every band vertex to QSCALE via `quantizeRailUT` (weld-readiness — parity with `paveRidge`/`paveJunction`).
- GitNexus `impact({target, direction:"upstream"})` before editing `paveRidge` (Task 1); report risk.

## File Structure

- **Modify** `src/fidelity/bandRemesh/featureStrip.ts` — extract `assembleRidgeBands(...)` from `paveRidge`'s post-offset body; `export` `perpUV`. `paveRidge` unchanged in behavior.
- **Create** `src/fidelity/bandRemesh/bandConstruct.ts` — `measureSpineCurvatureRadius`, `safeHalfWidthProfile`, `offsetRailVariable`, `footprintSelfCrossings`, `paveRidgeAdaptive`.
- **Create** `src/fidelity/bandRemesh/bandConstruct.test.ts` — analytic unit tests (default CI).
- **Create** `src/fidelity/bandRemesh/bandConstruct.gate.derisk.test.ts` — the full-coverage real-graph integration gate (PF_DERISK).

---

### Task 1: Refactor `featureStrip.ts` — extract `assembleRidgeBands`, export `perpUV`

**Files:**
- Modify: `src/fidelity/bandRemesh/featureStrip.ts`
- Test: `src/fidelity/bandRemesh/featureStrip.test.ts` (existing regression — must stay green)

**Interfaces:**
- Produces: `export function perpUV(sampler: SurfaceSampler, u: number, t: number, du: number, dt: number): { a: number; b: number }`
- Produces: `export function assembleRidgeBands(spineDense: StationPoint[], leftRail: StationPoint[], rightRail: StationPoint[], sampler: SurfaceSampler, edgeMm: number): RidgeResult`
- `paveRidge` signature unchanged: `(spine: StationPoint[], sampler: SurfaceSampler, opts: { widthMm: number; edgeMm: number }) => RidgeResult`

- [ ] **Step 1: GitNexus impact on `paveRidge`**

Run `impact({ target: "paveRidge", direction: "upstream", repo: "PotFoundry-Lite-v2.0", includeTests: true })`. Expected: LOW (spike/test consumers only; 0 production flows — like `paveJunction`). Report the risk; do not proceed on HIGH/CRITICAL without flagging.

- [ ] **Step 2: Add `export` to `perpUV`**

In `featureStrip.ts`, change `function perpUV(` to `export function perpUV(`. No body change.

- [ ] **Step 3: Extract `assembleRidgeBands`**

Cut everything in `paveRidge` from `const leftGrid = buildStations(...)` through the `return { mesh, vertexUT, spineVertexIds, openBoundaryVertices };` into a new exported function, and have `paveRidge` call it. The result:

```ts
/**
 * Build the two flank bands from a densified spine + its two (already-offset,
 * densified) flank rails: rows ∥ ridge, spine = shared crease, every vertex
 * QSCALE-quantized. Shared by paveRidge (constant width) and paveRidgeAdaptive
 * (curvature-capped variable width) — neither re-derives the assembly.
 */
export function assembleRidgeBands(
  spineDense: StationPoint[],
  leftRail: StationPoint[],
  rightRail: StationPoint[],
  sampler: SurfaceSampler,
  edgeMm: number,
): RidgeResult {
  const leftGrid = buildStations(spineDense, leftRail, sampler, edgeMm);
  const rightGrid = buildStations(spineDense, rightRail, sampler, edgeMm);
  const leftBand = paveBand(leftGrid, sampler);
  const rightBand = paveBand(rightGrid, sampler);

  const keyToId = new Map<string, number>();
  const combinedUt: Array<[number, number]> = [];
  const intern = (uRaw: number, tRaw: number): number => {
    const [u, t] = quantizeRailUT(uRaw, tRaw);
    const key = utKey(u, t);
    let id = keyToId.get(key);
    if (id === undefined) {
      id = combinedUt.length;
      keyToId.set(key, id);
      combinedUt.push([u, t]);
    }
    return id;
  };

  const tris: number[] = [];
  const addBand = (band: typeof leftBand): number[] => {
    const map = band.utVertices.map((v) => intern(v[0], v[1]));
    for (let k = 0; k < band.indices.length; k += 3) {
      const a = map[band.indices[k]], b = map[band.indices[k + 1]], c = map[band.indices[k + 2]];
      if (a === b || b === c || c === a) continue;
      tris.push(a, b, c);
    }
    return map;
  };
  const leftMap = addBand(leftBand);
  addBand(rightBand);

  const spineVertexIds = leftBand.railVertexIds.foot.map((id) => leftMap[id]);

  const openBoundaryVertices = new Set<number>();
  for (const grid of [leftGrid, rightGrid]) {
    const rows = grid.rows;
    for (const p of rows[0].w) openBoundaryVertices.add(intern(p.u, p.t));
    for (const p of rows[rows.length - 1].w) openBoundaryVertices.add(intern(p.u, p.t));
  }
  for (const id of leftBand.railVertexIds.crest) openBoundaryVertices.add(leftMap[id]);
  for (const id of rightBand.railVertexIds.crest) {
    openBoundaryVertices.add(intern(rightBand.utVertices[id][0], rightBand.utVertices[id][1]));
  }

  const positions = new Float32Array(combinedUt.length * 3);
  for (let i = 0; i < combinedUt.length; i++) {
    const p = sampler.position(combinedUt[i][0], combinedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }

  return {
    mesh: { positions, indices: new Uint32Array(tris) },
    vertexUT: combinedUt.map((v) => [v[0], v[1]] as [number, number]),
    spineVertexIds,
    openBoundaryVertices,
  };
}
```

And `paveRidge` becomes:

```ts
export function paveRidge(spine: StationPoint[], sampler: SurfaceSampler, opts: RidgeOptions): RidgeResult {
  const { widthMm, edgeMm } = opts;
  const maxSpacingMm = (edgeMm / 2) * 0.95;
  const spineDense = densifyRail(spine, sampler, maxSpacingMm);
  const leftRail = densifyRail(offsetRail(spineDense, sampler, widthMm, 1), sampler, maxSpacingMm);
  const rightRail = densifyRail(offsetRail(spineDense, sampler, widthMm, -1), sampler, maxSpacingMm);
  return assembleRidgeBands(spineDense, leftRail, rightRail, sampler, edgeMm);
}
```

- [ ] **Step 4: Run the regression — `paveRidge` behavior unchanged**

Run: `npx vitest run src/fidelity/bandRemesh/featureStrip.test.ts`
Expected: PASS (10/10 — the refactor is behavior-preserving). If any fail, the extraction diverged; revert and re-extract exactly.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/featureStrip.ts
git commit -m "refactor(mesher): extract assembleRidgeBands + export perpUV (paveRidge unchanged)"
```

---

### Task 2: `measureSpineCurvatureRadius`

**Files:**
- Create: `src/fidelity/bandRemesh/bandConstruct.ts`
- Test: `src/fidelity/bandRemesh/bandConstruct.test.ts`

**Interfaces:**
- Produces: `export function measureSpineCurvatureRadius(spine: StationPoint[], sampler: SurfaceSampler): number[]` — one radius (mm) per station; `Infinity` for straight/endpoints; small for sharp turns. Uses 3D Menger curvature.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { measureSpineCurvatureRadius } from './bandConstruct';
import type { StationPoint } from './stations';

describe('measureSpineCurvatureRadius', () => {
  it('is ~Infinity on a straight (constant-t) spine and small at a sharp corner', () => {
    const flat = new SyntheticCylinderSampler(50, 100, 0, 0); // plain cylinder
    // Straight horizontal spine in u at fixed t: collinear in 3D? No — u maps to a
    // circle. Use a SHORT straight-in-(u,t) run where the arc is ~linear.
    const straight: StationPoint[] = [
      { u: 0.40, t: 0.5 }, { u: 0.41, t: 0.5 }, { u: 0.42, t: 0.5 },
    ];
    const rStraight = measureSpineCurvatureRadius(straight, flat);
    // The cylinder curves in u, so the radius is finite but LARGE (~R0=50mm order).
    expect(rStraight[1]).toBeGreaterThan(10);

    // A right-angle corner in (u,t): radius should be far smaller than the straight case.
    const corner: StationPoint[] = [
      { u: 0.40, t: 0.5 }, { u: 0.45, t: 0.5 }, { u: 0.45, t: 0.55 },
    ];
    const rCorner = measureSpineCurvatureRadius(corner, flat);
    expect(rCorner[1]).toBeLessThan(rStraight[1]);
    expect(rCorner[1]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts`
Expected: FAIL — `measureSpineCurvatureRadius` is not exported / module missing.

- [ ] **Step 3: Implement**

```ts
/**
 * bandConstruct.ts — curvature-aware variable-width band construction.
 * Produces a feature-following ridge band whose (u,t) footprint is SIMPLE by
 * construction (the offset cannot fold), so it welds into the multi-hole
 * corridorPaveMulti interior. See
 * docs/superpowers/specs/2026-06-26-band-construction-design.md.
 *
 * @module fidelity/bandRemesh/bandConstruct
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { StationPoint } from './stations';
import type { RidgeResult } from './featureStrip';
import { perpUV, assembleRidgeBands } from './featureStrip';
import { densifyRail } from './stitch';
import { extractHoleBoundary } from './seamFill';

/** 3D distance between two (u,t) samples. */
function dist3(sampler: SurfaceSampler, a: StationPoint, b: StationPoint): number {
  const pa = sampler.position(a.u, a.t);
  const pb = sampler.position(b.u, b.t);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

/** Area of the 3D triangle (A,B,C). */
function area3(sampler: SurfaceSampler, A: StationPoint, B: StationPoint, C: StationPoint): number {
  const a = sampler.position(A.u, A.t);
  const b = sampler.position(B.u, B.t);
  const c = sampler.position(C.u, C.t);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/**
 * Per-station radius of curvature (mm) along the spine, via 3D Menger curvature
 * R = (|AB|·|BC|·|CA|) / (4·area(ABC)) over the three consecutive stations.
 * Straight runs → Infinity; sharp turns → small R. Endpoints → Infinity.
 */
export function measureSpineCurvatureRadius(spine: StationPoint[], sampler: SurfaceSampler): number[] {
  const n = spine.length;
  const out = new Array<number>(n).fill(Infinity);
  for (let i = 1; i < n - 1; i++) {
    const A = spine[i - 1], B = spine[i], C = spine[i + 1];
    const ab = dist3(sampler, A, B);
    const bc = dist3(sampler, B, C);
    const ca = dist3(sampler, C, A);
    const ar = area3(sampler, A, B, C);
    out[i] = ar > 1e-12 ? (ab * bc * ca) / (4 * ar) : Infinity;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts potfoundry-web/src/fidelity/bandRemesh/bandConstruct.test.ts
git commit -m "feat(mesher): measureSpineCurvatureRadius (3D Menger) for band-width capping"
```

---

### Task 3: `safeHalfWidthProfile`

**Files:**
- Modify: `src/fidelity/bandRemesh/bandConstruct.ts`
- Test: `src/fidelity/bandRemesh/bandConstruct.test.ts`

**Interfaces:**
- Produces: `export interface HalfWidthOpts { safety?: number; taperRadius?: number; maxByDensity?: number[] }`
- Produces: `export function safeHalfWidthProfile(radius: number[], targetWidthMm: number, opts?: HalfWidthOpts): number[]` — `w_i = min(target, safety·R_i, maxByDensity_i?)`, then a min-filter taper over `±taperRadius` stations.

- [ ] **Step 1: Write the failing test**

```ts
import { safeHalfWidthProfile } from './bandConstruct';

describe('safeHalfWidthProfile', () => {
  it('caps width to safety·R where R is small, uses target where R is large, and tapers corners', () => {
    const R = [Infinity, 10, 0.5, 10, Infinity]; // a tight pinch at index 2
    const w = safeHalfWidthProfile(R, 2.5, { safety: 0.8, taperRadius: 1 });
    expect(w.length).toBe(5);
    expect(w[2]).toBeCloseTo(0.4, 5);          // 0.8 * 0.5
    // Neighbours are tapered DOWN toward the pinch (min-filter), not full target.
    expect(w[1]).toBeLessThanOrEqual(2.5);
    expect(w[1]).toBeLessThan(safeHalfWidthProfile(R, 2.5, { safety: 0.8, taperRadius: 0 })[1] + 1e-9);
    // Far-from-pinch stations reach the target.
    const wNoPinch = safeHalfWidthProfile([Infinity, 10, 10, 10, Infinity], 2.5, { safety: 0.8 });
    expect(wNoPinch[2]).toBeCloseTo(2.5, 5);    // min(2.5, 8) = 2.5
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t safeHalfWidthProfile`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement (append to `bandConstruct.ts`)**

```ts
/** Options for {@link safeHalfWidthProfile}. */
export interface HalfWidthOpts {
  /** Fraction of the curvature radius the half-width may use (default 0.8). */
  safety?: number;
  /** Min-filter neighborhood (stations each side) tapering a pinch (default 2). */
  taperRadius?: number;
  /** Optional per-station upper bound (mm) from feature density (assembler-supplied). */
  maxByDensity?: number[];
}

/**
 * Per-station flank half-width (mm): w_i = min(target, safety·R_i, density_i),
 * then a min-filter over ±taperRadius so a corner's pinch tapers across its
 * neighbours (prevents multi-segment folds). The crest is unaffected — only the
 * flank width adapts.
 */
export function safeHalfWidthProfile(
  radius: number[],
  targetWidthMm: number,
  opts: HalfWidthOpts = {},
): number[] {
  const safety = opts.safety ?? 0.8;
  const taper = opts.taperRadius ?? 2;
  const base = radius.map((R, i) => {
    let w = Math.min(targetWidthMm, safety * R);
    if (opts.maxByDensity) w = Math.min(w, opts.maxByDensity[i]);
    return w;
  });
  if (taper <= 0) return base;
  const out = base.slice();
  for (let i = 0; i < base.length; i++) {
    let m = base[i];
    for (let k = Math.max(0, i - taper); k <= Math.min(base.length - 1, i + taper); k++) {
      if (base[k] < m) m = base[k];
    }
    out[i] = m;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t safeHalfWidthProfile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts potfoundry-web/src/fidelity/bandRemesh/bandConstruct.test.ts
git commit -m "feat(mesher): safeHalfWidthProfile (curvature cap + taper)"
```

---

### Task 4: `offsetRailVariable` + `footprintSelfCrossings`

**Files:**
- Modify: `src/fidelity/bandRemesh/bandConstruct.ts`
- Test: `src/fidelity/bandRemesh/bandConstruct.test.ts`

**Interfaces:**
- Produces: `export function offsetRailVariable(spine: StationPoint[], sampler: SurfaceSampler, widths: number[], sign: 1 | -1): StationPoint[]`
- Produces: `export function footprintSelfCrossings(mesh: { indices: Uint32Array }, vertexUT: Array<[number, number]>): number` — count proper self-crossings of the band's count-1 perimeter in (u,t) (`Infinity` if no single perimeter loop).

- [ ] **Step 1: Write the failing test**

```ts
import { offsetRailVariable, footprintSelfCrossings } from './bandConstruct';

describe('offsetRailVariable', () => {
  it('offsets each station by its own width along the metric perpendicular', () => {
    const flat = new SyntheticCylinderSampler(50, 100, 0, 0);
    const spine: StationPoint[] = [{ u: 0.40, t: 0.5 }, { u: 0.45, t: 0.5 }, { u: 0.50, t: 0.5 }];
    const widths = [1, 2, 1];
    const rail = offsetRailVariable(spine, flat, widths, 1);
    expect(rail.length).toBe(3);
    // The middle station (width 2) is offset farther from the spine than the ends (width 1).
    const d = (a: StationPoint, b: StationPoint): number => {
      const pa = flat.position(a.u, a.t), pb = flat.position(b.u, b.t);
      return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    };
    expect(d(rail[1], spine[1])).toBeGreaterThan(d(rail[0], spine[0]) + 0.5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t offsetRailVariable`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement (append to `bandConstruct.ts`)**

```ts
/** Offset each spine station by its own ±width along the metric perpendicular. */
export function offsetRailVariable(
  spine: StationPoint[],
  sampler: SurfaceSampler,
  widths: number[],
  sign: 1 | -1,
): StationPoint[] {
  const n = spine.length;
  const out: StationPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    let du = (b.u - a.u) % 1;
    if (du > 0.5) du -= 1;
    if (du < -0.5) du += 1;
    const dt = b.t - a.t;
    const l = Math.hypot(du, dt) || 1;
    const { a: pa, b: pb } = perpUV(sampler, spine[i].u, spine[i].t, du / l, dt / l);
    const w = widths[i];
    out.push({ u: spine[i].u + sign * pa * w, t: spine[i].t + sign * pb * w });
  }
  return out;
}

/** Proper (strict-interior) crossing of (u,t) segments p1→p2 and p3→p4. */
function properCrossUT(
  p1: readonly [number, number], p2: readonly [number, number],
  p3: readonly [number, number], p4: readonly [number, number],
): boolean {
  const rx = p2[0] - p1[0], ry = p2[1] - p1[1];
  const sx = p4[0] - p3[0], sy = p4[1] - p3[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return false;
  const qpx = p3[0] - p1[0], qpy = p3[1] - p1[1];
  const tS = (qpx * sy - qpy * sx) / denom;
  const tU = (qpx * ry - qpy * rx) / denom;
  const E = 1e-12;
  return tS > E && tS < 1 - E && tU > E && tU < 1 - E;
}

/**
 * Count proper self-crossings of the band's (u,t) FOOTPRINT — the count-1
 * perimeter loop of its mesh (spine crease is count-2 interior). Returns Infinity
 * when the perimeter is not a single simple loop (a degenerate band). This is the
 * weld precondition corridorPaveMulti's pointInLoop exclusion requires.
 */
export function footprintSelfCrossings(
  mesh: { indices: Uint32Array },
  vertexUT: Array<[number, number]>,
): number {
  let loop: number[];
  try {
    const bh = extractHoleBoundary({ indices: mesh.indices }, new Set<number>());
    if (bh.loops.length !== 1) return Infinity;
    loop = bh.loops[0];
  } catch {
    return Infinity;
  }
  const pts = loop.map((id) => vertexUT[id]);
  const m = pts.length;
  let count = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    for (let j = i + 1; j < m; j++) {
      if (j === i || (j + 1) % m === i || (i + 1) % m === j) continue;
      if (properCrossUT(a, b, pts[j], pts[(j + 1) % m])) count++;
    }
  }
  return count;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t offsetRailVariable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts potfoundry-web/src/fidelity/bandRemesh/bandConstruct.test.ts
git commit -m "feat(mesher): offsetRailVariable + footprintSelfCrossings"
```

---

### Task 5: `paveRidgeAdaptive` (curvature-capped + verify-and-shrink net)

**Files:**
- Modify: `src/fidelity/bandRemesh/bandConstruct.ts`
- Test: `src/fidelity/bandRemesh/bandConstruct.test.ts`

**Interfaces:**
- Produces: `export interface AdaptiveRidgeOptions { widthMm: number; edgeMm: number; safety?: number; taperRadius?: number; maxByDensity?: number[]; maxShrink?: number }`
- Produces: `export interface AdaptiveRidgeResult extends RidgeResult { shrinks: number; selfCrossings: number }`
- Produces: `export function paveRidgeAdaptive(spine: StationPoint[], sampler: SurfaceSampler, opts: AdaptiveRidgeOptions): AdaptiveRidgeResult`

- [ ] **Step 1: Write the failing test**

```ts
import { paveRidgeAdaptive } from './bandConstruct';
import { auditWatertight } from './audit';

describe('paveRidgeAdaptive', () => {
  it('produces a SIMPLE footprint + watertight band on a sharp right-angle corner spine (where constant width folds)', () => {
    const flat = new SyntheticCylinderSampler(50, 100, 0, 0);
    // An L-shaped spine with a sharp 90° corner — the constant-width failure case.
    const spine: StationPoint[] = [
      { u: 0.30, t: 0.30 }, { u: 0.50, t: 0.30 }, { u: 0.50, t: 0.55 },
    ];
    const res = paveRidgeAdaptive(spine, flat, { widthMm: 3, edgeMm: 2 });
    expect(res.selfCrossings).toBe(0);                 // simple footprint (the whole point)
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);                       // band is internally watertight
    expect(res.mesh.indices.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t paveRidgeAdaptive`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement (append to `bandConstruct.ts`)**

```ts
/** Options for {@link paveRidgeAdaptive}. */
export interface AdaptiveRidgeOptions {
  /** Target flank half-width (mm) where curvature allows. */
  widthMm: number;
  /** Target 3D edge length (mm). */
  edgeMm: number;
  /** Curvature safety fraction (default 0.8). */
  safety?: number;
  /** Taper neighborhood (default 2). */
  taperRadius?: number;
  /** Optional per-DENSIFIED-station density bound (mm). Rare; usually omitted. */
  maxByDensity?: number[];
  /** Max verify-and-shrink iterations (default 8; w·0.7^8 ≈ 0.06·w). */
  maxShrink?: number;
}

/** {@link RidgeResult} plus the construction diagnostics. */
export interface AdaptiveRidgeResult extends RidgeResult {
  /** How many global width-shrinks the verify net needed (0 = the cap sufficed). */
  shrinks: number;
  /** Footprint self-crossings of the returned band (0 by the simplicity guarantee). */
  selfCrossings: number;
}

/**
 * Pave a ridge whose (u,t) footprint is SIMPLE by construction: cap each station's
 * flank half-width by the local curvature radius, then VERIFY and globally shrink
 * the width until the footprint has zero self-crossings (terminating — w→0 is
 * always simple). The crest is the exact spine; sharp corners pinch to accept-class
 * thin slivers. Reuses paveRidge's proven assembly (assembleRidgeBands).
 */
export function paveRidgeAdaptive(
  spine: StationPoint[],
  sampler: SurfaceSampler,
  opts: AdaptiveRidgeOptions,
): AdaptiveRidgeResult {
  const { widthMm, edgeMm } = opts;
  const maxSpacingMm = (edgeMm / 2) * 0.95;
  const spineDense = densifyRail(spine, sampler, maxSpacingMm);
  const radius = measureSpineCurvatureRadius(spineDense, sampler);
  const base = safeHalfWidthProfile(radius, widthMm, {
    safety: opts.safety,
    taperRadius: opts.taperRadius,
    maxByDensity: opts.maxByDensity,
  });

  const maxShrink = opts.maxShrink ?? 8;
  let scale = 1;
  let last: RidgeResult | null = null;
  let lastCross = Infinity;
  for (let s = 0; s <= maxShrink; s++) {
    const widths = base.map((w) => Math.max(1e-4, w * scale));
    const leftRail = densifyRail(offsetRailVariable(spineDense, sampler, widths, 1), sampler, maxSpacingMm);
    const rightRail = densifyRail(offsetRailVariable(spineDense, sampler, widths, -1), sampler, maxSpacingMm);
    const res = assembleRidgeBands(spineDense, leftRail, rightRail, sampler, edgeMm);
    const cross = footprintSelfCrossings(res.mesh, res.vertexUT);
    last = res;
    lastCross = cross;
    if (cross === 0) return { ...res, shrinks: s, selfCrossings: 0 };
    scale *= 0.7;
  }
  // Net exhausted (pathological spine) — return the best attempt + LOUD diagnostic.
  return { ...(last as RidgeResult), shrinks: maxShrink, selfCrossings: lastCross };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts`
Expected: PASS (all bandConstruct unit tests).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts potfoundry-web/src/fidelity/bandRemesh/bandConstruct.test.ts
git commit -m "feat(mesher): paveRidgeAdaptive — curvature-capped + verify-and-shrink simple-footprint band"
```

---

### Task 6: Full-coverage real-graph GATE (PF_DERISK)

**Files:**
- Create: `src/fidelity/bandRemesh/bandConstruct.gate.derisk.test.ts`

**Interfaces:**
- Consumes: `paveRidgeAdaptive` (Task 5), `corridorPaveMulti`/`extractHoleBoundary`/`auditWatertight`, the real pipeline (`styleSampler`/`detectFeatures`/`conditionGraph`) — copy the config + `selectSeparatedEdges`/frame/merge helpers from `featureAssembler.step3a.derisk.test.ts`.

- [ ] **Step 1: Write the failing test (the gate)**

Mirror `featureAssembler.step3a.derisk.test.ts` (config, `selectSeparatedEdges`, frame, multi-hole merge) but pave each selected edge with `paveRidgeAdaptive` instead of `paveRidge` (no smoothing, no manual width-shrink — the module owns that). Assert, per style in `['Voronoi', 'GyroidManifold', 'HexagonalHive']`:

```ts
// FULL COVERAGE: every selected edge yields a simple footprint (selfCrossings==0).
expect(paved).toBe(selected.length);
for (const r of adaptiveResults) expect(r.selfCrossings).toBe(0);
// MULTI-BAND WELD holds by index.
const audit = auditWatertight(merged, { boundaryVertexIndices: frameSet });
expect(audit.nonManifoldEdges).toBe(0);
expect(audit.tJunctions).toBe(0);
// every band-perimeter edge incidence==2 (cracked === 0); inversionCount==0; unfillablePinches==[]
// quality: report aspectMax / pct<10 / p50 + the shrink counts; corner slivers accept-class.
```

Use a `beforeAll(() => buildGate(style), 120000)` per style (detectFeatures is ~13s). Include the non-vacuous negative control (split a band-perimeter vertex → tJunctions>0).

- [ ] **Step 2: Run to verify it fails first**

Run: `PF_DERISK=1 npx vitest run src/fidelity/bandRemesh/bandConstruct.gate.derisk.test.ts -t Voronoi`
Expected: FAIL initially if `safety`/`taperRadius` defaults are mis-tuned (e.g. some edge `selfCrossings>0` ⇒ `paved < selected`, or weld non-manifold). This is the calibration signal.

- [ ] **Step 3: Calibrate `safety` / `taperRadius` to green**

If any edge has `selfCrossings>0` after the net (shrinks==maxShrink), lower `safety` (0.8→0.6) and/or raise `taperRadius` (2→3) and/or raise `maxShrink`. Re-run until **all three styles** pass full coverage + weld 0/0. Record the chosen defaults in the test + a one-line note in the spec's §4 (the calibration result). Do NOT loosen the gate to pass — tighten the construction.

- [ ] **Step 4: Run all three styles green**

Run: `PF_DERISK=1 npx vitest run src/fidelity/bandRemesh/bandConstruct.gate.derisk.test.ts`
Expected: PASS (Voronoi + GyroidManifold + HexagonalHive: full coverage + weld 0/0).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.gate.derisk.test.ts potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts
git commit -m "test(mesher): full-coverage band-construction GATE green on Voronoi/Gyroid/Hex (calibrated safety/taper)"
```

---

### Task 7: Verify the whole bandRemesh suite + update memory

**Files:** none (verification + memory note)

- [ ] **Step 1: Run the default (CI-light) bandRemesh suite**

Run: `npx vitest run src/fidelity/bandRemesh/featureStrip.test.ts src/fidelity/bandRemesh/junction.test.ts src/fidelity/bandRemesh/stitch.test.ts src/fidelity/bandRemesh/bandConstruct.test.ts`
Expected: ALL PASS (the refactor + new module didn't regress the proven primitives).

- [ ] **Step 2: Run the heavy de-risk + gate suite**

Run: `PF_DERISK=1 npx vitest run src/fidelity/bandRemesh/featureAssembler.step3a.derisk.test.ts src/fidelity/bandRemesh/bandConstruct.gate.derisk.test.ts`
Expected: PASS.

- [ ] **Step 3: Update memory**

Append the result (full-coverage band construction ACHIEVED / or the calibrated residual) to `project_wholewall_mesher_decision.md`, and unblock 3b (junction composition now has a robust real-edge band primitive).

---

## Self-Review

**Spec coverage:** §1 finding → motivates the plan; §2 constraints (full coverage, accept-class corners, fidelity, density-invariant, weld-ready) → Task 5 (verify-and-shrink full coverage), Task 6 (gate asserts all-edges + quality); §3 architecture/data-flow → Tasks 1+5; §4 components (`measureSpineCurvature`/`safeHalfWidthProfile`/`offsetRailVariable`/`assertSimpleFootprint`) → Tasks 2/3/4/5; §5 guarantee → Task 5 (cap + net); §6 testing (unit + real gate) → Tasks 2-6; §7 scope/integration/hygiene → Global Constraints + Task 1 impact; §8 out-of-scope (B/C/junction/graft) → not in any task ✓. No gaps.

**Placeholder scan:** every code step has real code; the gate (Task 6) references the step3a helpers by name and says to copy them (the engineer has that file) — concrete. Calibration (Task 6 Step 3) is a real tuning loop with explicit knobs/directions, not a "tune it" hand-wave. No `TODO`/`TBD`.

**Type consistency:** `perpUV`/`assembleRidgeBands` (Task 1) consumed verbatim in Task 4/5; `measureSpineCurvatureRadius`→`safeHalfWidthProfile`→`offsetRailVariable`→`paveRidgeAdaptive` chain types line up (`number[]` radius → `number[]` widths → `StationPoint[]` rails → `RidgeResult`); `AdaptiveRidgeResult extends RidgeResult` so the gate's `auditWatertight({ boundaryVertexIndices: res.openBoundaryVertices })` is valid. Consistent.
