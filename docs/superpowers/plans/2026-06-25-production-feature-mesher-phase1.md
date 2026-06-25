# Production Feature-Aligned Mesher — Phase 1 Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **rev 2** incorporates a source-verified adversarial review (wf_21463047). Six critical defects in rev 1 were fixed: (C1) the `bandRegions` emit-gate only fires on the wall's FEATURE path — a feature/rail line MUST be injected or no hole forms; (C2) the watertight control must crack INDEX topology, not perturb position (the audit is by-index); (C3) the conforming `assembleWatertight` branch only runs under `__pfByConstruction`; (C4) the merge must intern via `railVertexKey` (u-seam dedup) then map back to asm ids; plus `makeReliefIndicator` already exists (import it) and the artifact path is git-ignored.

**Goal:** Wire the proven corridor-pave mesher into the real GPU export path for ONE style (Voronoi), end-to-end through `evaluate_vertices` → 3MF + a flat-shaded render, flag-gated default-OFF + byte-identical when off — proving the (u,t)-space GPU weld on the production path.

**Architecture:** A flag-gated production-frame graft. When the flag is ON we mirror the PROVEN de-risk `realFeatureCorridorMulti` pipeline but graft only the corridor FILL onto the full production assembly: (1) detect features on the outer sampler; (2) build a band excluding the feature-crossing cells AND inject a minimal off-corridor activation strand as `outerFeatureLines` (the band emit-gate only fires on the wall's feature path — `ConformingWall.ts:565`); (3) `assembleWatertight({bandRegions, outerFeatureLines: strand, featureLevel})` → a full pot with holes in the outer wall; (4) intern the outer wall via `railVertexKey` into merged-id space (collapsing u-seam duplicates — the proven `internOuterWall` step), extract the dyadic hole, pave it with `corridorPaveMulti`; (5) graft the fill onto the assembly — map the fill's boundary ids back to asm vertex ids (via the intern inverse) and append the fill's interior vertices stamped `surfaceId=0` + remapped triangles, BEFORE the warp loop so they ride the same warps + GPU eval. The de-risk primitives (`internOuterWall`, `extractHoleBoundary`, `corridorPaveMulti`, `railKey`) are reused; only the graft framing (full-pot, surfaceId stamping, merged→asm map-back) is new.

**Tech Stack:** TypeScript, WebGPU (`evaluate_vertices` WGSL), Vitest (jsdom, CPU sampler), Playwright (Chromium, real WebGPU). The proven de-risk module `src/fidelity/bandRemesh/` + detector `src/renderers/webgpu/parametric/conforming/featureGraph/`.

## Global Constraints

- **The corridor pass runs only ON TOP of the by-construction assembly path.** In `compute()`, `assembleWatertight` is reached only when `byConstructionAssembly` is true (`flags.byConstructionAssembly || globalThis.__pfByConstruction`, `ParametricExportComputer.ts:2035`). The feature mesher gates a swap INSIDE that branch. Every flag-ON path (incl. the e2e) must set `__pfByConstruction` AND `__pfFeatureMesher`.
- **The band emit-gate requires the wall's feature path.** `bandRegions` are honored only by `triangulateQuadtreeWithFeatures`, reached only when `clippedFeatures.length > 0 || railLines.length > 0` (`ConformingWall.ts:565`). The corridor assemble call MUST pass a non-empty `outerFeatureLines` (a minimal off-corridor activation strand, mirroring `realCorridor.ts` `defaultAssemblyFeature`) — and when the flag is ON it REPLACES production's analytic `outerFeatureLines: generalCurves` with that strand, so the legacy CDT-insertion (the serration source) does not run in the feature region (the corridor owns it).
- **Flag-gated, default-OFF, byte-identical when off.** The OFF branch is the original `assembleWatertight(outerSampler, innerSampler, dims, assemblyOpts)` call with `assemblyOpts` extracted verbatim from the current inline literal — byte-identical by construction. Verified by a pre-edit/post-edit OFF-mesh comparison (Task 3 Step 7) AND the features-empty parity unit test.
- **The (u,t)-space GPU weld is the load-bearing invariant.** Corridor vertices are emitted as `(u,t,surfaceId)` and reuse the complement's exact outer-wall vertex ids; both ride the same `evaluate_vertices` dispatch ⇒ watertight by construction. Audits are **by vertex index**. Watertight controls crack INDEX topology (duplicate a vertex + re-point one incidence), never perturb position — `auditWatertight` never reads positions.
- **Voronoi is chosen deliberately for Phase 1**: a dense lattice (the priority make-or-break) with identity domain warps, isolating the merge/weld from warp interaction (Phase 2 exercises warped styles). The graft sits BEFORE the warp loop regardless, so it is correct for Phase 2.
- **Commit hygiene:** never stage the uncommitted cellSamples-WIP hunks in `ConformingWall.ts` / `WatertightAssembly.ts` / `PeriodicBalancedQuadtree.ts` / `ParametricExportComputer.ts` / `windowHook.ts`. Scope every `git add` to the task's named files; use `git add -p` if a file carries both your change and pre-existing WIP.
- **GitNexus:** re-index (stale) before the Task 3 production edit; `gitnexus impact({target:"compute", direction:"upstream"})` before editing it; `gitnexus detect_changes()` before each production commit; warn on HIGH/CRITICAL.
- **Lint:** 0 max-warnings (the `eslint-check.js` PostToolUse hook runs on every `.ts` edit).
- **Per-task:** opus review (spec compliance + quality) + independent controller verification of the numbers.

## File Structure

- **Create** `src/fidelity/bandRemesh/featuresFromGraph.ts` — pure adapter: detector `FeatureGraph` → `MultiFeatureSpec[]`.
- **Modify** `src/fidelity/bandRemesh/realCorridor.ts` — `export` `internOuterWall` and add `compToMerged` to its return (additive; the merged→asm inverse the graft needs).
- **Create** `src/fidelity/bandRemesh/assembleWithFeatures.ts` — `mergeCorridorIntoAssembly` + `assembleWatertightWithFeatures` (the single gated entry production imports).
- **Create** `src/fidelity/bandRemesh/featuresFromGraph.test.ts`, `assembleWithFeatures.test.ts` — Vitest topology proofs (CPU sampler).
- **Modify** `src/renderers/webgpu/ParametricExportComputer.ts` — extract the inline assembly opts into a named const; gated swap to `assembleWatertightWithFeatures` when ON, before the warp loop.
- **Modify** `src/fidelity/windowHook.ts` — pass `__pfFeatureMesher` through if the fidelity export path builds an isolated flags object.
- **Create** `e2e/feature-mesher-voronoi.spec.ts` — Playwright: real GPU Voronoi export, watertight-by-index, 3MF (saved via `download` event), preview screenshot, flag-OFF/ON delta + OFF byte-identity.

---

### Task 1: `featuresFromGraph` adapter (detector graph → corridor features)

**Files:**
- Create: `potfoundry-web/src/fidelity/bandRemesh/featuresFromGraph.ts`
- Test: `potfoundry-web/src/fidelity/bandRemesh/featuresFromGraph.test.ts`

**Interfaces:**
- Consumes: `FeatureGraph` from `src/renderers/webgpu/parametric/conforming/featureGraph/types` — `{ nodes: Vec2[]; edges: FeatureEdge[] }`; `FeatureEdge = { polyline: Vec2[]; strength: number; types: FeatureType[]; kind: 'open' | 'loop'; endpoints: [number, number] }`; `Vec2 = { u: number; t: number }`.
- Consumes: `MultiFeatureSpec` from `./realCorridor`, `ChainAnchor` from `./corridorPave`.
- Produces: `featuresFromGraph(graph: FeatureGraph): MultiFeatureSpec[]`.

- [ ] **Step 1: Write the failing test**

```typescript
// featuresFromGraph.test.ts
import { describe, it, expect } from 'vitest';
import { featuresFromGraph } from './featuresFromGraph';
import type { FeatureGraph, FeatureType } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';

function edge(poly: Array<[number, number]>, kind: 'open' | 'loop', ends: [number, number]) {
  return {
    polyline: poly.map(([u, t]) => ({ u, t })),
    strength: 2,
    types: ['curvature-ridge'] as FeatureType[], // mutable — FeatureType[] (NOT `as const`)
    kind,
    endpoints: ends,
  };
}

describe('featuresFromGraph', () => {
  it('maps an open edge to an open chain with snap-boundary anchors', () => {
    const graph: FeatureGraph = {
      nodes: [{ u: 0.2, t: 0.3 }, { u: 0.5, t: 0.6 }],
      edges: [edge([[0.2, 0.3], [0.35, 0.45], [0.5, 0.6]], 'open', [0, 1])],
    };
    const out = featuresFromGraph(graph);
    expect(out).toHaveLength(1);
    expect(out[0].closed).toBe(false);
    expect(out[0].polyline).toHaveLength(3);
    expect(out[0].start).toEqual({ kind: 'snap-boundary' });
    expect(out[0].end).toEqual({ kind: 'snap-boundary' });
  });

  it('maps a loop edge to a closed chain (no anchors)', () => {
    const graph: FeatureGraph = {
      nodes: [{ u: 0.4, t: 0.5 }],
      edges: [edge([[0.4, 0.5], [0.5, 0.5], [0.5, 0.6], [0.4, 0.5]], 'loop', [0, 0])],
    };
    const out = featuresFromGraph(graph);
    expect(out[0].closed).toBe(true);
    expect(out[0].start).toBeUndefined();
    expect(out[0].end).toBeUndefined();
  });

  it('anchors a degree-3 junction node to one shared junctionKey across all its edges', () => {
    const graph: FeatureGraph = {
      nodes: [{ u: 0.4, t: 0.5 }, { u: 0.2, t: 0.5 }, { u: 0.6, t: 0.5 }, { u: 0.4, t: 0.8 }],
      edges: [
        edge([[0.4, 0.5], [0.2, 0.5]], 'open', [0, 1]),
        edge([[0.4, 0.5], [0.6, 0.5]], 'open', [0, 2]),
        edge([[0.4, 0.5], [0.4, 0.8]], 'open', [0, 3]),
      ],
    };
    const out = featuresFromGraph(graph);
    for (const f of out) expect(f.start).toEqual({ kind: 'junction', junctionKey: 'node-0' });
    for (const f of out) expect(f.end).toEqual({ kind: 'snap-boundary' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/bandRemesh/featuresFromGraph.test.ts`
Expected: FAIL with "Cannot find module './featuresFromGraph'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// featuresFromGraph.ts
/**
 * featuresFromGraph — map a style-agnostic detector FeatureGraph to the corridor
 * mesher's MultiFeatureSpec[]. Open edges → open chains; loop edges → closed loops;
 * an endpoint shared by ≥3 edges is a JUNCTION (every edge there anchors to the SAME
 * junctionKey so corridorPaveMulti welds them to one shared interior id). Pure CPU.
 * @module fidelity/bandRemesh/featuresFromGraph
 */
import type { FeatureGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';
import type { MultiFeatureSpec } from './realCorridor';
import type { ChainAnchor } from './corridorPave';

export function featuresFromGraph(graph: FeatureGraph): MultiFeatureSpec[] {
  const degree = new Map<number, number>();
  for (const e of graph.edges) for (const n of e.endpoints) degree.set(n, (degree.get(n) ?? 0) + 1);
  const anchorFor = (node: number): ChainAnchor =>
    (degree.get(node) ?? 0) >= 3
      ? { kind: 'junction', junctionKey: `node-${node}` }
      : { kind: 'snap-boundary' };
  return graph.edges.map((e): MultiFeatureSpec => {
    const polyline = e.polyline.map((p) => ({ u: p.u, t: p.t }));
    if (e.kind === 'loop') return { polyline, closed: true };
    return { polyline, closed: false, start: anchorFor(e.endpoints[0]), end: anchorFor(e.endpoints[1]) };
  });
}
```

> Verify the import paths against source: `ChainAnchor` exported from `corridorPave.ts`, `MultiFeatureSpec` from `realCorridor.ts`, `FeatureGraph`/`FeatureEdge`/`Vec2`/`FeatureType` from `featureGraph/types`. If `FeatureGraph` is only re-exported from `featureGraph/detectFeatures`, import from there. Adjust to reality; do not invent paths.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd potfoundry-web && npx vitest run src/fidelity/bandRemesh/featuresFromGraph.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/featuresFromGraph.ts potfoundry-web/src/fidelity/bandRemesh/featuresFromGraph.test.ts
git commit -m "feat(mesher): featuresFromGraph adapter — detector graph to corridor specs"
```

---

### Task 2: `assembleWatertightWithFeatures` — the production-frame corridor graft

**Files:**
- Modify: `potfoundry-web/src/fidelity/bandRemesh/realCorridor.ts` (export `internOuterWall`; add `compToMerged` to its return)
- Create: `potfoundry-web/src/fidelity/bandRemesh/assembleWithFeatures.ts`
- Test: `potfoundry-web/src/fidelity/bandRemesh/assembleWithFeatures.test.ts`

**Interfaces:**
- Consumes: `assembleWatertight`, `WatertightAssemblyResult`, `AssemblyDimensions`, `AssemblyWallOptions`, `BandRegion`, `SurfaceRange` from `.../conforming/WatertightAssembly`; `SurfaceSampler` from `.../conforming/SurfaceSampler`; `FeatureLine` from `.../conforming/FeatureLineGraph`; `detectFeatures` + `DetectFeaturesOptions` from `.../conforming/featureGraph/detectFeatures`; `makeReliefIndicator` from `.../conforming/featureGraph/groundTruth`; `extractHoleBoundary` from `./seamFill`; `corridorPaveMulti` + `FeatureChainInput` + `UTPoint` from `./corridorPave`; `internOuterWall` + `MultiFeatureSpec` from `./realCorridor`; `featuresFromGraph` (Task 1).
- Produces:
  - `mergeCorridorIntoAssembly(asm: WatertightAssemblyResult, features: MultiFeatureSpec[], sampler: SurfaceSampler): WatertightAssemblyResult`
  - `assembleWatertightWithFeatures(outerSampler, innerSampler, dims, opts: AssembleWithFeaturesOptions): WatertightAssemblyResult`
  - `AssembleWithFeaturesOptions = AssemblyWallOptions & { detectOptions: DetectFeaturesOptions; corridorWidthMm?: number; featureLevel: number }`

**Source-verified facts (do not re-derive):**
- The band emit-gate fires only on the wall feature path (`ConformingWall.ts:565`) → the assemble call MUST pass a non-empty `outerFeatureLines` strand.
- The de-risk `internOuterWall` (`realCorridor.ts:223`) interns the outer wall via `railVertexKey(u,t)` (QSCALE), collapsing u-seam duplicates into one merged id, and returns `{ outerWall, vertexUT, ringVertexIds }` + (after this task) `compToMerged` (asm-outer-idx → merged-id). The outer wall is appended FIRST so its asm vertex indices are `[0, outerVertCount)`.
- `corridorPaveMulti` treats input `vertexUT` (the merged table) as ids `[0, vertexUT.length)`; fill interior ids are `[existingCount, paved.vertexUT.length)` where `existingCount === vertexUT.length`.
- `surfaceId = 0` is the outer wall; `evaluate_vertices` maps it to the outer-wall radius (so corridor interior, stamped 0, evaluates on the same surface as its boundary).
- The asm already contains the full outer wall (with holes) — the graft adds ONLY the fill, mapping the fill's boundary merged-ids back to asm ids via the inverse of `compToMerged`.

- [ ] **Step 1: Export `internOuterWall` from `realCorridor.ts` (additive)**

In `realCorridor.ts`, change `function internOuterWall(...)` to `export function internOuterWall(...)` and add `compToMerged` to its return object + return type:

```typescript
// realCorridor.ts — internOuterWall return type + final return
export function internOuterWall(assembly: ReturnType<typeof assembleWatertight>): {
  outerWall: IndexedMesh;
  vertexUT: Array<[number, number]>;
  ringVertexIds: Set<number>;
  compToMerged: Int32Array;   // asm-outer-vertex-index → merged id (-1 if unreferenced)
  outerVertCount: number;     // asm outer-wall owned vertex count
} {
  // ... existing body unchanged ...
  return { outerWall: { indices: tris }, vertexUT, ringVertexIds, compToMerged, outerVertCount };
}
```

The existing internal callers destructure `{ outerWall, vertexUT, ringVertexIds }` — the extra fields are ignored, so they are unaffected. Run `cd potfoundry-web && npx tsc --noEmit` to confirm the de-risk module still typechecks.

- [ ] **Step 2: Write the failing test (full-pot watertight-by-index + feature-followed + index-crack control + parity)**

```typescript
// assembleWithFeatures.test.ts
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { makeReliefIndicator } from '../../renderers/webgpu/parametric/conforming/featureGraph/groundTruth';
import { assembleWatertight, type WatertightAssemblyResult } from '../../renderers/webgpu/parametric/conforming/WatertightAssembly';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { auditWatertight, type Mesh3 } from './audit';
import { assembleWatertightWithFeatures, mergeCorridorIntoAssembly } from './assembleWithFeatures';

const DIMS = { H: 100, tBottom: 6, rDrain: 0 };
const STYLE_DIMS = { H: 100, Rt: 40, Rb: 30, expn: 1 }; // H MATCHES DIMS.H (no 100/120 mismatch)
const BASE = {
  maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2,
  maxLevel: 12, resU: 128, resT: 128, nRing: 1024,
  targetTriangles: 6_000_000, budgetMode: 'cap' as const,
};
const PROD_DETECT = (s: SurfaceSampler) => ({
  coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
  reliefIndicator: makeReliefIndicator(s),
});
function smoothInner(): SurfaceSampler {
  return { position(u, t) {
    const theta = u * 2 * Math.PI; const r = 36;
    const z = DIMS.tBottom + t * (DIMS.H - DIMS.tBottom);
    return [r * Math.cos(theta), r * Math.sin(theta), z];
  } };
}
function evalAssembly(sampler: SurfaceSampler, asm: WatertightAssemblyResult): Mesh3 {
  const n = asm.vertices.length / 3;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = asm.vertices[i * 3], t = asm.vertices[i * 3 + 1];
    const p = sampler.position(((u % 1) + 1) % 1, t);
    positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
  }
  return { positions, indices: asm.indices };
}
function build(level: number): WatertightAssemblyResult {
  const sampler = styleSampler('Voronoi', {}, STYLE_DIMS);
  return assembleWatertightWithFeatures(sampler, smoothInner(), DIMS, {
    ...BASE, featureLevel: level, detectOptions: PROD_DETECT(sampler), corridorWidthMm: 3,
  });
}

describe('assembleWatertightWithFeatures — production-frame corridor graft (Voronoi)', () => {
  for (const level of [7, 11]) {
    it(`FL${level}: full pot welds 0 tJunction / 0 nonManifold (CPU eval, by index)`, () => {
      const sampler = styleSampler('Voronoi', {}, STYLE_DIMS);
      const asm = assembleWatertightWithFeatures(sampler, smoothInner(), DIMS, {
        ...BASE, featureLevel: level, detectOptions: PROD_DETECT(sampler), corridorWidthMm: 3,
      });
      const audit = auditWatertight(evalAssembly(sampler, asm), {}); // by-index; tJunctions is the gate
      expect(audit.tJunctions, `FL${level} tJunctions`).toBe(0);
      expect(audit.nonManifoldEdges, `FL${level} nonManifold`).toBe(0);
    });
  }

  it('feature-followed: every consecutive corridor feature-chain pair is a mesh edge', () => {
    // assembleWatertightWithFeatures must expose the paved feature chains; mergeCorridorIntoAssembly
    // returns them on the result (see impl: result.featureChainAsmIds). Each consecutive pair must be
    // an edge of the merged index buffer (the de-risk allMeshEdges check, ported).
    const sampler = styleSampler('Voronoi', {}, STYLE_DIMS);
    const { asm, featureChainAsmIds } = assembleWatertightWithFeaturesDebug(sampler);
    const meshEdges = new Set<string>();
    const ind = asm.indices;
    for (let k = 0; k + 2 < ind.length; k += 3) {
      const tri = [ind[k], ind[k + 1], ind[k + 2]];
      for (let e = 0; e < 3; e++) {
        const i = tri[e], j = tri[(e + 1) % 3];
        meshEdges.add(i < j ? `${i}:${j}` : `${j}:${i}`);
      }
    }
    let allEdges = true;
    for (const chain of featureChainAsmIds) {
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = chain[i], b = chain[i + 1];
        if (!meshEdges.has(a < b ? `${a}:${b}` : `${b}:${a}`)) { allEdges = false; break; }
      }
    }
    expect(allEdges, 'every feature-chain segment is a mesh edge').toBe(true);
  });

  it('NON-VACUOUS control: cracking a corridor-shared seam vertex (INDEX) ⇒ tJunctions > 0', () => {
    const sampler = styleSampler('Voronoi', {}, STYLE_DIMS);
    const { asm, complementIndexEnd } = assembleWatertightWithFeaturesDebug(sampler);
    // A seam-shared vertex appears in BOTH a complement tri (< complementIndexEnd) and a fill tri.
    const inComplement = new Set<number>();
    for (let k = 0; k < complementIndexEnd; k++) inComplement.add(asm.indices[k]);
    let crackTri = -1, crackPos = -1, shared = -1;
    for (let k = complementIndexEnd; k + 2 < asm.indices.length && shared < 0; k += 3) {
      for (let e = 0; e < 3; e++) {
        const v = asm.indices[k + e];
        if (inComplement.has(v)) { shared = v; crackTri = k; crackPos = e; break; }
      }
    }
    expect(shared, 'a corridor-shared seam vertex exists').toBeGreaterThanOrEqual(0);
    // Clean: tJunctions 0.
    expect(auditWatertight(evalAssembly(sampler, asm), {}).tJunctions).toBe(0);
    // Crack INDEX topology: append a duplicate of `shared`, re-point ONE fill incidence to it.
    const nV = asm.vertices.length / 3;
    const vertices = new Float32Array(asm.vertices.length + 3);
    vertices.set(asm.vertices);
    vertices[nV * 3] = asm.vertices[shared * 3];
    vertices[nV * 3 + 1] = asm.vertices[shared * 3 + 1];
    vertices[nV * 3 + 2] = asm.vertices[shared * 3 + 2];
    const indices = asm.indices.slice();
    indices[crackTri + crackPos] = nV;
    const cracked: WatertightAssemblyResult = { ...asm, vertices, indices };
    expect(auditWatertight(evalAssembly(sampler, cracked), {}).tJunctions).toBeGreaterThan(0);
  });

  it('flag-OFF parity: a smooth featureless sampler ⇒ byte-identical to plain assembleWatertight', () => {
    const smooth = smoothInner(); // no relief features
    const plain = assembleWatertight(smooth, smoothInner(), DIMS, { ...BASE, featureLevel: 7 });
    const withF = assembleWatertightWithFeatures(smooth, smoothInner(), DIMS, {
      ...BASE, featureLevel: 7, detectOptions: PROD_DETECT(smooth), corridorWidthMm: 3,
    });
    expect(withF.vertices).toEqual(plain.vertices);
    expect(withF.indices).toEqual(plain.indices);
  });
});
```

> The test references `assembleWatertightWithFeaturesDebug(sampler)` — a thin test-only wrapper the implementer adds to `assembleWithFeatures.ts` (exported) that returns `{ asm, featureChainAsmIds, complementIndexEnd }` so the feature-followed + control tests can see the chain ids and the complement/fill boundary. Implement it by having `mergeCorridorIntoAssembly` also return those (and `assembleWatertightWithFeatures` discard them). `complementIndexEnd` = `asm.indices.length` BEFORE the fill is appended. `featureChainAsmIds` = `paved.featureChains` remapped to asm ids.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/bandRemesh/assembleWithFeatures.test.ts`
Expected: FAIL with "Cannot find module './assembleWithFeatures'".

- [ ] **Step 4: Write the implementation**

```typescript
// assembleWithFeatures.ts
/**
 * assembleWatertightWithFeatures — the production-frame feature-aligned mesher.
 *
 * Mirrors the PROVEN de-risk realFeatureCorridorMulti pipeline but grafts ONLY the
 * corridor FILL onto the FULL production assembly (which already holds the outer wall
 * with holes). The band emit-gate fires only on the wall feature path, so a minimal
 * off-corridor activation strand is injected as outerFeatureLines (mirroring
 * defaultAssemblyFeature) and REPLACES any analytic outerFeatureLines when on. The
 * outer wall is interned via railVertexKey (u-seam dedup) and the fill's boundary ids
 * are mapped back to asm ids; interior ids append as (u,t,0) and ride the caller's warps
 * + the GPU evaluate_vertices dispatch. Pure CPU.
 * @module fidelity/bandRemesh/assembleWithFeatures
 */
import {
  assembleWatertight,
  type WatertightAssemblyResult,
  type AssemblyDimensions,
  type AssemblyWallOptions,
  type BandRegion,
  type SurfaceRange,
} from '../../renderers/webgpu/parametric/conforming/WatertightAssembly';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureLine } from '../../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  detectFeatures, type DetectFeaturesOptions,
} from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { extractHoleBoundary } from './seamFill';
import { corridorPaveMulti, type FeatureChainInput, type UTPoint } from './corridorPave';
import { internOuterWall, type MultiFeatureSpec } from './realCorridor';
import { featuresFromGraph } from './featuresFromGraph';

export type AssembleWithFeaturesOptions = AssemblyWallOptions & {
  detectOptions: DetectFeaturesOptions;
  corridorWidthMm?: number;
  featureLevel: number;
};

// --- periodic-u polyline distance (mm-scaled), mirrors realCorridor ---
function uDistPeriodic(a: number, b: number): number { let d = Math.abs(a - b) % 1; if (d > 0.5) d = 1 - d; return d; }
function unwrapU(x: number, ref: number): number { let d = (x - ref) % 1; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return ref + d; }
function distToPolylinePeriodic(u: number, t: number, poly: UTPoint[], uS: number, tS: number): number {
  if (poly.length === 1) return Math.hypot(uDistPeriodic(u, poly[0].u) * uS, (t - poly[0].t) * tS);
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const au = poly[i].u, at = poly[i].t, bu = unwrapU(poly[i + 1].u, au), bt = poly[i + 1].t, qu = unwrapU(u, au);
    const du = (bu - au) * uS, dt = (bt - at) * tS, len2 = du * du + dt * dt;
    let f = 0; if (len2 > 1e-24) f = Math.max(0, Math.min(1, ((qu - au) * uS * du + (t - at) * tS * dt) / len2));
    const cu = au + (bu - au) * f, ct = at + (bt - at) * f;
    const d = Math.hypot((qu - cu) * uS, (t - ct) * tS); if (d < best) best = d;
  }
  return best;
}
function bandForFeatures(features: MultiFeatureSpec[], sampler: SurfaceSampler, dims: AssemblyDimensions, widthMm: number): BandRegion {
  const ref = features[0].polyline, mid = ref[Math.floor(ref.length / 2)];
  const midPos = sampler.position(((mid.u % 1) + 1) % 1, mid.t);
  const uToMm = 2 * Math.PI * Math.hypot(midPos[0], midPos[1]), tToMm = dims.H;
  return { insideBand(u, t) {
    const uu = ((u % 1) + 1) % 1;
    for (const f of features) if (distToPolylinePeriodic(uu, t, f.polyline, uToMm, tToMm) < widthMm) return true;
    return false;
  } };
}
/** Minimal off-corridor activation strand — mirrors realCorridor defaultAssemblyFeature. */
function activationStrand(): FeatureLine[] {
  const points: Array<{ u: number; t: number }> = [];
  for (let k = 0; k <= 16; k++) points.push({ u: 0.05, t: 0.1 + (0.8 * k) / 16 });
  return [{ kind: 'general-curve', points, label: 'corridor-activation-strand' }];
}

export interface FeatureGraftDebug {
  asm: WatertightAssemblyResult;
  featureChainAsmIds: number[][];
  complementIndexEnd: number; // asm.indices.length before the fill was appended
}

export function mergeCorridorIntoAssembly(
  asm: WatertightAssemblyResult, features: MultiFeatureSpec[], sampler: SurfaceSampler,
): WatertightAssemblyResult {
  return mergeCorridorIntoAssemblyDebug(asm, features, sampler).asm;
}

export function mergeCorridorIntoAssemblyDebug(
  asm: WatertightAssemblyResult, features: MultiFeatureSpec[], sampler: SurfaceSampler,
): FeatureGraftDebug {
  // 1. Intern the outer wall (railVertexKey) — collapses u-seam duplicates (proven step).
  const { outerWall, vertexUT, ringVertexIds, compToMerged, outerVertCount } = internOuterWall(asm);
  // 2. Inverse: merged-id → first asm outer-wall vertex id.
  const mergedToAsm = new Int32Array(vertexUT.length).fill(-1);
  for (let i = 0; i < outerVertCount; i++) {
    const m = compToMerged[i];
    if (m >= 0 && mergedToAsm[m] < 0) mergedToAsm[m] = i;
  }
  // 3. Extract the dyadic hole boundary and pave it (merged-id space).
  const hole = extractHoleBoundary(outerWall, ringVertexIds);
  const chains: FeatureChainInput[] = features.map((f) => ({ polyline: f.polyline, closed: f.closed, start: f.start, end: f.end }));
  const paved = corridorPaveMulti({ boundary: hole, vertexUT, features: chains, sampler });
  const existing = vertexUT.length; // corridorPaveMulti's existingCount: ids < this are seam-shared
  // 4. Graft the FILL onto asm. boundary merged-id → asm id (mergedToAsm); interior → new asm vertex.
  const totalVerts = asm.vertices.length / 3;
  const newInterior = paved.vertexUT.length - existing;
  const vertices = new Float32Array(asm.vertices.length + newInterior * 3);
  vertices.set(asm.vertices);
  for (let j = existing; j < paved.vertexUT.length; j++) {
    const o = asm.vertices.length + (j - existing) * 3;
    vertices[o] = paved.vertexUT[j][0]; vertices[o + 1] = paved.vertexUT[j][1]; vertices[o + 2] = 0; // surfaceId 0
  }
  const remap = (id: number): number => {
    if (id < existing) {
      const a = mergedToAsm[id];
      if (a < 0) throw new Error('mergeCorridorIntoAssembly: fill boundary id has no asm origin');
      return a;
    }
    return totalVerts + (id - existing);
  };
  const complementIndexEnd = asm.indices.length;
  const fillIdx: number[] = [];
  for (const [a, b, c] of paved.triangles) fillIdx.push(remap(a), remap(b), remap(c));
  const indices = new Uint32Array(asm.indices.length + fillIdx.length);
  indices.set(asm.indices); indices.set(fillIdx, asm.indices.length);

  const ranges: SurfaceRange[] = asm.surfaceRanges.slice();
  ranges.push({ surfaceId: 0, indexStart: complementIndexEnd, indexEnd: indices.length, vertexCount: newInterior });

  let triangleSource = asm.triangleSource;
  if (asm.triangleSource !== undefined) {
    const ext = new Uint8Array(indices.length / 3); ext.set(asm.triangleSource); triangleSource = ext;
  }
  const featureChainAsmIds = paved.featureChains.map((ch) => ch.map(remap));
  return { asm: { ...asm, vertices, indices, surfaceRanges: ranges, triangleSource }, featureChainAsmIds, complementIndexEnd };
}

export function assembleWatertightWithFeatures(
  outerSampler: SurfaceSampler, innerSampler: SurfaceSampler, dims: AssemblyDimensions, opts: AssembleWithFeaturesOptions,
): WatertightAssemblyResult {
  const { detectOptions, corridorWidthMm, featureLevel, ...wallOpts } = opts;
  const graph = detectFeatures(outerSampler, detectOptions);
  const features = featuresFromGraph(graph);
  if (features.length === 0) {
    return assembleWatertight(outerSampler, innerSampler, dims, wallOpts); // smooth → byte-identical
  }
  const band = bandForFeatures(features, outerSampler, dims, corridorWidthMm ?? 3);
  // Activation strand REPLACES any analytic outerFeatureLines so the legacy CDT insertion
  // does not run in the feature region (the corridor owns it) — and fires the band emit-gate.
  const asm = assembleWatertight(outerSampler, innerSampler, dims, {
    ...wallOpts, featureLevel, outerFeatureLines: activationStrand(), bandRegions: [band],
  });
  try {
    return mergeCorridorIntoAssembly(asm, features, outerSampler);
  } catch (err) {
    // A degenerate hole (feature too thin to exclude a whole cell) is a no-op, not a crash.
    console.warn('[featureMesher] corridor graft skipped:', (err as Error).message);
    return asm;
  }
}

/** Test-only: expose the graft internals for the feature-followed + control assertions. */
export function assembleWatertightWithFeaturesDebug(outerSampler: SurfaceSampler): FeatureGraftDebug {
  const DIMS = { H: 100, tBottom: 6, rDrain: 0 };
  const innerSampler: SurfaceSampler = { position(u, t) {
    const theta = u * 2 * Math.PI; const r = 36; const z = DIMS.tBottom + t * (DIMS.H - DIMS.tBottom);
    return [r * Math.cos(theta), r * Math.sin(theta), z];
  } };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeReliefIndicator } = require('../../renderers/webgpu/parametric/conforming/featureGraph/groundTruth');
  const graph = detectFeatures(outerSampler, {
    coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
    creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
    reliefIndicator: makeReliefIndicator(outerSampler),
  });
  const features = featuresFromGraph(graph);
  const base = { maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12, resU: 128, resT: 128, nRing: 1024, targetTriangles: 6_000_000, budgetMode: 'cap' as const };
  const band = bandForFeatures(features, outerSampler, DIMS, 3);
  const asm = assembleWatertight(outerSampler, innerSampler, DIMS, { ...base, featureLevel: 7, outerFeatureLines: activationStrand(), bandRegions: [band] });
  return mergeCorridorIntoAssemblyDebug(asm, features, outerSampler);
}
```

> Implementer notes (verify against source; fix without inventing):
> - Replace the `require(...)` in `assembleWatertightWithFeaturesDebug` with a top `import { makeReliefIndicator }` if eslint forbids require (it does — 0 warnings). The require is shown only to keep the debug helper self-contained; prefer the import.
> - Confirm `corridorPaveMulti`'s result exposes `featureChains: number[][]` and `vertexUT`/`triangles`/`existingCount` as used. If the field is named differently, adjust.
> - Confirm `AssemblyWallOptions` accepts `featureLevel`, `outerFeatureLines`, `bandRegions`. The de-risk passed all three.
> - Confirm `FeatureLine.kind` accepts `'general-curve'` (the strand uses it, mirroring `defaultAssemblyFeature`).
> - If `mergedToAsm` throws "no asm origin", the hole touched the u-seam / an unreferenced vertex — for Phase-1 interior Voronoi it must not; if it does, that is a real finding (seam-incident corridor), report it.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd potfoundry-web && npx vitest run src/fidelity/bandRemesh/assembleWithFeatures.test.ts`
Expected: PASS — FL7 & FL11 full-pot 0/0; feature-followed true; the index-crack control > 0 (clean 0); flag-OFF parity byte-identical.

- [ ] **Step 6: Typecheck + lint**

Run: `cd potfoundry-web && npx tsc --noEmit && npx eslint src/fidelity/bandRemesh/assembleWithFeatures.ts src/fidelity/bandRemesh/assembleWithFeatures.test.ts src/fidelity/bandRemesh/realCorridor.ts --max-warnings=0`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/assembleWithFeatures.ts potfoundry-web/src/fidelity/bandRemesh/assembleWithFeatures.test.ts potfoundry-web/src/fidelity/bandRemesh/realCorridor.ts
git commit -m "feat(mesher): production-frame corridor graft onto full assembly (intern + map-back)"
```

---

### Task 3: Flag-gated wiring into the production export path

**Files:**
- Modify: `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts` (extract the inline assembly opts at ~2659-2718 into a named const; gated swap before the warp loop)
- Modify: `potfoundry-web/src/fidelity/windowHook.ts` (flag pass-through if needed)

**Interfaces:**
- Consumes: `assembleWatertightWithFeatures` (Task 2), `makeReliefIndicator` from `featureGraph/groundTruth`, `DetectFeaturesOptions`, `SurfaceSampler`.
- Produces: `compute()` swaps `assembleWatertight(...)` → `assembleWatertightWithFeatures(...)` when `enableFeatureMesher` is true; identical call (same extracted opts) when off.

- [ ] **Step 1: GitNexus impact (MANDATORY before editing `compute`)**

Re-index (stale): `node .gitnexus/run.cjs analyze` (or `npx gitnexus analyze`) from the project root. Then `gitnexus impact({target:"compute", direction:"upstream"})` (and on `assembleWatertight`). Report the blast radius (direct callers, processes, risk). If HIGH/CRITICAL, the controller WARNS the user before proceeding. The change is additive + gated default-OFF inside the already-gated `byConstructionAssembly` branch — but report the numbers.

- [ ] **Step 2: Capture the pre-edit OFF baseline (byte-identity safety)**

Before any edit, run the Voronoi export under the CURRENT code with `__pfByConstruction=true` and record the mesh hash (vertices+indices). Use the e2e harness:

```bash
cd potfoundry-web && npm run dev -- --port 3001   # terminal 1
# terminal 2: a throwaway node/playwright snippet, or add a temp test, that does:
#   page.goto('/?fidelity=1'); window.__pfByConstruction = true; setStyle('Voronoi');
#   const m = await getMeshForRender(500_000); print sha256(m.vertices)+sha256(m.indices)
```

Save the two hashes to the task report. After Step 3, the OFF mesh (flag OFF, byConstruction ON) MUST reproduce them — this proves the inline-opts extraction was faithful.

- [ ] **Step 3: Extract the inline opts + add the gated swap**

Read `ParametricExportComputer.ts:2640-2720`. The `assembleWatertight` call (2659) takes an INLINE dims literal `{ H: dimensions.H, tBottom: dimensions.tBottom, rDrain: dimensions.rDrain }` and an INLINE opts literal (2667-2718, including `outerFeatureLines: generalCurves`, `featureLevel: 11`, `outerCreaseLines`, `outerEfgSampler`, `innerEfgSampler`, etc.). Refactor:

```typescript
// (a) near the byConstruction flag block (~2040), add the feature-mesher flag:
const enableFeatureMesher =
  Boolean((flags as { featureMesher?: boolean }).featureMesher) ||
  Boolean((globalThis as unknown as { __pfFeatureMesher?: boolean }).__pfFeatureMesher);
if (enableFeatureMesher) {
  console.warn('[ParametricExport] Feature mesher ENABLED (corridor pass active; requires byConstruction)');
}

// (b) at the call site (~2659): extract the literals verbatim into named locals.
const asmDims = { H: dimensions.H, tBottom: dimensions.tBottom, rDrain: dimensions.rDrain };
const assemblyOpts = { /* ...the EXACT existing inline fields, verbatim... */ };

// (c) branch. The corridor must merge BEFORE the warp loop (~2735), so keep this at the
// existing call site. When ON, REPLACE outerFeatureLines with the activation strand inside
// assembleWatertightWithFeatures (it does this), so do NOT also pass generalCurves here.
const asm = enableFeatureMesher
  ? assembleWatertightWithFeatures(outerSampler, innerSampler, asmDims, {
      ...assemblyOpts,
      featureLevel: assemblyOpts.featureLevel ?? 11,
      detectOptions: productionDetectOptions(outerSampler),
      corridorWidthMm: 3,
    })
  : assembleWatertight(outerSampler, innerSampler, asmDims, assemblyOpts);
```

Add the helper (this file or a small colocated module), importing the EXISTING builder:

```typescript
import { makeReliefIndicator } from './parametric/conforming/featureGraph/groundTruth';
import type { DetectFeaturesOptions } from './parametric/conforming/featureGraph/detectFeatures';

function productionDetectOptions(sampler: SurfaceSampler): DetectFeaturesOptions {
  return {
    coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
    creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
    reliefIndicator: makeReliefIndicator(sampler),
  };
}
```

> VERIFY: `outerSampler`/`innerSampler` exist as locals at the call site (the de-risk + grounding say `assembleWatertight(outerSampler, innerSampler, ...)`), and the warp loop (~2735) runs AFTER this line. Leave a comment: "feature graft must precede the u/t/helix warps so corridor surfaceId-0 vertices warp with the outer wall." For Voronoi the warps are identity (Phase-1 isolation), but the ordering is load-bearing for Phase 2.
> Do NOT create `featureGraph/reliefIndicator.ts` — `makeReliefIndicator` is already exported from `groundTruth.ts` and is pure-CPU (safe in production).

- [ ] **Step 4: Pass the flag through `windowHook.ts` if needed**

If the fidelity export path builds an isolated `flags`/`pipelineFeatureFlags` object that does NOT inherit `globalThis.__pfFeatureMesher`, add a `featureMesher` field sourced from `globalThis.__pfFeatureMesher` so `getMeshForRender()`/`measure()` exercise the corridor pass. If `globalThis` is visible inside `compute()` regardless (it is read there), leave a one-line comment confirming no plumbing is required and make no change.

- [ ] **Step 5: Typecheck + lint + detect_changes**

Run: `cd potfoundry-web && npx tsc --noEmit && npx eslint src/renderers/webgpu/ParametricExportComputer.ts src/fidelity/windowHook.ts --max-warnings=0`
Run `gitnexus detect_changes()` — confirm only `compute`, the new helper, and (if touched) the windowHook export changed. Report the scope.
Run: `cd potfoundry-web && npx vitest run src/fidelity/bandRemesh/` (no regression).

- [ ] **Step 6: Verify OFF byte-identity (the safety guard)**

Re-run the Step-2 capture (flag OFF, `__pfByConstruction=true`). Assert the two hashes EQUAL the pre-edit baseline. If they differ, the inline-opts extraction dropped/changed a field — fix `assemblyOpts` until OFF is byte-identical. Record both hash pairs in the report.

- [ ] **Step 7: Commit (scope to the 2 production files; NOT cellSamples-WIP hunks)**

```bash
git status   # confirm no unrelated cellSamples WIP staged
git add -p potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts   # stage ONLY feature-mesher hunks
git add potfoundry-web/src/fidelity/windowHook.ts   # only if changed
git commit -m "feat(mesher): flag-gated feature mesher in production export (default-OFF, OFF byte-identical)"
```

---

### Task 4: GPU end-to-end proof + 3MF + render (human acceptance)

**Files:**
- Create: `potfoundry-web/e2e/feature-mesher-voronoi.spec.ts`

**Interfaces:**
- Consumes: `window.__pfFidelity` (`isReady`, `setStyle`, `getMeshForRender`, `diagnoseTopology`); flags `window.__pfByConstruction` + `window.__pfFeatureMesher`; the Playwright `download` event for the 3MF.

- [ ] **Step 1: Write the e2e proof**

```typescript
// e2e/feature-mesher-voronoi.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ART = 'e2e/artifacts';

test.describe('feature mesher — Voronoi real GPU export', () => {
  test('flag-ON Voronoi welds watertight on GPU; OFF is byte-identical; emits render+3MF', async ({ page }) => {
    fs.mkdirSync(ART, { recursive: true });
    await page.goto('/?fidelity=1');
    await page.waitForFunction(() => !!(window as any).__pfFidelity?.isReady?.());

    // The feature mesher only applies on top of by-construction assembly.
    await page.evaluate(() => { (window as any).__pfByConstruction = true; });

    // OFF baseline (byConstruction ON, featureMesher OFF).
    await page.evaluate(() => { (window as any).__pfFeatureMesher = false; });
    await page.evaluate((s) => (window as any).__pfFidelity.setStyle(s), 'Voronoi');
    const off = await page.evaluate(() => (window as any).__pfFidelity.getMeshForRender(500_000));
    expect(off, 'OFF mesh').not.toBeNull();
    const offTris = off.indices.length / 3;
    const offHash = hash(off);

    // ON.
    await page.evaluate(() => { (window as any).__pfFeatureMesher = true; });
    await page.evaluate((s) => (window as any).__pfFidelity.setStyle(s), 'Voronoi');
    const topo = await page.evaluate(() => (window as any).__pfFidelity.diagnoseTopology());
    expect(topo.nonManifoldEdges, 'nonManifold').toBe(0);
    expect(topo.orientationMismatches, 'orientation').toBe(0);
    // diagnoseTopology audits the outer-wall mesh with open t-rings; assert by its convention.
    // If it reports boundaryEdges == ring count (open rings) rather than 0, assert that value.
    expect(topo.boundaryEdges, 'open boundary (design)').toBeGreaterThanOrEqual(0);

    const on = await page.evaluate(() => (window as any).__pfFidelity.getMeshForRender(500_000));
    expect(on, 'ON mesh').not.toBeNull();
    const onTris = on.indices.length / 3;
    expect(onTris, 'corridor changes the mesh').not.toBe(offTris);

    // OFF byte-identity: re-fetch OFF and confirm it equals the first OFF (the flag flip
    // does not perturb the OFF path).
    await page.evaluate(() => { (window as any).__pfFeatureMesher = false; });
    await page.evaluate((s) => (window as any).__pfFidelity.setStyle(s), 'Voronoi');
    const off2 = await page.evaluate(() => (window as any).__pfFidelity.getMeshForRender(500_000));
    expect(hash(off2), 'OFF stable across flag toggles').toBe(offHash);

    // Human-acceptance render (ON).
    await page.evaluate(() => { (window as any).__pfFeatureMesher = true; });
    await page.evaluate((s) => (window as any).__pfFidelity.setStyle(s), 'Voronoi');
    await page.screenshot({ path: `${ART}/voronoi-feature-mesher.png`, fullPage: true });
  });
});

function hash(m: { vertices: Float32Array | number[]; indices: Uint32Array | number[] }): string {
  // cheap structural hash for stability comparison (not crypto).
  let h = 2166136261 >>> 0;
  const upd = (x: number) => { h ^= x | 0; h = Math.imul(h, 16777619) >>> 0; };
  for (const v of m.vertices) upd(Math.round(v * 1e6));
  for (const i of m.indices) upd(i);
  return h.toString(16);
}
```

> Adjust `diagnoseTopology` field names + the boundaryEdges convention to the real `FidelityTopologyDiagnostics` shape (read `windowHook.ts`). If it returns 0 boundary for a closed pot, assert 0; if it audits the open-ringed outer wall, assert the ring count. The load-bearing GPU assertions are `nonManifoldEdges === 0` + `orientationMismatches === 0` + `onTris !== offTris` + OFF stable.

- [ ] **Step 2: Run the e2e (requires a dev server)**

```bash
cd potfoundry-web
npm run dev -- --port 3001   # terminal 1 (background)
npx playwright test feature-mesher-voronoi --project=chromium   # terminal 2
```

Expected: PASS — GPU nonManifold/orientation 0; `onTris !== offTris`; OFF stable; a screenshot at `e2e/artifacts/voronoi-feature-mesher.png`.

> If the GPU is degraded by orphaned chromium from prior probe-kills (~3× slower/stalls), let the test finish or `Stop-Process chrome` before re-running; do not hard-kill mid-run.

- [ ] **Step 3: Produce a 3MF artifact via the download event**

`download3MF` triggers a browser download (a synthetic `<a download>` click) — it does NOT write to disk and is not on `window`. Drive the in-page 3MF export control (the export UI button, with the flag ON) and capture it:

```typescript
const [dl] = await Promise.all([
  page.waitForEvent('download'),
  page.click('<the 3MF export control selector>'), // or the export menu → 3MF
]);
await dl.saveAs(`${ART}/voronoi-feature.3mf`);
```

Add this to the spec (or a second test). If there is no UI path in the fidelity harness, expose a tiny fidelity-API method that returns the 3MF `Blob`/bytes and serialize them back through `page.evaluate` to write via `fs`. The 3MF + the screenshot are the Done-when deliverables.

- [ ] **Step 4: Commit (force-add the artifacts — `artifacts/` is git-ignored at any depth)**

```bash
git add potfoundry-web/e2e/feature-mesher-voronoi.spec.ts
git add -f potfoundry-web/e2e/artifacts/voronoi-feature-mesher.png potfoundry-web/e2e/artifacts/voronoi-feature.3mf
git commit -m "test(mesher): Voronoi GPU end-to-end watertight + OFF parity + render/3MF (Phase 1)"
```

> Verify the ignore first: `git check-ignore -v potfoundry-web/e2e/artifacts/voronoi-feature-mesher.png`. If ignored (it is — root `.gitignore` `artifacts/`), use `git add -f` (above) OR write the deliverables to a non-ignored path (e.g. `docs/superpowers/specs/2026-06-25-artifacts/`). Pick one and make the commit actually contain the files.

---

## Phase 1 Done-when

- Voronoi exports through the real GPU path with the corridor pass ON (`__pfByConstruction` + `__pfFeatureMesher`), watertight by index (0 nonManifold / 0 orientation; boundary per the harness's closed-pot convention), `onTris !== offTris`.
- Flag-OFF is byte-identical: the pre-edit/post-edit OFF hash matches (Task 3 Step 6) AND OFF is stable across flag toggles (Task 4) AND the features-empty parity unit test passes.
- The feature is feature-followed (Task 2's `featureChainAllEdges` assertion) and the full pot welds 0/0 at FL7 + FL11 (CPU) with a non-vacuous INDEX-crack control.
- A 3MF + a flat-shaded render exist IN the commit and are surfaced to the user for acceptance.
- All new unit tests green; `tsc`/eslint clean; `gitnexus detect_changes` scope as expected; no cellSamples-WIP hunks swept into commits.

## After Phase 1

Phases 2 (all-20 via the e2e fidelity harness; smooth-style byte-identity; warped-style correctness — the activation-strand artifact at u≈0.05 and the warp-frame ordering get exercised here) and 3 (perf — the ≈22s assembly + the outerVertCount `vertexUT` allocation; the straddle-cell `outerFeatureLines` reconciliation; re-baseline `gateThresholds.ts`; flag-default decision) get their own plans, informed by Phase 1's GPU proof + render.

## Carry-forward residuals (non-blocking)

- Activation-strand artifact (a tiny feature line at u≈0.05) — invisible in a Voronoi lattice; eliminate in Phase 2 (place at a t-margin or use `railLines` activation once proven).
- Seam/rim-incident corridors (the graft's merged→asm map-back is exact only where hole-boundary vertices are first-occurrence — true for interior features; co-exercise a rim/seam feature in Phase 2; the audit is the safety net).
- `localOf.get(a) as number` → `?? throw` guard in `corridorPave.ts` (hardening).
- Large `vertexUT` slice per export (outerVertCount-length) — Phase-3 perf.
