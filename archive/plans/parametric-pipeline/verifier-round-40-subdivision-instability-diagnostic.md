# Verifier Diagnostic — Subdivision vs Persistent Feature-Edge Jaggedness
Date: 2026-03-08

## Summary Verdict: ACCEPT WITH AMENDMENTS

Unprotected GPU-surface subdivision is a credible cause of persistent visible feature-edge instability, but not the strongest single explanation for the full export failure signature. It is a late-stage local shape amplifier that can bypass the R38 protected corridor. It does not plausibly explain the very large seam gap or the global open-boundary counts by itself.

## Evidence

1. The protected corridor exists only as a vertex set emitted by the tessellator: boundary-crossing phantom anchors and their companions are added to `protectedStripVertices` in [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1090) and populated at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1263).

2. That protection is forwarded into the chain-strip and boundary optimizers from [ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1552) and [ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1573).

3. The chain-strip optimizer actually honors the corridor. It rejects flips whenever any quad endpoint touches a protected vertex at [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L564), [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L586), [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L659), and [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L714). Boundary diagonal optimization also skips cells or adjacent strip triangles touching protected vertices at [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L875) and [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L890).

4. Subdivision receives no such protection. The call at [ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1602) passes chains and constraint edges, but no protected vertex set.

5. Subdivision explicitly targets the same neighborhood R38 was trying to stabilize. It rebuilds an adjacency map over chain-strip triangles and standard-grid triangles that share edges with them at [MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L332) and [MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L347). It then splits any shared non-constraint edge longer than the interior or boundary threshold at [MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L361), [MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L371), and [MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L374).

6. Those splits mutate existing triangles in place and append new triangles after all protected flip passes have finished at [MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L413). There is no later corridor-aware repair pass.

## Root Cause Assessment

### A1 [WARNING]: Subdivision is a credible local destabilizer
**Claim being tested**: unprotected subdivision can reintroduce visible instability after R38 protection.

**Verified behavior**: yes. R38 protects only later edge flips and diagonal swaps, not edge splitting. Subdivision operates specifically on chain-strip and strip-boundary shared edges and can split edges incident to protected phantom anchors or companions as long as the edge itself is not in `constraintEdgeSet`.

**Why this matters visually**: the feature edge may stay topologically present, but its local support fan can change after the corridor was intentionally frozen. Since the midpoint is inserted from UV-space and the two original triangles are replaced by four, the local normal field and silhouette-supporting triangulation can still become stair-stepped.

**Why this is not sufficient as the sole root cause**: edge splitting does not create seam closure, and by construction it only touches edges with exactly two adjacent faces. That makes it a weak explanation for `seam gap 11.310mm` and a weak primary explanation for `27452 boundary edges`. It may contribute to inconsistent normals, but it is not the architectural source of the open seam.

### A2 [WARNING]: The strongest competing explanation is still the broad generic 3D quad flip pass
**Claim**: if subdivision is not the main source of the visible jaggedness, the next most likely culprit is the generic 3D flipper.

**Verified behavior**: `flipEdges3D` runs before the protected passes, iterates every standard quad for up to 5 passes, and only respects `lockedQuads`, not the R38 protected corridor, at [MeshOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshOptimizer.ts#L290), [MeshOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshOptimizer.ts#L363), and [MeshOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshOptimizer.ts#L349). The lock band itself is intentionally narrow at [MeshOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshOptimizer.ts#L25).

**Why it is stronger globally**: the observed count is `141752` flips, far larger than `2129` subdivision splits. This pass can alter a large halo of standard support quads around feature corridors before the corridor-specific optimizers even run. If the lock band misses phantom-boundary neighborhoods, the later protected passes may refuse to touch exactly the cells already degraded by the generic pass.

### A3 [NOTE]: The validation counters still point to an independent seam/topology problem
`checkManifold()` counts boundary and non-manifold edges purely from edge-face multiplicity at [MeshValidator.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshValidator.ts#L214), while the seam metric is a separate continuity measure downstream of seam pairing. Neither mechanism depends on protected subdivision logic. So the extreme `boundary edges` and `seam gap` numbers should not be used as proof that subdivision is the primary defect.

## Falsification Experiment

Implement the smallest possible A/B:

1. Add `protectedVertices?: Set<number>` to `SubdivisionParams` and thread `outerProtectedStripVertices` from [ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1602).
2. In `subdivideLongEdges`, reject any candidate edge whose endpoints or opposite vertices touch the protected corridor before it enters `edgesToSplit` or `splitsToApply`.
3. Re-run one known-bad export twice with only this flag difference.

Falsification criterion:
- If visible edge jaggedness drops materially while chain quality, seam gap, and boundary-edge counts stay roughly unchanged, subdivision is a real local root cause/amplifier.
- If the visible artifact is unchanged, reject subdivision as the dominant explanation and focus on `flipEdges3D` coverage around the phantom corridor.

Recommended metrics to capture in the log:
- count of candidate subdivision edges touching protected vertices
- count of blocked protected-corridor splits
- max and mean distance from protected anchors to newly inserted midpoint vertices
- before/after screenshots or chain-edge local angle statistics for the same export seed

## Risk and Blast Radius

- Code risk: low to moderate. The change is local to `MeshSubdivision.ts` plus one call-site parameter in `ParametricExportComputer.ts`.
- Behavioral risk: moderate. Blocking splits in the protected corridor may preserve visible features while worsening local aspect ratios or leaving some long edges unresolved.
- Blast radius: limited to post-tessellation outer-wall refinement. It should not affect chain detection, row insertion, grid generation, or seam healing logic.
- False-confidence risk: high if judged only by manifold metrics. A successful local A/B may improve visible jaggedness without moving the seam or boundary-edge failures much at all.