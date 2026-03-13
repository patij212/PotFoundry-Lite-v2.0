 Wire Orphaned Pipeline Infrastructure into Parametric Export

 Context

 The parametric export pipeline has 6 orphaned modules in src/renderers/webgpu/parametric/ that are fully implemented
 and tested but never called from the orchestrator (ParametricExportComputer.ts). The ExportDialog exposes 4 Debug
 feature flags (metricAwareRefinement, distortionGating, gpuFidelityCheck, seamHealing) that resolve to config but
 drive zero pipeline logic. Quality profile tolerances are computed but never validated. The user observes that "only
 feature chain insertion makes a difference" — everything else is cosmetic topology tweaks invisible on a 3D-printed
 pot.

 Goal: Wire the existing infrastructure so that feature flags actually do something, quality profiles drive adaptive
 refinement, and mesh validation reports real metrics.

 Audit Summary (current state)

 ┌─────────────────────────┬────────┬─────────────────────────────────────────────────────────┐
 │     Flag / Setting      │ Status │                      Why it's dead                      │
 ├─────────────────────────┼────────┼─────────────────────────────────────────────────────────┤
 │ metricAwareRefinement   │ DEAD   │ SurfaceMetric.ts exists but never called                │
 ├─────────────────────────┼────────┼─────────────────────────────────────────────────────────┤
 │ distortionGating        │ DEAD   │ MeshValidator.ts exists but never called                │
 ├─────────────────────────┼────────┼─────────────────────────────────────────────────────────┤
 │ gpuFidelityCheck        │ DEAD   │ MeshValidator.ts GPU path exists but never called       │
 ├─────────────────────────┼────────┼─────────────────────────────────────────────────────────┤
 │ seamHealing             │ DEAD   │ SeamTopology.ts has measurement only; healing not built │
 ├─────────────────────────┼────────┼─────────────────────────────────────────────────────────┤
 │ Quality tolerances      │ DEAD   │ Resolved but never validated against mesh               │
 ├─────────────────────────┼────────┼─────────────────────────────────────────────────────────┤
 │ maxRefineIterations     │ DEAD   │ AdaptiveRefinement.ts exists but never called           │
 ├─────────────────────────┼────────┼─────────────────────────────────────────────────────────┤
 │ relaxIterations default │ BUG    │ Dialog sends 0; non-dialog path falls back to 20        │
 └─────────────────────────┴────────┴─────────────────────────────────────────────────────────┘

 Orphaned modules (all COMPLETE implementations with tests):
 1. FeatureEdgeGraph.ts (479 lines) — constraint graph for feature edges
 2. SurfaceEvaluator.ts (231 lines) — GPU UV→XYZ wrapper
 3. CurvatureSampler.ts (201 lines) — GPU curvature sampling
 4. SurfaceMetric.ts (731 lines) — metric tensor field, anisotropy
 5. AdaptiveRefinement.ts (930 lines) — tolerance-driven refinement loop
 6. MeshValidator.ts (1327 lines) + SeamTopology.ts (595 lines) — geometric QA

 Plan: Incremental wiring in dependency order

 Phase 1: Quick wins (no new algorithms needed)

 1a. Fix relaxIterations default discrepancy

 - File: src/renderers/webgpu/ParametricExportComputer.ts ~line 1212
 - Change: params.relaxIterations ?? 20 → params.relaxIterations ?? 0
 - The v7.2 journal entry says GPU relax was disabled. Default should be 0 everywhere.

 1b. Wire MeshValidator as post-processing QA step

 - File: src/renderers/webgpu/ParametricExportComputer.ts (end of compute())
 - What: After final mesh is produced, call validateMesh() (CPU) or validateMeshGPU() (when gpuFidelityCheck is
 enabled)
 - Config mapping:
   - distortionGating flag → enables UV distortion check in validator config
   - gpuFidelityCheck flag → uses GPU-enhanced fidelity check instead of CPU dihedral heuristic
 - Output: Add validationReport to the return type. Surface warnings to the ExportDialog's debug output.
 - Dependencies: MeshValidator imports AdaptiveRefinement utilities (triangleNormal, buildEdgeAdjacency, etc.) and
 SeamTopology — these come along transitively.
 - Complexity: LOW — pure append at end of pipeline

 1c. Wire FeatureEdgeGraph for constraint-aware optimization

 - File: src/renderers/webgpu/ParametricExportComputer.ts (after chain linking, before optimizers)
 - What: Build FeatureEdgeGraph from chains + grid using buildFeatureEdgeGraphFromGrid(). Pass to existing optimizers
 via featureEdgesToLockedQuads() to replace the current ad-hoc quad locking.
 - Complexity: LOW — construction call + passing to existing functions

 Phase 2: Adaptive refinement (the big payoff)

 2a. Wire AdaptiveRefinement as new pipeline stage

 - File: src/renderers/webgpu/ParametricExportComputer.ts (after subdivision, before GPU final eval)
 - What: Call adaptiveRefine() with:
   - FeatureEdgeGraph from Phase 1c
   - GPU evaluator callback (existing inline code wrapped as EvaluateMidpointsFn)
   - QualityProfile (already resolved) — maxRefineIterations finally drives real logic
   - ExportTolerances (already resolved) — refinement loop stops when tolerances pass
 - Effect: draft profile skips refinement (0 iterations), standard does 2 iterations, high does 4, ultra does 6. Each
 iteration splits triangles that exceed chord/normal error thresholds. This is the missing link that makes quality
 profiles actually matter.
 - Config mapping: Profile selection (draft/standard/high/ultra) now produces visibly different meshes
 - Complexity: MEDIUM — need to create GPU evaluator callback matching EvaluateMidpointsFn signature

 2b. Wire SurfaceMetric for metric-aware refinement

 - File: src/renderers/webgpu/parametric/AdaptiveRefinement.ts (edge scoring)
 - What: When metricAwareRefinement flag is enabled, compute vertex metrics via computeVertexMetrics() and use
 anisotropicSplitPriority() for edge scoring instead of Euclidean length
 - Effect: Refinement concentrates splits where the surface is most stretched/compressed in parameter space, rather
 than where 3D edges are longest. More efficient triangle allocation.
 - Complexity: MEDIUM — modifying the edge selection logic in the refinement loop

 Phase 3: Seam healing (new algorithm needed)

 3. Implement seam healing

 - File: src/renderers/webgpu/parametric/SeamTopology.ts (new function)
 - What: After mesh is finalized, identify col-0 / col-(W-1) vertex pairs via identifySeamPairs(), then average their
 3D positions to close the seam gap. Optionally insert "ghost triangles" bridging the seam if gap exceeds threshold.
 - Note: SeamTopology already has full measurement infrastructure. Only the repair step is missing.
 - Complexity: MEDIUM-HIGH — new algorithm, needs careful handling of index remapping

 Phase 4: Surface dialog feedback

 4. Surface validation report in ExportDialog

 - File: src/ui/controls/ExportDialog.tsx (Debug tab)
 - What: Display the ValidationReport from MeshValidator:
   - Pass/fail badges for each check (manifold, degenerate, quality, fidelity, seam)
   - Key metrics: min angle, max aspect ratio, chord error p95, triangle count
   - Warnings list
 - Effect: User can see concrete quality metrics and understand what the flags do
 - Complexity: LOW — UI rendering of existing data

 Files to modify

 File: src/renderers/webgpu/ParametricExportComputer.ts
 Phase: 1a,1b,1c,2a
 Change: Fix default, wire validator, build feature graph, wire refinement
 ────────────────────────────────────────
 File: src/renderers/webgpu/parametric/AdaptiveRefinement.ts
 Phase: 2b
 Change: Add metric-aware edge scoring branch
 ────────────────────────────────────────
 File: src/renderers/webgpu/parametric/SeamTopology.ts
 Phase: 3
 Change: Add healSeam() function
 ────────────────────────────────────────
 File: src/ui/controls/ExportDialog.tsx
 Phase: 4
 Change: Add validation report display
 ────────────────────────────────────────
 File: src/hooks/useParametricExport.ts
 Phase: 1b,4
 Change: Forward validation report to UI
 ────────────────────────────────────────
 File: src/renderers/webgpu/parametric/types.ts
 Phase: 1b
 Change: Add ValidationReport to export result type

 What NOT to do

 - Do NOT refactor the orchestrator to use StageRegistry / stage interfaces from contracts.ts. That's a large
 structural refactor that adds no user-visible value yet.
 - Do NOT wire SurfaceEvaluator / CurvatureSampler to replace inline GPU code. Clean but purely cosmetic refactor —
 save for later.
 - Do NOT enable localOnlyMode = false path. It's known to produce density band artifacts.

 Verification

 1. npm run test — all parametric tests pass
 2. npm run typecheck — clean
 3. Manual test: Export same pot at draft vs ultra quality → ultra should have measurably different mesh (more
 triangles near features, lower chord error)
 4. Manual test: Toggle distortionGating and gpuFidelityCheck → validation report appears in Debug tab
 5. Manual test: Toggle metricAwareRefinement → refinement concentrates near high-curvature areas