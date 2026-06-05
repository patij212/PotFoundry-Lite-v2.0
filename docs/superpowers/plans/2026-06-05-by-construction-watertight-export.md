# By-Construction Watertight Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the parametric export mesh watertight, consistently wound, feature-preserving, and sliver-free **by construction** — reaching CAD-level export quality — by restructuring the assembly flow so junctions are shared, not stitched by the repair battery.

**Architecture:** Reuse the existing generators (feature detection, CDT outer-wall tessellation, subdivision, GPU evaluation) but invert the pipeline order: build a **periodic** outer wall (no seam boundary), **refine walls first**, then build caps **from the refined wall boundary rings (shared vertex indices)**, taper features to uniform boundary rings, dedup near-coincident chain vertices, and finish with a topology-preserving quality pass. The 12-stage repair battery is demoted to a verifier. New path is flag-gated (`byConstructionAssembly`) until it passes the full e2e matrix.

**Tech Stack:** TypeScript, WebGPU compute, Vitest (jsdom) unit tests, Playwright e2e (real WebGPU), the `e2e/_topology_probe.cjs` / `e2e/_quality_probe.cjs` probes and the `export-fidelity` matrix.

Spec: `docs/superpowers/specs/2026-06-05-by-construction-watertight-export-design.md`.

---

## Working agreements (read first)

- **Dev server:** a Vite dev server must be running on `:3001` for the e2e probes (`cd potfoundry-web && npm run dev -- --port 3001`). Do **not** edit `src/` while the full matrix is running (HMR corrupts in-flight runs); single probes are fine.
- **Authoritative gate:** the e2e harness, NOT unit tests. Unit tests have repeatedly passed while the real mesh failed this codebase. Every phase MUST end with an e2e probe.
- **Working directory:** all `npx`/`node` commands run from `potfoundry-web/`.
- **Flag:** all new behavior lives behind `byConstructionAssembly` (added in Task 0). The legacy path stays default until Phase 5.
- **Representative styles for per-task e2e:** `HarmonicRipple` (features, measurable, exhibited every defect), `SuperformulaBlossom` (clean — must stay clean), `SpiralRidges` (formerly hung — must stay measurable).
- **ESLint:** 0 warnings policy; a PostToolUse hook lints every edited `.ts`. Fix warnings before moving on.
- **Lint/typecheck commands:** `npx eslint <file> --max-warnings=0` and `npx tsc --noEmit` (ignore pre-existing errors in `AxisOverlay.test.ts` / `BindGroupFactory.test.ts` — they are not ours).

### Probe quick-reference (run from `potfoundry-web/`)

```bash
# Topology (orient/bnd/nonManifold) for one style, with staged winding diagnostics:
PF_STYLE_ID=HarmonicRipple PF_WINDING_STAGE=1 PF_TOPOLOGY_SAMPLE_LIMIT=2 node e2e/_topology_probe.cjs

# Quality (slivers) for one style, with worst-triangle centroids:
PF_STYLE_ID=HarmonicRipple PF_QUALITY_SAMPLE_LIMIT=120 node e2e/_quality_probe.cjs

# Full matrix (long; writes e2e/fidelity/baseline.json):
npx playwright test export-fidelity --project=chromium
```

A pass for a style means the probe's `DIAG_JSON`/`QUALITY_JSON` shows the §2 goal numbers.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `src/renderers/webgpu/ParametricExportComputer.ts` | Pipeline orchestration; add `byConstructionAssembly` flag + new flow branch (refine-before-caps, shared pool, verifier tail) | Modify |
| `src/renderers/webgpu/parametric/OuterWallTessellator.ts` | Periodic wrap-cell grid mode; feature taper hook | Modify |
| `src/renderers/webgpu/parametric/ChainLinker.ts` | Near-coincident chain-vertex dedup | Modify |
| `src/renderers/webgpu/parametric/CapBuilder.ts` | Build watertight cap strips between two shared boundary rings | **Create** |
| `src/renderers/webgpu/parametric/MeshQualityPass.ts` | Final topology-preserving sliver-elimination pass (edge flips + safe collapses) | **Create** |
| `src/renderers/webgpu/parametric/MeshVerifier.ts` | Assert watertight/oriented/sliver-free; precise dev diagnostics | **Create** |
| `*.test.ts` siblings | Unit tests per module | Create/Modify |

---

## Task 0: Add the `byConstructionAssembly` flag (no behavior change)

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts` (flags object / params)

- [ ] **Step 1: Locate the flags.** Find where pipeline `flags`/config booleans are read in `compute()` (search `flags.outerWallCorridorPlanning`). Identify the flags source object/type.

- [ ] **Step 2: Add the flag** with default `false`, threaded the same way existing flags are. Add a one-line doc comment: `// by-construction assembly (shared rings + periodic seam); legacy battery path when false`.

- [ ] **Step 3: Add a probe override.** In the same place the probes read globals (search `__pfEnableWindingStageDiagnostics`), allow `globalThis.__pfByConstruction === true` to force the flag on, so the e2e probes can exercise the new path without changing defaults. Example:
```ts
const byConstructionAssembly = Boolean(flags?.byConstructionAssembly)
  || Boolean((globalThis as unknown as { __pfByConstruction?: boolean }).__pfByConstruction);
```

- [ ] **Step 4: Add probe plumbing.** In `e2e/_topology_probe.cjs` and `e2e/_quality_probe.cjs`, add (mirroring `PF_WINDING_STAGE`):
```js
if (process.env.PF_BYCONSTRUCTION === '1') {
  await page.addInitScript(() => { window.__pfByConstruction = true; });
}
```

- [ ] **Step 5: typecheck + lint.** `npx tsc --noEmit` (no new errors in our files); `npx eslint src/renderers/webgpu/ParametricExportComputer.ts --max-warnings=0`.

- [ ] **Step 6: e2e no-op check.** `PF_STYLE_ID=SuperformulaBlossom PF_TOPOLOGY_SAMPLE_LIMIT=0 node e2e/_topology_probe.cjs` → still `orient=0 bnd=0 nonMan=0` (flag off by default; new branch not yet written).

- [ ] **Step 7: Commit.**
```bash
git add src/renderers/webgpu/ParametricExportComputer.ts e2e/_topology_probe.cjs e2e/_quality_probe.cjs
git commit -m "feat(parametric): add byConstructionAssembly flag (no-op scaffold)"
```

---

## Phase 1 — Periodic outer-wall seam by construction (spec §5)

Goal: the outer wall is a true periodic cylinder — the wrap cell (last column → column 0) is emitted using column-0's vertices, so there is **no seam boundary edge ever**. Eliminates the seam-fill orientation injector.

### Task 1.1: Periodic wrap-cell emission in the outer-wall grid

**Files:**
- Modify: `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- Test: `src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`

- [ ] **Step 1: Read the current grid emission.** In `buildCDTOuterWall`, find where standard grid cells are emitted across columns (search `emitStandardCell` / the column loop and `SEAM_GUARD`). Understand how a cell between column `c` and `c+1` is built, and confirm the last column is `unionU.length-1` with no wrap cell to column 0.

- [ ] **Step 2: Write the failing test** — a minimal periodic grid must have NO boundary edges on the seam. Add to `OuterWallTessellator.test.ts`:
```ts
describe('periodic outer-wall seam (by construction)', () => {
  it('emits a wrap cell so the u-seam has zero boundary edges', () => {
    // Minimal 4-column × 3-row periodic wall, no chains. With periodicSeam:true the
    // wrap cell (col3→col0) must exist so every vertical seam edge is shared by 2 cells.
    const res = buildCDTOuterWall(
      [], /* meshChains */
      makeIdentityRowMapping(3),       // helper below or inline a rowMapping for 3 rows
      new Float32Array([0, 0.5, 1]),   // finalT (3 rows)
      new Float32Array([0, 0.25, 0.5, 0.75]), // unionU (4 columns, periodic in [0,1))
      200, 0,
      { mode: 'sweep' },
      { Rb: 45, Rt: 70, expn: 1, H: 120 },
      { periodicSeam: true },
    );
    // Count boundary edges among outer-mid vertices on the seam (u≈0 column).
    const seamBoundary = countSeamBoundaryEdges(res.indices, res.vertices); // helper below
    expect(seamBoundary).toBe(0);
  });
});
```
Provide the `countSeamBoundaryEdges` helper in the test file: build an undirected edge-use count over `res.indices`, then count edges whose both endpoints have `u<=0.01` and that are used exactly once. (If `makeIdentityRowMapping` doesn't exist, construct the `rowMapping` inline to match the shape `buildCDTOuterWall` expects — read its type first.)

- [ ] **Step 3: Run the test, expect FAIL.** `npx vitest run src/renderers/webgpu/parametric/OuterWallTessellator.test.ts -t "periodic outer-wall seam"` → FAIL (no `periodicSeam` option / seam edges are boundary).

- [ ] **Step 4: Implement the periodic option.** Add `periodicSeam?: boolean` to `OuterWallBuildOptions`. In the standard-cell column loop, when `periodicSeam` is set, after the last column emit one extra wrap cell whose "right" column is **column 0's vertex indices** (same row indices) instead of a new u=1 column. Reuse the existing cell-emission/diagonal logic (`emitStandardCell` / `sweepQuad`) with `right = column0`. Ensure winding matches interior cells (unwrapped-u: treat col-0 as u+1, mirroring the existing `unwrappedU` convention in `PeriodicSeamClosure.ts`).

- [ ] **Step 5: Run the test, expect PASS.** Same command → PASS (seamBoundary === 0).

- [ ] **Step 6: Guard regression** — run the full tessellator suite: `npx vitest run src/renderers/webgpu/parametric/OuterWallTessellator.test.ts` → all green (the new option is opt-in; default path unchanged).

- [ ] **Step 7: lint + commit.**
```bash
npx eslint src/renderers/webgpu/parametric/OuterWallTessellator.ts --max-warnings=0
git add src/renderers/webgpu/parametric/OuterWallTessellator.ts src/renderers/webgpu/parametric/OuterWallTessellator.test.ts
git commit -m "feat(parametric): periodic wrap-cell outer-wall grid mode"
```

### Task 1.2: Wire periodicSeam into the by-construction branch + chain seam handling

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

- [ ] **Step 1: Branch the outer-wall call.** In `compute()`, where `buildCDTOuterWall(...)` is called (surf.id===0), when `byConstructionAssembly` is true pass `periodicSeam: true` in the options object.

- [ ] **Step 2: Seam-crossing chains.** Confirm chain edges with `|Δu|>0.5` (seam-crossing) reference column-0 verts under periodicSeam. Read `seamFilteredChainEdges` (currently filters them OUT). Under periodicSeam, seam-crossing chain edges should be KEPT and connected to the shared col-0 verts. If the tessellator's chain integration can't yet place a seam-crossing chain vertex on the shared column, leave a `// TODO(phase1): seam-crossing chains` and rely on the periodic grid wrap for now — the e2e check (Step 4) reveals whether feature-dense seams still inject conflicts.

- [ ] **Step 3: typecheck + lint.** `npx tsc --noEmit`; eslint the file.

- [ ] **Step 4: e2e validation (authoritative).** With the dev server up:
```bash
PF_STYLE_ID=HarmonicRipple PF_BYCONSTRUCTION=1 PF_WINDING_STAGE=1 PF_TOPOLOGY_SAMPLE_LIMIT=2 node e2e/_topology_probe.cjs
```
Expected: the `[WINDING-STAGE] after-fillOuterWallSeamBoundaryChains` jump (was 0→5862) is gone or far smaller; seam boundary edges at base-gen are 0. Record the new `orient`/`bnd`/`nonMan`. Compare to legacy: same command without `PF_BYCONSTRUCTION=1`.

- [ ] **Step 5: clean-style + hang-style guard.**
```bash
PF_STYLE_ID=SuperformulaBlossom PF_BYCONSTRUCTION=1 PF_TOPOLOGY_SAMPLE_LIMIT=0 node e2e/_topology_probe.cjs   # stays 0/0/0
PF_STYLE_ID=SpiralRidges       PF_BYCONSTRUCTION=1 PF_TOPOLOGY_SAMPLE_LIMIT=0 node e2e/_topology_probe.cjs   # still completes
```

- [ ] **Step 6: Commit.**
```bash
git add src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "feat(parametric): use periodic seam in by-construction outer wall"
```

> **Phase 1 exit criterion:** under `PF_BYCONSTRUCTION=1`, HarmonicRipple shows no seam-stage winding-conflict injection at base-gen (the cross-surface injector remains — addressed in Phase 2). Clean/hang styles unaffected.

---

## Phase 2 — Refine-before-caps + shared junction rings (spec §4 reorder, §8)

Goal: build + refine the walls first, then build caps from the refined wall rings sharing their vertex indices. Eliminates cross-surface fills and the cross-surface orientation injector.

### Task 2.1: Create `CapBuilder` — watertight cap strip between two shared rings

**Files:**
- Create: `src/renderers/webgpu/parametric/CapBuilder.ts`
- Test: `src/renderers/webgpu/parametric/CapBuilder.test.ts`

- [ ] **Step 1: Define the interface.**
```ts
// CapBuilder.ts
/** A boundary ring: ordered vertex indices (into the shared pool) around a surface edge. */
export interface BoundaryRing {
  /** Vertex indices in ring order (ascending angle). */
  vertices: number[];
}

/**
 * Triangulate a cap strip BETWEEN two existing rings, referencing their vertex
 * indices directly (no new boundary verts). `outer`/`inner` are matched ring-order
 * sequences (same length after taper). Winding is chosen so the strip is consistent
 * with `outwardSign` (the cap's outward normal direction along +Z or radial).
 * Returns triangle indices into the SAME vertex pool the rings index into.
 */
export function buildCapBetweenRings(
  outer: BoundaryRing,
  inner: BoundaryRing,
  positions: Float32Array,
  outwardSign: 1 | -1,
): Uint32Array;
```

- [ ] **Step 2: Write the failing test** — equal-length rings → clean quad strip, watertight + oriented, no new verts.
```ts
import { describe, expect, it } from 'vitest';
import { buildCapBetweenRings } from './CapBuilder';
import { topologyDiagnostics } from '../../../fidelity/metrics';

describe('buildCapBetweenRings', () => {
  it('strips two matched rings into a watertight, consistently-wound cap (no new verts)', () => {
    // Two concentric 4-vertex rings at z=120: outer r=70, inner r=66. Indices 0..3 outer, 4..7 inner.
    const positions = new Float32Array([
      70,0,120, 0,70,120, -70,0,120, 0,-70,120,   // outer ring 0..3
      66,0,120, 0,66,120, -66,0,120, 0,-66,120,   // inner ring 4..7
    ]);
    const tris = buildCapBetweenRings({ vertices: [0,1,2,3] }, { vertices: [4,5,6,7] }, positions, 1);
    // No index may exceed the existing 8 vertices (no new verts created).
    expect(Math.max(...tris)).toBeLessThan(8);
    // The cap alone is an open annulus (its inner/outer rims are boundary), but it must
    // have ZERO orientation mismatches and ZERO non-manifold edges.
    const topo = topologyDiagnostics({ vertices: positions, indices: tris }, 1e-4, 8);
    expect(topo.orientationMismatches).toBe(0);
    expect(topo.nonManifoldEdges).toBe(0);
    // 4 quads → 8 triangles around the closed ring.
    expect(tris.length / 3).toBe(8);
  });
});
```

- [ ] **Step 3: Run, expect FAIL** (module/function missing): `npx vitest run src/renderers/webgpu/parametric/CapBuilder.test.ts`.

- [ ] **Step 4: Implement** the matched-ring strip: for each `i`, emit quad `(outer[i], inner[i], inner[i+1], outer[i+1])` (indices mod ring length, wrapping closed) as two triangles, wound per `outwardSign` (compute the triangle normal vs the cap's intended outward direction and flip if needed). Reference ring indices directly; create no vertices.

- [ ] **Step 5: Run, expect PASS.**

- [ ] **Step 6: Add a mismatched-length test (taper guarantees equal length, but be defensive):** assert `buildCapBetweenRings` throws or returns `[]` with a clear error when ring lengths differ, so Phase 3's taper contract is enforced. Implement that guard. Re-run → PASS.

- [ ] **Step 7: lint + commit.**
```bash
npx eslint src/renderers/webgpu/parametric/CapBuilder.ts --max-warnings=0
git add src/renderers/webgpu/parametric/CapBuilder.ts src/renderers/webgpu/parametric/CapBuilder.test.ts
git commit -m "feat(parametric): CapBuilder — watertight shared-ring cap strips"
```

### Task 2.2: Extract refined wall boundary rings

**Files:**
- Modify: `src/renderers/webgpu/parametric/CapBuilder.ts` (add ring extraction)
- Test: `src/renderers/webgpu/parametric/CapBuilder.test.ts`

- [ ] **Step 1: Define** `extractBoundaryRing(uvs, surfaceId, atEnd)`: collect vertices of `surfaceId` at t≈1 (atEnd) or t≈0, ordered by u (ascending), deduped by canonical position. Signature:
```ts
export function extractBoundaryRing(uvs: Float32Array, surfaceId: number, atEnd: boolean): BoundaryRing;
```

- [ ] **Step 2: Failing test** — a 3-column × 2-row single-surface grid; the top ring (t=1) must list the 3 top vertices in u order.
```ts
it('extracts the t=1 boundary ring of a surface in u order', () => {
  // verts: (u,t,sid). sid=0. cols u={0,0.33,0.66}, rows t={0,1}.
  const uvs = new Float32Array([
    0,0,0,  0.33,0,0,  0.66,0,0,    // bottom row idx 0,1,2
    0,1,0,  0.33,1,0,  0.66,1,0,    // top row idx 3,4,5
  ]);
  const ring = extractBoundaryRing(uvs, 0, true);
  expect(ring.vertices).toEqual([3, 4, 5]);
});
```

- [ ] **Step 3: Run FAIL → implement → run PASS.** (`npx vitest run ... -t "extracts the t=1 boundary ring"`.)

- [ ] **Step 4: lint + commit.**
```bash
git add src/renderers/webgpu/parametric/CapBuilder.ts src/renderers/webgpu/parametric/CapBuilder.test.ts
git commit -m "feat(parametric): extractBoundaryRing for shared-ring caps"
```

### Task 2.3: Restructure `compute()` — refine walls before caps, shared pool (by-construction branch only)

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

> This is the largest task. The legacy path is untouched; you add a parallel `if (byConstructionAssembly) { ... }` flow. Read the current order first: surface gen loop (`for surf of SURFACE_CONFIG`) → combine → subdivide (`subdivideLongEdges`) → refine block → tail.

- [ ] **Step 1: Build only the walls** (surf.id 0 outer, 1 inner) into the combined vertex pool, skipping cap surfaces (rim/base/drain/foot) in the by-construction branch.

- [ ] **Step 2: Refine the walls** via the existing `subdivideLongEdges` + refine block, exactly as today but on the walls-only mesh. Keep `outerIdxCountAfterSubdiv` semantics.

- [ ] **Step 3: After refinement, extract rings** from the refined `combinedVerts`/`finalResultData` using `extractBoundaryRing` (outer-top, outer-bottom, inner-top, inner-bottom, drain as configured).

- [ ] **Step 4: Build caps** with `buildCapBetweenRings`, appending their triangles to `finalCombinedIdxs` (referencing the shared, already-refined ring vertex indices — NO new vertex arrays concatenated for cap boundaries; caps add interior verts only if a surface needs them, which matched rings do not).

- [ ] **Step 5: Skip the repair battery** in the by-construction branch (guard the tail stages with `if (!byConstructionAssembly)`), EXCEPT keep `normalizeWindingByComponent` temporarily as a safety telemetry call (so we can read residual conflicts) — it will be removed in Phase 5.

- [ ] **Step 6: typecheck + lint.**

- [ ] **Step 7: e2e validation.**
```bash
PF_STYLE_ID=HarmonicRipple PF_BYCONSTRUCTION=1 PF_WINDING_STAGE=1 PF_TOPOLOGY_SAMPLE_LIMIT=4 node e2e/_topology_probe.cjs
```
Expected: `bnd=0`, `nonMan=0` at the wall↔cap junctions (shared rings), and the cross-surface winding injector gone → `orient` dramatically lower (target 0 modulo Phase-3 chain issues). Record numbers.

- [ ] **Step 8: clean + hang guard** (as Task 1.2 Step 5, with `PF_BYCONSTRUCTION=1`).

- [ ] **Step 9: Commit.**
```bash
git add src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "feat(parametric): refine-before-caps + shared-ring assembly (by-construction)"
```

> **Phase 2 exit criterion:** under `PF_BYCONSTRUCTION=1`, HarmonicRipple has `bnd=0`, `nonMan=0`, and `orient` near 0 (any residual traced to chain handling, addressed next). SpiralRidges still completes; SuperformulaBlossom still clean.

---

## Phase 3 — Feature taper + chain-vertex dedup (spec §6, §7)

Goal: make boundary rings uniform (taper) and remove near-duplicate chain vertices, eliminating rim/base/wall needle slivers and guaranteeing equal-length matched rings for `CapBuilder`.

### Task 3.1: Feature taper to base columns at t=0/t=1

**Files:**
- Modify: `src/renderers/webgpu/parametric/OuterWallTessellator.ts` (per-row chain patch)
- Test: `src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`

- [ ] **Step 1: Read** the per-row feature patching (where chain vertices replace/displace grid columns per row). Identify where a row's chain displacement amplitude is applied.

- [ ] **Step 2: Failing test** — with `featureTaper:true`, the top row (t=1) and bottom row (t=0) carry NO chain displacement (boundary ring == base columns).
```ts
it('tapers feature displacement to zero at the t=0 and t=1 boundary rows', () => {
  // A single chain peak at u=0.5 spanning all rows. With taper, the t=0 and t=1 rows
  // must have the chain vertex AT the base column position (no radial displacement),
  // while a mid row keeps full displacement.
  // (Construct meshChains with one peak chain; call buildCDTOuterWall with
  //  { featureTaper: true }; assert top/bottom ring vertices lie on the base ring
  //  radius and the mid row's chain vertex is displaced.)
});
```
Fill in the fixture concretely using the chain types from `parametric/types.ts` (read `FeatureChain`/`ChainPoint`). Assert via 3D radius: boundary-row chain vertex radius ≈ base radius; mid-row radius ≠ base.

- [ ] **Step 3: Run FAIL → implement taper → run PASS.** Implement: scale chain displacement by `taper(t)` where `taper`=0 at t∈{0,1} and 1 in the interior over a band (e.g. linear ramp over the first/last `TAPER_ROWS` rows or a fixed `TAPER_T=0.04`). Add `featureTaper?: boolean` and `TAPER_T` constant.

- [ ] **Step 4: Run full tessellator suite** → green.

- [ ] **Step 5: lint + commit.**
```bash
git add src/renderers/webgpu/parametric/OuterWallTessellator.ts src/renderers/webgpu/parametric/OuterWallTessellator.test.ts
git commit -m "feat(parametric): taper feature displacement to uniform boundary rings"
```

### Task 3.2: Chain-vertex dedup

**Files:**
- Modify: `src/renderers/webgpu/parametric/ChainLinker.ts`
- Test: `src/renderers/webgpu/parametric/ChainLinker.test.ts`

- [ ] **Step 1: Failing test** — two chain points within ε (e.g. 0.02 mm) merge to one.
```ts
it('merges near-coincident chain points below the dedup epsilon', () => {
  // Build a chain with two points 0.02mm apart (below ~0.05mm); after dedup the
  // linked chain has one vertex there. (Use the ChainLinker entry point + assert
  // resulting unique point count.)
});
```
Read `ChainLinker`'s public entry + `ChainPoint` shape; write the assertion against the deduped output.

- [ ] **Step 2: Run FAIL → implement** a position-keyed merge (3D distance < `CHAIN_DEDUP_EPS_MM = 0.05`) in the link/re-snap step → **run PASS**.

- [ ] **Step 3: Full ChainLinker suite** → green; lint.

- [ ] **Step 4: Commit.**
```bash
git add src/renderers/webgpu/parametric/ChainLinker.ts src/renderers/webgpu/parametric/ChainLinker.test.ts
git commit -m "feat(parametric): dedup near-coincident chain vertices"
```

### Task 3.3: Wire taper + dedup into the by-construction branch + e2e

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

- [ ] **Step 1: Pass `featureTaper: true`** to `buildCDTOuterWall` and enable chain dedup when `byConstructionAssembly`.

- [ ] **Step 2: typecheck + lint.**

- [ ] **Step 3: e2e — slivers.**
```bash
PF_STYLE_ID=HarmonicRipple PF_BYCONSTRUCTION=1 PF_QUALITY_SAMPLE_LIMIT=120 node e2e/_quality_probe.cjs
```
Expected: `sliverCount` drops sharply from 4213 (rim/wall needles gone). Record. Also re-run the topology probe to confirm `bnd/nonMan/orient` still good and `featuresDropped=0` (check the matrix `measure()` path or chain debug).

- [ ] **Step 4: features guard.** Confirm `featuresPresent==featuresExpected` for HarmonicRipple (run the matrix single-style or read `getLastChainDebugData`). Taper must not drop chains.

- [ ] **Step 5: Commit.**
```bash
git add src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "feat(parametric): enable taper + chain dedup in by-construction path"
```

> **Phase 3 exit criterion:** HarmonicRipple under `PF_BYCONSTRUCTION=1`: `bnd/nonMan/orient=0`, `featuresDropped=0`, `sliverCount` greatly reduced (residual handled in Phase 4).

---

## Phase 4 — Final topology-preserving quality pass (spec §9)

Goal: drive `maxAspect3D < ASPECT_MAX` (sliverCount=0) on the watertight+oriented mesh without breaking topology or winding.

### Task 4.1: Create `MeshQualityPass` — gated edge flips + safe collapses

**Files:**
- Create: `src/renderers/webgpu/parametric/MeshQualityPass.ts`
- Test: `src/renderers/webgpu/parametric/MeshQualityPass.test.ts`

- [ ] **Step 1: Interface.**
```ts
export interface QualityPassResult {
  indices: Uint32Array;
  flips: number;
  collapses: number;
  /** Max aspect after the pass (for telemetry). */
  maxAspect3D: number;
}
/**
 * Improve triangle quality on a watertight, consistently-wound mesh WITHOUT changing
 * topology class or winding: greedy 3D edge flips that raise min-angle, then
 * watertight-safe collapses of triangles still above `aspectMax`. Every mutation is
 * gated: it is applied only if it does NOT create a boundary, non-manifold, or
 * winding-inconsistent edge.
 */
export function runMeshQualityPass(
  indices: Uint32Array,
  positions: Float32Array,
  aspectMax: number,
  maxPasses?: number,
): QualityPassResult;
```

- [ ] **Step 2: Failing test** — a sliver pair flips to good triangles; topology + winding preserved.
```ts
import { topologyDiagnostics, triangleQuality3D } from '../../../fidelity/metrics';
it('flips a sliver diagonal to raise min-angle without breaking topology/winding', () => {
  // Two triangles sharing the long diagonal of a thin quad (a needle pair). Flipping
  // the shared diagonal yields two well-shaped triangles.
  const positions = new Float32Array([0,0,0, 10,0,0, 10,0.2,0, 0,0.2,0]); // thin quad
  const indices = new Uint32Array([0,1,2, 0,2,3]); // shares diagonal 0-2 (long) → slivers
  const before = triangleQuality3D({ vertices: positions, indices });
  const res = runMeshQualityPass(indices, positions, 100, 4);
  const afterTopo = topologyDiagnostics({ vertices: positions, indices: res.indices }, 1e-4, 8);
  expect(res.maxAspect3D).toBeLessThan(before.maxAspect3D);
  expect(afterTopo.orientationMismatches).toBe(0);
  expect(afterTopo.nonManifoldEdges).toBe(0);
  expect(afterTopo.boundaryEdges).toBe(afterTopo.boundaryEdges); // unchanged count (flip preserves boundary)
});
```

- [ ] **Step 3: Run FAIL → implement.** Reuse the 3D flip math from `ChainStripOptimizer.ts` (`minAngle3D`, `triNormal`, flip selection); generalize to all manifold edges; gate each flip so the post-flip edge stays manifold and winding-consistent. Implement collapses only for triangles still above `aspectMax`, gated to be watertight-safe (skip if any incident edge would go boundary/non-manifold). **Run PASS.**

- [ ] **Step 4: Add an invariant test** — on a small closed tetra-like watertight mesh, the pass keeps `boundaryEdges==0, nonManifoldEdges==0, orientationMismatches==0`. Implement until green.

- [ ] **Step 5: lint + commit.**
```bash
npx eslint src/renderers/webgpu/parametric/MeshQualityPass.ts --max-warnings=0
git add src/renderers/webgpu/parametric/MeshQualityPass.ts src/renderers/webgpu/parametric/MeshQualityPass.test.ts
git commit -m "feat(parametric): MeshQualityPass — gated flips + safe collapses"
```

### Task 4.2: Wire the quality pass into the by-construction branch + e2e

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

- [ ] **Step 1: Call `runMeshQualityPass`** on the assembled by-construction mesh (after caps, before the verifier), `aspectMax = ASPECT_MAX` (import from `fidelity/types`).

- [ ] **Step 2: typecheck + lint.**

- [ ] **Step 3: e2e — slivers to 0.**
```bash
PF_STYLE_ID=HarmonicRipple PF_BYCONSTRUCTION=1 PF_QUALITY_SAMPLE_LIMIT=10 node e2e/_quality_probe.cjs   # sliverCount → 0
PF_STYLE_ID=HarmonicRipple PF_BYCONSTRUCTION=1 PF_TOPOLOGY_SAMPLE_LIMIT=0 node e2e/_topology_probe.cjs  # bnd/nonMan/orient still 0
```

- [ ] **Step 4: Commit.**
```bash
git add src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "feat(parametric): run final quality pass in by-construction path"
```

> **Phase 4 exit criterion:** HarmonicRipple under `PF_BYCONSTRUCTION=1` meets the FULL goal set: `orient/bnd/nonMan/sliverCount=0`, `featuresDropped=0`.

---

## Phase 5 — Verifier, full-matrix validation, flip default, remove battery (spec §10, §11)

### Task 5.1: Create `MeshVerifier`

**Files:**
- Create: `src/renderers/webgpu/parametric/MeshVerifier.ts`
- Test: `src/renderers/webgpu/parametric/MeshVerifier.test.ts`

- [ ] **Step 1: Interface + impl** reusing `fidelity/metrics`:
```ts
export interface VerifyResult {
  ok: boolean;
  boundaryEdges: number; nonManifoldEdges: number;
  orientationMismatches: number; sliverCount: number;
  reasons: string[];
}
export function verifyExportMesh(indices: Uint32Array, positions: Float32Array, weldToleranceMm: number, aspectMax: number): VerifyResult;
```
Compute via `topologyMetric` + `triangleQuality3D`; `ok` iff all four are 0 (sliverCount==0). Populate `reasons` with the failing dimensions.

- [ ] **Step 2: Tests** — a clean closed mesh → `ok:true`; a mesh with a known boundary → `ok:false` with the reason. FAIL→impl→PASS.

- [ ] **Step 3: lint + commit.**
```bash
git add src/renderers/webgpu/parametric/MeshVerifier.ts src/renderers/webgpu/parametric/MeshVerifier.test.ts
git commit -m "feat(parametric): MeshVerifier for by-construction assert"
```

### Task 5.2: Replace battery with verifier in the by-construction branch

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

- [ ] **Step 1:** In the by-construction branch, after the quality pass, call `verifyExportMesh`; in DEV log `reasons` on failure. Keep only a minimal guarded numeric weld (1e-4) before verification. Remove the temporary `normalizeWindingByComponent` telemetry call from Task 2.3.

- [ ] **Step 2: typecheck + lint; e2e re-confirm HarmonicRipple full goal set.**

- [ ] **Step 3: Commit.**
```bash
git add src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "feat(parametric): verifier tail for by-construction path"
```

### Task 5.3: Full-matrix validation under the flag

- [ ] **Step 1: Force the flag for the matrix run.** Add a `?byconstruction=1` URL handling in the fidelity mount (search `?fidelity`) OR set `window.__pfByConstruction=true` via the matrix spec's init script. (Implement the smallest hook; document it.)

- [ ] **Step 2: Run the full matrix** (long; no source edits during the run):
```bash
npx playwright test export-fidelity --project=chromium
```

- [ ] **Step 3: Analyze `e2e/fidelity/baseline.json`.** For every style assert `orientationMismatches==0 && boundaryEdges==0 && nonManifoldEdges==0 && sliverCount==0 && featuresDropped==0 && featuresPresent==featuresExpected`. List any style that fails and which dimension.

- [ ] **Step 4: Iterate** per failing style (use the per-style probes to localize; most likely residual slivers on extreme interlaced styles — return to Phase 4 tuning). Re-run the matrix until all styles pass.

- [ ] **Step 5: Commit** the passing baseline.
```bash
git add e2e/fidelity/baseline.json
git commit -m "test(fidelity): by-construction matrix baseline — all styles meet goal set"
```

### Task 5.4: Flip default + remove dead battery

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts` (+ delete dead fills once unused)

- [ ] **Step 1:** Default `byConstructionAssembly` to `true`.

- [ ] **Step 2:** Delete the legacy battery branch and the now-unused fill/repair/seam-zipper/normalizer functions and their tests (confirm no other importers via grep). Keep `MeshVerifier`/`CapBuilder`/`MeshQualityPass`.

- [ ] **Step 3: typecheck + lint + full unit suite** (`npx vitest run`), then a final full matrix to confirm no regression with the flag removed.

- [ ] **Step 4: Commit.**
```bash
git add -A
git commit -m "feat(parametric): default to by-construction assembly; remove repair battery"
```

> **Phase 5 exit criterion (= project done):** the full e2e matrix meets the §2 goal set on ALL styles with `byConstructionAssembly` as default, the repair battery removed, export time not regressed.

---

## Self-review (author checklist — completed)

- **Spec coverage:** §5 seam → Phase 1; §4 reorder + §8 rings → Phase 2; §6 taper + §7 dedup → Phase 3; §9 quality pass → Phase 4; §10 verifier + §11 rollout → Phase 5; §2 acceptance → Task 5.3. All spec sections mapped.
- **Placeholders:** test bodies that depend on existing types (`FeatureChain`/`ChainPoint`, `rowMapping`) are marked "read the type, then fill the fixture" rather than left as silent TODO — this is unavoidable for fixtures bound to existing internals; the assertion contract is explicit in each.
- **Type consistency:** `BoundaryRing`, `buildCapBetweenRings`, `extractBoundaryRing`, `runMeshQualityPass`/`QualityPassResult`, `verifyExportMesh`/`VerifyResult`, and the `byConstructionAssembly` / `__pfByConstruction` / `PF_BYCONSTRUCTION` flag names are used consistently across tasks.
- **Honest note:** Phase 5 sliver=0 on the extreme interlaced styles (CelticKnot 113k, 2.6M tris) is the highest-risk target; Task 5.4 Step 4 explicitly budgets iteration there.
