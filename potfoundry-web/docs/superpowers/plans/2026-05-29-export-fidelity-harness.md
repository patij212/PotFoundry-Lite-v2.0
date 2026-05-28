# SP0 — 3D Export Fidelity Measurement Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-WebGPU Playwright harness that exports every registered style and emits a per-style × per-metric 3D fidelity matrix plus pinned invariants, with zero changes to pipeline logic.

**Architecture:** Pure metric functions live in `src/fidelity/metrics.ts` (bundled so the in-page hook can call them, and unit-tested in vitest). A dev/test-gated `window.__pfFidelity` hook (`src/fidelity/windowHook.ts`, registered from `StatusFooter`) drives `generateMesh` at two budgets — a dense reference for ground-truth radius and the mesh under test — runs the metrics in-page, and returns ~12 numbers per style. A Playwright spec (`e2e/export-fidelity.spec.ts`) loops all styles, writes `e2e/fidelity/baseline.json`, and asserts one invariant per fidelity dimension.

**Tech Stack:** TypeScript, Vitest (jsdom), Playwright (Chromium/Edge + `--enable-unsafe-webgpu`), WebGPU, Zustand.

**Key design facts (verified against code):**
- Pipeline **stage 8 evaluates every vertex with the WGSL surface evaluator**, so mesh vertices lie on the analytic surface → a dense mesh is a valid `R_true` source for **all 20 styles**.
- CPU `STYLE_FUNCTIONS` implements only **5 of 20** styles, so a CPU `R_true` is impossible for the rest. The dense-reference approach avoids this entirely.
- `vite.config.ts` vitest `include: ['src/**/*.test.{ts,tsx}']` → metrics tests MUST be under `src/`.
- Local Playwright `baseURL` is `http://localhost:3001`, but `npm run dev` defaults to port **3000**. Run dev with `npm run dev -- --port 3001` for this harness.
- `MeshData = { vertices: Float32Array, indices: Uint32Array, vertexCount, triangleCount }` (`src/geometry/types.ts`).
- `STYLE_REGISTRY` keys are the style ids (`src/styles/registry.ts`); `store.setStyle(name)` switches style and resets opts.
- `useParametricExport().generateMesh(targetTriangles?)` returns `Promise<MeshData | null>`; `.isAvailable` reports GPU readiness.
- `getLastChainDebugData()` (`ParametricExportComputer.ts`) returns `{ chainCount, lineCount, ... } | null` — feature accounting.

---

## Task 1: Fidelity types & thresholds

**Files:**
- Create: `potfoundry-web/src/fidelity/types.ts`

- [ ] **Step 1: Write the types module**

```ts
/**
 * Shared types and pinned thresholds for the 3D export fidelity harness (SP0).
 * Pure declarations only — safe to import from both vitest and the app bundle.
 */

/** Analytic outer radius of the pottery surface at a given angle/height. */
export type RTrue = (theta: number, z: number) => number;

/** Minimal mesh view the pure metric functions operate on. */
export interface MeshView {
  vertices: Float32Array; // flat [x0,y0,z0, x1,y1,z1, ...]
  indices: Uint32Array;   // flat [i0,i1,i2, ...]
}

/** One row of the fidelity matrix — all numeric, transferable across CDP. */
export interface FidelityMetrics {
  styleId: string;
  triangleCount: number;
  vertexCount: number;
  referenceTriangleCount: number;

  // 1. Sag deviation (mm) from the dense radial reference.
  maxSagMm: number;
  rmsSagMm: number;
  sagReferenceBinThetaRad: number;
  sagReferenceBinZmm: number;

  // 2. 3D triangle quality.
  maxAspect3D: number;
  minAngleDeg: number;
  sliverCount: number;

  // 3. Watertightness.
  boundaryEdges: number;
  nonManifoldEdges: number;

  // 4. Normal consistency.
  orientationMismatches: number;

  // 5. Feature preservation (from pipeline chain accounting).
  featuresExpected: number;
  featuresPresent: number;
  featuresDropped: number;
}

export type FidelityMatrixRow = FidelityMetrics;

export interface FidelityBaseline {
  generatedAt: string;
  budget: number;
  referenceBudget: number;
  refDimensions: { H: number; Rt: number; Rb: number };
  rows: FidelityMatrixRow[];
}

// ── Pinned thresholds (see spec "Thresholds") ──────────────────────────────
/** Sag tolerance target (mm). Sub-tenth-mm, well above the dense-ref floor. */
export const SAG_TOL_MM = 0.1;
/** 3D aspect-ratio sliver bound (matches the UV audit B5 bound). */
export const ASPECT_MAX = 100;
/** Position weld tolerance (mm), matches exportValidation.ts. */
export const WELD_TOL_MM = 1e-4;
```

- [ ] **Step 2: Typecheck**

Run: `cd potfoundry-web && npm run typecheck`
Expected: PASS (no errors referencing `src/fidelity/types.ts`).

- [ ] **Step 3: Commit**

```bash
git add potfoundry-web/src/fidelity/types.ts
git commit -m "feat(fidelity): SP0 harness types and pinned thresholds"
```

---

## Task 2: Radial reference (dense-mesh R_true)

Builds an `R_true(θ, z)` lookup from a dense mesh's vertices by binning radius into a `(θ, z)` grid, dilating to fill empty cells, then bilinearly interpolating (with θ wrap-around).

**Files:**
- Create: `potfoundry-web/src/fidelity/metrics.ts`
- Test: `potfoundry-web/src/fidelity/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildRadialReference } from './metrics';

const TAU = 2 * Math.PI;

/** Dense cylinder: constant radius R over height [0, H]. */
function denseCylinder(R: number, H: number, nTheta: number, nZ: number): Float32Array {
  const verts: number[] = [];
  for (let j = 0; j < nZ; j++) {
    const z = (j / (nZ - 1)) * H;
    for (let i = 0; i < nTheta; i++) {
      const th = (i / nTheta) * TAU;
      verts.push(Math.cos(th) * R, Math.sin(th) * R, z);
    }
  }
  return new Float32Array(verts);
}

describe('buildRadialReference', () => {
  it('recovers a constant radius for a dense cylinder', () => {
    const ref = buildRadialReference(denseCylinder(40, 100, 360, 200));
    expect(ref.binThetaRad).toBeGreaterThan(0);
    expect(ref.binZmm).toBeGreaterThan(0);
    // Sample at arbitrary (theta, z) — must return ~40.
    for (const [th, z] of [[0.1, 5], [1.7, 50], [5.9, 95]] as const) {
      expect(ref.rTrue(th, z)).toBeCloseTo(40, 3);
    }
  });

  it('captures a linearly varying radius (cone) within bin resolution', () => {
    // Cone: R grows from 20 at z=0 to 60 at z=100.
    const verts: number[] = [];
    for (let j = 0; j < 200; j++) {
      const z = (j / 199) * 100;
      const R = 20 + (60 - 20) * (z / 100);
      for (let i = 0; i < 360; i++) {
        const th = (i / 360) * TAU;
        verts.push(Math.cos(th) * R, Math.sin(th) * R, z);
      }
    }
    const ref = buildRadialReference(new Float32Array(verts));
    expect(ref.rTrue(2.0, 50)).toBeCloseTo(40, 1);
    expect(ref.rTrue(2.0, 25)).toBeCloseTo(30, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: FAIL with "buildRadialReference is not a function" (or import error).

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Pure 3D export-fidelity metrics (SP0). No DOM, no GPU, no app imports beyond types.
 * Trusted via vitest unit tests, then run in-page by the fidelity window hook.
 */
import type { MeshView, RTrue } from './types';

const TAU = 2 * Math.PI;

export interface RadialReferenceOptions {
  thetaBins?: number; // default 720
  zBins?: number;     // default 400
}

export interface RadialReference {
  rTrue: RTrue;
  binThetaRad: number;
  binZmm: number;
}

/**
 * Build an R_true(θ, z) lookup from dense-mesh vertices (which lie on the
 * analytic surface). Bins radius into a (θ, z) grid, fills empty cells by
 * iterative dilation, then bilinearly interpolates with θ wrap-around.
 */
export function buildRadialReference(
  denseVertices: Float32Array,
  options: RadialReferenceOptions = {},
): RadialReference {
  const nTheta = options.thetaBins ?? 720;
  const nZ = options.zBins ?? 400;
  const n = denseVertices.length / 3;

  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = denseVertices[i * 3 + 2];
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const zSpan = Math.max(zMax - zMin, 1e-9);

  const sum = new Float64Array(nTheta * nZ);
  const cnt = new Uint32Array(nTheta * nZ);

  for (let i = 0; i < n; i++) {
    const x = denseVertices[i * 3];
    const y = denseVertices[i * 3 + 1];
    const z = denseVertices[i * 3 + 2];
    const r = Math.hypot(x, y);
    let th = Math.atan2(y, x);
    if (th < 0) th += TAU;
    let ti = Math.floor((th / TAU) * nTheta);
    if (ti >= nTheta) ti = nTheta - 1;
    let zi = Math.floor(((z - zMin) / zSpan) * (nZ - 1));
    if (zi < 0) zi = 0;
    if (zi >= nZ) zi = nZ - 1;
    const idx = zi * nTheta + ti;
    sum[idx] += r;
    cnt[idx] += 1;
  }

  // Cell averages; -1 marks empty.
  const grid = new Float64Array(nTheta * nZ);
  for (let k = 0; k < grid.length; k++) {
    grid[k] = cnt[k] > 0 ? sum[k] / cnt[k] : -1;
  }
  dilateFillEmpty(grid, nTheta, nZ);

  const binThetaRad = TAU / nTheta;
  const binZmm = zSpan / (nZ - 1);

  const cellAt = (ti: number, zi: number): number => {
    const t = ((ti % nTheta) + nTheta) % nTheta; // wrap θ
    const z = zi < 0 ? 0 : zi >= nZ ? nZ - 1 : zi; // clamp z
    return grid[z * nTheta + t];
  };

  const rTrue: RTrue = (theta, z) => {
    let th = theta % TAU;
    if (th < 0) th += TAU;
    const tf = (th / TAU) * nTheta - 0.5;
    const zf = ((z - zMin) / zSpan) * (nZ - 1);
    const ti0 = Math.floor(tf);
    const zi0 = Math.floor(zf);
    const tw = tf - ti0;
    const zw = zf - zi0;
    const c00 = cellAt(ti0, zi0);
    const c10 = cellAt(ti0 + 1, zi0);
    const c01 = cellAt(ti0, zi0 + 1);
    const c11 = cellAt(ti0 + 1, zi0 + 1);
    const top = c00 * (1 - tw) + c10 * tw;
    const bot = c01 * (1 - tw) + c11 * tw;
    return top * (1 - zw) + bot * zw;
  };

  return { rTrue, binThetaRad, binZmm };
}

/** Multi-pass nearest-neighbour dilation to fill empty (-1) cells in place. */
function dilateFillEmpty(grid: Float64Array, nTheta: number, nZ: number): void {
  const hasEmpty = () => {
    for (let k = 0; k < grid.length; k++) if (grid[k] < 0) return true;
    return false;
  };
  let guard = 0;
  while (hasEmpty() && guard++ < nTheta + nZ) {
    const next = grid.slice();
    for (let zi = 0; zi < nZ; zi++) {
      for (let ti = 0; ti < nTheta; ti++) {
        const idx = zi * nTheta + ti;
        if (grid[idx] >= 0) continue;
        let acc = 0;
        let num = 0;
        const neigh = [
          [(ti + 1) % nTheta, zi],
          [(ti - 1 + nTheta) % nTheta, zi],
          [ti, Math.min(zi + 1, nZ - 1)],
          [ti, Math.max(zi - 1, 0)],
        ];
        for (const [nt, nz] of neigh) {
          const v = grid[nz * nTheta + nt];
          if (v >= 0) { acc += v; num++; }
        }
        if (num > 0) next[idx] = acc / num;
      }
    }
    grid.set(next);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: PASS (both `buildRadialReference` tests).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/metrics.ts potfoundry-web/src/fidelity/metrics.test.ts
git commit -m "feat(fidelity): dense-mesh radial reference for R_true"
```

---

## Task 3: Sag deviation metric

Samples barycentric interior points of each triangle and measures radial deviation from `R_true`.

**Files:**
- Modify: `potfoundry-web/src/fidelity/metrics.ts`
- Modify: `potfoundry-web/src/fidelity/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `metrics.test.ts`:

```ts
import { sagDeviation } from './metrics';

const TAU2 = 2 * Math.PI;

/** Faceted cylinder (flat side quads) of radius R, nSides around, 1 tall band. */
function facetedCylinder(R: number, H: number, nSides: number): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  for (let j = 0; j < 2; j++) {
    const z = j * H;
    for (let i = 0; i < nSides; i++) {
      const th = (i / nSides) * TAU2;
      verts.push(Math.cos(th) * R, Math.sin(th) * R, z);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < nSides; i++) {
    const a = i;
    const b = (i + 1) % nSides;
    const c = i + nSides;
    const d = ((i + 1) % nSides) + nSides;
    idx.push(a, b, c, b, d, c);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

describe('sagDeviation', () => {
  it('reports near-zero sag when the mesh lies on the reference surface', () => {
    const R = 40;
    const mesh = facetedCylinder(R, 100, 256); // many sides → near-smooth
    const rTrue = () => R;
    const out = sagDeviation(mesh, rTrue, 4);
    // A 256-gon's flat-chord dip from the true circle is tiny.
    expect(out.maxSagMm).toBeLessThan(0.05);
    expect(out.rmsSagMm).toBeLessThanOrEqual(out.maxSagMm);
  });

  it('reports the chord sag of a coarse faceted cylinder', () => {
    const R = 40;
    const nSides = 8;
    const mesh = facetedCylinder(R, 100, nSides);
    const rTrue = () => R;
    const out = sagDeviation(mesh, rTrue, 6);
    // Max chord sag of a regular n-gon ≈ R(1 - cos(π/n)).
    const expectedMax = R * (1 - Math.cos(Math.PI / nSides));
    expect(out.maxSagMm).toBeGreaterThan(expectedMax * 0.5);
    expect(out.maxSagMm).toBeLessThanOrEqual(expectedMax + 1e-6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: FAIL with "sagDeviation is not a function".

- [ ] **Step 3: Write minimal implementation**

Append to `metrics.ts`:

```ts
export interface SagResult {
  maxSagMm: number;
  rmsSagMm: number;
}

/** Barycentric interior sample weights for a given order (order 4 → 15 samples). */
function barycentricSamples(order: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 1; i < order; i++) {
    for (let j = 1; j < order - i; j++) {
      const k = order - i - j;
      if (k < 1) continue;
      out.push([i / order, j / order, k / order]);
    }
  }
  // Fallback to centroid if the order is too small to yield interior points.
  if (out.length === 0) out.push([1 / 3, 1 / 3, 1 / 3]);
  return out;
}

/**
 * Radial sag of each triangle's interior vs R_true. For each barycentric
 * sample point P, deviation = |hypot(P.x,P.y) − R_true(atan2(P.y,P.x), P.z)|.
 */
export function sagDeviation(mesh: MeshView, rTrue: RTrue, order = 4): SagResult {
  const { vertices, indices } = mesh;
  const samples = barycentricSamples(order);
  let maxSag = 0;
  let sumSq = 0;
  let count = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

    for (const [wa, wb, wc] of samples) {
      const px = ax * wa + bx * wb + cx * wc;
      const py = ay * wa + by * wb + cy * wc;
      const pz = az * wa + bz * wb + cz * wc;
      const r = Math.hypot(px, py);
      const dev = Math.abs(r - rTrue(Math.atan2(py, px), pz));
      if (dev > maxSag) maxSag = dev;
      sumSq += dev * dev;
      count++;
    }
  }

  return {
    maxSagMm: maxSag,
    rmsSagMm: count > 0 ? Math.sqrt(sumSq / count) : 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: PASS (all `sagDeviation` + `buildRadialReference` tests).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/metrics.ts potfoundry-web/src/fidelity/metrics.test.ts
git commit -m "feat(fidelity): sag deviation metric vs dense reference"
```

---

## Task 4: 3D triangle-quality metric

**Files:**
- Modify: `potfoundry-web/src/fidelity/metrics.ts`
- Modify: `potfoundry-web/src/fidelity/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `metrics.test.ts`:

```ts
import { triangleQuality3D } from './metrics';

describe('triangleQuality3D', () => {
  it('rates an equilateral triangle as near-ideal', () => {
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, Math.sqrt(3) / 2, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const out = triangleQuality3D({ vertices, indices });
    expect(out.maxAspect3D).toBeCloseTo(1, 1);
    expect(out.minAngleDeg).toBeGreaterThan(59);
    expect(out.sliverCount).toBe(0);
  });

  it('flags a needle sliver with high aspect and tiny min angle', () => {
    const vertices = new Float32Array([0, 0, 0, 100, 0, 0, 50, 0.05, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const out = triangleQuality3D({ vertices, indices });
    expect(out.maxAspect3D).toBeGreaterThan(100);
    expect(out.minAngleDeg).toBeLessThan(1);
    expect(out.sliverCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: FAIL with "triangleQuality3D is not a function".

- [ ] **Step 3: Write minimal implementation**

Append to `metrics.ts`:

```ts
export interface TriangleQualityResult {
  maxAspect3D: number;
  minAngleDeg: number;
  sliverCount: number;
}

const SLIVER_ASPECT = 100;

/**
 * 3D triangle quality. aspect = longest² / (4·area·√3) (1 = equilateral),
 * minAngleDeg = smallest interior angle across all triangles, sliverCount =
 * triangles with aspect > 100.
 */
export function triangleQuality3D(mesh: MeshView): TriangleQualityResult {
  const { vertices, indices } = mesh;
  let maxAspect = 0;
  let minAngle = 180;
  let slivers = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

    const ab2 = dist2(ax, ay, az, bx, by, bz);
    const bc2 = dist2(bx, by, bz, cx, cy, cz);
    const ca2 = dist2(cx, cy, cz, ax, ay, az);
    const longest2 = Math.max(ab2, bc2, ca2);

    // Area via cross product of two edges.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const cxp = uy * vz - uz * vy;
    const cyp = uz * vx - ux * vz;
    const czp = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(cxp, cyp, czp);

    if (area <= 1e-12) {
      maxAspect = Math.max(maxAspect, Infinity);
      slivers++;
      minAngle = 0;
      continue;
    }

    const aspect = longest2 / (4 * area * Math.sqrt(3));
    if (aspect > maxAspect) maxAspect = aspect;
    if (aspect > SLIVER_ASPECT) slivers++;

    const a = Math.sqrt(bc2); // side opposite A
    const b = Math.sqrt(ca2); // side opposite B
    const c = Math.sqrt(ab2); // side opposite C
    const angA = lawOfCosines(b, c, a);
    const angB = lawOfCosines(a, c, b);
    const angC = lawOfCosines(a, b, a === 0 ? 0 : c) === 0 ? 0 : lawOfCosines(a, b, c);
    const triMin = Math.min(angA, angB, angC);
    if (triMin < minAngle) minAngle = triMin;
  }

  return {
    maxAspect3D: maxAspect,
    minAngleDeg: indices.length > 0 ? minAngle : 0,
    sliverCount: slivers,
  };
}

function dist2(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/** Interior angle (degrees) opposite side `opp`, given the two adjacent sides. */
function lawOfCosines(adj1: number, adj2: number, opp: number): number {
  if (adj1 <= 0 || adj2 <= 0) return 0;
  let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
  if (cos > 1) cos = 1;
  if (cos < -1) cos = -1;
  return (Math.acos(cos) * 180) / Math.PI;
}
```

> Note: the `angC` line above is intentionally simplified to `const angC = lawOfCosines(a, b, c);` — replace the placeholder ternary with that single call when implementing. (Kept explicit here to flag the per-angle pattern.)

Use this final form for the three angles:

```ts
    const angA = lawOfCosines(b, c, a);
    const angB = lawOfCosines(a, c, b);
    const angC = lawOfCosines(a, b, c);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: PASS (equilateral + sliver cases).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/metrics.ts potfoundry-web/src/fidelity/metrics.test.ts
git commit -m "feat(fidelity): 3D triangle-quality metric (aspect, min angle, slivers)"
```

---

## Task 5: Topology metric (watertightness + orientation)

Position-welds vertices (tolerance `WELD_TOL_MM`), builds a directed edge→use map, and reports `boundaryEdges`, `nonManifoldEdges`, and `orientationMismatches`. Mirrors the algorithm in `exportValidation.ts`, kept independent so the harness is self-contained.

**Files:**
- Modify: `potfoundry-web/src/fidelity/metrics.ts`
- Modify: `potfoundry-web/src/fidelity/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `metrics.test.ts`:

```ts
import { topologyMetric } from './metrics';

function closedCube(): { vertices: Float32Array; indices: Uint32Array } {
  return {
    vertices: new Float32Array([
      -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
      -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    ]),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]),
  };
}

describe('topologyMetric', () => {
  it('reports a closed oriented cube as watertight', () => {
    const out = topologyMetric(closedCube(), 1e-4);
    expect(out.boundaryEdges).toBe(0);
    expect(out.nonManifoldEdges).toBe(0);
    expect(out.orientationMismatches).toBe(0);
  });

  it('reports boundary edges for an open quad', () => {
    const mesh = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const out = topologyMetric(mesh, 1e-4);
    expect(out.boundaryEdges).toBeGreaterThan(0);
  });

  it('detects winding mismatches on a flipped face', () => {
    const mesh = closedCube();
    const flipped = new Uint32Array(mesh.indices);
    flipped[3] = 0; flipped[4] = 2; flipped[5] = 3; // flip second triangle
    const out = topologyMetric({ vertices: mesh.vertices, indices: flipped }, 1e-4);
    expect(out.orientationMismatches).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: FAIL with "topologyMetric is not a function".

- [ ] **Step 3: Write minimal implementation**

Append to `metrics.ts`:

```ts
export interface TopologyResult {
  boundaryEdges: number;
  nonManifoldEdges: number;
  orientationMismatches: number;
}

/**
 * Weld vertices by position quantization, then analyze the directed edge map:
 * - boundaryEdges: undirected edges used by exactly one triangle side.
 * - nonManifoldEdges: undirected edges shared by >2 triangle sides.
 * - orientationMismatches: manifold edges whose two uses point the same way
 *   (i.e. not one forward + one reverse) → inconsistent winding.
 */
export function topologyMetric(mesh: MeshView, weldToleranceMm: number): TopologyResult {
  const remap = buildWeldRemap(mesh.vertices, weldToleranceMm);
  const { indices } = mesh;

  // Directed edge usage keyed by "min:max"; track forward/reverse counts.
  const uses = new Map<string, { forward: number; reverse: number }>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if (a === b) continue; // degenerate edge
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      let u = uses.get(key);
      if (!u) { u = { forward: 0, reverse: 0 }; uses.set(key, u); }
      if (a === lo) u.forward++; else u.reverse++;
    }
  }

  let boundary = 0;
  let nonManifold = 0;
  let mismatch = 0;
  for (const u of uses.values()) {
    const total = u.forward + u.reverse;
    if (total === 1) boundary++;
    else if (total > 2) nonManifold++;
    else if (total === 2 && !(u.forward === 1 && u.reverse === 1)) mismatch++;
  }

  return { boundaryEdges: boundary, nonManifoldEdges: nonManifold, orientationMismatches: mismatch };
}

/** Map each vertex index to a canonical welded index via position quantization. */
function buildWeldRemap(vertices: Float32Array, toleranceMm: number): Uint32Array {
  const n = vertices.length / 3;
  const remap = new Uint32Array(n);
  if (toleranceMm <= 0) {
    for (let i = 0; i < n; i++) remap[i] = i;
    return remap;
  }
  const inv = 1 / toleranceMm;
  const buckets = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const qx = Math.round(vertices[i * 3] * inv);
    const qy = Math.round(vertices[i * 3 + 1] * inv);
    const qz = Math.round(vertices[i * 3 + 2] * inv);
    const key = `${qx},${qy},${qz}`;
    const existing = buckets.get(key);
    if (existing === undefined) { buckets.set(key, i); remap[i] = i; }
    else remap[i] = existing;
  }
  return remap;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: PASS (cube watertight, open quad boundary, flipped winding).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/metrics.ts potfoundry-web/src/fidelity/metrics.test.ts
git commit -m "feat(fidelity): watertightness + orientation topology metric"
```

---

## Task 6: Metric assembler (`computeFidelityMetrics`)

Wires the pure metrics together into a single `FidelityMetrics` object (feature numbers passed in by the caller, since they come from runtime pipeline debug data, not geometry).

**Files:**
- Modify: `potfoundry-web/src/fidelity/metrics.ts`
- Modify: `potfoundry-web/src/fidelity/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `metrics.test.ts`:

```ts
import { computeFidelityMetrics } from './metrics';

describe('computeFidelityMetrics', () => {
  it('assembles a full metrics row from a mesh + dense reference', () => {
    const R = 40;
    const dense = denseCylinder(R, 100, 360, 200);
    const mesh = facetedCylinder(R, 100, 64);
    const row = computeFidelityMetrics({
      styleId: 'TestCylinder',
      mesh,
      denseVertices: dense,
      features: { expected: 5, present: 5 },
      weldToleranceMm: 1e-4,
      sagSampleOrder: 4,
    });
    expect(row.styleId).toBe('TestCylinder');
    expect(row.triangleCount).toBe(mesh.indices.length / 3);
    expect(row.maxSagMm).toBeGreaterThanOrEqual(0);
    expect(row.maxAspect3D).toBeGreaterThan(0);
    expect(row.featuresExpected).toBe(5);
    expect(row.featuresDropped).toBe(0);
    expect(row.sagReferenceBinThetaRad).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: FAIL with "computeFidelityMetrics is not a function".

- [ ] **Step 3: Write minimal implementation**

Append to `metrics.ts`:

```ts
import type { FidelityMetrics } from './types';

export interface ComputeFidelityArgs {
  styleId: string;
  mesh: MeshView;
  denseVertices: Float32Array;
  features: { expected: number; present: number };
  weldToleranceMm: number;
  sagSampleOrder?: number;
  referenceTriangleCount?: number;
}

/** Assemble a complete FidelityMetrics row from a mesh-under-test + dense reference. */
export function computeFidelityMetrics(args: ComputeFidelityArgs): FidelityMetrics {
  const { styleId, mesh, denseVertices, features, weldToleranceMm } = args;
  const ref = buildRadialReference(denseVertices);
  const sag = sagDeviation(mesh, ref.rTrue, args.sagSampleOrder ?? 4);
  const quality = triangleQuality3D(mesh);
  const topo = topologyMetric(mesh, weldToleranceMm);
  const dropped = Math.max(0, features.expected - features.present);

  return {
    styleId,
    triangleCount: mesh.indices.length / 3,
    vertexCount: mesh.vertices.length / 3,
    referenceTriangleCount: args.referenceTriangleCount ?? denseVertices.length / 3,
    maxSagMm: sag.maxSagMm,
    rmsSagMm: sag.rmsSagMm,
    sagReferenceBinThetaRad: ref.binThetaRad,
    sagReferenceBinZmm: ref.binZmm,
    maxAspect3D: quality.maxAspect3D,
    minAngleDeg: quality.minAngleDeg,
    sliverCount: quality.sliverCount,
    boundaryEdges: topo.boundaryEdges,
    nonManifoldEdges: topo.nonManifoldEdges,
    orientationMismatches: topo.orientationMismatches,
    featuresExpected: features.expected,
    featuresPresent: features.present,
    featuresDropped: dropped,
  };
}
```

- [ ] **Step 4: Run the full metrics suite**

Run: `cd potfoundry-web && npx vitest run src/fidelity/metrics.test.ts`
Expected: PASS (all tasks 2–6).

- [ ] **Step 5: Lint + typecheck**

Run: `cd potfoundry-web && npm run lint && npm run typecheck`
Expected: PASS (0 warnings).

- [ ] **Step 6: Commit**

```bash
git add potfoundry-web/src/fidelity/metrics.ts potfoundry-web/src/fidelity/metrics.test.ts
git commit -m "feat(fidelity): assemble full FidelityMetrics row"
```

---

## Task 7: Dev/test-gated window hook

Exposes `window.__pfFidelity` for Playwright. No pipeline logic — it only calls the existing `generateMesh`, reads `getLastChainDebugData()`, and runs the pure metrics in-page.

**Files:**
- Create: `potfoundry-web/src/fidelity/windowHook.ts`

- [ ] **Step 1: Write the hook module**

```ts
/**
 * Dev/test-gated window hook for the SP0 fidelity harness. Registered from
 * StatusFooter behind import.meta.env.DEV (or ?fidelity=1). NEVER ships active
 * in production. Contains no pipeline logic: it drives the existing
 * generateMesh, reads pipeline chain-debug accounting, and runs pure metrics
 * in-page so only ~12 numbers cross the CDP bridge.
 */
import type { MeshData } from '../geometry/types';
import { STYLE_REGISTRY } from '../styles/registry';
import { getLastChainDebugData } from '../renderers/webgpu/ParametricExportComputer';
import { computeFidelityMetrics } from './metrics';
import { WELD_TOL_MM, type FidelityMetrics } from './types';

export interface FidelityMeasureOptions {
  targetTriangles: number;
  referenceTriangles: number;
  sagSampleOrder?: number;
}

export interface FidelityHookDeps {
  setStyle: (name: string) => void;
  isAvailable: () => boolean;
  generateMesh: (targetTriangles?: number) => Promise<MeshData | null>;
}

export interface PfFidelityApi {
  listStyles(): string[];
  isReady(): boolean;
  setStyle(styleId: string): Promise<void>;
  measure(opts: FidelityMeasureOptions): Promise<FidelityMetrics>;
}

declare global {
  interface Window {
    __pfFidelity?: PfFidelityApi;
  }
}

export function shouldEnableFidelityHook(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
  } catch {
    /* import.meta may be undefined in some bundling contexts */
  }
  if (typeof location !== 'undefined') {
    return new URLSearchParams(location.search).has('fidelity');
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createFidelityApi(deps: FidelityHookDeps): PfFidelityApi {
  return {
    listStyles() {
      return Object.keys(STYLE_REGISTRY);
    },
    isReady() {
      return deps.isAvailable();
    },
    async setStyle(styleId: string) {
      deps.setStyle(styleId);
      // Wait for the async GPU re-init (useEffect keyed on style.name) to settle.
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (deps.isAvailable()) return;
        await sleep(100);
      }
      throw new Error(`Fidelity: GPU did not become ready for style ${styleId}`);
    },
    async measure(opts: FidelityMeasureOptions): Promise<FidelityMetrics> {
      const styleId = currentStyleId();
      const dense = await deps.generateMesh(opts.referenceTriangles);
      if (!dense) throw new Error('Fidelity: dense reference generateMesh returned null');
      const denseVertices = dense.vertices.slice(); // copy before next generate reuses buffers

      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');

      const chain = getLastChainDebugData();
      const expected = chain?.chainCount ?? 0;
      const present = chain?.lineCount ?? 0;

      return computeFidelityMetrics({
        styleId,
        mesh: { vertices: mesh.vertices, indices: mesh.indices },
        denseVertices,
        features: { expected, present },
        weldToleranceMm: WELD_TOL_MM,
        sagSampleOrder: opts.sagSampleOrder,
        referenceTriangleCount: dense.triangleCount,
      });
    },
  };
}

function currentStyleId(): string {
  return (window as unknown as { __pfCurrentStyle?: string }).__pfCurrentStyle ?? 'unknown';
}
```

> The `currentStyleId()` indirection is replaced in Task 8: `StatusFooter` writes the live style name to `window.__pfCurrentStyle` so `measure()` labels rows correctly without importing the store here.

- [ ] **Step 2: Typecheck**

Run: `cd potfoundry-web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add potfoundry-web/src/fidelity/windowHook.ts
git commit -m "feat(fidelity): dev-gated window.__pfFidelity hook"
```

---

## Task 8: Register the hook from StatusFooter

`StatusFooter` already consumes `useParametricExport` and is always mounted. Register the hook there via `useEffect`, gated, with cleanup.

**Files:**
- Modify: `potfoundry-web/src/ui/v2/layout/StatusFooter.tsx`

- [ ] **Step 1: Add imports**

After the existing hook imports (near line 19), add:

```tsx
import { useAppStore } from '../../../state';
import {
  createFidelityApi,
  shouldEnableFidelityHook,
} from '../../../fidelity/windowHook';
```

(`useAppStore` is already imported in this file — do not duplicate it; only add the `windowHook` import.)

- [ ] **Step 2: Register the hook in an effect**

Inside the `StatusFooter` component body, after `parametricExport` is defined (after line 61), add:

```tsx
  const setStyle = useAppStore((s) => s.setStyle);
  const styleName = useAppStore((s) => s.style.name);

  // Expose the current style id for the fidelity hook's row labelling.
  useEffect(() => {
    (window as unknown as { __pfCurrentStyle?: string }).__pfCurrentStyle = styleName;
  }, [styleName]);

  // Dev/test-gated 3D fidelity measurement hook (SP0). No-op in production.
  useEffect(() => {
    if (!shouldEnableFidelityHook()) return;
    window.__pfFidelity = createFidelityApi({
      setStyle: (name: string) => setStyle(name as Parameters<typeof setStyle>[0]),
      isAvailable: () => parametricExport.isAvailable,
      generateMesh: (n) => parametricExport.generateMesh(n),
    });
    return () => { delete window.__pfFidelity; };
  }, [setStyle, parametricExport]);
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd potfoundry-web && npm run typecheck && npm run lint`
Expected: PASS (0 warnings). If lint flags the `as unknown as` cast, scope it narrowly as shown.

- [ ] **Step 4: Manually confirm the hook appears in dev**

Run (separate terminal): `cd potfoundry-web && npm run dev -- --port 3001`
Then in the browser console at `http://localhost:3001`:
```js
await window.__pfFidelity.listStyles()
```
Expected: array of 20 style ids. Stop here if `__pfFidelity` is undefined — the gate or registration is wrong.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/ui/v2/layout/StatusFooter.tsx
git commit -m "feat(fidelity): register window hook from StatusFooter (dev-gated)"
```

---

## Task 9: Playwright fidelity spec

Loops all styles, calls `measure`, writes `baseline.json`, asserts invariants. Invariants known-broken at HEAD use `test.fail()` so they flip green when SP1–SP3 fix them.

**Files:**
- Create: `potfoundry-web/e2e/export-fidelity.spec.ts`
- Create (emitted): `potfoundry-web/e2e/fidelity/baseline.json`

- [ ] **Step 1: Write the spec**

```ts
/**
 * SP0 — 3D Export Fidelity Harness (real WebGPU).
 * Loads the app once, loops every registered style, measures the 3D fidelity
 * matrix via window.__pfFidelity, writes baseline.json, and asserts one pinned
 * invariant per fidelity dimension. Run with the dev server on :3001:
 *   npm run dev -- --port 3001   (separate terminal)
 *   npx playwright test export-fidelity --project=chromium
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  SAG_TOL_MM,
  ASPECT_MAX,
  type FidelityMetrics,
  type FidelityBaseline,
} from '../src/fidelity/types';

const TARGET_TRIANGLES = 500_000;      // 'draft'/'standard'-ish for matrix speed
const REFERENCE_TRIANGLES = 8_000_000; // dense R_true reference
const OUT_DIR = path.join(__dirname, 'fidelity');
const OUT_FILE = path.join(OUT_DIR, 'baseline.json');

test.describe.configure({ mode: 'serial' });

test.describe('Export fidelity matrix', () => {
  let styles: string[] = [];
  const rows: FidelityMetrics[] = [];

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/?fidelity=1');
    await expect(page.locator('.pf-wgpu-preview')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', { timeout: 30000 });
    styles = await page.evaluate(() => window.__pfFidelity!.listStyles());

    for (const styleId of styles) {
      await page.evaluate((s) => window.__pfFidelity!.setStyle(s), styleId);
      const row = await page.evaluate(
        ({ t, r }) => window.__pfFidelity!.measure({ targetTriangles: t, referenceTriangles: r }),
        { t: TARGET_TRIANGLES, r: REFERENCE_TRIANGLES },
      );
      rows.push(row);
      // eslint-disable-next-line no-console
      console.log(
        `${row.styleId}: sag=${row.maxSagMm.toFixed(3)}mm aspect=${row.maxAspect3D.toFixed(0)} ` +
        `bnd=${row.boundaryEdges} nonMan=${row.nonManifoldEdges} orient=${row.orientationMismatches} ` +
        `featDrop=${row.featuresDropped}/${row.featuresExpected}`,
      );
    }

    const baseline: FidelityBaseline = {
      generatedAt: new Date().toISOString(),
      budget: TARGET_TRIANGLES,
      referenceBudget: REFERENCE_TRIANGLES,
      refDimensions: { H: 120, Rt: 70, Rb: 45 },
      rows,
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2));
    await page.close();
  });

  test('produced a matrix row for every registered style', () => {
    expect(rows.length).toBe(styles.length);
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });

  // ── Pinned invariants (one per dimension). Some use test.fail() because the
  //    pipeline is currently broken; they flip the moment SP1–SP3 fix them. ──

  test('INVARIANT sag: maxSagMm <= SAG_TOL_MM (all styles)', () => {
    test.fail(); // SP1 (tolerance-driven tessellation) target — RED at HEAD.
    for (const r of rows) expect(r.maxSagMm, r.styleId).toBeLessThanOrEqual(SAG_TOL_MM);
  });

  test('INVARIANT quality: maxAspect3D < ASPECT_MAX (all styles)', () => {
    test.fail(); // SP2 (sliver elimination) target — RED at HEAD.
    for (const r of rows) expect(r.maxAspect3D, r.styleId).toBeLessThan(ASPECT_MAX);
  });

  test('INVARIANT watertight: boundaryEdges == 0 (outer-wall mesh) — DOCUMENTED', () => {
    test.fail(); // SP3 (watertight assembly) target; outer wall is open by design at HEAD.
    for (const r of rows) expect(r.boundaryEdges, r.styleId).toBe(0);
  });

  test('INVARIANT orientation: orientationMismatches == 0 (all styles)', () => {
    for (const r of rows) expect(r.orientationMismatches, r.styleId).toBe(0);
  });

  test('INVARIANT features: featuresDropped == 0 (all styles)', () => {
    test.fail(); // F12-style silent chain drops exist at HEAD — RED until fixed.
    for (const r of rows) expect(r.featuresDropped, r.styleId).toBe(0);
  });
});
```

> If any `test.fail()` invariant is actually GREEN at HEAD (e.g. orientation already clean for all styles), Playwright reports it as an unexpected pass — remove that `test.fail()` line so the invariant becomes a true guard. Adjust per the first real run (Task 10).

- [ ] **Step 2: Verify the spec compiles (no run yet)**

Run: `cd potfoundry-web && npx tsc --noEmit e2e/export-fidelity.spec.ts` *(expect module-resolution noise only; no syntax errors)*. Preferred: `npm run typecheck:full` if it includes `e2e/`.

- [ ] **Step 3: Commit the spec (baseline.json committed in Task 10 after first run)**

```bash
git add potfoundry-web/e2e/export-fidelity.spec.ts
git commit -m "test(fidelity): SP0 Playwright matrix spec + pinned invariants"
```

---

## Task 10: First real run, calibrate invariants, commit baseline

**Files:**
- Modify: `potfoundry-web/e2e/export-fidelity.spec.ts` (only if calibration requires)
- Create: `potfoundry-web/e2e/fidelity/baseline.json`

- [ ] **Step 1: Start the dev server**

Run (separate terminal, leave running): `cd potfoundry-web && npm run dev -- --port 3001`
Expected: server on `http://localhost:3001`.

- [ ] **Step 2: Run the fidelity spec**

Run: `cd potfoundry-web && npx playwright test export-fidelity --project=chromium`
Expected: the matrix prints one line per style; `baseline.json` is written; the "matrix row for every style" + "orientation" tests pass; the `test.fail()` invariants report as expected failures (not unexpected passes).

- [ ] **Step 3: Calibrate invariants to real HEAD**

If a `test.fail()` invariant *passes unexpectedly*, remove its `test.fail()` line (it's already healthy). If a non-`fail` invariant fails, either it reveals a real bug (record it) or it needs documenting — convert to `test.fail()` with a one-line reason. Re-run until expected/green is stable.

- [ ] **Step 4: Re-run to confirm stability**

Run: `cd potfoundry-web && npx playwright test export-fidelity --project=chromium`
Expected: deterministic result (same expected-failures, same passes).

- [ ] **Step 5: Commit the baseline + any calibration**

```bash
git add potfoundry-web/e2e/fidelity/baseline.json potfoundry-web/e2e/export-fidelity.spec.ts
git commit -m "test(fidelity): commit SP0 baseline matrix + calibrated invariants"
```

---

## Task 11: Acceptance check

- [ ] **Step 1: Full vitest suite green**

Run: `cd potfoundry-web && npm run test`
Expected: PASS, including all `src/fidelity/metrics.test.ts` cases.

- [ ] **Step 2: Lint + typecheck clean**

Run: `cd potfoundry-web && npm run lint && npm run typecheck`
Expected: PASS, 0 warnings.

- [ ] **Step 3: Confirm acceptance criteria (spec §"Acceptance criteria for SP0")**

Verify all five:
1. Dev server + fidelity spec produces a complete matrix for every registered style. ✓ (Task 10)
2. `metrics.ts` unit tests pass in vitest. ✓ (Task 11 Step 1)
3. `baseline.json` committed as the SP1–SP3 reference. ✓ (Task 10)
4. Pinned invariants exist for all five dimensions, reflecting real HEAD (red where broken, green where good). ✓ (Tasks 9–10)
5. No pipeline logic changed; only production touch is the dev/test-gated window hook + its StatusFooter registration. ✓

- [ ] **Step 4: Run gitnexus_detect_changes (per CLAUDE.md) and report scope**

Confirm changes are confined to `src/fidelity/*`, `src/ui/v2/layout/StatusFooter.tsx`, and `e2e/*`. Report the affected-symbol scope to the user. No parametric pipeline symbols should appear.

---

## Self-Review

**Spec coverage:** every spec dimension is implemented — sag (Tasks 2–3), 3D quality (Task 4), watertightness + orientation (Task 5), feature preservation (Tasks 6–7 via chain debug), all assembled (Task 6) and asserted (Task 9). Output `baseline.json` (Tasks 9–10). Window hook is the single production touch (Tasks 7–8). The revised dense-reference `R_true` is implemented in Task 2 and consumed in Tasks 3/6.

**Type consistency:** `MeshView`, `RTrue`, `FidelityMetrics`, `FidelityBaseline`, `SAG_TOL_MM`, `ASPECT_MAX`, `WELD_TOL_MM` are defined once in `types.ts` (Task 1) and imported everywhere. `computeFidelityMetrics` signature in Task 6 matches its call in Task 7. `createFidelityApi`/`FidelityHookDeps` in Task 7 match the registration in Task 8. `generateMesh` returns `Promise<MeshData | null>` (verified) and the hook null-checks it.

**Known calibration point (not a placeholder):** the exact set of `test.fail()` invariants that are RED vs GREEN at HEAD can only be known after the first real GPU run (Task 10 Step 3). The plan handles this explicitly rather than guessing, consistent with the audit's `it.fails` convention.

**One deliberate inline note:** Task 4 Step 3 flags a simplification for the `angC` computation; the corrected three-line form is given immediately after. Implement the corrected form.
