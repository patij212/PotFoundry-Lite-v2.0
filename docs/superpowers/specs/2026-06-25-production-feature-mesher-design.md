# Production Feature-Aligned Mesher — Design

**Date:** 2026-06-25
**Branch:** refactor/core-migration
**Status:** Design (approved architecture + build order; pending spec review)
**Predecessor:** `2026-06-25-mesher-derisk-COMPLETE-and-GO.md` (the de-risk arc — GO)

## 1. Goal

Wire the proven feature-aligned watertight mesher into the production export path so the exported mesh's triangles **follow the model's features** (no serration / staircasing on diagonal or curved feature loci), watertight-by-construction, across all 20 styles — printable seamlessly on resin printers. Flag-gated, default-OFF, byte-identical when off.

## 2. The proven foundation (does not change)

The de-risk arc proved, end-to-end on REAL geometry (incl. a dense tangled Voronoi network), the universal mechanism (module `src/fidelity/bandRemesh/`):

```
detectFeatures → FeatureGraph (style-agnostic feature loci)
  → exclude the feature-crossing CELLS from the dyadic complement (emit-gate: bandRegions)
  → ONE corridor (the excluded whole cells), bounded by DYADIC cell edges
  → pave the corridor feature-pinned: full cdt2d + constraint-respecting topological flood-fill
  → weld at the DYADIC cell-edge seam: REUSE the complement's EXACT registered boundary
       vertices (corners + 2:1 mid-edges) — the feature lives strictly INSIDE, never on the seam
  → the dyadic complement meshes the smooth regions (unchanged)
```

All welds 0/0/0 (boundary / non-manifold / T-junction) at two feature levels, feature-followed, near sliver-free, scaling (cdt 0.8s after the compact-point fix). Every step opus-reviewed + controller-verified with a non-vacuous control (crack a shared vertex ⇒ T-junctions > 0). 21/21 tests green.

**This sub-project SCALES that harness to production. The mechanism, seam, interior fill, topology, and scale never change.**

## 3. What production looks like today (grounding)

- **Export entry:** `ParametricExportComputer.compute(params)` (`ParametricExportComputer.ts:1972`) → `assembleWatertight(outerSampler, innerSampler, dims, opts)` (`WatertightAssembly.ts:421`) → `WatertightAssemblyResult { vertices: Float32Array (packed u,t,surfaceId), indices: Uint32Array, surfaceRanges, ... }`.
- **GPU vertex eval:** the assembly stores vertices in **parameter space** `(u,t,surfaceId)`; 3D positions come from the GPU compute kernel `evaluate_vertices` (`assets/shaders/adaptive_mesh.wgsl:763`), dispatched by `ParametricExportComputer.evaluatePoints(uvVertices, …)` (`ParametricExportComputer.ts:1768`). There is **no CPU alternative** for (u,t)→(x,y,z) on the production path.
- **The flag-OFF hooks already exist:** `AssemblyWallOptions.bandRegions` and `.railLines` (`WatertightAssembly.ts:282`, `:284`) thread to the OUTER wall's emit-gate via `buildConformingWall` (`:513`) → `triangulateQuadtreeWithFeatures` (`ConformingWall.ts:25`). Omitting them ⇒ byte-identical assembly (the load-bearing guarantee).
- **The EXISTING feature mechanism is the wrong one for the defect:** `extractAnalyticFeatures(styleId, …)` (`FeatureLineGraph.ts:953`) produces per-style analytic loci that thread in as `featureLines` → inserted as **constrained CDT edges inside the axis-aligned cells** (`WatertightAssembly.ts:508`). Per the root-cause review, a constraint edge does NOT reorient an axis-aligned cell — this is the serration source, not the fix. Our path replaces it for feature-crossing cells.
- **Export formats:** `stlExport.ts` (`generateBinarySTL` `:349`, `generateAsciiSTL` `:546`) and `exporters/export3MF.ts` (`exportTo3MF` `:332`). Require a **single combined vertex+index mesh** (`assertMeshExportable`, `stlExport.ts:105`).
- **Dev flags:** read from `globalThis.__pfXxx` at decision points (e.g. `windowHook.ts:452` `__pfConformingUBias`, `:474` `__pfConformingDirectional`).
- **Fidelity harness:** `e2e/export-fidelity.spec.ts` loops all 20 styles, runs a REAL GPU export, measures sag / aspect / min-angle / slivers / boundary / non-manifold / orientation / feature-drop / triangle count → `e2e/fidelity/baseline.json`. Run: `npm run dev -- --port 3001` then `npx playwright test export-fidelity --project=chromium`.
- **Gate thresholds:** `gateThresholds.ts` `GATE_THRESHOLDS` (minAngleDeg 20, maxAspect 4.76, epsRel 0.05, tauFloorMm 0.005, tauCeilMm 0.1) + `chordToleranceMm(featureSizeMm)` — the re-baseline target.

## 4. Integration design

A **flag-gated pass** in `ParametricExportComputer.compute()` that wraps the existing `assembleWatertight` call:

**Flag OFF (default):** today's behavior, byte-identical (no `bandRegions`/`railLines`, no corridor pass).

**Flag ON:**
1. **Detect features** for the style → `FeatureGraph` (corridors + their dyadic cell footprints + feature chains).
2. **Build `bandRegions`/`railLines`** from the FeatureGraph (the de-risk `realFeatureCorridorMulti` machinery) and call `assembleWatertight({ …, bandRegions, railLines })` → the complement mesh with feature-crossing cells **excluded** (holes), boundary vertices registered.
3. **Pave each corridor** with `corridorPaveMulti` → feature-pinned interior triangulation, reusing the complement's EXACT registered boundary vertices (`railKey`/`railVertexKey` replicate `vertexIndex` bit-exact).
4. **Merge** the corridor's `(u,t,surfaceId)` vertices + indices into the `WatertightAssemblyResult` buffer (dedup the shared boundary vertices by their global id — the weld).
5. The merged buffer rides the **existing** GPU `evaluate_vertices` + export path unchanged.

### 4.1 The load-bearing production invariant — the (u,t)-space GPU weld

The de-risk proved the weld in **(u,t)-id space** with a CPU sampler. Production correctness reduces to one contract:

> **`corridorPaveMulti` emits every vertex as `(u,t,surfaceId)`, and every boundary vertex it reuses is keyed bit-exact to the complement's `vertexIndex`. Both the complement and the corridor then ride the SAME GPU `evaluate_vertices` dispatch ⇒ identical (x,y,z) at the seam ⇒ watertight-by-construction at the 3D level.**

This is the Phase-1 make-or-break. It is well-de-risked (the id-space weld is proven; GPU eval is a pure function of (u,t,surfaceId)), but it must be proven on the **real GPU export path**, not just the CPU sampler. Phase 1 exists to prove exactly this.

### 4.2 Feature-source decision (documented fork)

The de-risk drove corridors from the **style-agnostic** `featureGraph/detectFeatures` (sub-project 1; CPU-sampler topology, dense-truth-gated, 14/20 recall, priority lattices fully tracked). Production also has the **per-style analytic** `extractAnalyticFeatures` (exact closed-form loci where they exist).

**Decision:** Phase 1 & 2 use the **proven** `featureGraph/detectFeatures` → `realFeatureCorridorMulti` path (it's what the de-risk validated, and it is style-agnostic — the user's "handle all complex models" requirement). Reconciling onto / preferring the exact analytic loci where they exist is a **documented Phase-3+ follow-up**, not a Phase-1 dependency. (The two return different graph types; unifying them is real work with no correctness urgency since the detector is proven.)

### 4.3 Flag mechanism

Dev path: `globalThis.__pfFeatureMesher` (boolean), read in `compute()` in the same style as `__pfConformingUBias` (`windowHook.ts:452`). UI path: optionally plumb through `params.pipelineFeatureFlags` (`resolveFeatureFlags`, `ParametricExportComputer.ts:2029`) in a later task. Default OFF ⇒ byte-identical.

## 5. Build phases

### Phase 1 — Voronoi, end-to-end on the REAL GPU path → render

Wire the flag-gated pass for **one style (Voronoi)** through the real `compute()` → GPU `evaluate_vertices` → combined mesh → 3MF + flat-shaded render. Proves §4.1 (the (u,t)-GPU weld on the production path) and the production wiring. **The render is the human acceptance test** — the first time the feature-following lattice is *seen*, not just measured. Gate: watertight (0 boundary / 0 non-manifold / 0 T-junction by index) + feature-followed + flag-OFF byte-identical, on the GPU mesh.

### Phase 2 — All 20 styles

Drive the corridor pass from `detectFeatures` per style; smooth/featureless configs produce no corridor ⇒ byte-identical dyadic mesh. Validate watertight + feature-followed + quality across all 20 via the e2e fidelity harness. Priority lattices (Voronoi / CelticKnot / Hex / Gyroid) and the smooth styles both covered. Gate: no style regresses watertight; feature styles show feature-followed edges; no new sliver class beyond the accepted junction/feature-tip wedges.

### Phase 3 — Perf + re-baseline + ship decision

Perf is the **dominant remaining production risk** (correctness is de-risked): the per-region `assembleWatertight` ≈ 22s dominates a flag-ON export (the cdt pave is 0.8s). First-class task — optimize/cache (e.g. single assembly + batched corridors, not per-region re-assembly). Then re-run the e2e harness, commit the new `baseline.json`, re-baseline `gateThresholds.ts`, and decide the flag default (stay OFF until perf + all-20 clean).

## 6. Testing strategy

- **Phase 1:** a focused GPU-path test (real `compute()` or the `windowHook` fidelity API) asserting watertight-by-index + feature-followed + flag-OFF byte-identity on Voronoi; plus a produced 3MF + render screenshot for human sign-off. Non-vacuous control carried forward (crack a shared seam vertex ⇒ T-junctions > 0).
- **Phase 2:** the existing `e2e/export-fidelity.spec.ts` across all 20, flag-ON vs flag-OFF; assert flag-OFF byte-identity, flag-ON watertight non-regression, feature-followed on feature styles.
- **Phase 3:** perf measurement in the harness; re-baselined `baseline.json` + `gateThresholds.ts` committed.

## 7. Carry-forward residuals (non-blocking, from the GO record §5)

- Feature-endpoint-meets-coarse-boundary wedge (FL11-resolved; finer boundary or endpoint paving if it recurs at production density).
- Rim/base-incident corridors (Q1 proven for interior holes; co-exercise a feature that runs to the rim/base).
- `localOf.get(a) as number` → add a `?? throw` guard (hardening).
- Closed-loop-at-density (inferred from the loop + dense tests; co-exercise explicitly).

## 8. Risks

| Risk | Mitigation |
|---|---|
| (u,t)-GPU weld differs from the CPU-sampler weld | Phase 1 proves it on the real GPU path before any all-20 work; the weld is already id-space-proven and GPU eval is a pure function of (u,t,surfaceId). |
| Perf (≈22s assembly) makes flag-ON unshippable | Phase 3 first-class; flag stays OFF until acceptable. Correctness ships independent of perf. |
| Detector recall (14/20) misses features on some styles | Style-agnostic detector is the proven path; analytic-loci reconciliation is the documented follow-up for exactness. Phase 2 measures per-style feature-followed. |
| Existing `featureLines` CDT-edge path conflicts with the corridor path | The corridor path REPLACES `featureLines` for feature-crossing cells (bandRegions excludes those cells); they do not overlap. Spec'd explicitly. |
| A flag-ON change leaks into flag-OFF (byte-identity break) | Every task asserts flag-OFF byte-identity; the `bandRegions`/`railLines` omit-path is already the load-bearing guarantee. |

## 9. Standing constraints (honor throughout)

- **Commit hygiene:** never stage cellSamples-WIP files (`ConformingWall.ts` / `WatertightAssembly.ts` / `PeriodicBalancedQuadtree.ts` / `ParametricExportComputer.ts` / `windowHook.ts` carry uncommitted WIP) — scope each commit to the task's files; strip cellSamples if a subagent sweeps it in.
- **Flag-gated default-OFF + byte-identical** when OFF — proven per task.
- **Preserve work** — commit WIP/partial with honest status; never `git revert`/`git restore` to discard completed work.
- **GitNexus:** re-index (stale) before production edits; `impact({target, direction:'upstream'})` before editing a production symbol; `detect_changes()` before committing; warn on HIGH/CRITICAL.
- **Per-task opus review + independent controller verification**; audit by INDEX not position; non-vacuous controls.
