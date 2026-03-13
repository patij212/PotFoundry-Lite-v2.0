 the debug# Generator Round 40 — Protected Corridor vs Final Subdivision
Date: 2026-03-08

## Problem Statement

Visible feature-edge jaggedness persists even after mesh-guide chains and R38 protected-corridor support. The export log shows that later topology passes still rewrite the feature neighborhood heavily, and the final pass in that sequence still has no notion of the protected corridor.

## Root Cause Analysis

1. The outer-wall tessellator already computes a protected corridor as `protectedStripVertices` in [src/renderers/webgpu/parametric/OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1090) and returns it through `buildCDTOuterWall()` for downstream preservation.

2. `ParametricExportComputer` threads that protected set into the chain-strip and boundary optimizers at [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1561) and [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1582), while those optimizers explicitly skip quads and triangles touching protected vertices at [src/renderers/webgpu/parametric/ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L565), [src/renderers/webgpu/parametric/ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L875), and [src/renderers/webgpu/parametric/ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L887).

3. The final GPU-surface subdivision pass is called later at [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1602), after all of those protections, but `SubdivisionParams` in [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L56) has no `protectedVertices` field.

4. Inside `subdivideLongEdges()` at [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L269), candidate edges are rejected only if they are literal chain constraints at [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L361). Any long non-constraint edge in the chain-strip or boundary neighborhood is still eligible for splitting at [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L374).

5. That means R38 protects the corridor from diagonal rewrites, then the last pass inserts fresh midpoint vertices into the same neighborhood anyway. Those new vertices are created after chain-directed locking, after generic flips, after strip optimization, and after boundary optimization, so they bypass every earlier stabilization decision.

## Proposals

### Proposal 1: Protect Subdivision With Existing Corridor Set (Conservative, Recommended)
**Idea**: Extend subdivision to accept the existing protected corridor and refuse splits whose edge endpoints or incident triangles touch that set.

**Mechanism**:
- Add `protectedVertices?: Set<number>` to `SubdivisionParams` in [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L56).
- Pass `outerProtectedStripVertices` from [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1602) into `subdivideLongEdges()`.
- In `subdivideLongEdges()` at [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L323), add a local guard that skips any candidate split edge when:
  - `protectedVertices.has(v0)` or `protectedVertices.has(v1)`, or
  - either adjacent triangle contains a protected vertex.

**Why this is most likely correct**:
- It matches the observed asymmetry exactly: strip and boundary passes preserve the corridor, subdivision does not.
- It targets the final topology-mutating pass, so it removes the last opportunity to destabilize the visible edge.
- It is smaller and lower-risk than retuning the global flip heuristics or changing chain smoothing again.

**Trade-offs**:
- Some long edges inside the protected corridor will remain unsplit.
- Local triangle quality may be slightly worse by pure aspect metrics, but the visible ridge should be more stable because the corridor topology stops changing after protection is established.

**Assumptions**:
1. The remaining visible instability is dominated by post-protection topology mutation, not by chain geometry alone.
2. The protected corridor already marks the right neighborhood tightly enough that skipping subdivision there will not over-freeze unrelated cells.

### Proposal 2: Broaden Protection to Generic 3D Flips (Moderate)
**Idea**: Also thread corridor awareness into `flipEdges3D()`.

**Why I do not recommend it first**:
- The generic pass is much broader and earlier, so changing it is a larger behavioral intervention.
- The smallest fix with the highest signal-to-risk ratio is to stop the final pass from reopening a corridor the earlier passes already agreed to preserve.

## Recommended Approach

Recommend **Proposal 1**.

The most likely remaining root cause is not that the guide chain is still too rough. It is that the mesh neighborhood around that guide is still being altered after the corridor was explicitly protected. Further chain smoothing attacks the upstream path again. This fix attacks the last downstream pass that still ignores the corridor and therefore has the highest chance of stabilizing the visible edge with the least production risk.

## Exact Files / Functions To Change

1. [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1602)
Pass `outerProtectedStripVertices` into `subdivideLongEdges()`.

2. [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L56)
Add `protectedVertices?: Set<number>` to `SubdivisionParams`.

3. [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L269)
Update `subdivideLongEdges()` to read the protected set.

4. [src/renderers/webgpu/parametric/MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L361)
Extend the candidate-edge rejection logic so protected corridor edges and protected-adjacent triangle pairs are never split.

## Why This Beats More Chain Smoothing

The chain metrics already improved upstream. The log proves that. But the visible edge is still subjected to later topological mutation: chain-directed flips, generic flips, strip flips, boundary flips, then 2129 GPU-surface edge splits. More smoothing only changes the path those passes start from. Protecting subdivision changes whether the final pass is allowed to rewrite the already-repaired corridor at all. That is the smaller, more production-safe lever.