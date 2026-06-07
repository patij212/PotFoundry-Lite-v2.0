# Conforming Mesher Foundation — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A watertight-by-construction, metric-correct, periodic-seam-closed outer-wall mesher for **feature-free** surfaces — the structural foundation the feature system (Plan 2) and watertight assembly (Plan 3) build on.

**Architecture:** CPU mesher in metric-warped (u,t) param space. Modules depend on an injected `SurfaceSampler` (synthetic surface in unit tests; GPU-backed in production) so correctness is unit-testable without WebGPU. A periodic balanced quadtree refined by a curvature→edge-length sizing field, triangulated with transition templates → no T-junctions, seam closed by shared θ=0/θ=2π indices. Validated in isolation by a new `diagnoseConformingOuterWall` harness hook (the outer wall is a cylinder: boundary edges only at the t=0/t=1 rings).

**Tech Stack:** TypeScript, Vitest (jsdom), Playwright e2e (`window.__pfFidelity`), `delaunator`/`robust-predicates` (later plans), existing GPU `evaluate_vertices` kernel.

**Spec:** `docs/superpowers/specs/2026-06-07-cad-grade-parametric-export-design.md` (build steps 1–3).

**Branch point (from integration map):** `ParametricExportComputer.ts:2881` (`if (surf.id === 0)`); flag resolved at `:1723`. The conforming path returns an `OuterWallResult`-compatible object (empty arrays for `interpolatedChainVertices`/`phantomChainAnchors` since positions are exact) and, when active, the orchestrator skips stages 7 + optimization passes + tail battery (Task 8).

---

## File Structure

All new code under `src/renderers/webgpu/parametric/conforming/`:

| File | Responsibility |
|---|---|
| `SurfaceSampler.ts` | `SurfaceSampler` interface + `SyntheticCylinderSampler` (analytic, for tests) + `GpuSurfaceSampler` (wraps `evaluatePoints`, pre-evaluated dense grid + bilinear interp) |
| `SurfaceMetricTensor.ts` | E,F,G first fundamental form + principal curvature κ at (u,t) via central differences on a sampler |
| `MetricSizingField.ts` | `h_iso(u,t)` target edge length from curvature (sagitta law) + Lipschitz (≤3×) grading clamp |
| `PeriodicBalancedQuadtree.ts` | Quadtree over [0,1)×[0,1], periodic in u, refined to the sizing field, 2:1 balanced |
| `QuadtreeTriangulator.ts` | Transition-template triangulation of a balanced quadtree → conforming, T-junction-free (u,t) mesh; seam shared |
| `ConformingOuterWall.ts` | Orchestrates sampler→metric→sizing→quadtree→triangulator into an `OuterWallResult`-compatible result |
| `conforming/index.ts` | Barrel re-exports |

Modified:
- `parametric/contracts.ts` — add `conformingMesher` flag (default false)
- `ParametricExportComputer.ts` — branch at `:2881`; skip optimization+battery when conforming (Task 8)
- `fidelity/windowHook.ts` — add `diagnoseConformingOuterWall` hook (Task 7)

---

## Task 0: Scaffold + flag

**Files:**
- Modify: `src/renderers/webgpu/parametric/contracts.ts` (near `byConstructionAssembly`, ~:384)
- Create: `src/renderers/webgpu/parametric/conforming/index.ts`

- [ ] **Step 1: Add the flag.** In `contracts.ts`, add to `PipelineFeatureFlags`: `conformingMesher?: boolean;` and to `DEFAULT_FEATURE_FLAGS`: `conformingMesher: false,`. In `resolveFeatureFlags`, OR with `(globalThis as { __pfConforming?: boolean }).__pfConforming`.
- [ ] **Step 2:** Create `conforming/index.ts` with a header comment and no exports yet.
- [ ] **Step 3: Verify** `npm run typecheck` passes.
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(conforming): scaffold conformingMesher flag + module dir"`

---

## Task 1: SurfaceSampler interface + synthetic sampler

**Files:**
- Create: `src/renderers/webgpu/parametric/conforming/SurfaceSampler.ts`
- Test: `src/renderers/webgpu/parametric/conforming/SurfaceSampler.test.ts`

Interface (exact):
```typescript
/** Maps outer-wall parameter (u,t) in [0,1)x[0,1] to a 3D position (mm). */
export interface SurfaceSampler {
  /** Evaluate one point. u wraps periodically; t clamps to [0,1]. */
  position(u: number, t: number): readonly [number, number, number];
}

/** Analytic test surface: a rippled cylinder. r(u) = R0 + amp*cos(2*pi*k*u). */
export class SyntheticCylinderSampler implements SurfaceSampler {
  constructor(
    private R0: number, private H: number,
    private amp = 0, private k = 0,
  ) {}
  position(u: number, t: number): readonly [number, number, number] {
    const theta = 2 * Math.PI * u;
    const r = this.R0 + this.amp * Math.cos(2 * Math.PI * this.k * u);
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}
```

- [ ] **Step 1: Write failing test.**
```typescript
import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
describe('SyntheticCylinderSampler', () => {
  it('maps (u,t) onto a cylinder of radius R0 when amp=0', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const [x, y, z] = s.position(0, 0.5);
    expect(Math.hypot(x, y)).toBeCloseTo(50, 6);
    expect(z).toBeCloseTo(60, 6);
  });
  it('wraps u periodically (u=0 and u=1 coincide)', () => {
    const s = new SyntheticCylinderSampler(50, 120, 5, 7);
    const a = s.position(0, 0.3); const b = s.position(1, 0.3);
    expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6);
  });
});
```
- [ ] **Step 2: Run** `npx vitest run src/renderers/webgpu/parametric/conforming/SurfaceSampler.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `SurfaceSampler.ts` as above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(conforming): SurfaceSampler interface + synthetic cylinder`.

---

## Task 2: SurfaceMetricTensor (E,F,G + principal curvature)

**Files:**
- Create: `src/renderers/webgpu/parametric/conforming/SurfaceMetricTensor.ts`
- Test: `…/SurfaceMetricTensor.test.ts`

Interface:
```typescript
export interface MetricTensor { E: number; F: number; G: number; }
/** First fundamental form at (u,t) by central differences (step h in param). */
export function firstFundamentalForm(s: SurfaceSampler, u: number, t: number, h?: number): MetricTensor;
/** Max abs principal curvature at (u,t) by second differences (mm^-1). */
export function principalCurvatureMax(s: SurfaceSampler, u: number, t: number, h?: number): number;
```

Algorithm: `Pu = (P(u+h,t)-P(u-h,t))/(2h)`, `Pt = (P(u,t+h)-P(u,t-h))/(2h)`. `E=Pu·Pu, F=Pu·Pt, G=Pt·Pt`. Curvature: second differences `Puu,Ptt,Put`, normal `n=Pu×Pt/|Pu×Pt|`; `L=Puu·n, M=Put·n, N=Ptt·n`; principal curvatures = eigenvalues of shape operator `[[L,M],[M,N]]·inv([[E,F],[F,G]])`; return max abs.

- [ ] **Step 1: Failing test** — for `SyntheticCylinderSampler(R0=50,H=120,amp=0)` (plain cylinder): `∂P/∂u` magnitude = 2πR0, so assert `firstFundamentalForm(s,0.3,0.5).E` ≈ `(2π·50)²` within 1%; `G` ≈ `120²`; `F` ≈ 0 (abs < 1e-3). Assert `principalCurvatureMax` ≈ `1/50` within 5%.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(conforming): first fundamental form + principal curvature`.

---

## Task 3: MetricSizingField (sagitta + Lipschitz grading)

**Files:**
- Create: `…/MetricSizingField.ts`; Test: `…/MetricSizingField.test.ts`

Interface:
```typescript
export interface SizingOptions { maxSagMm: number; minEdgeMm: number; maxEdgeMm: number; gradeRatio: number; resU: number; resT: number; }
/** Precompute h_iso on a resU×resT grid (physical mm), Lipschitz-graded, then sample by (u,t). */
export class MetricSizingField {
  constructor(s: SurfaceSampler, opts: SizingOptions);
  /** Target physical edge length (mm) at (u,t). */
  edgeLength(u: number, t: number): number;
}
```

Algorithm: at each grid node compute `κ=principalCurvatureMax`; raw `h=sqrt(8*maxSag/max(κ,1e-6))`, clamp `[minEdge,maxEdge]`. Then iterate a grading pass: `h[i]=min(h[i], gradeRatio*min(neighbor h))` to a fixpoint (Lipschitz). `edgeLength` = bilinear interp (u periodic, t clamped).

- [ ] **Step 1: Failing test** — flat cylinder κ=1/R0: `h≈sqrt(8*0.1*R0)`. With R0=50, maxSag=0.1 → `h≈sqrt(40)=6.32mm`; assert `edgeLength` ≈ 6.32 within 5% (or = maxEdge if clamped lower — set maxEdge=20 so not clamped). Grading test: construct a field whose raw `h` has one low-curvature-spike node; assert every adjacent-node ratio ≤ gradeRatio after construction.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement. Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(conforming): metric sizing field with sagitta + Lipschitz grading`.

---

## Task 4: PeriodicBalancedQuadtree

**Files:**
- Create: `…/PeriodicBalancedQuadtree.ts`; Test: `…/PeriodicBalancedQuadtree.test.ts`

A quadtree over the unit square, **periodic in u**: a cell at the u=1 edge is a neighbor of the u=0 edge cell at the same t-span. Each leaf stores `(u0,t0,level)` (size = 1/2^level in u and t). Refine a leaf (split 1→4) while its physical size (`sqrt(E)*du` wide, `sqrt(G)*dt` tall, evaluated at the cell center) exceeds the sizing field target there. Then enforce 2:1 balance: no leaf edge-adjacent (incl. across the u-seam) to a leaf more than one level finer; split the coarser leaf until balanced.

Interface:
```typescript
export interface QuadLeaf { u0: number; t0: number; level: number; }
export class PeriodicBalancedQuadtree {
  constructor(field: MetricSizingField, metric: SurfaceSampler, opts: { maxLevel: number });
  leaves(): QuadLeaf[];
  /** Neighbor leaves across each of the 4 sides (u-sides wrap). */
  neighbors(leaf: QuadLeaf): { side: 'uMinus'|'uPlus'|'tMinus'|'tPlus'; leaf: QuadLeaf }[];
}
```

- [ ] **Step 1: Failing test** — (a) uniform field (flat cylinder, constant h, choose H/R0 so a uniform level L results) → all leaves same level; count = (2^level)². (b) 2:1 balance invariant: for every edge-adjacent leaf pair (including u-wrap), `|levelA-levelB| ≤ 1`. (c) periodic neighbor: a leaf at `u0=1-size` has a `uPlus` neighbor at `u0=0`.
- [ ] **Step 2–4: Run/implement/run.**
- [ ] **Step 5: Commit** `feat(conforming): periodic 2:1-balanced quadtree`.

---

## Task 5: QuadtreeTriangulator (transition templates, T-junction-free)

**Files:**
- Create: `…/QuadtreeTriangulator.ts`; Test: `…/QuadtreeTriangulator.test.ts`

Emit a conforming triangle mesh from the balanced quadtree. Shared corner/edge vertices are deduped by a `Map<string,number>` keyed on quantized (u,t). For each leaf, inspect each side: if the neighbor is one level finer, that side has a **mid-edge vertex** that must be included → triangulate the leaf with the transition template for its set of split sides (a 2:1-balanced quad has 0–4 split sides; with rotation these reduce to a few templates: 0 split = 2 tris; 1 split = 3 tris fanned from the opposite corner through the mid-edge; etc.). Seam: u=0 and u=1 vertices share a map key (u quantized mod 1) → shared index.

Output: `{ vertices: Float32Array /*(u,t,0) xN*/, indices: Uint32Array /*CCW*/ }`.

- [ ] **Step 1: Failing test** (topology invariants on the (u,t) mesh):
  - Build an undirected edge-use map keyed by deduped vertex indices. Assert every interior edge used by exactly 2 triangles.
  - **No T-junctions:** assert every mid-edge vertex introduced by a finer neighbor is referenced by the coarse leaf's triangles (template guarantee) — i.e. no vertex lies on the interior of an edge it is not an endpoint of.
  - **Seam closed:** boundary edges (used once) occur only where `t≈0` or `t≈1`; none at `u≈0`/`u≈1`.
  - **Orientation:** every triangle has signed area > 0 in (u,t).
  - Fixtures: (a) uniform level-2 tree → 2 tris/quad, 32 tris; (b) a hand-forced tree with one quadrant one level finer → exercises a transition template; assert invariants hold.
- [ ] **Step 2–4: Run/implement/run.**
- [ ] **Step 5: Commit** `feat(conforming): T-junction-free transition-template triangulation`.

---

## Task 6: ConformingOuterWall orchestrator

**Files:**
- Create: `…/ConformingOuterWall.ts`; Test: `…/ConformingOuterWall.test.ts`

```typescript
export interface ConformingOuterWallOptions { maxSagMm: number; maxEdgeMm: number; minEdgeMm: number; gradeRatio: number; maxLevel: number; resU: number; resT: number; }
export interface ConformingOuterWallResult { vertices: Float32Array; indices: Uint32Array; gridVertexCount: number; bottomRing: number[]; topRing: number[]; }
export function buildConformingOuterWall(sampler: SurfaceSampler, opts: ConformingOuterWallOptions): ConformingOuterWallResult;
```

Composes Tasks 2–5. `bottomRing`/`topRing` = ordered boundary vertex loops at t=0/t=1 (for Plan 3 assembly). Seam already shared-index.

- [ ] **Step 1: Failing test** — on `SyntheticCylinderSampler(50,120,amp=3,k=8)` (rippled cylinder, real curvature). Helper: 3D-evaluate every (u,t) vertex via the sampler, then:
  - Watertight cylinder: boundary edges (used once) occur **only** at t=0 or t=1 rings; seam closed.
  - No non-manifold edges (no edge used >2×).
  - 3D quality: **max aspect < 100**, **min angle > 1°**.
  - Sag: sample each triangle's centroid in (u,t), compare sampler position vs the triangle's plane → **< 0.12 mm**.
- [ ] **Step 2–4: Run/implement/run.**
- [ ] **Step 5: Commit** `feat(conforming): ConformingOuterWall orchestrator (feature-free)`.

---

## Task 7: GPU-backed sampler + isolated harness hook

**Files:**
- Modify: `…/SurfaceSampler.ts` (add `GpuSurfaceSampler`)
- Modify: `src/fidelity/windowHook.ts` (add `diagnoseConformingOuterWall`)
- Modify: `src/fidelity/FidelityHookMount.tsx` (wire a sampler factory using `evaluatePoints`)

`GpuSurfaceSampler`: pre-evaluate a dense `resU×resT` grid of (u,t,0) via one GPU `evaluatePoints` batch, store positions; `position` = bilinear interp (u periodic). Real-style positions, no per-call GPU round-trip.

`diagnoseConformingOuterWall(opts)`: build a `GpuSurfaceSampler` for the current style, run `buildConformingOuterWall`, GPU-eval the (u,t) vertices to 3D, return `{ ringExcludedBoundaryEdges, nonManifoldEdges, orientationMismatches, sliverCount, maxAspect3D, maxSagMm, triangleCount }` — measuring the conforming outer wall **in isolation**, before assembly/battery.

- [ ] **Step 1: Failing test** (unit, `GpuSurfaceSampler` with a mock batch fn): bilinear interp returns grid node values at nodes, interpolates between.
- [ ] **Step 2–4: Run/implement/run** the unit test.
- [ ] **Step 5: e2e GATE (manual, via harness).** Add `e2e/_conforming_probe.cjs` (model on `_check.cjs`) calling `diagnoseConformingOuterWall`. Run dev server + `PF_STYLES=SuperformulaBlossom node e2e/_conforming_probe.cjs`. **Gate:** smooth style → `ringExcludedBoundaryEdges=0 ∧ nonManifoldEdges=0 ∧ orientationMismatches=0 ∧ sliverCount=0`. Commit `feat(conforming): GPU sampler + isolated outer-wall diagnostic`.

---

## Task 8: Pipeline branch (feature-free conforming outer wall, optimization+battery skipped)

**Files:**
- Modify: `ParametricExportComputer.ts` (branch at `:2881`; skip passes when `conformingMesher`)

- [ ] **Step 1:** At `:2881`, when `flags.conformingMesher`, build the conforming outer wall (via a `GpuSurfaceSampler` over `this.evaluatePoints`) and adapt its result to the consumed `OuterWallResult` fields (`vertices, indices, gridVertexCount`; empty `chainEdges/quadMap/origToFinal/chainVertexChainIds/chainAdjacentVertices/protectedStripVertices/fanDiagonalEdges/interpolatedChainVertices/phantomChainAnchors`).
- [ ] **Step 2:** Guard the optimization passes (chainDirectedFlip, flipEdges3D, optimizeChainStrips, optimizeBoundaryDiagonals, subdivideLongEdges) and the **entire tail repair battery** with `if (!flags.conformingMesher)`. Under conforming run only: GPU eval (stage 8), the existing inter-surface assembly **temporarily** (until Plan 3 shares rings), `validateMesh`.
- [ ] **Step 3:** `npm run typecheck && npm run lint`.
- [ ] **Step 4: e2e GATE.** Set `window.__pfConforming` and run `e2e/_check.cjs` on SuperformulaBlossom. Expect outer wall clean; whole-mesh may still show inter-surface boundary (Plan 3 fixes). Record numbers as the foundation baseline.
- [ ] **Step 5: Commit** `feat(conforming): wire conforming outer wall into pipeline behind flag`.

---

## Self-review notes
- **Spec coverage:** Tasks 2–3 = pillar P1 (metric sizing); Tasks 4–5 = P2 (balanced quadtree, T-junction-free) + P3 (seam); Tasks 6–8 = ConformingOuterWall + integration. Features (P5), local CDT (P4), and assembly are **Plan 2/3** by design.
- **No GPU in unit tests:** all correctness via `SyntheticCylinderSampler`; GPU only at Task 7/8 e2e gates.
- **Canary discipline:** Task 8 must not regress SuperformulaBlossom’s outer wall; if it does, fix construction, never add repair.
- **Method naming:** sampler method is `position(u,t)` (not `eval`) to avoid the eval security-lint false positive.

## Next plans
- **Plan 2 — Feature system:** `FeatureLineGraph`, `AnalyticFeatureExtractor` (Tier 1), `FeatureCellCDT` (local CDT + Steiner + Chew), ground-truth feature counts; analytic-style rollout (build steps 4–6).
- **Plan 3 — Tier-2 + watertight assembly + cutover:** `SampledFeatureExtractor` (Voronoi/Gyroid), `WatertightAssembly` (shared rings), flip default, retire battery + dead cdt2d (build steps 7–8).
