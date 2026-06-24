# Feature-Aligned Band Remesh — Implementation Plan (Phase 0: de-risk spike + paver core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pave a Voronoi relief web ribbon with band-following triangles (advancing front between two pinned rail curves), watertight-by-construction, proving the watertight stitch + triple junction on synthetic cases before any production integration.

**Architecture:** A new, isolated, GPU-free `bandRemesh` module meshes the region between two rail polylines (foot `f2−f1=th` + crest `f2−f1=th·frac`) with metric-sized band-following triangles. The existing dyadic quadtree meshes the complement; the two share the rail vertices. This Phase 0 builds + tests the paver and the watertight stitch on SYNTHETIC ribbons (no production code touched yet); it is the spike that GATES the real integration (Phase 1, separate plan) and can abort to fallback Approach A.

**Tech Stack:** TypeScript, Vitest (jsdom, no WebGPU), existing conforming-mesher modules (`SurfaceSampler`, `SurfaceMetricTensor`, `FeatureConformingTriangulator` audit patterns), Playwright (GPU render, Phase 1 only).

## Global Constraints (verbatim from spec, apply to every task)

- Watertight: `boundaryEdges=0`, `nonManifoldEdges=0`, `orientationMismatches=0` — must hold on every produced mesh.
- Edge-wobble ≤ **0.02mm**; near-feature facet (perp-3D) ≤ **0.02mm**; ribbon triangle worst 3D aspect ≤ **4**; **zero** ribbon triangles with min interior angle < 10°; ribbon min-angle p50 ≥ **30°**.
- **Density-invariant:** every quality gate must hold at BOTH featureLevel 7 and 11 (the slivers are currently density-invariant; the fix must be too).
- Phase 0 touches NO production code — only new files under `potfoundry-web/src/fidelity/bandRemesh/`. Production stays byte-identical.
- ESLint 0 warnings (the PostToolUse hook enforces it). Run `gitnexus impact` before editing any existing symbol (Phase 1); `detect_changes` before any commit that touches production.
- Reuse, don't reinvent: the wall edge audit from `FeatureConformingTriangulator.test.ts`, the (u,t)→mm scaling + analytic samplers from `verify_voronoiCelticFeatureFlow.test.ts`, `firstFundamentalForm` from `SurfaceMetricTensor.ts`.

**Spike gate (the whole point of Phase 0):** after Task 6, the synthetic ribbon + triple junction must meet ALL the quality + watertight constraints above. If the watertight stitch (Task 5) cannot be made clean, STOP and report — fall back to Approach A (per-cell strip fill) in a revised plan. Do not proceed to Phase 1 on a failing gate.

---

### Task 1: Audit + measurement utilities (`bandRemesh/audit.ts`)

**Files:**
- Create: `potfoundry-web/src/fidelity/bandRemesh/audit.ts`
- Test: `potfoundry-web/src/fidelity/bandRemesh/audit.test.ts`

**Interfaces:**
- Produces: `Mesh3 = { positions: Float32Array /*flat xyz*/, indices: Uint32Array }`;
  `auditWatertight(m: Mesh3, opts?: {openT?: 'none'}): { boundaryEdges: number; nonManifoldEdges: number; tJunctions: number }`;
  `triangleQuality3D(m: Mesh3): { aspectMax: number; pctMinAngleBelow10: number; minAngleP50: number }`;
  `lateralWobbleMm(boundary: Array<[number,number]> /*(u,t)*/, locus: (u:number)=>[number,number], uToMm: number, tToMm: number): { p99: number; max: number }`.

- [ ] **Step 1: Write failing tests.** A known-watertight closed double-triangle quad strip → `auditWatertight` returns `0,0,0`. A strip with one triangle's shared edge split (a deliberate T-junction) → `tJunctions ≥ 1`. An equilateral-ish triangle → `triangleQuality3D.aspectMax ≈ 1.15`, `minAngleP50 ≈ 60`; a 30:1 needle → `aspectMax > 20`, `pctMinAngleBelow10 = 100`. A boundary polyline offset 0.03mm from a straight locus → `lateralWobbleMm.max ≈ 0.03`.

```ts
import { describe, it, expect } from 'vitest';
import { auditWatertight, triangleQuality3D, lateralWobbleMm } from './audit';
// closed octahedron-ish or a welded quad torus strip for 0/0/0; see helper below
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/fidelity/bandRemesh/audit.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement.** `auditWatertight`: build an undirected edge map keyed by sorted vertex-index pair; count==1 → boundary (T-junction if both endpoints are interior, reusing the `wallEdgeAudit` logic from `FeatureConformingTriangulator.test.ts:55-90` — copy, don't import a test file), count>2 → non-manifold; orientation via directed-edge parity. `triangleQuality3D`: per triangle, 3D side lengths from `positions`; aspect = `longest^2 / (2·sqrt3·area)`; min interior angle via law of cosines; aggregate. `lateralWobbleMm`: for each boundary point, perpendicular distance to the locus (sample the locus densely, nearest-segment), scaled by `uToMm`/`tToMm`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git add src/fidelity/bandRemesh/audit.ts src/fidelity/bandRemesh/audit.test.ts && git commit -m "test(bandRemesh): watertight + triangle-quality + edge-wobble audit utilities"`

---

### Task 2: Crest rail extraction (`bandRemesh/rails.ts`)

**Files:**
- Create: `potfoundry-web/src/fidelity/bandRemesh/rails.ts`
- Test: `potfoundry-web/src/fidelity/bandRemesh/rails.test.ts`

**Interfaces:**
- Consumes: `voronoiWebField`-style scalar (replicate the f64 worley `f2−f1` from `FeatureLineGraph.ts:651` in the test, OR export a parameterized `voronoiSdf(u,t,p)` returning `f2−f1` — prefer a tiny new export `voronoiCellSdf` so the rail uses production math). `marchingSquaresZero` + `segmentsToPolylines` (`SampledFeatureExtractor.ts`).
- Produces: `extractRails(p: Float32Array, opts: { footFrac: number; crestFrac: number; resU: number; resT: number; dpTol: number }): { foot: FeatureLine[]; crest: FeatureLine[] }` — foot at `f2−f1=th·footFrac` (footFrac=1.0), crest at `f2−f1=th·crestFrac` (crestFrac=0.15).

- [ ] **Step 1: Write failing test.** For default Voronoi params, `extractRails` returns non-empty `foot` and `crest`; each crest loop lies strictly INSIDE its foot loop (every crest point has `f2−f1 < th·footFrac`); crest is within tol of the analytic `f2−f1=th·0.15` level (re-evaluate the field at crest points → ≈ `th·0.15`).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Mirror `extractVoronoi`: `marchingSquaresZero((u,t)=>sdf(u,t)-th*frac, resU, resT, true)` + `segmentsToPolylines('rail', 3, dpTol)`, once per frac. Keep `dpTol=3e-4` (the committed smooth value).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `"feat(bandRemesh): foot+crest rail extraction (interior-offset level sets)"`

---

### Task 3: Band parameterization + metric-sized cross-band stations (`bandRemesh/stations.ts`)

**Files:**
- Create: `potfoundry-web/src/fidelity/bandRemesh/stations.ts`
- Test: `potfoundry-web/src/fidelity/bandRemesh/stations.test.ts`

**Interfaces:**
- Consumes: `SurfaceSampler` (`conforming/SurfaceSampler.ts`), `firstFundamentalForm` (`conforming/SurfaceMetricTensor.ts`), a `foot`/`crest` polyline pair.
- Produces: `buildStations(foot: P[], crest: P[], sampler: SurfaceSampler, targetEdgeMm: number): { rows: Array<{ s: number; footPt: P; crestPt: P; w: P[] }> }` where each row spans foot→crest with interior cross-band points spaced ≈ `targetEdgeMm` in 3D; `s` rows are spaced ≈ `targetEdgeMm` along the ribbon in 3D.

- [ ] **Step 1: Write failing test.** On a synthetic STRAIGHT diagonal ribbon (two parallel rails on a `SyntheticCylinderSampler`, amp=0), `buildStations` yields rows whose adjacent 3D spacing (both along-s and across-w) is within ±25% of `targetEdgeMm`; foot/crest endpoints of each row equal the input rail vertices (anchor preservation — critical for stitching).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Correspond foot↔crest by nearest-arclength; sample along-s at metric-arclength `targetEdgeMm` intervals (integrate `sqrt(Pu·Pu)` via `firstFundamentalForm`); per row, place cross-band points by metric arclength foot→crest. The row's foot/crest points MUST be the actual rail vertices (anchors), interior points are new.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `"feat(bandRemesh): metric-sized cross-band station grid between rails"`

---

### Task 4: Advancing-front strip triangulation (`bandRemesh/paver.ts`) — the orientation fix

**Files:**
- Create: `potfoundry-web/src/fidelity/bandRemesh/paver.ts`
- Test: `potfoundry-web/src/fidelity/bandRemesh/paver.test.ts`

**Interfaces:**
- Consumes: `buildStations` output, `SurfaceSampler`.
- Produces: `paveBand(rows, sampler): { utVertices: Array<[number,number]>; indices: Uint32Array; railVertexIds: { foot: number[]; crest: number[] } }` — band-following triangles; `railVertexIds` exposes the boundary vertex ids in rail order (for Task 5 stitching).

- [ ] **Step 1: Write failing test.** Pave the synthetic straight ribbon (Task 3). Then evaluate `utVertices` to 3D via the sampler and assert: internally watertight (`auditWatertight` → boundary edges ONLY on the two rails + the two ends, `nonManifoldEdges=0`, `tJunctions=0`); `triangleQuality3D.aspectMax ≤ 4`, `pctMinAngleBelow10 = 0`, `minAngleP50 ≥ 30`. Repeat at two `targetEdgeMm` (coarse + fine) → quality holds at BOTH (density-invariance).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Connect consecutive rows: for each pair of adjacent rows, zip their station points into quads, split each quad by the diagonal that maximizes the 3D min-angle (law-of-cosines on the evaluated positions). Triangles run ALONG the band by construction. Shared row vertices → internally watertight.
- [ ] **Step 4: Run, verify PASS** (both densities).
- [ ] **Step 5: Commit** — `"feat(bandRemesh): advancing-front band-following strip triangulation"`

---

### Task 5: Watertight stitch to a dyadic grid (`bandRemesh/stitch.ts`) — THE MAKE-OR-BREAK GATE

**Files:**
- Create: `potfoundry-web/src/fidelity/bandRemesh/stitch.ts`
- Test: `potfoundry-web/src/fidelity/bandRemesh/stitch.test.ts`

**Interfaces:**
- Consumes: `paveBand` output (esp. `railVertexIds`), a surrounding dyadic-grid triangulation that uses the SAME rail polylines as constraints.
- Produces: `stitchBandIntoGrid(grid, band): Mesh3` — one combined mesh where band rail vertices ARE the grid's constraint-curve vertices (deduplicated by exact (u,t) key), the band region is excluded from the grid's fill, and no T-junctions exist on the shared rails.

This is the spike's central unknown — the algorithm is developed against the gate test, not pre-coded. The mechanism to realize: (a) triangulate the grid with foot+crest as constraints via the existing constrained path, but mark the band-interior region (between foot and crest) as a hole / exclude it; (b) weld the band's rail vertices to the grid's identical rail-crossing vertices by exact (u,t) key (the registry already places grid vertices at the curve crossings — Task 5 must MATCH the paver's rail stations to those crossings, which may require the paver to sample the rails at the grid's crossing points rather than its own metric stations on the rail — resolve this here: **the rails' on-grid crossing vertices are the anchors; the paver's free stations are interior only**).

- [ ] **Step 1: Write the gate test.** Build a small dyadic grid (uniform level L) on `SyntheticCylinderSampler` with the two synthetic rails as constraints; exclude the band; pave the band (Task 4) using the grid's rail-crossing vertices as anchors; `stitchBandIntoGrid`; then `auditWatertight(combined)` MUST be `{boundaryEdges: <only the mesh's true open boundary>, nonManifoldEdges: 0, tJunctions: 0}` and `triangleQuality3D` over the band tris meets the Task-4 bars. Run at L matching FL7 and FL11 → holds at both.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement the stitch** (develop against the gate): exact-(u,t)-key weld of band rail vertices to grid rail vertices; band-region exclusion from the grid fill; verify shared edges are used exactly twice. If the grid path cannot exclude the band cleanly, document the exact blocker.
- [ ] **Step 4: Run, verify PASS at FL7 and FL11.** **If it cannot be made to pass → STOP. Write a one-page finding (`docs/superpowers/specs/2026-06-24-bandremesh-spike-result.md`) and recommend fallback Approach A.**
- [ ] **Step 5: Commit** — `"feat(bandRemesh): watertight stitch of paved band into dyadic grid (spike gate A)"`

---

### Task 6: Triple-junction paving (`bandRemesh/junction.ts`) — spike gate B

**Files:**
- Create: `potfoundry-web/src/fidelity/bandRemesh/junction.ts`
- Test: `potfoundry-web/src/fidelity/bandRemesh/junction.test.ts`

**Interfaces:**
- Produces: `paveJunction(incomingBands: Array<{ endRow }>, sampler): Mesh3fragment` — a paved junction polygon sharing the three incoming fronts' end vertices.

- [ ] **Step 1: Write the gate test.** A synthetic 3-ribbon Y-junction (three rail pairs meeting at a point). Pave all three bands + the junction; stitch; `auditWatertight` → `nonManifoldEdges=0`, `tJunctions=0`; junction tris meet aspect ≤4 / no <10° slivers.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** the junction polygon paving (fan/centroid-with-quality or constrained fill of the small central polygon), sharing the three fronts' end vertices.
- [ ] **Step 4: Run, verify PASS.** (If junctions prove intractable but straight bands passed, record it — junctions may be the residual.)
- [ ] **Step 5: Commit** — `"feat(bandRemesh): triple-junction paving (spike gate B)"`

---

### Task 7: Spike result + decision record

**Files:**
- Create: `docs/superpowers/specs/2026-06-24-bandremesh-spike-result.md`

- [ ] **Step 1:** Record the measured spike outcome: watertight (bnd/nonMan/T) + quality (aspect, %<10°, p50) + edge-wobble at FL7 and FL11 for the straight ribbon (Task 5) and the junction (Task 6), vs the spec gate. State GO (proceed to Phase 1 real Voronoi integration) or NO-GO (fall back to Approach A, with the specific blocker).
- [ ] **Step 2: Commit** — `"docs(bandRemesh): spike result + GO/NO-GO decision"`

---

## Phase 1 (separate plan, written AFTER the spike — GO only)

Detailed only once the spike resolves the stitch mechanism. Scope: wire the `bandRemesh` module into the real Voronoi path (`extractVoronoi` crest rail + `FeatureConformingTriangulator`/`WatertightAssembly` band exclusion + paver), flag-gated default-OFF; run `gitnexus impact` first; verify on `verify_voronoiCelticFeatureFlow` + a real GPU export/3MF/render to the user; re-baseline `gateThresholds.ts`. **Then** a Phase 2 plan generalizes to Gothic/Gyroid/Celtic (each its own band definition).

## Self-Review

- **Spec coverage:** rails §3.1 → Task 2; paving §3.2 → Tasks 3–4; stitching/junctions §3.3 → Tasks 5–6; spike-gate build order §5 → Tasks 1–7 + Phase 1 note; success metrics §2 → audit Task 1 + asserted in Tasks 4–6; integration §4 + generalization §7 → Phase 1/2 notes. Covered.
- **Placeholders:** none — novel-algorithm steps (Task 5 stitch) are explicitly test-gate-driven with the mechanism described, which is the honest representation of spike work, not a TODO.
- **Type consistency:** `Mesh3`, `auditWatertight`, `triangleQuality3D`, `lateralWobbleMm`, `extractRails`, `buildStations`, `paveBand`/`railVertexIds`, `stitchBandIntoGrid`, `paveJunction` — names used consistently across tasks.
- **Scope:** Phase 0 is one coherent deliverable (the de-risked paver core). Real integration + generalization correctly deferred to follow-on plans (spike-gated).
