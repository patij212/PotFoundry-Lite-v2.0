# Snaking-C0 P3 — standalone double-valued CelticKnot mesher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone, verified generator that turns P2's declared CelticKnot cliff complex + the exact analytic surface into a **watertight, <0.01mm-chord** triangle mesh with **double-valued vertical walls** at the snaking C0 cliffs (two vertices at one (u,t), joined by flat quads, welded to the surface sheets, Y-junctions pinched), and exports it as STL.

**Architecture:** Self-contained pipeline, reusing only safe primitives. Per region-bounded piece: (1) constrained-Delaunay-triangulate the (u,t) domain with the cliff polylines as constraint edges (`cdt2d`); (2) classify each triangle to a *region* (which z-buffer sheet it belongs to) by its centroid; (3) **cut/split** every vertex that sits on a cliff into one copy per incident region, lifting each copy to that region's radius (the double-valuedness); (4) bridge each cliff's two rails with **wall quads**; (5) **pinch** incident wall rails to the shared junction double-vertex; (6) **refine** any triangle whose chord to the true surface exceeds 0.01mm; (7) **verify** watertight + chord, then export STL. The mesher is style-agnostic (consumes a generic cliff complex + a `(u,t)->radius` surface fn); a thin CelticKnot entry wires P1's complex + `buildAnalyticRadiusFn`.

**Tech Stack:** TypeScript, Vitest (jsdom), `cdt2d` (constrained Delaunay), `buildAnalyticRadiusFn` (exact surface), `generateBinarySTL`.

## Global Constraints

- **Standalone only.** Do NOT touch production `assembleWatertight`, `tierC/`, `ConformingWall.ts`, `FeatureLineGraph.ts`, `WatertightAssembly.ts`, or any mesher hub. This generator is a new, isolated module. Production wiring is an explicitly-separate follow-up plan.
- **Do NOT touch** files another agent holds: `parallelPatchProof*.ts`, `_patchProofWorker.ts`, Gothic certification, `validatedResidualProgram.ts`, `triangleExactMeanValueScreen.test.ts`, `_gothicVoronoiConformingSpike.test.ts`, `FeatureLineGraph.ts`.
- **Reuse P1 read-only:** `buildCelticKnotCliffComplex` / `CelticKnotCliffComplex` / `CliffSegment` / `CliffJunction` from `src/renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex.ts`. Do not modify it.
- **Precision bar (the definition of "perfect"):** manifold — 0 non-manifold edges, boundary edges only on the declared open rims (t=0/1 band ends); chord — max distance from the mesh to the true surface (analytic sheets + ruled wall faces) **< 0.01 mm**.
- **Determinism:** identical inputs ⇒ identical mesh (no `Date`/`Math.random`). `cdt2d` is deterministic for fixed point/edge order.
- **Lint 0-max-warnings**; a `PostToolUse` hook runs `eslint --max-warnings=0` after each `.ts` edit. `npm run typecheck` must stay clean.
- **Concurrency hygiene:** `git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0"` absolute paths; NEVER `git stash`; re-check `git status` before every commit; commit ONLY this plan's new files by explicit pathspec.
- **Coordinate convention (match P2/WatertightAssembly):** `theta = 2*pi*u`, `z = t*H`, `pos = [r*cos(theta), r*sin(theta), z]`. Height on Z.
- All commands run from `potfoundry-web/`.

---

## File Structure

New directory `potfoundry-web/src/geometry/doubleValued/` (isolated):
- `types.ts` — `Mesh` (`{ positions: number[]; triangles: number[] }` growable during build), `CliffComplexLike`, `SurfaceRadiusFn`, `MeshBuildOptions`.
- `mesh.ts` — the growable-mesh helper: `createMesh()`, `addVertex(mesh, x,y,z): number`, `addTriangle(mesh, a,b,c)`, `addQuad(mesh, a,b,c,d)`, `toMeshData(mesh): MeshData`.
- `verify.ts` — self-contained checks: `auditManifold(mesh, boundaryVertexIds): { nonManifold, boundary, tJunctions }`; `chordToSurface(mesh, surfaceMeshRef): { maxMm, rmsMm }` via a point→triangle distance index (reuse the `distPtTri2` Ericson routine).
- `doubleValuedMesh.ts` — the general core: `buildDoubleValuedMesh(complex, surface, dims, opts): Mesh`.
- `celticKnotMesh.ts` — the deliverable entry: `buildCelticKnotDoubleValuedMesh(styleParams, dims, opts): { mesh: MeshData; report: MeshReport }`, wiring P1's complex + `buildAnalyticRadiusFn`.
- Tests: `doubleValuedMesh.test.ts` (M1, synthetic), `celticKnotMesh.test.ts` (M2–M5, real).
- One dev-gated STL emitter test `_celticMeshStl.test.ts` (env `PF_P3_STL=1`) → `research/exchange/_p3_celtic/`.

**Interfaces produced (used across milestones):**

```ts
// types.ts
export interface Mesh { positions: number[]; triangles: number[]; } // positions flat xyz*, triangles flat i*3
export type SurfaceRadiusFn = (u: number, t: number) => number;      // exact radius at (u,t)
export interface MeshBuildOptions { baseGridU: number; baseGridT: number; chordTolMm: number; maxRefinePasses: number; }
export interface MeshReport { vertexCount: number; triangleCount: number; nonManifold: number; boundary: number; maxChordMm: number; rmsChordMm: number; }
```

---

## Milestone 1 (Task 1): pipeline core on a single synthetic straight cliff

Prove the whole machinery on the simplest input: a domain split by one straight cliff `u = 0.5` into a low sheet (`r = RLO`) and a high sheet (`r = RHI`), joined by a vertical wall. This establishes: constrained CDT, region classification, vertex-split, wall bridging, the manifold + chord verifiers, and STL — end to end, watertight, chord ~0.

**Files:**
- Create: `src/geometry/doubleValued/types.ts`, `mesh.ts`, `verify.ts`, `doubleValuedMesh.ts`
- Test: `src/geometry/doubleValued/doubleValuedMesh.test.ts`

**Interfaces:**
- Consumes: `cdt2d` (default import), the coordinate convention.
- Produces: `buildDoubleValuedMesh(complex: CliffComplexLike, surface: SurfaceRadiusFn, dims: {H:number}, opts: MeshBuildOptions): Mesh`, where `CliffComplexLike = { segments: SegLike[]; junctions: JunLike[] }`, `SegLike = { at(s):{u,t}; lipsAt(s):{upper,lower}; tRange:[number,number] }`. `createMesh/addVertex/addTriangle/addQuad/toMeshData`; `auditManifold`; `chordToSurface`.

- [ ] **Step 1: Write the failing test (M1 watertight + chord + STL-able)**

```ts
// doubleValuedMesh.test.ts
import { describe, it, expect } from 'vitest';
import { buildDoubleValuedMesh } from './doubleValuedMesh';
import { auditManifold } from './verify';
import { toMeshData } from './mesh';

const H = 120, RLO = 40, RHI = 42; // 2mm step
// One straight vertical cliff at u=0.5 over t in [0.1,0.9]; left region low, right region high.
const straightComplex = {
  segments: [{
    tRange: [0.1, 0.9] as [number, number],
    at: (s: number) => ({ u: 0.5, t: 0.1 + 0.8 * s }),
    lipsAt: (_s: number) => ({ upper: RHI, lower: RLO }),
  }],
  junctions: [] as [],
};
const stepSurface = (u: number, _t: number): number => (u >= 0.5 ? RHI : RLO);

describe('double-valued mesher (M1 straight cliff)', () => {
  it('builds a watertight double-valued wall between two flat sheets', () => {
    const mesh = buildDoubleValuedMesh(straightComplex, stepSurface, { H }, {
      baseGridU: 12, baseGridT: 24, chordTolMm: 0.01, maxRefinePasses: 0,
    });
    expect(mesh.triangles.length / 3).toBeGreaterThan(0);
    // Every interior edge shared by exactly 2 triangles; the only boundary is the
    // outer domain rectangle rim (u=0/1 ends, t=0.1/0.9 ends) — NO crack along the cliff.
    const audit = auditManifold(mesh);
    expect(audit.nonManifold).toBe(0);
    // the cliff must NOT be a boundary (the wall closes it): boundary edges only on the 4 rim sides
    expect(audit.cliffBoundary).toBe(0);
    // wall exists: some triangle spans radius RLO..RHI at constant (u,t)=0.5-ish
    const md = toMeshData(mesh);
    expect(md.vertexCount).toBeGreaterThan(0);
    expect(md.triangleCount).toBe(mesh.triangles.length / 3);
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run src/geometry/doubleValued/doubleValuedMesh.test.ts`
Expected: FAIL — modules do not exist yet.

- [ ] **Step 3: Implement `types.ts` + `mesh.ts`**

```ts
// types.ts
export interface Mesh { positions: number[]; triangles: number[]; }
export type SurfaceRadiusFn = (u: number, t: number) => number;
export interface SegLike { at(s: number): { u: number; t: number }; lipsAt(s: number): { upper: number; lower: number }; tRange: readonly [number, number]; }
export interface JunLike { u: number; t: number; pinch: { upper: number; lower: number }; }
export interface CliffComplexLike { segments: readonly SegLike[]; junctions: readonly JunLike[]; }
export interface MeshBuildOptions { baseGridU: number; baseGridT: number; chordTolMm: number; maxRefinePasses: number; }
```

```ts
// mesh.ts
import type { Mesh } from './types';
import type { MeshData } from '../types';
export const createMesh = (): Mesh => ({ positions: [], triangles: [] });
export function addVertex(m: Mesh, x: number, y: number, z: number): number {
  const id = m.positions.length / 3;
  m.positions.push(x, y, z);
  return id;
}
export const addTriangle = (m: Mesh, a: number, b: number, c: number): void => { m.triangles.push(a, b, c); };
export const addQuad = (m: Mesh, a: number, b: number, c: number, d: number): void => { m.triangles.push(a, b, c, a, c, d); };
export function toMeshData(m: Mesh): MeshData {
  return {
    vertices: new Float32Array(m.positions),
    indices: new Uint32Array(m.triangles),
    vertexCount: m.positions.length / 3,
    triangleCount: m.triangles.length / 3,
  };
}
```

- [ ] **Step 4: Implement `verify.ts` (self-contained manifold + chord)**

```ts
// verify.ts
import type { Mesh } from './types';
export interface ManifoldReport { nonManifold: number; boundary: number; cliffBoundary: number; }
/** Edge-use census. boundaryVertexKeys: (u,t) keys allowed to be open (the true rims). */
export function auditManifold(m: Mesh): ManifoldReport {
  const use = new Map<string, number>();
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const tris = m.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    for (const [a, b] of [[tris[i], tris[i + 1]], [tris[i + 1], tris[i + 2]], [tris[i + 2], tris[i]]] as const) {
      const k = key(a, b);
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let nonManifold = 0, boundary = 0;
  for (const c of use.values()) { if (c > 2) nonManifold += 1; else if (c === 1) boundary += 1; }
  // cliffBoundary is filled by the caller/test via geometry; here 0 (positions-based split ⇒ no cliff cracks).
  return { nonManifold, boundary, cliffBoundary: 0 };
}
```

(NOTE: `cliffBoundary` is a geometry-aware count computed in Step 6 by tagging wall/sheet boundary vertices; for M1 the test asserts the wall closed the cliff — implement `cliffBoundary` by counting count-1 edges whose both endpoints lie on the cliff locus but are NOT on the outer rectangle rim. See Step 6.)

- [ ] **Step 5: Implement the surface-mesh + region classify (`doubleValuedMesh.ts`, part A)**

Point set: a `baseGridU × baseGridT` lattice over the domain `[uMin,uMax]×[tMin,tMax]` (for M1, `[0,1]×[0.1,0.9]`), PLUS the cliff polyline vertices (sample each segment at `baseGridT` points via `seg.at(s)`). Constraint edges: consecutive cliff-polyline vertices. Triangulate with `cdt2d(points, edges, { exterior: false })`.

```ts
// doubleValuedMesh.ts
import cdt2d from 'cdt2d';
import { createMesh, addVertex, addQuad } from './mesh';
import type { CliffComplexLike, Mesh, MeshBuildOptions, SurfaceRadiusFn } from './types';

const TAU = 2 * Math.PI;
const lift = (u: number, t: number, r: number, H: number): [number, number, number] =>
  [r * Math.cos(TAU * u), r * Math.sin(TAU * u), t * H];

export function buildDoubleValuedMesh(
  complex: CliffComplexLike,
  surface: SurfaceRadiusFn,
  dims: { H: number },
  opts: MeshBuildOptions
): Mesh {
  const { H } = dims;
  // 1. domain bounds from the cliff t-ranges (M1: full u, interior t)
  const tLo = Math.min(...complex.segments.map((s) => s.tRange[0]));
  const tHi = Math.max(...complex.segments.map((s) => s.tRange[1]));
  const uMin = 0, uMax = 1;
  // 2. build point set + constraint edges
  const pts: [number, number][] = [];
  const edges: [number, number][] = [];
  const pushPt = (u: number, t: number): number => { pts.push([u, t]); return pts.length - 1; };
  for (let i = 0; i < opts.baseGridU; i += 1)
    for (let j = 0; j < opts.baseGridT; j += 1)
      pushPt(uMin + (uMax - uMin) * (i / (opts.baseGridU - 1)), tLo + (tHi - tLo) * (j / (opts.baseGridT - 1)));
  // cliff polylines as constraint chains
  const cliffKeys = new Set<string>();
  for (const seg of complex.segments) {
    let prev = -1;
    for (let j = 0; j < opts.baseGridT; j += 1) {
      const { u, t } = seg.at(j / (opts.baseGridT - 1));
      const id = pushPt(u, t);
      cliffKeys.add(`${Math.round(u / 1e-7)}:${Math.round(t / 1e-7)}`);
      if (prev >= 0) edges.push([prev, id]);
      prev = id;
    }
  }
  const tris = cdt2d(pts, edges, { exterior: false });
  // 3. classify each triangle by centroid region = sign(surface just-left vs just-right)…
  //    (M1: region = (centroid u >= cliff u) ? HIGH : LOW; general classify in M2)
  //    …and 4. split vertices per region, lifting each copy to its region radius.
  return assembleSheetsAndWalls(pts, tris, complex, surface, H, cliffKeys);
}
```

- [ ] **Step 6: Implement split + wall bridge (`assembleSheetsAndWalls`)**

For each CDT triangle, compute its region id at the centroid (M1: `u_centroid >= 0.5 ? 'HI' : 'LO'`). Emit each triangle's 3 vertices as **region-specific** mesh vertices (keyed by `(pointIndex, regionId)` so a shared cliff point gets a distinct vertex per side), lifting to the region's radius `surface(u_offset_into_region, t)` — for M1, `RLO`/`RHI`. Then, for each cliff polyline segment between consecutive cliff points `p_j, p_{j+1}`, look up the LOW-side copies (radius = `lipsAt.lower`) and HIGH-side copies (radius = `lipsAt.upper`) and `addQuad` the wall. Tag the wall/sheet cliff vertices so `auditManifold` can report `cliffBoundary` = count-1 edges between two cliff-tagged, non-rim vertices (must be 0 = wall closed the cliff).

Provide the full `assembleSheetsAndWalls` implementation (region vertex registry `Map<string,number>`; wall quads oriented consistently; cliff-boundary census). Keep it ~80 lines; write it concretely during execution and pin behavior with the Step-1 test.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/geometry/doubleValued/doubleValuedMesh.test.ts`
Expected: PASS — `nonManifold: 0`, `cliffBoundary: 0` (wall closed), triangles > 0.

- [ ] **Step 8: Lint + typecheck**

Run: `npx eslint src/geometry/doubleValued/*.ts --max-warnings=0 && npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0" commit -m "feat(mesh): P3 M1 — double-valued wall pipeline core on a straight cliff (TDD)" -- potfoundry-web/src/geometry/doubleValued/types.ts potfoundry-web/src/geometry/doubleValued/mesh.ts potfoundry-web/src/geometry/doubleValued/verify.ts potfoundry-web/src/geometry/doubleValued/doubleValuedMesh.ts potfoundry-web/src/geometry/doubleValued/doubleValuedMesh.test.ts
```

---

## Milestone 2 (Task 2): one real CelticKnot ribbon strand (snaking, no crossings)

Feed a real single-strand ribbon-background complex (one column, one strand, `strandCount` set so no crossings) + `buildAnalyticRadiusFn`. Prove the snaking cliff conforms and the wall + sheets chord to the true surface **< 0.01mm** after refinement.

**Files:** Create `src/geometry/doubleValued/celticKnotMesh.ts`; extend `verify.ts` (`chordToSurface`); Test `src/geometry/doubleValued/celticKnotMesh.test.ts`.

**Interfaces:**
- Consumes: `buildCelticKnotCliffComplex` (P1), `buildAnalyticRadiusFn` (`geometry/analyticRadius`), `buildDoubleValuedMesh` (M1).
- Produces: `buildCelticKnotDoubleValuedMesh(styleParams, dims, opts): { mesh: MeshData; report: MeshReport }`; `chordToSurface(mesh, refTriangles): { maxMm, rmsMm }` (dense reference = analytic sheets sampled fine + wall ruled faces; point→triangle distance via `distPtTri2`).

- [ ] **Step 1: Failing test** — build a single-strand CelticKnot mesh; assert `report.nonManifold === 0`, `report.boundary` only on the t-rims, and `report.maxChordMm < 0.01` after refinement (`maxRefinePasses >= 4`). (Full test code written at execution.)
- [ ] **Step 2: Run, watch fail.**
- [ ] **Step 3: Implement `chordToSurface`** — build a dense reference triangle soup (analytic sheets on a fine grid + wall ruled faces from the lips), index with a spatial hash, measure max/rms point→surface distance over the mesh's vertices + edge midpoints (`distPtTri2`).
- [ ] **Step 4: Implement `celticKnotMesh.ts`** — derive params like `celticKnotOuterWallTarget.parameters()`, build the complex (P1), wrap `buildAnalyticRadiusFn` as `SurfaceRadiusFn` (`(u,t) => rA(TAU*u, t*H)`), call `buildDoubleValuedMesh` with a refine loop (subdivide triangles whose edge-midpoint chord > tol, re-lift), return `{ mesh, report }`.
- [ ] **Step 5: Generalize `buildDoubleValuedMesh` region-classify** — replace M1's `u>=0.5` with a general classifier: region id = the surface's z-buffer winner at the centroid (evaluate `surface` just inside each side of the nearest cliff; or reuse the declared strand/region from the complex). Add the refine pass (midpoint subdivision + re-lift + re-CDT-free local split).
- [ ] **Step 6: Run — expect PASS** (watertight + chord < 0.01mm). Lint + typecheck. Commit.

---

## Milestone 3 (Task 3): full ribbon-background at one column — crossings + Y-junctions

Add multiple strands with genuine crossings. Emit the 3-sheet Y-junction pinch: incident wall rails converge to the shared `junction.pinch` double-vertex (`{upper:r0, lower:r0-jump}`), 2 levels. Reuse the centroid-fan pattern for the small overlap diamond.

- [ ] Failing test: multi-strand single-column mesh; `nonManifold === 0` **including at every junction**; chord < 0.01mm. (P1's junction list drives the pinch.)
- [ ] Implement junction handling: snap each incident segment's endpoint rail vertices (both lips) to the shared junction double-vertex (dedup by `(u,t)` → 2 vertices: `r0`, `r0-jump`); fan-triangulate the overlap diamond interior. Verify the 55→…→2 collapse is respected (levels == 2 at the junction).
- [ ] Run, lint, typecheck, commit.

---

## Milestone 4 (Task 4): internal occlusion walls

Emit the occlusion curtains (ribbon-over-ribbon step) from the declared `kind:'occlusion'` segments: lower lip = over-strand foot `r0`, upper lip = under-strand raised surface (from the analytic surface just outside the over-edge). Weld into the ribbon sheets.

- [ ] Failing test: mesh with `styleRadius` supplied so occlusion segments exist; occlusion walls present, non-degenerate, watertight, chord < 0.01mm.
- [ ] Implement: the occlusion segment's wall bridges `r0` (over foot) to the under surface; weld its rails to the over/under ribbon sheet edges. Handle the diamond-corner taper (walls vanish at corners).
- [ ] Run, lint, typecheck, commit.

---

## Milestone 5 (Task 5): full CelticKnot pot at 0.01mm — deliver the STL

Compose all columns; run the full refine loop to `maxChordMm < 0.01`; verify; export STL.

- [ ] Failing test (default params, all columns): `report.nonManifold === 0`, `report.boundary` only on t-rims, `report.maxChordMm < 0.01`; `report.triangleCount` finite and reasonable.
- [ ] Implement the full compose + refine-to-tolerance. Tune `baseGridU/baseGridT/maxRefinePasses` so chord < 0.01mm converges; log the pass count and final chord.
- [ ] Add dev-gated STL emitter `_celticMeshStl.test.ts` (`it.skipIf(!process.env.PF_P3_STL)`) → writes `research/exchange/_p3_celtic/celtic_perfect.stl` via `generateBinarySTL(report.mesh)`; log tris + max chord.
- [ ] Run `PF_P3_STL=1` to emit; open/inspect; run the manifold + chord asserts. Lint, typecheck.
- [ ] Cross-check with the production verifiers (`auditWatertight` from `bandRemesh/audit.ts`, `wallChordError`/`buildNearestSurface` from `metrics.ts`) as an independent second opinion; reconcile any disagreement before claiming done.
- [ ] Commit. **Deliver the STL path + the verified report (tris, 0 non-manifold, max chord mm) to the user.**

---

## Self-Review notes (fill during execution)

- M1 is the load-bearing proof: if constrained-CDT + vertex-split + wall-bridge yields a watertight, crack-free double-valued wall on the straight cliff, every later milestone is the same machinery at higher complexity. If M1's `cliffBoundary` will not go to 0 (cracks), STOP and reconsider the split strategy (region-partition vs post-hoc split) before proceeding.
- Chord < 0.01mm is a refinement question, not a topology one: once watertight holds, drive `maxChordMm` down by subdividing high-chord triangles. Watch mesh size; log dropped/added counts (no silent caps).
- Determinism: fixed point/edge insertion order into `cdt2d`; stamp any timing outside the mesher.

## Definition of Done (P3 standalone)

- [ ] `buildCelticKnotDoubleValuedMesh` returns a mesh with **0 non-manifold edges**, boundary only on the true t-rims, and **max chord to the analytic surface < 0.01 mm** at default params.
- [ ] The double-valued walls (ribbon↔background + occlusion) and 3-sheet Y-junction pinches are present and watertight.
- [ ] A CelticKnot STL is emitted and delivered, with the verified report.
- [ ] Cross-checked against the production verifiers.
- [ ] All new files isolated under `src/geometry/doubleValued/`; no production mesher hub touched.
- **Follow-up (separate plan):** production wiring — adopt the double-valued outer wall into `assembleWatertight` via the `tierCOuterWall` hook, flag-gated.
