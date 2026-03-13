Context

 The parametric export (v22.0) produces catastrophic mesh near feature chain edges:
 - 178,954 inverted triangles (20%), max aspect ratio 2 billion
 - Only 8 companion vertices for 3,248 cross-cell chain edges
 - Visual: severe spikes radiating from feature edges (see export screenshot)
 - Note: Many broken triangles also come from anisotropic relaxation (out of scope for this plan — flagged for future
 work)

 Goal: Dense, smooth, flawless triangulation near feature edges that perfectly represents the mathematical surface
 model. Three configurable approaches exposed in the Export Dialog.

 Architecture: Modular ChainStripTriangulator

 Create a new module ChainStripTriangulator.ts with a strategy pattern:

 src/renderers/webgpu/parametric/
   ChainStripTriangulator.ts     ← NEW: strategy pattern, 3 modes
   OuterWallTessellator.ts       ← MODIFY: call ChainStripTriangulator instead of constraintAwareTriangulate
   types.ts                      ← MODIFY: add chainStripMode + chainStripDensity to PipelineStageConfig

 Strategy Interface

 export type ChainStripMode = 'sweep' | 'cdt' | 'sweep-repair';

 export interface ChainStripConfig {
     mode: ChainStripMode;        // which triangulation strategy
     densityMultiplier: number;   // how many extra vertices per chain vertex (1-4)
     adaptiveRefine: boolean;     // post-triangulation adaptive subdivision in strip
 }

 Three Modes

 ┌──────────────┬────────────────────────────────────────────────┬─────────────────────────────────────────────────┐
 │     Mode     │                  Description                   │                   When to use                   │
 ├──────────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ sweep        │ Current sweep + backtrack fix (winding-safe)   │ Fast, low-risk default                          │
 ├──────────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ cdt          │ Local cdt2d per strip band                     │ Best quality, guaranteed constraint enforcement │
 ├──────────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ sweep-repair │ Current sweep + post-fix inversion repair pass │ Middle ground                                   │
 └──────────────┴────────────────────────────────────────────────┴─────────────────────────────────────────────────┘

 Implementation Batches

 Batch 1: Dense Chain-Strip Vertex Seeding + CDT (Core)

 Files: ChainStripTriangulator.ts (NEW), OuterWallTessellator.ts, types.ts

 1a. Dense vertex seeding in OuterWallTessellator.ts

 Expand insertCompanionVertices() into insertChainStripVertices():

 - Lower MIN_COL_GAP from 2 to 1 — companions for ALL cross-cell edges
 - Shadow vertices: For each original chain vertex at (u, row), insert vertices at (u, row±1) if no vertex exists
 within 0.5/numU of that U in the adjacent row. Skip if within 1e-6 of a grid column.
 - Flank vertices: For each chain vertex, add vertices at (u ± colSpacing/2, row) — half-column offsets that give CDT
 good triangulation material on both sides of the chain.
 - Guard: Skip all insertions near seam (|u - 0| < 2/numU or |u - 1| < 2/numU).

 Expected: hundreds to thousands of extra vertices (up from 8), creating a dense band around chains.

 1b. New module: ChainStripTriangulator.ts

 // Exports:
 export type ChainStripMode = 'sweep' | 'cdt' | 'sweep-repair';
 export interface ChainStripConfig { mode, densityMultiplier, adaptiveRefine }

 export function triangulateChainStrip(
     buf: number[],
     bot: StripVertex[], top: StripVertex[],
     constraints: Array<[number, number]>,
     chainVerts: ChainVertex[], gridVCount: number,
     tBot: number, tTop: number,
     config: ChainStripConfig,
 ): void;

 CDT mode (mode === 'cdt'):
 1. Collect stripBot + stripTop vertices → local array (dedup by global index)
 2. Normalize (u,t) → scale U by tRange/uRange for well-conditioned CDT input
 3. Build constraint edges: bot boundary, top boundary, left/right boundaries, chain edges. Deduplicate.
 4. cdt2d(points, edges, { exterior: false }) — try/catch, fallback to sweep
 5. Map local→global indices. Filter by strip bounds (centroid check). Enforce CCW winding via UV cross product.

 Sweep mode (mode === 'sweep'):
 Call existing constraintAwareTriangulate() with backtrack winding fix (see Batch 2).

 Sweep-repair mode (mode === 'sweep-repair'):
 1. Call constraintAwareTriangulate()
 2. Post-pass: detect inverted triangles (UV cross product < 0), collect them
 3. Extract the inverted region's vertices + surrounding ring → run local CDT on just that patch
 4. Stitch repaired patch back into index buffer

 1c. Wire into OuterWallTessellator.ts main loop (line 948)

 Replace:
 constraintAwareTriangulate(indexBuf, stripBot, stripTop, segConstraints, allChainVertices, gridVertexCount);
 With:
 triangulateChainStrip(indexBuf, stripBot, stripTop, segConstraints,
     allChainVertices, gridVertexCount,
     activeTPositions[j], activeTPositions[j + 1],
     chainStripConfig);

 The chainStripConfig comes from PipelineStageConfig (passed via buildCDTOuterWall params or module-level config).

 1d. Post-CDT adaptive refinement in strip

 After CDT triangulation, for each strip with config.adaptiveRefine:
 1. Identify edges longer than targetEdgeLength * 0.5 (half the grid average)
 2. Split at midpoint, evaluate on GPU surface for exact 3D position
 3. Re-CDT the local patch with the new vertex
 4. Max 2 iterations per strip

 This uses the existing GPU evaluation pipeline (same as Phase 08 in ParametricExportComputer).

 Batch 2: Sweep Backtrack Fix + Winding Verification

 File: OuterWallTessellator.ts (or ChainStripTriangulator.ts)

 2a. Fix constraintAwareTriangulate() backtrack (lines 304-316)

 Current backtrack creates single triangles with potentially wrong winding:
 if (targetBot < curBot && targetTop >= curTop) {
     buf.push(bot[targetBot].idx, top[targetTop].idx, top[anchorTop].idx);
 }

 Fix: verify winding before emitting. Use (u,t) cross product. If CW, swap indices:
 const cross = computeUVCross(bot[targetBot], top[targetTop], top[anchorTop], vertices);
 if (cross > 0) buf.push(bot[targetBot].idx, top[targetTop].idx, top[anchorTop].idx);
 else if (cross < 0) buf.push(bot[targetBot].idx, top[anchorTop].idx, top[targetTop].idx);
 // cross === 0 → degenerate, skip

 2b. Post-triangulation inversion repair pass

 New function repairInvertedTriangles():
 1. Scan all chain-strip triangles for UV-space winding (cross product)
 2. Collect inverted triangles into patches
 3. For each patch: extract boundary vertices → local CDT → replace patch triangles
 4. Return count of repaired triangles

 Batch 3: Export Dialog Integration

 Files: ExportDialog.tsx, ExportPanel.tsx, types.ts

 3a. Add to PipelineStageConfig in types.ts:

 /** Phase 03: Chain-strip triangulation mode ('sweep' | 'cdt' | 'sweep-repair'). */
 chainStripMode: 'sweep' | 'cdt' | 'sweep-repair';
 /** Phase 03: Chain-strip vertex density multiplier (1-4). */
 chainStripDensity: number;
 /** Phase 03: Enable adaptive refinement in chain strips (default: true). */
 chainStripAdaptiveRefine: boolean;

 3b. Add to PipelineConfig in ExportDialog.tsx:

 chainStripMode: 'sweep' | 'cdt' | 'sweep-repair';
 chainStripDensity: number;
 chainStripAdaptiveRefine: boolean;

 3c. Add UI controls in Phase 03 StageSection:

 <ParamRow label="Chain-strip mode" hint="How feature-edge triangulation is computed">
     <Select value={pipeline.chainStripMode}
         options={[
             { value: 'cdt', label: 'Local CDT (best quality)' },
             { value: 'sweep-repair', label: 'Sweep + repair' },
             { value: 'sweep', label: 'Sweep (fastest)' },
         ]}
         onChange={v => onChange('chainStripMode', v)} />
 </ParamRow>
 <ParamRow label="Strip density" hint="Extra vertices near chains (1=normal, 4=very dense)">
     <Slider value={pipeline.chainStripDensity} min={1} max={4} step={1}
         onChange={v => onChange('chainStripDensity', v)} />
 </ParamRow>
 <ParamRow label="Strip adaptive refine" hint="Subdivide long edges in chain strips">
     <Toggle value={pipeline.chainStripAdaptiveRefine}
         onChange={v => onChange('chainStripAdaptiveRefine', v)} />
 </ParamRow>

 3d. Flow config through the pipeline:

 - ExportDialog → useParametricExport → ParametricExportComputer → buildCDTOuterWall → triangulateChainStrip
 - Default: chainStripMode: 'cdt', chainStripDensity: 2, chainStripAdaptiveRefine: true

 Batch 4: Tests

 File: OuterWallTessellator.test.ts, ChainStripTriangulator.test.ts (NEW)

 ChainStripTriangulator.test.ts:

 - CDT mode: basic strip, chain constraints enforced, CCW winding, no degenerates
 - Sweep mode: same tests, verify backtrack fix
 - Sweep-repair mode: inject known inverted triangles, verify repair
 - Dense seeding: verify vertex count increases with densityMultiplier
 - Boundary matching: strip boundaries match grid cells (no T-junctions)
 - Fallback: CDT failure gracefully falls back to sweep

 OuterWallTessellator.test.ts:

 - Update existing companion tests for new insertChainStripVertices (shadow + flank vertices)
 - Integration: full buildCDTOuterWall with CDT mode — all indices valid, aspect ratios improved

 Critical Files

 ┌────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────┐
 │                              File                              │                     Action                      │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/renderers/webgpu/parametric/ChainStripTriangulator.ts      │ CREATE — strategy pattern module                │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/renderers/webgpu/parametric/ChainStripTriangulator.test.ts │ CREATE — unit tests                             │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/renderers/webgpu/parametric/OuterWallTessellator.ts        │ MODIFY — expand companion→strip vertices, wire  │
 │                                                                │ new module                                      │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/renderers/webgpu/parametric/OuterWallTessellator.test.ts   │ MODIFY — update companion tests                 │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/renderers/webgpu/parametric/types.ts                       │ MODIFY — add 3 fields to PipelineStageConfig    │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/ui/controls/ExportDialog.tsx                               │ MODIFY — add chain-strip controls to Pipeline   │
 │                                                                │ tab                                             │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/renderers/webgpu/ParametricExportComputer.ts               │ MODIFY — pass chainStripConfig to               │
 │                                                                │ buildCDTOuterWall                               │
 └────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────┘

 Existing Code to Reuse

 - cdt2d library — already installed, typed at src/types/cdt2d.d.ts
 - bsearchFloor() from GridBuilder.ts — column lookup
 - SurfaceMetric.targetEdgeLength() — for adaptive refinement thresholds
 - ChainStripOptimizer.identifyChainStripTriangles() — region detection
 - MeshSubdivision.identifyChainAdjacentVertices() — proximity detection

 Verification

 1. npx vitest run src/renderers/webgpu/parametric/ChainStripTriangulator.test.ts — all pass
 2. npx vitest run src/renderers/webgpu/parametric/OuterWallTessellator.test.ts — all pass
 3. npx vitest run src/renderers/webgpu/parametric/ — full suite passes
 4. Export with CDT mode: companion count >> 8, missing edges → 0, no inverted chain-strip triangles
 5. Visual: smooth dense triangulation near feature edges

 Known Issue (Out of Scope)

 Anisotropic relaxation causes additional broken triangles — the v21.0 metric relaxation enabled: 200 iterations step
 moves vertices in ways that can create inversions outside chain strips. This is noted for future work and not
 addressed in this plan.