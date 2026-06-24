# Real-Feature Mesher — De-Risk Plan (sub-project 2, Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Prove the GO'd dyadic-edge-seam corridor mechanism (`corridorPave`) holds on REAL detector-driven features — full-height walls, junctions, loops, and a dense network — before committing to the full all-20 build. A NO-GO at any step is a cheap, valuable answer.

**Architecture:** Reuse the proven `src/fidelity/bandRemesh/` (`seamFill.extractHoleBoundary`, `corridorPave`, `audit`) + Task-2 `bandRegions` emit-gate, but drive the feature(s) from sub-project 1's `detectFeatures(sampler, opts)` FeatureGraph on a REAL `styleSampler` pot, instead of a synthetic ridge. The seam (Q1) and the feature-pinned fill (Q2) are PROVEN — this scales the INTERIOR to real features + topology.

**Tech Stack:** TypeScript, Vitest (CPU `styleSampler`, no GPU), the conforming mesher + bandRemesh + featureGraph modules.

## Global Constraints

- Reuse the proven seam + corridorPave; do NOT re-derive them. The new work is the detector→corridor wiring + topology (multiple feature edges as cdt2d constraints, junctions, loops).
- The load-bearing pass criteria carry from the spike: seam **0/0/0** at FL7 & FL11 (boundaryEdges=rings, nonManifold/orient/tJunction=0), the feature(s) followed (every densified feature segment a mesh edge), and measured aspect/`%<10°` (target ≤4 / 0; document residuals honestly — the user accepts slivers where the mesh follows features).
- **Commit-hygiene (standing):** `ConformingWall.ts`/`WatertightAssembly.ts`/`PeriodicBalancedQuadtree.ts`/`ParametricExportComputer.ts` carry pre-existing uncommitted `cellSamples` WIP — `git add` ONLY your own files; never reference `cellSamples` in new options.
- Prefer test + bandRemesh edits; production edits only if needed (flag-gated, byte-identical, impact-analyzed, `detect_changes`). ESLint 0. TDD. Report ACTUAL numbers (controller re-verifies).

**Verified anchors:** `corridorPave(holeBoundary, holeVertexUT, featurePolyline, opts)` (corridorPave.ts — single feature, cdt2d, Steiner density), `extractHoleBoundary` (seamFill.ts), `auditWatertight` + `triangleQuality3D` + `lateralWobbleMm` (audit.ts), `detectFeatures` + `styleSampler('Voronoi')` + the FeatureGraph type (featureGraph/), `assembleWatertight` + `bandRegions` (WatertightAssembly.ts), the harness `verify_dyadic_seam.test.ts`.

---

### Task 1: One REAL full-height feature (the bridge from synthetic to real)

**Files:** Create `src/fidelity/bandRemesh/realCorridor.ts`; Test `src/fidelity/verify_real_feature_mesher.test.ts`.

**Interfaces:**
- `realFeatureCorridor(sampler, featureEdgePolyline, opts:{featureLevel, widthCells}): { bandRegion, hole, paved, merged }` — given a real (u,t) feature polyline: build the corridor `bandRegion` (insideBand = dist((u,t), polyline) < widthCells·cellWidth), `assembleWatertight` with it → hole, `extractHoleBoundary`, `corridorPave(hole, …, featureEdgePolyline)`, merge. Reuses the spike machinery; the ONLY new thing is sourcing the feature polyline from a real detector edge + handling a real (possibly seam-crossing / full-height) curve.

- [ ] **Step 1: Failing test.** Real Voronoi pot (`styleSampler('Voronoi')`, real dims). `detectFeatures` → pick ONE substantial feature edge (a full-height-ish wall segment, interior to the rings; if it crosses the u-seam, handle or pick one that doesn't for Step 1). Run `realFeatureCorridor` at FL7 & FL11. Assert: seam **0/0/0**; the feature polyline is a continuous mesh edge-chain (every densified segment a mesh edge); wobble p99 small; report aspect/`%<10°`.
- [ ] **Step 2: Run → iterate** (real curves differ from the synthetic diagonal — endpoint snapping to the boundary, curvature, density). Do NOT weaken the gate; document any residual.
- [ ] **Step 3: Run → PASS** (seam + feature-followed) or documented NO-GO with the exact invariant.
- [ ] **Step 4: Commit** `test(mesher): corridorPave follows a REAL detector Voronoi wall, welded at the dyadic seam (FL7&11)`.

---

### Task 2: Topology — a REAL junction + a REAL loop (multiple features in one corridor)

**Files:** extend `realCorridor.ts` (multi-feature) + the test.

**Interfaces:**
- Extend `corridorPave` (or a `corridorPaveMulti`) to pin MULTIPLE feature polylines as cdt2d constraints in ONE corridor region — a junction (3 edges meeting at a degree-3 FeatureGraph node, shared vertex) and a closed loop (a Voronoi cell). cdt2d handles the constraint network; junctions are shared constraint-edge endpoints; loops are closed constraint loops.

- [ ] **Step 1: Failing test.** From the real Voronoi FeatureGraph, pick a degree-3 NODE + its 3 incident edges (a junction) and a closed CELL loop. Build ONE corridor covering their cells, pave with all features pinned. Assert at FL7 & FL11: seam 0/0/0; ALL feature edges are continuous mesh edge-chains through the junction/around the loop; the junction node is a shared mesh vertex; report aspect/`%<10°` (note any acute-junction slivers — the user accepts slivers if features are followed).
- [ ] **Step 2-3: Run → iterate → PASS** or documented residual (esp. acute-angle junction quality).
- [ ] **Step 4: Commit** `test(mesher): corridorPave handles a real Voronoi junction + loop (one cdt2d region, welded)`.

---

### Task 3: The DENSE network (the make-or-break for tangled lattices)

**Files:** extend the test (+ realCorridor.ts if needed).

- [ ] **Step 1: Failing test.** Take a REGION of the real Voronoi web (several cells + junctions + loops) → exclude ALL its feature-cells → ONE corridor → pave with the WHOLE sub-FeatureGraph pinned (Steiner density from the detector saliency or boundary-matched). Assert at FL7 & FL11: seam 0/0/0; all features followed; measure aspect/`%<10°` + the triangle count + the cdt2d runtime (the dense-network scale concern). This is the make-or-break for the tangled-lattice styles (the user's priority).
- [ ] **Step 2: Run → measure.** Report scale (tri count, runtime) + quality honestly. If the dense corridor is intractable or low-quality, that is the key finding (→ per-feature corridors or a different interior strategy).
- [ ] **Step 3: Run → PASS** or documented residual/NO-GO.
- [ ] **Step 4: Commit** `test(mesher): corridorPave on a dense real Voronoi network region (seam + quality + scale)`.

---

## Post-plan (controller)

After Task 3: GO/NO-GO record. If GO → brainstorm the FULL general mesher (all-20 via the detector, density-follows-saliency, rim/base-incident corridors, production wiring + GPU export/render + re-baseline). If a NO-GO surfaces (dense-network scale/quality), iterate the interior strategy on the proven seam.

## Self-review
- Coverage: real feature → Task 1; topology (junction/loop) → Task 2; dense network → Task 3 — the three gaps between the synthetic spike and the real all-20 mesher, hardest-relevant last (dense network = the tangled-lattice make-or-break).
- Types: `realFeatureCorridor`/`corridorPaveMulti` reuse `corridorPave`/`extractHoleBoundary`/`auditWatertight`/`detectFeatures`/`bandRegions` per the verified anchors.
- No placeholders: each task names the real source (detector FeatureGraph on `styleSampler('Voronoi')`), the gate (seam 0/0/0 + feature-followed + measured quality), and the honest-residual rule.
