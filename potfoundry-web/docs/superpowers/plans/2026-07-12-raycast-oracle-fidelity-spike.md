# Raycast-Oracle Fidelity Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only measurement harness that reports, per frontier style + clean control, where the current conforming mesher stands against the 0.01 mm-everywhere / edges-preserved / sliceable bar — and the CPU-vs-certified-GPU drift number that decides oracle-refine vs remesher.

**Architecture:** Pure-CPU spine (Vitest/Node) that reuses the exact `assembleConformingCPU` pipeline, scores every outer facet's true chord-sag against the exact CPU field, runs the production verdict-refine loop (flag-toggled) to measure insertion cost, and validates the full solid for slicing. A final Playwright→WebGPU capstone dumps the certified GPU field so drift can be computed and condition A certified. All code lives under `research/spike-raycast-oracle/` — **zero production files touched**.

**Tech Stack:** TypeScript, Vitest (jsdom), Node `fs`, existing `conforming/` + `fidelity/` + `geometry/` modules, Playwright + headless Chromium WebGPU (capstone only).

## Global Constraints

- **No production code changes.** Every file created lives under `research/spike-raycast-oracle/` or writes artifacts to `research/lab/`. Do not edit any file under `src/`.
- **ESLint 0-warnings.** A PostToolUse hook runs `eslint --max-warnings=0` on every `.ts` edit. Fix all warnings before the task's commit.
- **Fixed fixture (verbatim):** `DEFAULT_DIMENSIONS = { H: 120, Rt: 70, Rb: 45, tWall: 3, tBottom: 3, rDrain: 10, expn: 1.1 }`. Registry-default style params via `buildStyleParamPayload(styleId, {})`. Twist is **identity** at these dims (`spinTurns = spinPhase = 0`), so `theta = 2πu`, `z = t·H` — no twist term anywhere in the CPU fixture.
- **Tolerance:** `TOL_MM = 0.01` (max chord-sag on every outer facet).
- **Recorded/reasoned cap:** the verdict loop's production constants `VERDICT_TOL_MM = 0.01`, `VERDICT_MAX_PASS = 4` are the cap. The scorecard records these values and reasons about convergence against them; it never silently truncates.
- **Four styles:** `SuperformulaBlossom` (id 0, control, `sf_strength=0`), `SpiralRidges` (id 2), `GothicArches` (id 5), `GyroidManifold` (id 12).
- **Triangle count is reported, never a gate.**
- **Spec:** `docs/superpowers/specs/2026-07-12-raycast-oracle-fidelity-spike-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `research/spike-raycast-oracle/buildSolidCPU.ts` | Parameterized CPU build (copy of `assembleConformingCPU`, exposing `maxSagMm` + `verdictRefine` flag). Returns parametric `(u,t,s)` verts, 3D positions, indices, surface ranges, feature-kind summary. |
| `research/spike-raycast-oracle/sagScorer.ts` | `denseBary(8)` + `perpDistToPlane` chord-sag over **every** outer facet against a supplied exact lift. Returns max, %over-tol, worst-facet location. |
| `research/spike-raycast-oracle/conditionC.ts` | Full-solid `MeshData` → `validateMeshForExport` + `detectSelfIntersections` + `topologyMetric` → emit binary STL to disk. |
| `research/spike-raycast-oracle/scorecard.ts` | Row type, markdown-table writer, go/no-go readout. |
| `research/spike-raycast-oracle/gpuOracle.mjs` | **(Phase 2)** Playwright dump of the certified GPU position grid per style → JSON. |
| `research/spike-raycast-oracle/drift.ts` | **(Phase 2)** CPU-`evalSurface` vs GPU-grid radial drift → `δ`; certifies condition A. |
| `research/spike-raycast-oracle/*.test.ts` | One Vitest unit test per module above. |
| `research/spike-raycast-oracle/scorecard.spike.test.ts` | Orchestrator: runs the 4 styles, writes `research/lab/2026-07-12-raycast-oracle-fidelity.md` + STL files. |

---

# Phase 1 — CPU spine (delivers conditions A, B2, C, insertion-cost for all 4 styles)

## Task 1: `buildSolidCPU` — parameterized CPU build

**Files:**
- Create: `research/spike-raycast-oracle/buildSolidCPU.ts`
- Test: `research/spike-raycast-oracle/buildSolidCPU.test.ts`

**Interfaces:**
- Consumes: `assembleWatertight`, `GpuSurfaceSampler`, `extractAnalyticFeatures`, `chooseCreaseGrid`, `chooseCreaseTGrid`, `chooseHelixGrid`, `applyUWarp`, `applyTWarp`, `applyHelixWarp`, `AssemblyDimensions`, `FeatureLine`, `SurfaceSampler` (all from `../../src/renderers/webgpu/parametric/conforming`); `getStyleFunction` (`../../src/geometry/styles`); `baseRadius` (`../../src/geometry/profile`); `buildStyleParamPayload` (`../../src/utils/styleParams`); `DEFAULT_DIMENSIONS`, `StyleId`, `StyleOptions` (`../../src/geometry/types`).
- Produces:
  ```ts
  export interface SolidCPU {
    paramVerts: Float32Array;   // (u, t, surfaceId) × N — pre-lift
    pos3D: Float32Array;        // (x, y, z) × N — CPU-exact lift
    indices: Uint32Array;
    outerIndexStart: number;    // into indices: first outer-wall (surfaceId 0) tri index
    outerIndexEnd: number;      // exclusive
    generalCurveCount: number;
    featureKinds: Record<string, number>;  // kind -> line count (diagnostics)
    verdictRan: boolean;        // whether the flag-ON verdict branch was eligible
  }
  export function buildSolidCPU(
    styleId: StyleId,
    opts: { maxSagMm: number; verdictRefine: boolean },
  ): SolidCPU
  ```

- [ ] **Step 1: Write the failing test**

```ts
// research/spike-raycast-oracle/buildSolidCPU.test.ts
import { describe, it, expect } from 'vitest';
import { buildSolidCPU } from './buildSolidCPU';

describe('buildSolidCPU', () => {
  it('builds a non-trivial closed solid for the smooth control', () => {
    const s = buildSolidCPU('SuperformulaBlossom', { maxSagMm: 0.1, verdictRefine: false });
    expect(s.indices.length / 3).toBeGreaterThan(1000);
    expect(s.paramVerts.length).toBe(s.pos3D.length);
    // outer range is a valid sub-range of indices
    expect(s.outerIndexStart).toBeGreaterThanOrEqual(0);
    expect(s.outerIndexEnd).toBeLessThanOrEqual(s.indices.length);
    expect(s.outerIndexEnd).toBeGreaterThan(s.outerIndexStart);
    // all 3D positions finite
    expect([...s.pos3D].every(Number.isFinite)).toBe(true);
  }, 60000);

  it('tightening maxSagMm produces more triangles', () => {
    const coarse = buildSolidCPU('GyroidManifold', { maxSagMm: 0.1, verdictRefine: false });
    const fine = buildSolidCPU('GyroidManifold', { maxSagMm: 0.01, verdictRefine: false });
    expect(fine.indices.length).toBeGreaterThan(coarse.indices.length);
  }, 120000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run research/spike-raycast-oracle/buildSolidCPU.test.ts`
Expected: FAIL — "Cannot find module './buildSolidCPU'".

- [ ] **Step 3: Write the implementation**

This is a near-verbatim, parameterized copy of `assembleConformingCPU`
(`src/geometry/conformingTopologyGate.test.ts:64-287`). It is copied — not
imported — because that source is a `.test.ts` whose top-level `describe.each`
would execute on import in a non-test module. Two changes vs the original:
`maxSagMm` is a parameter, and `globalThis.__pfConformingVerdictRefine` is set
around `assembleWatertight` when `opts.verdictRefine` is true.

```ts
// research/spike-raycast-oracle/buildSolidCPU.ts
import {
  assembleWatertight,
  GpuSurfaceSampler,
  extractAnalyticFeatures,
  chooseCreaseGrid,
  chooseCreaseTGrid,
  chooseHelixGrid,
  applyUWarp,
  applyTWarp,
  applyHelixWarp,
  type AssemblyDimensions,
  type FeatureLine,
  type SurfaceSampler,
} from '../../src/renderers/webgpu/parametric/conforming';
import type { StyleId, StyleOptions } from '../../src/geometry/types';
import { DEFAULT_DIMENSIONS } from '../../src/geometry/types';
import { getStyleFunction } from '../../src/geometry/styles';
import { baseRadius } from '../../src/geometry/profile';
import { buildStyleParamPayload } from '../../src/utils/styleParams';

const DIMS = {
  H: DEFAULT_DIMENSIONS.H, Rt: DEFAULT_DIMENSIONS.Rt, Rb: DEFAULT_DIMENSIONS.Rb,
  tWall: DEFAULT_DIMENSIONS.tWall, tBottom: DEFAULT_DIMENSIONS.tBottom,
  rDrain: DEFAULT_DIMENSIONS.rDrain, expn: DEFAULT_DIMENSIONS.expn,
};
const MIN_R = 0.5;
const EMPTY_OPTS: StyleOptions = {};

/** CPU surrogate of WGSL compute_outer_radius (twist identity at default dims). */
export function outerRadius(styleId: StyleId, theta: number, t: number): number {
  const z = t * DIMS.H;
  const r0 = baseRadius(z, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn, EMPTY_OPTS);
  return getStyleFunction(styleId)(theta, z, r0, DIMS.H, EMPTY_OPTS);
}
function innerRadius(styleId: StyleId, theta: number, t: number): number {
  return Math.max(outerRadius(styleId, theta, t) - DIMS.tWall, MIN_R);
}

/** CPU surrogate of WGSL evaluate_vertices — all 6 surface IDs. Exported so the
 *  sag scorer and condition-C task lift with the identical exact field. */
export function evalSurface(
  styleId: StyleId, u: number, t: number, surfaceId: number,
): [number, number, number] {
  const theta = 2 * Math.PI * (u - Math.floor(u));
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const { H, tBottom, rDrain } = DIMS;
  let r: number, z: number;
  if (surfaceId < 0.5) { r = outerRadius(styleId, theta, t); z = t * H; }
  else if (surfaceId < 1.5) { z = tBottom + t * (H - tBottom); r = innerRadius(styleId, theta, z / H); }
  else if (surfaceId < 2.5) {
    const ri = innerRadius(styleId, theta, 1), ro = outerRadius(styleId, theta, 1);
    r = ri + (ro - ri) * t; z = H;
  } else if (surfaceId < 3.5) {
    const ro = outerRadius(styleId, theta, 0); r = ro + (rDrain - ro) * t; z = 0;
  } else if (surfaceId < 4.5) {
    const ri = innerRadius(styleId, theta, tBottom / H); r = ri + (rDrain - ri) * t; z = tBottom;
  } else { r = rDrain; z = t * tBottom; }
  return [r * cos, r * sin, z];
}

function denseWallSampler(styleId: StyleId, surfaceId: number, res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const p = evalSurface(styleId, col / res, tVal, surfaceId);
      grid[w++] = p[0]; grid[w++] = p[1]; grid[w++] = p[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}

export interface SolidCPU {
  paramVerts: Float32Array;
  pos3D: Float32Array;
  indices: Uint32Array;
  outerIndexStart: number;
  outerIndexEnd: number;
  generalCurveCount: number;
  featureKinds: Record<string, number>;
  verdictRan: boolean;
}

export function buildSolidCPU(
  styleId: StyleId,
  opts: { maxSagMm: number; verdictRefine: boolean },
): SolidCPU {
  const DENSE_RES = 128;
  const outerSampler = denseWallSampler(styleId, 0, DENSE_RES);
  const innerSampler = denseWallSampler(styleId, 1, DENSE_RES);
  const dims: AssemblyDimensions = { H: DIMS.H, tBottom: DIMS.tBottom, rDrain: DIMS.rDrain };
  const nRing = 256;

  const [, packedParams] = buildStyleParamPayload(styleId, EMPTY_OPTS as Record<string, unknown>);
  const featureGraph = extractAnalyticFeatures(
    styleId, Float32Array.from(packedParams), { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
  );

  const featureKinds: Record<string, number> = {};
  for (const l of featureGraph.lines) featureKinds[l.kind] = (featureKinds[l.kind] ?? 0) + 1;

  const creaseUSet = new Set<number>(), creaseU: number[] = [];
  const creaseTSet = new Set<number>(), creaseT: number[] = [];
  const helixLines = featureGraph.lines.filter((l) => l.kind === 'helical-crease');
  for (const line of featureGraph.lines) {
    if (line.kind === 'vertical-crease') {
      const u = line.points[0].u, key = Math.round(u * 1e7);
      if (!creaseUSet.has(key)) { creaseUSet.add(key); creaseU.push(u); }
    } else if (line.kind === 'horizontal-band') {
      const tt = line.points[0].t, key = Math.round(tt * 1e7);
      if (!creaseTSet.has(key)) { creaseTSet.add(key); creaseT.push(tt); }
    }
  }
  const creaseChoice = chooseCreaseGrid(creaseU);
  const creaseTChoice = chooseCreaseTGrid(creaseT);
  let helixChoice = chooseHelixGrid(0, 0, 0);
  if (helixLines.length > 0) {
    const k = helixLines.length, l0 = helixLines[0].points;
    const p0 = l0[0], p1 = l0[Math.min(1, l0.length - 1)];
    let du = (p1.u - p0.u) % 1;
    if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
    const dt = p1.t - p0.t, slope = dt > 1e-9 ? du / dt : 0;
    helixChoice = chooseHelixGrid(k, -slope * k, p0.u * k);
  }

  const generalCurves: FeatureLine[] = featureGraph.lines.filter((l) => l.kind === 'general-curve');
  const minLevel = Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level);

  // Verdict-refine flag: eligible only when outer featureLines are non-empty
  // (matches ConformingWall's flag-ON guard). Record eligibility for the scorecard.
  const prevFlag = (globalThis as Record<string, unknown>).__pfConformingVerdictRefine;
  const verdictRan = opts.verdictRefine && generalCurves.length > 0;
  (globalThis as Record<string, unknown>).__pfConformingVerdictRefine = opts.verdictRefine;
  let asm;
  try {
    asm = assembleWatertight(outerSampler, innerSampler, dims, {
      maxSagMm: opts.maxSagMm, maxEdgeMm: 8, minEdgeMm: 0.2, gradeRatio: 2,
      maxLevel: 10, resU: 128, resT: 128, nRing, targetTriangles: undefined,
      budgetMode: 'cap' as const,
      minUniformLevel: minLevel > 0 ? minLevel : undefined,
      outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
      featureLevel: 7,
    });
  } finally {
    (globalThis as Record<string, unknown>).__pfConformingVerdictRefine = prevFlag;
  }

  if (!creaseChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) asm.vertices[i] = applyUWarp(creaseChoice.warp, asm.vertices[i]);
  }
  if (!creaseTChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      if (asm.vertices[i + 2] < 1.5) asm.vertices[i + 1] = applyTWarp(creaseTChoice.warp, asm.vertices[i + 1]);
    }
  }
  if (!helixChoice.warp.isIdentity && creaseChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      const sid = asm.vertices[i + 2];
      const tEval = sid < 1.5 ? asm.vertices[i + 1] : sid < 2.5 ? 1 : 0;
      asm.vertices[i] = applyHelixWarp(helixChoice.warp, asm.vertices[i], tEval);
    }
  }

  const paramVerts = Float32Array.from(asm.vertices);
  const n = asm.vertices.length / 3;
  const pos3D = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = evalSurface(styleId, asm.vertices[i * 3], asm.vertices[i * 3 + 1], asm.vertices[i * 3 + 2]);
    pos3D[i * 3] = p[0]; pos3D[i * 3 + 1] = p[1]; pos3D[i * 3 + 2] = p[2];
  }

  const outer = asm.surfaceRanges.find((r) => r.surfaceId === 0);
  if (!outer) throw new Error('no outer surface range');

  return {
    paramVerts, pos3D, indices: asm.indices,
    outerIndexStart: outer.indexStart, outerIndexEnd: outer.indexEnd,
    generalCurveCount: generalCurves.length, featureKinds, verdictRan,
  };
}
```

> **NOTE — verify `SurfaceRange` field names** against `WatertightAssembly.ts`
> (`surfaceRanges: { surfaceId, indexStart, indexEnd, vertexCount }[]`). If the
> assembler exposes the outer range differently, adapt the `.find(...)` above;
> everything else is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run research/spike-raycast-oracle/buildSolidCPU.test.ts`
Expected: PASS (both tests). If the second is slow, that is expected (0.01 mm build is dense).

- [ ] **Step 5: Commit**

```bash
git add research/spike-raycast-oracle/buildSolidCPU.ts research/spike-raycast-oracle/buildSolidCPU.test.ts
git commit -m "spike(raycast-oracle): parameterized CPU solid build (T1)"
```

---

## Task 2: `sagScorer` — true chord-sag over every outer facet

**Files:**
- Create: `research/spike-raycast-oracle/sagScorer.ts`
- Test: `research/spike-raycast-oracle/sagScorer.test.ts`

**Interfaces:**
- Consumes: `SolidCPU` (Task 1) — `paramVerts`, `pos3D`, `indices`, `outerIndexStart/End`.
- Produces:
  ```ts
  export interface SagReport {
    maxSagMm: number;
    facetCount: number;
    overTolCount: number;         // facets with sag > tolMm
    worst: { u: number; t: number; sagMm: number } | null;
  }
  export function scoreOuterSag(
    solid: { paramVerts: Float32Array; pos3D: Float32Array; indices: Uint32Array;
             outerIndexStart: number; outerIndexEnd: number },
    lift: (u: number, t: number) => [number, number, number],
    tolMm: number,
  ): SagReport
  ```
  The `lift` is `(u, t) => evalSurface(styleId, u, t, 0)` — the exact outer field.

- [ ] **Step 1: Write the failing test**

The parabola `z = u²` over triangle (u,t) = (0,0),(1,0),(0,1) has an analytic max
chord-sag of `0.25 / √2 ≈ 0.176777` at the edge midpoint `u=0.5` (which `denseBary(8)`
samples exactly). A planar lift has sag 0.

```ts
// research/spike-raycast-oracle/sagScorer.test.ts
import { describe, it, expect } from 'vitest';
import { scoreOuterSag } from './sagScorer';

// one outer triangle, params (0,0),(1,0),(0,1); vertex 3D positions filled by lift.
function oneTri(lift: (u: number, t: number) => [number, number, number]) {
  const uv = [[0, 0], [1, 0], [0, 1]] as const;
  const paramVerts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const pos3D = new Float32Array(9);
  uv.forEach(([u, t], i) => { const p = lift(u, t); pos3D[i*3]=p[0]; pos3D[i*3+1]=p[1]; pos3D[i*3+2]=p[2]; });
  return { paramVerts, pos3D, indices: new Uint32Array([0, 1, 2]), outerIndexStart: 0, outerIndexEnd: 3 };
}

describe('scoreOuterSag', () => {
  it('reports ~0 sag for a planar lift', () => {
    const lift = (u: number, t: number): [number, number, number] => [u, t, 0];
    const r = scoreOuterSag(oneTri(lift), lift, 0.01);
    expect(r.maxSagMm).toBeLessThan(1e-9);
    expect(r.overTolCount).toBe(0);
  });

  it('matches the analytic parabola sag 0.25/sqrt(2)', () => {
    const lift = (u: number, t: number): [number, number, number] => [u, t, u * u];
    const r = scoreOuterSag(oneTri(lift), lift, 0.01);
    expect(r.maxSagMm).toBeCloseTo(0.25 / Math.SQRT2, 4);
    expect(r.overTolCount).toBe(1);
    expect(r.worst?.u).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run research/spike-raycast-oracle/sagScorer.test.ts`
Expected: FAIL — "Cannot find module './sagScorer'".

- [ ] **Step 3: Write the implementation**

`denseBary(8)` and `perpDistToPlane` are reproduced verbatim from
`verdictRefine.ts:59-104` (they are module-private there; the codebase already
sanctions this local-reimpl pattern — see verdictRefine's import-hygiene note).

```ts
// research/spike-raycast-oracle/sagScorer.ts
function denseBary(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) pts.push([i / n, j / n, (n - i - j) / n]);
  return pts;
}
const DENSE8 = denseBary(8);

function perpDistToPlane(
  p: [number, number, number], a: [number, number, number],
  b: [number, number, number], c: [number, number, number],
): number {
  const abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
  const acx = c[0]-a[0], acy = c[1]-a[1], acz = c[2]-a[2];
  const nx = aby*acz - abz*acy, ny = abz*acx - abx*acz, nz = abx*acy - aby*acx;
  const nLen = Math.hypot(nx, ny, nz);
  if (nLen < 1e-15) return 0;
  const apx = p[0]-a[0], apy = p[1]-a[1], apz = p[2]-a[2];
  return Math.abs(apx*nx + apy*ny + apz*nz) / nLen;
}

export interface SagReport {
  maxSagMm: number;
  facetCount: number;
  overTolCount: number;
  worst: { u: number; t: number; sagMm: number } | null;
}

export function scoreOuterSag(
  solid: { paramVerts: Float32Array; pos3D: Float32Array; indices: Uint32Array;
           outerIndexStart: number; outerIndexEnd: number },
  lift: (u: number, t: number) => [number, number, number],
  tolMm: number,
): SagReport {
  const { paramVerts, pos3D, indices, outerIndexStart, outerIndexEnd } = solid;
  const uAt = (v: number) => paramVerts[v * 3], tAt = (v: number) => paramVerts[v * 3 + 1];
  const xyz = (v: number): [number, number, number] => [pos3D[v*3], pos3D[v*3+1], pos3D[v*3+2]];

  let maxSag = 0, overTol = 0, facets = 0;
  let worst: SagReport['worst'] = null;

  for (let ti = outerIndexStart; ti < outerIndexEnd; ti += 3) {
    const ia = indices[ti], ib = indices[ti + 1], ic = indices[ti + 2];
    const A = xyz(ia), B = xyz(ib), C = xyz(ic);
    const ua = uAt(ia), ta = tAt(ia), ub = uAt(ib), tb = tAt(ib), uc = uAt(ic), tc = tAt(ic);
    facets++;
    let facetWorst = 0, facetU = ua, facetT = ta;
    for (const [wa, wb, wc] of DENSE8) {
      const u = wa*ua + wb*ub + wc*uc, t = wa*ta + wb*tb + wc*tc;
      const P = lift(u, t);
      const d = perpDistToPlane(P, A, B, C);
      if (d > facetWorst) { facetWorst = d; facetU = u; facetT = t; }
    }
    if (facetWorst > tolMm) overTol++;
    if (facetWorst > maxSag) { maxSag = facetWorst; worst = { u: facetU, t: facetT, sagMm: facetWorst }; }
  }
  return { maxSagMm: maxSag, facetCount: facets, overTolCount: overTol, worst };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run research/spike-raycast-oracle/sagScorer.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add research/spike-raycast-oracle/sagScorer.ts research/spike-raycast-oracle/sagScorer.test.ts
git commit -m "spike(raycast-oracle): true chord-sag scorer over outer facets (T2)"
```

---

## Task 3: `conditionC` — validate + slice-emit the full solid

**Files:**
- Create: `research/spike-raycast-oracle/conditionC.ts`
- Test: `research/spike-raycast-oracle/conditionC.test.ts`

**Interfaces:**
- Consumes: `SolidCPU` (Task 1); `validateMeshForExport` (`../../src/geometry/exportValidation`); `detectSelfIntersections` (`../../src/geometry/selfIntersection`); `generateBinarySTL` (`../../src/geometry/stlExport`); `MeshData` (`../../src/geometry/types`); Node `fs`.
- Produces:
  ```ts
  export interface ConditionCReport {
    ok: boolean;
    boundaryEdges: number;
    nonManifoldEdges: number;
    orientationMismatches: number;
    selfIntersections: number;
    triangleCount: number;
    stlPath: string;
    errors: string[];
  }
  export function checkConditionC(
    solid: { pos3D: Float32Array; indices: Uint32Array },
    styleId: string, outDir: string,
  ): ConditionCReport
  ```

- [ ] **Step 1: Write the failing test**

Mirrors `realMeshExport.test.ts:76-93` — the smooth control must be watertight,
oriented, and emit a non-empty STL.

```ts
// research/spike-raycast-oracle/conditionC.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildSolidCPU } from './buildSolidCPU';
import { checkConditionC } from './conditionC';

describe('checkConditionC', () => {
  it('validates + emits an STL for the smooth control', () => {
    const outDir = join('research', 'spike-raycast-oracle', '__tmp_test__');
    const solid = buildSolidCPU('SuperformulaBlossom', { maxSagMm: 0.1, verdictRefine: false });
    const r = checkConditionC(solid, 'SuperformulaBlossom', outDir);
    expect(r.triangleCount).toBeGreaterThan(1000);
    expect(r.boundaryEdges).toBe(0);
    expect(r.orientationMismatches).toBe(0);
    expect(r.ok).toBe(true);
    expect(existsSync(r.stlPath)).toBe(true);
    expect(statSync(r.stlPath).size).toBeGreaterThan(84); // > STL header
    rmSync(outDir, { recursive: true, force: true });
  }, 60000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run research/spike-raycast-oracle/conditionC.test.ts`
Expected: FAIL — "Cannot find module './conditionC'".

- [ ] **Step 3: Write the implementation**

```ts
// research/spike-raycast-oracle/conditionC.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateMeshForExport } from '../../src/geometry/exportValidation';
import { detectSelfIntersections } from '../../src/geometry/selfIntersection';
import { generateBinarySTL } from '../../src/geometry/stlExport';
import type { MeshData } from '../../src/geometry/types';

export interface ConditionCReport {
  ok: boolean;
  boundaryEdges: number;
  nonManifoldEdges: number;
  orientationMismatches: number;
  selfIntersections: number;
  triangleCount: number;
  stlPath: string;
  errors: string[];
}

export function checkConditionC(
  solid: { pos3D: Float32Array; indices: Uint32Array },
  styleId: string, outDir: string,
): ConditionCReport {
  const mesh: MeshData = {
    vertices: solid.pos3D,
    indices: solid.indices,
    vertexCount: solid.pos3D.length / 3,
    triangleCount: solid.indices.length / 3,
  };
  const report = validateMeshForExport(mesh);
  const si = detectSelfIntersections(mesh);

  mkdirSync(outDir, { recursive: true });
  const stlPath = join(outDir, `${styleId}.stl`);
  const buf = generateBinarySTL(mesh, styleId); // ArrayBuffer; runs winding repair internally
  writeFileSync(stlPath, Buffer.from(buf));

  return {
    ok: report.ok && !si.intersects,
    boundaryEdges: report.boundaryEdges,
    nonManifoldEdges: report.nonManifoldEdges,
    orientationMismatches: report.orientationMismatches,
    selfIntersections: si.count,
    triangleCount: mesh.triangleCount,
    stlPath,
    errors: report.errors,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run research/spike-raycast-oracle/conditionC.test.ts`
Expected: PASS. (If the smooth control shows `boundaryEdges > 0`, that is the
real "SP3 watertight-assembly pending" finding from the spec — record it; do not
force the test green. Change the assertion to `expect(r.boundaryEdges).toBe(0)`
staying as the goal, and if it fails, capture the number in the scorecard and
mark the test `it.fails(...)` with a comment referencing SP3.)

- [ ] **Step 5: Commit**

```bash
git add research/spike-raycast-oracle/conditionC.ts research/spike-raycast-oracle/conditionC.test.ts
git commit -m "spike(raycast-oracle): condition-C validate + STL emit (T3)"
```

---

## Task 4: `scorecard` — row type, markdown writer, go/no-go

**Files:**
- Create: `research/spike-raycast-oracle/scorecard.ts`
- Test: `research/spike-raycast-oracle/scorecard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ScoreRow {
    style: string;
    featureKinds: Record<string, number>;
    // condition A (CPU-measured; certified in Phase 2)
    sagOffMm: number; overTolOff: number;   // verdictRefine OFF @ 0.01 target
    sagOnMm: number; overTolOn: number;      // verdictRefine ON  @ 0.01 target
    verdictRan: boolean;
    trisOff: number; trisOn: number;
    // condition B2 (feature-band A) + B1 (drift, Phase 2)
    worstOn: { u: number; t: number; sagMm: number } | null;
    // condition C
    conditionC: { ok: boolean; boundaryEdges: number; nonManifoldEdges: number;
                  orientationMismatches: number; selfIntersections: number; stlPath: string };
    driftMaxMm: number | null;  // Phase 2; null until GPU anchor runs
  }
  export function renderScorecard(rows: ScoreRow[], capNote: string): string
  ```

- [ ] **Step 1: Write the failing test**

```ts
// research/spike-raycast-oracle/scorecard.test.ts
import { describe, it, expect } from 'vitest';
import { renderScorecard, type ScoreRow } from './scorecard';

const row: ScoreRow = {
  style: 'GyroidManifold', featureKinds: { 'general-curve': 12 },
  sagOffMm: 0.041, overTolOff: 320, sagOnMm: 0.009, overTolOn: 0, verdictRan: true,
  trisOff: 210000, trisOn: 512000,
  worstOn: { u: 0.3, t: 0.5, sagMm: 0.009 },
  conditionC: { ok: true, boundaryEdges: 0, nonManifoldEdges: 0, orientationMismatches: 0, selfIntersections: 0, stlPath: 'x.stl' },
  driftMaxMm: null,
};

describe('renderScorecard', () => {
  it('emits a markdown table with the style row and a cap note', () => {
    const md = renderScorecard([row], 'cap = VERDICT_MAX_PASS(4) @ tol 0.01mm');
    expect(md).toContain('GyroidManifold');
    expect(md).toContain('| Style |');
    expect(md).toContain('cap = VERDICT_MAX_PASS(4)');
    expect(md).toContain('0.009');
    expect(md).toContain('drift'); // column present even when pending
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run research/spike-raycast-oracle/scorecard.test.ts`
Expected: FAIL — "Cannot find module './scorecard'".

- [ ] **Step 3: Write the implementation**

```ts
// research/spike-raycast-oracle/scorecard.ts
export interface ScoreRow {
  style: string;
  featureKinds: Record<string, number>;
  sagOffMm: number; overTolOff: number;
  sagOnMm: number; overTolOn: number;
  verdictRan: boolean;
  trisOff: number; trisOn: number;
  worstOn: { u: number; t: number; sagMm: number } | null;
  conditionC: { ok: boolean; boundaryEdges: number; nonManifoldEdges: number;
                orientationMismatches: number; selfIntersections: number; stlPath: string };
  driftMaxMm: number | null;
}

const f = (x: number, d = 4) => x.toFixed(d);
const drift = (x: number | null) => (x === null ? 'pending' : f(x));

function goNoGo(r: ScoreRow): string {
  const aMet = r.overTolOn === 0;
  const cMet = r.conditionC.ok;
  if (aMet && cMet) return 'A+C met (oracle-refine viable)';
  if (!aMet && r.verdictRan) return 'A UNMET after verdict cap → remesher/machinery signal';
  if (!aMet && !r.verdictRan) return 'A UNMET, verdict inert (feature kind not general-curve)';
  if (!cMet) return `C UNMET (bnd=${r.conditionC.boundaryEdges}) → SP3 watertight`;
  return 'see notes';
}

export function renderScorecard(rows: ScoreRow[], capNote: string): string {
  const head = [
    '# Raycast-Oracle Fidelity Scorecard (2026-07-12)',
    '',
    `**Cap (recorded/reasoned):** ${capNote}`,
    '',
    '**Bar:** A) max outer chord-sag ≤ 0.01mm everywhere; B2) feature-band facets satisfy A;',
    'C) watertight/manifold/oriented + self-intersection-free (validator) + manual slice.',
    'Triangle counts are reported, not gated. Drift (CPU-vs-certified-GPU) certifies A in Phase 2.',
    '',
    '| Style | feature kinds | sag OFF | >tol OFF | sag ON | >tol ON | verdictRan | tris OFF | tris ON | worst(u,t) | C ok | bnd | nonMan | orient | selfX | drift max | verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const body = rows.map((r) => {
    const w = r.worstOn ? `(${f(r.worstOn.u, 3)},${f(r.worstOn.t, 3)})` : '—';
    const kinds = Object.entries(r.featureKinds).map(([k, n]) => `${k}:${n}`).join(' ') || 'none';
    return `| ${r.style} | ${kinds} | ${f(r.sagOffMm)} | ${r.overTolOff} | ${f(r.sagOnMm)} | ${r.overTolOn} | ${r.verdictRan} | ${r.trisOff} | ${r.trisOn} | ${w} | ${r.conditionC.ok} | ${r.conditionC.boundaryEdges} | ${r.conditionC.nonManifoldEdges} | ${r.conditionC.orientationMismatches} | ${r.conditionC.selfIntersections} | ${drift(r.driftMaxMm)} | ${goNoGo(r)} |`;
  });
  return [...head, ...body, ''].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run research/spike-raycast-oracle/scorecard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add research/spike-raycast-oracle/scorecard.ts research/spike-raycast-oracle/scorecard.test.ts
git commit -m "spike(raycast-oracle): scorecard renderer + go/no-go (T4)"
```

---

## Task 5: Orchestrator — run 4 styles, write scorecard + STLs

**Files:**
- Create: `research/spike-raycast-oracle/scorecard.spike.test.ts`
- Writes (artifacts, not code): `research/lab/2026-07-12-raycast-oracle-fidelity.md`, `research/lab/spike-stl/<style>.stl`

**Interfaces:**
- Consumes: `buildSolidCPU`, `evalSurface` (T1); `scoreOuterSag` (T2); `checkConditionC` (T3); `renderScorecard`, `ScoreRow` (T4).

- [ ] **Step 1: Write the orchestrator (this task's "test" IS the run)**

Each style is built twice (verdict OFF/ON) at the 0.01 mm target; sag scored
against the exact `evalSurface` lift; condition C emitted; a row assembled. The
file asserts it produced 4 rows and a non-empty scorecard, then writes artifacts.

```ts
// research/spike-raycast-oracle/scorecard.spike.test.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StyleId } from '../../src/geometry/types';
import { buildSolidCPU, evalSurface } from './buildSolidCPU';
import { scoreOuterSag } from './sagScorer';
import { checkConditionC } from './conditionC';
import { renderScorecard, type ScoreRow } from './scorecard';

const STYLES: StyleId[] = ['SuperformulaBlossom', 'SpiralRidges', 'GothicArches', 'GyroidManifold'];
const TOL = 0.01;
const OUT_MD = join('research', 'lab', '2026-07-12-raycast-oracle-fidelity.md');
const STL_DIR = join('research', 'lab', 'spike-stl');
const CAP_NOTE =
  'cap = production VERDICT_MAX_PASS(4) @ VERDICT_TOL_MM(0.01mm). Reasoned: 4 dyadic ' +
  'passes = up to 16x local refine over the base feature cell; non-convergence past ' +
  'that indicates a topology limit (chord-across-feature), i.e. a remesher signal, not ' +
  'insufficient density. Not silently truncated — per-style convergence recorded below.';

describe('raycast-oracle fidelity scorecard', () => {
  it('scores 4 styles and writes the scorecard + STLs', () => {
    const rows: ScoreRow[] = [];
    for (const style of STYLES) {
      const off = buildSolidCPU(style, { maxSagMm: TOL, verdictRefine: false });
      const on = buildSolidCPU(style, { maxSagMm: TOL, verdictRefine: true });
      const lift = (u: number, t: number) => evalSurface(style, u, t, 0);
      const sagOff = scoreOuterSag(off, lift, TOL);
      const sagOn = scoreOuterSag(on, lift, TOL);
      const c = checkConditionC(on, style, STL_DIR);
      rows.push({
        style, featureKinds: on.featureKinds,
        sagOffMm: sagOff.maxSagMm, overTolOff: sagOff.overTolCount,
        sagOnMm: sagOn.maxSagMm, overTolOn: sagOn.overTolCount,
        verdictRan: on.verdictRan,
        trisOff: off.indices.length / 3, trisOn: on.indices.length / 3,
        worstOn: sagOn.worst,
        conditionC: { ok: c.ok, boundaryEdges: c.boundaryEdges, nonManifoldEdges: c.nonManifoldEdges,
          orientationMismatches: c.orientationMismatches, selfIntersections: c.selfIntersections, stlPath: c.stlPath },
        driftMaxMm: null,
      });
    }
    const md = renderScorecard(rows, CAP_NOTE);
    mkdirSync(join('research', 'lab'), { recursive: true });
    writeFileSync(OUT_MD, md);
    expect(rows.length).toBe(4);
    expect(md.length).toBeGreaterThan(200);
  }, 600000);
});
```

- [ ] **Step 2: Run the orchestrator**

Run: `npx vitest run research/spike-raycast-oracle/scorecard.spike.test.ts`
Expected: PASS; `research/lab/2026-07-12-raycast-oracle-fidelity.md` exists with 4
data rows; `research/lab/spike-stl/*.stl` written. (Long — up to 10 min; the 0.01 mm
builds are dense.)

- [ ] **Step 3: Read the scorecard and sanity-check the control**

Open `research/lab/2026-07-12-raycast-oracle-fidelity.md`. The control
(`SuperformulaBlossom`) MUST show `sag ON ≈ 0`, `>tol ON = 0`, `C ok = true`. If it
does not, the harness (not the mesher) is wrong — stop and diagnose before trusting
any frontier number.

- [ ] **Step 4: Commit**

```bash
git add research/spike-raycast-oracle/scorecard.spike.test.ts research/lab/2026-07-12-raycast-oracle-fidelity.md research/lab/spike-stl
git commit -m "spike(raycast-oracle): orchestrator + first CPU-spine scorecard (T5)"
```

- [ ] **Step 5: Manual slice check (condition C, human step)**

Load each `research/lab/spike-stl/<style>.stl` in your slicer. Record per-style
"slices cleanly? y/n" as a note appended to the scorecard. This is the real-slice
half of condition C the automated validator cannot fully stand in for.

---

# Phase 2 — GPU anchor (drift → certifies condition A, completes B1)

## Task 6: `gpuOracle.mjs` — dump the certified GPU field grid *(capstone; needs one runtime-wiring discovery)*

**Status/framing:** This is the **one** task whose exact in-page call must be
confirmed at runtime — there is no *confirmed* read-only page hook that returns
certified `(u,t)→position` values (the raycast controller reads pixels, not
positions). The CPU spine (T1–T5) already emits a full scorecard with
`drift = pending`, so this task *upgrades that column*; it does not block the
deliverable. Do not fabricate the eval call — run the discovery step first.

**Files:**
- Create: `research/spike-raycast-oracle/gpuOracle.mjs`
- Writes: `research/lab/spike-gpu/<style>.json` (`{ resU, resT, positions: number[] }`)

**Prerequisite:** `npm run dev` (localhost:3000). Playwright + Chromium
`--enable-unsafe-webgpu` (exactly as every `e2e/_raycast_*.mjs` runs).

**Confirmed in-page hooks** (from `e2e/_raycast_lut_dump.mjs` + `src` grep — real):
- `window.__POTFOUNDRY_STORE__.getState().setStyle(styleKey)` / `.getState().style`
- `window.__pfRaycast.controller` (`isReady(id)`, `readbackPixels` — pixels only)
- `window.__pfConformingProbe` → `globalThis.__pfConformingResult` (set at
  `ParametricExportComputer.ts:2403`); plus `__pfConformingMaxSag` / `__pfConformingMaxLevel`
  / `__pfConformingNRing` quality overrides on the export path.

- [ ] **Step 1 — Discovery (bounded; concrete deliverable).** Read
  `src/renderers/webgpu/ExportComputer.ts` (`compute(params): { mesh: MeshData }`)
  and `ParametricExportComputer.ts:2249-2403` (the `__pfConformingProbe` →
  `__pfConformingResult` capture). Grep `src/hooks/useGPUExport.ts` and the export
  button handler for a page-reachable export trigger. Decide the route:
  - **Route A (preferred): uniform GPU Grid export.** Confirm whether the app can be
    driven to run `ExportComputer.compute({ dimensions: DEFAULT_DIMENSIONS,
    quality: { nTheta: RES, nZ: RES }, styleId, styleOpts: {}, styleIndex })` from the
    page (directly if the renderer is on `window`, else via the export UI action).
    Its `result.mesh.vertices` are certified `style_radius` positions on a **uniform**
    grid — trivially matched to CPU `evalSurface(styleId, col/RES, row/(RES-1), 0)`.
  - **Route B (fallback): conforming probe capture.** Set `window.__pfConformingProbe`,
    trigger the conforming export, read `globalThis.__pfConformingResult`; confirm it
    carries **both** parametric `(u,t,surfaceId)` and 3D positions so drift can be
    computed per vertex (not a uniform grid — Task 7 then compares per-vertex).

  **Deliverable:** one sentence naming the confirmed call + its exact return shape.
  **Hard stop:** if *no* read-only page path returns certified positions and the only
  option is a new dev hook in `src/`, STOP and raise with the user — this spike forbids
  `src` edits; the CPU-spine scorecard stands with `drift = pending` until resolved.

- [ ] **Step 2 — Implement `gpuOracle.mjs` with the route confirmed in Step 1.**
  Skeleton below; fill the single `page.evaluate` body with the Step-1 call. The
  store/style-switch/readiness hooks are the confirmed ones from `_raycast_lut_dump.mjs`.

```js
// research/spike-raycast-oracle/gpuOracle.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STYLES = [
  ['SuperformulaBlossom', 0], ['SpiralRidges', 2], ['GothicArches', 5], ['GyroidManifold', 12],
];
const RES = 512;
const OUT = join('research', 'lab', 'spike-gpu');

const browser = await chromium.launch({
  headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
});
const page = await browser.newPage();
await page.goto('http://localhost:3000/');
await page.waitForFunction(() => Boolean(window.__POTFOUNDRY_STORE__), null, { timeout: 30000 });

mkdirSync(OUT, { recursive: true });
for (const [style, id] of STYLES) {
  await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), style);
  // <<< Step-1 confirmed call goes here: returns a flat [x,y,z,...] outer grid
  //     (Route A: ExportComputer.compute uniform grid; Route B: __pfConformingResult) >>>
  const positions = await page.evaluate(async ({ style, id, RES }) => {
    throw new Error(`gpuOracle: wire the Step-1 call for ${style}/${id}@${RES} before running`);
  }, { style, id, RES });
  writeFileSync(join(OUT, `${style}.json`), JSON.stringify({ resU: RES, resT: RES, positions }));
  console.log(`${style}: ${positions.length / 3} GPU points`);
}
await browser.close();
```

- [ ] **Step 3 — Run the dump (dev server up).**

```bash
npm run dev   # terminal 1
node research/spike-raycast-oracle/gpuOracle.mjs   # terminal 2
```
Expected: `research/lab/spike-gpu/<style>.json` for all 4 styles.

- [ ] **Step 4 — Commit.**

```bash
git add research/spike-raycast-oracle/gpuOracle.mjs research/lab/spike-gpu
git commit -m "spike(raycast-oracle): certified GPU field grid dump (T6)"
```

---

## Task 7: `drift` — CPU-vs-GPU radial drift, certify condition A

**Files:**
- Create: `research/spike-raycast-oracle/drift.ts`
- Test: `research/spike-raycast-oracle/drift.test.ts`

**Interfaces:**
- Consumes: `evalSurface` (T1); the `research/lab/spike-gpu/<style>.json` dumps (T6).
- Produces:
  ```ts
  export interface DriftReport { maxMm: number; meanMm: number; atWorst: { u: number; t: number } }
  export function computeDrift(
    styleId: string,
    gpu: { resU: number; resT: number; positions: number[] | Float32Array },
  ): DriftReport
  ```

- [ ] **Step 1: Write the failing test**

Drift of `evalSurface` against a GPU grid that IS `evalSurface` must be ~0 (proves
the comparator; the real GPU grid replaces the synthetic one at runtime).

```ts
// research/spike-raycast-oracle/drift.test.ts
import { describe, it, expect } from 'vitest';
import { evalSurface } from './buildSolidCPU';
import { computeDrift } from './drift';

describe('computeDrift', () => {
  it('is ~0 when the reference grid equals the CPU field', () => {
    const res = 64; const positions: number[] = [];
    for (let row = 0; row < res; row++) for (let col = 0; col < res; col++) {
      const p = evalSurface('SuperformulaBlossom', col / res, row / (res - 1), 0);
      positions.push(p[0], p[1], p[2]);
    }
    const d = computeDrift('SuperformulaBlossom', { resU: res, resT: res, positions });
    expect(d.maxMm).toBeLessThan(1e-6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run research/spike-raycast-oracle/drift.test.ts`
Expected: FAIL — "Cannot find module './drift'".

- [ ] **Step 3: Write the implementation**

Radial drift compares the GPU grid node against the CPU field at the same `(u,t)`.
Compare radius magnitude in the xy-plane (twist identity at default dims, so radius
is the invariant that matters for the field).

```ts
// research/spike-raycast-oracle/drift.ts
import { evalSurface } from './buildSolidCPU';
import type { StyleId } from '../../src/geometry/types';

export interface DriftReport { maxMm: number; meanMm: number; atWorst: { u: number; t: number } }

export function computeDrift(
  styleId: string,
  gpu: { resU: number; resT: number; positions: number[] | Float32Array },
): DriftReport {
  const { resU, resT, positions } = gpu;
  let max = 0, sum = 0, n = 0, wu = 0, wt = 0;
  for (let row = 0; row < resT; row++) {
    const t = row / (resT - 1);
    for (let col = 0; col < resU; col++) {
      const u = col / resU;
      const base = (row * resU + col) * 3;
      const gx = positions[base], gy = positions[base + 1];
      const gRad = Math.hypot(gx, gy);
      const cp = evalSurface(styleId as StyleId, u, t, 0);
      const cRad = Math.hypot(cp[0], cp[1]);
      const d = Math.abs(gRad - cRad);
      sum += d; n++;
      if (d > max) { max = d; wu = u; wt = t; }
    }
  }
  return { maxMm: max, meanMm: n ? sum / n : 0, atWorst: { u: wu, t: wt } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run research/spike-raycast-oracle/drift.test.ts`
Expected: PASS.

- [ ] **Step 5: Fold drift into the scorecard**

Extend the orchestrator (Task 5) to read `research/lab/spike-gpu/<style>.json` when
present and set `driftMaxMm = computeDrift(style, gpu).maxMm`; then re-derive
condition A certification: **A is certified** iff `sagOnMm + driftMaxMm ≤ 0.01`. If
`driftMaxMm` alone is a large fraction of 0.01 (say > 0.002), flag "certified oracle
required — CPU port drifts at features" in the go/no-go column. Re-run the
orchestrator to regenerate the scorecard with the drift column populated.

Run: `npx vitest run research/spike-raycast-oracle/scorecard.spike.test.ts`
Expected: scorecard regenerated; `drift max` column now numeric.

- [ ] **Step 6: Commit**

```bash
git add research/spike-raycast-oracle/drift.ts research/spike-raycast-oracle/drift.test.ts research/spike-raycast-oracle/scorecard.spike.test.ts research/lab/2026-07-12-raycast-oracle-fidelity.md
git commit -m "spike(raycast-oracle): CPU-vs-GPU drift + condition-A certification (T7)"
```

---

## Final: write the go/no-go readout

- [ ] Append a short **Findings & go/no-go** section to
  `research/lab/2026-07-12-raycast-oracle-fidelity.md` interpreting the table per the
  spec §9 mapping (all-A+C → oracle-refine; A-unmet-at-cap → remesher/machinery;
  drift-structural → oracle necessary; C-unmet → SP3). Commit.

```bash
git add research/lab/2026-07-12-raycast-oracle-fidelity.md
git commit -m "spike(raycast-oracle): findings + go/no-go readout"
```
