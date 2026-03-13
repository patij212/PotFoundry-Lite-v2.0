# Verifier Round 21 — Critique of Chain-Owned Transition Zones

Date: 2026-03-11

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator is attacking the right defect class: the active outer-wall path still gives topology ownership to the global `unionU` grid and then tries to repair chain-local quality afterward. That is visible in the live pipeline where `ParametricExportComputer` builds one global CDF-adaptive `unionU` from curvature plus chain Gaussian floors before calling `buildCDTOuterWall()` in [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1421) and [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1451). Inside the tessellator, near-feature regions are still resolved by cell-local and super-cell sweeps rather than a chain-owned local remeshing domain in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L943), [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1778), and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1997).

That makes the proposed ownership shift a sound response to the user’s complaint that chain strips inherit grid properties and produce local bumps/valleys. But the proposal understates how much current code depends on the cell-owned representation. This is not a small swap of one triangulation routine. It is a bounded rewrite of the feature-adjacent branch inside `buildCDTOuterWall()` and must be treated as such.

## Critique

### C1 [CRITICAL]: The proposal describes the right ownership shift, but understates the implementation scope

**Generator's claim**: “This is not a full outer-wall rewrite. It is a targeted replacement of the topology owner for feature-adjacent regions.”

**Actual behavior**: The live code no longer uses the archived strip-CDT path. `buildCDTOuterWall()` explicitly states that cell-local quad splitting replaced `ChainStripTriangulator.ts` in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L20) and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L799). The near-feature path is not an isolated strip module; it is the core `emitChainCell()` / `emitSuperCell()` branch inside the main tessellator in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1778) and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1997).

**Counterexample**: If an implementation merely adds a “corridor triangulator” beside the current path but leaves `cellChainMap`, `fusionRequests`, `superCellMap`, `emitChainCell()`, and `emitSuperCell()` structurally intact, the feature zone is still cell-owned. The corridor becomes an overlay, not the owner. The same inherited bottom/top rail logic survives, so the complaint is not fixed at the root.

**Required fix**: Treat this as a bounded architectural rewrite of the chain-adjacent branch within `buildCDTOuterWall()`. Keep `emitStandardCell()` outside corridors, but replace the current chain/super-cell ownership path rather than layering on top of it.

### C2 [CRITICAL]: Seam-collar stitching is the real hard problem, and current downstream code assumes cell-owned seam decomposition

**Generator's claim**: “The host grid attaches only to an outer seam collar of the corridor, never directly to the feature edge.”

**Actual behavior**: The current pipeline gets manifold compatibility from shared cell boundaries, phantom-row propagation, and explicit split-cell emission. The active tessellator already has multiple seam-preservation mechanisms: R37 phantom-row splitting in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1206), R53 boundary propagation and split-cell emission in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1745), and post-build metadata consumed by later stages.

**Counterexample**: If a corridor remesher triangulates locally but does not emit a single authoritative seam decomposition for every touched host-grid edge, then the host side and corridor side will disagree about edge partitioning. That recreates the same T-junction / non-manifold class that R37/R53 were built to suppress.

**Required fix**: The first implementation must define the corridor seam as a first-class boundary contract: which host edges are split, where they are split, and how those splits replace the current R37/R53 cell-local propagation rules for that neighborhood. Without that, the proposal is not implementation-ready.

### C3 [CRITICAL]: The proposal omits required downstream contracts used by optimizers and validators

**Generator's claim**: Replace the near-feature tessellation owner, keep the rest of the pipeline.

**Actual behavior**: `ParametricExportComputer` consumes several feature-zone outputs from `buildCDTOuterWall()`: `quadMap`, `chainEdges`, `chainAdjacentVertices`, `protectedStripVertices`, `fanDiagonalEdges`, and `interpolatedChainVertices` in [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1435) and [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1477). Those feed `buildFeatureEdgeGraphFromChainEdges()`, `optimizeChainStripFlips()`, `optimizeBoundaryDiagonals()`, and `subdivideLongEdges()` in [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1559), [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1800), and [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1820).

**Counterexample**: If a corridor remesher returns triangles but no equivalent of `protectedStripVertices`, later flip/subdivision passes can immediately rewire the corridor. If it returns no `chainAdjacentVertices`, the optimizer’s chain-strip classification becomes stale. If it returns no coherent `quadMap` / boundary ownership story, boundary diagonal optimization becomes undefined in the replaced neighborhood.

**Required fix**: The corridor design must specify replacement metadata contracts for all downstream consumers before implementation starts. A corridor that only solves local triangulation but not optimizer ownership will regress in later passes.

### C4 [WARNING]: “More companion density” is mostly a stale alternative in the live codebase

**Generator's claim**: Prefer corridors over more local companion tuning.

**Actual behavior**: The old generic chain-strip companion / CDT strip path is not the active implementation anymore. `ChainStripTriangulator.ts` is gone, `buildCDTOuterWall()` documents that cell-local quad splitting replaced it, and the backward-compatible `ChainStripConfig` is ignored internally in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L20), [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L848), and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L860).

**Counterexample**: Increasing `chainStripDensity` or `chainStripExpansion` today does not change the primary near-feature tessellation logic, because that config is no longer the owner of the active path.

**Required fix**: Frame “more companion density” explicitly as a rejected legacy branch, not as a serious live alternative, except for the narrow R38 phantom-corridor support fan in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1431).

### C5 [WARNING]: R54 and R55 are not the right answer, but they are not fully replaceable until the corridor owns seam transitions

**Generator's claim**: Wider R54/R55 style fixes are the wrong architectural response.

**Actual behavior**: That claim is directionally correct. R54 fuses narrow chain-adjacent cells after `cellChainMap` ownership is already fixed in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1073). R55 coalesces near-coincident grid and chain edge vertices only when `safeToCoalesce` proves the surrounding cells are all chain/super cells in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L329) and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1683). Both are symptom controls inside a grid-owned representation.

**Counterexample**: Simply widening `R54_NEAR_BOUNDARY_FRAC` or `GRID_CHAIN_COALESCE_RADIUS` cannot prevent the inherited rail problem in `emitChainCell()` because the bottom/top edges still begin with grid corners and are swept as grid-owned monotone boundaries in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1791).

**Amendment**: Keep R54/R55 as fallback degeneracy handling at the host-grid seam until the corridor implementation proves it can replace their stitching role locally. Do not delete them early.

### C6 [WARNING]: Immediate removal of chain-driven global density is premature

**Generator's claim**: Once chain-owned zones exist, the chain Gaussian floor in the outer-wall density profile becomes unnecessary.

**Actual behavior**: The global outer wall is still built from `buildDensityProfile(uCurvature, chainVertexUs, 0.6, 0.004)` and `generateCDFAdaptivePositions(...)` in [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1421). That chain term is currently carrying some feature-adjacent budget even outside the narrowest chain-owned neighborhoods.

**Counterexample**: If chain Gaussian floors are removed before corridor ownership covers seam neighborhoods, overlap cases, and transition collars robustly, the host grid can become too sparse immediately outside the corridor and create a new boundary-quality failure.

**Required fix**: Stage this change. Phase 1 should add corridor ownership while retaining a reduced chain floor. Only after measured corridor coverage and seam behavior are validated should the chain floor be removed or strongly demoted.

### C7 [CRITICAL]: Seam-wrap and circular-domain behavior must be specified up front

**Generator's claim**: Corridor construction at seam wrap needs a circular-domain policy.

**Actual behavior**: The current tessellator sidesteps many wrap cases by dropping seam-crossing chain edges when `Math.abs(u0 - u1) > SEAM_THRESHOLD` in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L974) and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1027). That is a pragmatic simplification of the cell-owned path, not a valid corridor definition.

**Counterexample**: A chain corridor centered near `u = 0.995` with shells on both sides will naturally want support on both sides of the periodic seam. If the corridor builder inherits the current “drop seam-crossing edge” rule, it will either split one physical corridor into two fake domains or starve the seam neighborhood.

**Required fix**: The initial corridor design must choose one wrap policy: unwrapped local coordinates around the chain cut, or true periodic corridor polygons. This cannot be deferred.

### C8 [WARNING]: The metric-aware part is only partially real today

**Generator's claim**: Shell spacing should target near-1:1 3D aspect ratio via a local 3D metric target.

**Actual behavior**: There is a stretch-estimation helper in `OuterWallTessellator` at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L112), but the live tessellator does not use it in the active near-feature path. More sophisticated metric tooling exists elsewhere in `SurfaceMetric` / adaptive refinement, but not as a plug-in corridor sizing system in the current OWT branch.

**Counterexample**: If implementation proceeds with only a paper-level “near-1:1 in 3D” target and no concrete metric source, shell spacing will fall back to UV heuristics and reintroduce the same mismatch the proposal is meant to eliminate.

**Required fix**: Start with a measurable surrogate: circumferential stretch estimate plus band height, then gate the result with post-GPU aspect / stretch diagnostics from the existing validation stack. Do not promise full local metric optimality in phase 1.

## Accepted Items

1. The diagnosis that global `unionU` ownership is the wrong response to the user’s complaint is correct. The current global density path still encodes chain presence as column budget in [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1421).
2. The claim that the live near-feature path is still grid-cell-first is correct. `cellChainMap`, `fusionRequests`, super-cells, `emitChainCell()`, and `emitSuperCell()` are the active owners in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L943), [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1010), [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1778), and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1997).
3. The proposal is stronger than wider R54/R55 tuning because it changes topology ownership rather than pushing harder on post-hoc corrections.
4. The proposal is stronger than U-column injection because exact or denser columns still feed the same cell-owned sweep machinery.

## Rejected Items

1. The idea that this remains a narrowly-scoped replacement for only `emitChainCell()` / `emitSuperCell()` is too optimistic unless seam decomposition, metadata contracts, and wrap policy are included in scope.
2. Immediate removal of chain-driven Gaussian floors from the outer-wall density profile should be rejected for phase 1.

## Comparison Against Alternatives

### Wider R54 / R55 Fixes

Reject as the primary response. R54 and R55 operate after the feature zone is already encoded as grid-owned cells in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1073) and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L2191). They can suppress the worst narrow-side or near-coincident failures, but they cannot stop inherited rail topology from producing chain-to-grid micro undulations.

### More Companion Density

Reject as a live primary option. The generic strip-companion/CDT regime is archival; the active tessellator explicitly ignores legacy strip-density config in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L848). The only live “companions” are narrow R38 phantom supports around boundary crossings in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1431), which are too local and too special-case to solve the general complaint.

### U-Column Injection

Reject. The current global density system already demonstrates the failure mode: shared chain U ranges are aliased into one global `unionU`, then consumed by cell-owned sweep logic. Injecting more exact columns changes sampling density but not near-feature ownership.

## Implementation Conditions

1. Define the corridor seam contract before coding: touched host edges, split points, and manifold matching rules.
2. Specify replacement outputs for `quadMap`, `chainAdjacentVertices`, `protectedStripVertices`, `fanDiagonalEdges`, and exact `chainEdges` semantics so `ParametricExportComputer` downstream stages remain correct.
3. Keep R54/R55 and current host-grid emission outside the corridor for phase 1; demote them only after corridor seam behavior is validated.
4. Retain a reduced chain floor in the global outer-wall density profile for the first corridor implementation. Remove it only after coverage and boundary-quality diagnostics prove it redundant.
5. Choose and document a periodic seam policy for corridors before implementation.
6. Gate the first implementation with concrete metrics: count of direct feature-to-host-grid triangles, 3D aspect ratio around corridor shells, seam split count, non-manifold edge count, and stretch-ratio diagnostics.

## Final Verdict

**ACCEPT WITH AMENDMENTS**

The chain-owned corridor architecture is the right strategic response to the user’s complaint. It attacks the real ownership bug instead of tuning around it. But in the live PotFoundry codebase it is not merely “replace strip triangulation.” It must be treated as a controlled rewrite of the feature-adjacent branch inside `buildCDTOuterWall()`, with explicit seam ownership, downstream metadata contracts, staged global-density rollback, and a real periodic-domain policy.