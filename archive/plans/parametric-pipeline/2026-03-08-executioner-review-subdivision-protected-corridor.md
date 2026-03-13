# Executioner Review — Protected Corridor In MeshSubdivision
Date: 2026-03-08

## Feasibility Assessment

Verdict: FEASIBLE with a small, local change.

`subdivideLongEdges()` currently rebuilds the chain-strip/boundary neighborhood and then selects candidate shared edges purely from edge length and constraint status in [potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L269). The R38 protected corridor is already passed into the flip optimizers from [potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1552), but the subdivision call omits it at [potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1602). Extending `SubdivisionParams` with `protectedVertices?: Set<number>` and applying the same `any protected vertex => skip` rule during candidate selection is mechanically straightforward and consistent with the existing optimizer semantics in [potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L565) and [potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L875).

I do not see an architectural blocker. This is a low-risk API extension plus one new filter in subdivision candidate collection.

## File Impact Analysis

Minimum files:

1. [potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts)
Add `protectedVertices` to `SubdivisionParams`, destructure it in `subdivideLongEdges()`, and skip edge candidates whose two incident triangles touch the protected corridor.

2. [potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts)
Pass `outerProtectedStripVertices` into the subdivision call alongside the existing `chains` and `finalT` params.

3. [potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.test.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.test.ts)
Add focused unit coverage for protected-corridor skipping and backward compatibility when `protectedVertices` is undefined.

Optional but not strictly required:

4. [potfoundry-web/src/renderers/webgpu/ParametricExportComputer.test.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.test.ts)
Only needed if you want one orchestration-level assertion that the new param is threaded through; not required for the minimal fix.

## Risk Zones

1. Corridor starvation is the main real risk.
The subdivision pass considers both chain-strip triangles and immediate boundary neighbors in [potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L322). A hard skip on any protected vertex will suppress all splits on the local two-triangle patch around an edge, which may leave some long edges intact near phantom anchors and companions. That is acceptable if the goal is to preserve the repaired corridor, but it can reduce the effectiveness of subdivision if the protected set grows later.

2. Protection should apply to the full two-triangle split patch, not just the edge endpoints.
Each split rewrites two existing triangles and appends two more in [potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L423). If the guard only checks `v0`/`v1`, subdivision could still reshape a corridor triangle through an unprotected long edge whose opposite vertex is protected. The right granularity is the same four-vertex quad used by the flip optimizer: shared edge endpoints plus both opposite vertices.

3. Appended triangles do not need extra protection for this pass.
`subdivideLongEdges()` is single-pass: candidates are collected before any new vertices or triangles are appended. That means newly created midpoint triangles cannot be reconsidered in the same call. No extra bookkeeping for new protected midpoint vertices is required unless a later design adds iterative subdivision.

4. `chainAdjacentVertices` and `protectedVertices` solve different problems.
UV-proximity chain detection in [potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L142) expands which triangles are considered chain-strip, but the protected set from R38 only marks phantom anchors and local companions created in [potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1227). So this fix protects the phantom corridor specifically, not every UV-snapped chain-adjacent neighborhood. If the jaggedness source is broader than the phantom corridor, this change may be necessary but not sufficient.

5. UV data is still not extended by subdivision.
Subdivision appends 3D positions and indices but does not grow `combinedVerts` in [potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L458). That pre-existing limitation does not block this protection change, because the protection decision is made before splitting. It is still worth noting if someone later wants a second post-subdivision pass that relies on UV metadata for new midpoint vertices.

## Unstated Dependencies

1. The change assumes `outerProtectedStripVertices` is already available from the tessellator result, which it is via [potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1361).

2. The protected set is intentionally sparse: only true boundary-crossing phantom anchors and their side companions are marked in [potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1263). That limited scope is what makes a hard skip feasible.

3. The existing optimizer contract is vertex-based, not edge-based. Reusing that contract avoids inventing a second corridor definition just for subdivision.

## Implementation Sequence

1. Add `protectedVertices?: Set<number>` to `SubdivisionParams` in [potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L56).
2. Thread the param through the subdivision call in [potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1602).
3. In candidate selection, decode the two shared-edge endpoints plus their two opposite vertices and skip when any of the four are protected.
4. Add a unit test proving a formerly splittable edge is skipped when one of the four patch vertices is protected.
5. Add a unit test proving legacy behavior is unchanged when `protectedVertices` is omitted.

## Recommendation

Use a hard skip on the full two-triangle patch.

Why:

- It matches the R38 optimizer behavior already in production.
- It is the smallest change that actually preserves corridor topology.
- Threshold inflation is weaker and harder to reason about because the operation can still fire on the exact corridor you are trying to freeze.
- A softer rule creates tuning work without strong evidence that the hard skip overprotects, because the current protected set is already narrowly targeted.

If follow-up testing shows obvious under-subdivision beside the corridor, the next minimal step is not global threshold inflation. The next step would be a narrower skip rule, for example protecting only when a protected vertex is one of the two incident triangle opposites or when the shared edge itself touches a protected endpoint. That is a second-step tuning option, not the right first fix.