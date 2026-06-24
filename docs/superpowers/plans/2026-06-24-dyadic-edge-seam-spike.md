# Dyadic-Edge-Seam Mesher — Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Prove the UNIVERSAL watertight seam — an externally-paved region bounded by whole dyadic cell edges, reusing the complement's exact registered boundary vertices, welds to the production complement — or surface a second cheap NO-GO. Then add the feature-aligned interior.

**Architecture:** Reuse Task-2's `bandRegions` emit-gate to leave a CELL-ALIGNED hole in the complement; fill that hole reusing its exact boundary vertices (corners + 2:1 mid-edges, which are already in the complement's emitted mesh); weld at the dyadic seam. Q1 proves the seam with a trivial fill (no feature, no production edit). Q2 replaces the fill with feature-aligned paving.

**Tech Stack:** TypeScript, Vitest (CPU `styleSampler`, no GPU), the conforming mesher + bandRemesh modules.

## Global Constraints

- **The universal principle (the spec):** the corridor MUST reuse the complement's EXACT boundary vertices — every vertex on the hole-boundary edges, INCLUDING 2:1-balance mid-edge vertices. These are obtained from the complement's EMITTED mesh (the count-1 hole-boundary edges already carry them), so no registry surgery is needed. Weld in (u,t)-id space (the complement's QSCALE `vertexIndex`/`railVertexKey`); 3D evaluated once per vertex.
- **Q1 = ZERO production edits** (pure orchestration + test on top of Task-2's existing `bandRegions`). Q2 may touch production (flag-gated, default-OFF, byte-identical, `gitnexus impact` + `detect_changes`).
- **Standing commit-hygiene rule:** `ConformingWall.ts`, `WatertightAssembly.ts`, `PeriodicBalancedQuadtree.ts`, `ParametricExportComputer.ts` carry PRE-EXISTING uncommitted `cellSamples` WIP — `git add` ONLY the files YOU edit; verify `git status` before commit.
- Binary watertight gate (Q1), then quality (Q2). ESLint 0; TDD.

**Verified anchors (from the band-stitch integration map + Tasks 1-4):**
- Task-2 `bandRegions?: BandRegion[]` (`{insideBand(u,t):boolean}`) on `assembleWatertight` — fully-inside-predicate leaves emit no triangles. Flag-OFF byte-identical.
- `assembleWatertight` returns packed `(u,t,surfaceId)` vertices + indices; outer wall = surfaceId 0; the true open boundary = the t=0/t=1 rings.
- `src/fidelity/bandRemesh/`: `auditWatertight(mesh3,{boundaryVertexIndices})`, `quantizeRailUT`/`railVertexKey` (railKey.ts), the Phase-0 paver (paver.ts).
- The band-stitch harness to clone: `verify_mesher_band_integration.test.ts` (real assembly, FL7&11) + `integrate.ts` (merge/eval patterns) + `styleSampler('Voronoi'|smooth)`.

---

### Task 1: Q1 — the universal seam (cell-aligned hole-fill), the make-or-break

**Files:** Create `src/fidelity/bandRemesh/seamFill.ts`; Test `src/fidelity/verify_dyadic_seam.test.ts`. NO production edits.

**Interfaces:**
- `extractHoleBoundary(outerWallMesh, ringVertexIds): { loops: number[][] }` — from the emitted complement OUTER wall (surfaceId 0), build the edge→triangle-count map; the edges used by exactly ONE triangle and NOT on the t=0/t=1 rings are the hole boundary; order them into closed loop(s) of vertex ids. (The hole-boundary vertices are the complement's exact vertices incl. 2:1 mid-edges — they already exist in the emitted mesh.)
- `fillHole(loop, vertexUT): { triangles:[number,number,number][] }` — triangulate the hole polygon in (u,t) using ONLY the loop's existing vertices (a constrained ear-clip / fan; ANY valid fill — Q1 does not care about quality, only that it reuses the exact boundary vertices and is internally consistent). Returns triangles indexing the SAME vertex ids.

- [ ] **Step 1: Failing test — the seam gate.** On a smooth cylinder (`styleSampler` of a plain flared pot), define a CELL-ALIGNED rectangle corridor: `bandRegions:[{insideBand:(u,t)=> u∈[uA,uB] && t∈[tA,tB]}]` where `[uA,uB]×[tA,tB]` is aligned to dyadic cell boundaries at the featureLevel (so whole cells are excluded → a clean rectangular hole). Run `assembleWatertight` with that `bandRegions`. Extract the hole boundary, fill it, merge fill triangles into the assembly (sharing the loop vertex ids), and `auditWatertight(merged,{boundaryVertexIndices: t=0/t=1 rings})`. Assert at **FL7 AND FL11**: `boundaryEdges` = rings only, `nonManifoldEdges`=0, `orientationMismatches`=0, `tJunctions`=0. (The hole-boundary edges must weld count-2: complement tri + fill tri.)
- [ ] **Step 2: Run → iterate.** The likely first failure is the hole-boundary loop ordering or a missed 2:1 mid-edge vertex — fix the extraction (it must include EVERY count-1 boundary vertex). Do NOT weaken the gate.
- [ ] **Step 3: Run → PASS** (watertight at FL7 & FL11) — OR a documented NO-GO with the exact failing invariant (e.g. "a 2:1 mid-edge vertex on the hole boundary is not reused → T-junction").
- [ ] **Step 4: Non-vacuous control + byte-identical.** Committed controls: (a) crack one interior hole-boundary vertex (t strictly in (0,1)) → `tJunctions>0`; (b) with NO `bandRegions`, the assembly is byte-identical to today (Task-2 guard).
- [ ] **Step 5: Commit** `test(mesher): dyadic-edge seam welds an externally-filled cell-aligned hole (FL7 & FL11)`.

**This is THE decisive task.** If the cell-aligned hole welds, the universal seam is proven (independent of any feature). If it cannot, that is a second cheap NO-GO that refutes the dyadic-edge-seam approach — report it precisely.

---

### Task 2: Q2 — feature-aligned interior (orientation/quality)

Only after Task 1 GOes. Replace the trivial fill with feature-aligned paving on a real feature corridor.

**Files:** `src/fidelity/bandRemesh/corridorPave.ts` (new); extend `verify_dyadic_seam.test.ts`. Production edits ONLY if the corridor (whole-cell, feature-following) needs a predicate the emit-gate can't express — keep flag-gated/byte-identical, impact-analyzed.

**Interfaces:**
- `featureCells(featureEdge, qt): Set<cellId>` — the dyadic leaf cells a feature polyline crosses (the corridor).
- `corridorPave(holeLoop, holeVertexUT, featurePolyline, sampler, targetEdgeMm): { triangles }` — pave the corridor interior with rows oriented ALONG the feature (the feature is the spine), the boundary rows riding the EXACT hole-boundary vertices (from Task 1). Reuse the Phase-0 paver's along-feature diagonal choice (max 3D min-angle).

- [ ] **Step 1: Failing test.** On a real feature (a single Voronoi wall, or a synthetic diagonal ridge on a cylinder): corridor = the feature-crossing cells → exclude (emit-gate) → hole → `corridorPave` feature-aligned, boundary pinned to the hole vertices → merge → audit. Assert FL7 & FL11: watertight 0/0/0 (the Task-1 seam still holds) AND corridor-triangle aspect ≤ 4, ZERO `<10°` slivers, and the feature is a continuous interior mesh polyline (no staircase).
- [ ] **Step 2: Run → iterate** the paver↔staircase-boundary transition until quality holds (or document the residual). Do NOT weaken the gate.
- [ ] **Step 3: Run → PASS** (watertight + quality) or documented residual.
- [ ] **Step 4: `detect_changes` if production touched. Commit** `feat(mesher): feature-aligned corridor paving welded at the dyadic seam`.

---

## Post-plan (controller, not a task)

After Task 2 (or an earlier documented NO-GO): final spike review (most-capable model); GO/NO-GO record. If GO → the full general-mesher plan scales the corridor paving to junctions/loops/the full FeatureGraph/all-20 styles on the PROVEN seam. If Q1 NO-GO → escalate the fallback decision (detector-driven density in the existing mesher).

## Self-review

- **Spec coverage:** §2 universal principle → Task 1 (reuse exact boundary vertices); §4 Q1 seam → Task 1; §4 Q2 orientation → Task 2; §5 gate → Task 1 Steps 1-4 + Task 2 Step 1; §7 2:1-mid-edge subtlety → Task 1 Step 2; §8 risks → the iterate steps. Covered.
- **Type consistency:** `extractHoleBoundary`/`fillHole` (Task 1) feed `corridorPave` (Task 2); all index the complement's vertex ids; `auditWatertight`/`bandRegions`/`quantizeRailUT` per the verified anchors.
- **No placeholders:** Task 1 is fully concrete (cell-aligned rectangle corridor, hole extraction by count-1 edges, fill, audit, controls). Task 2 is at design granularity (refined once Q1 proves the seam) — appropriate for a spike whose Q1 is the gate.
