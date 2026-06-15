# ADR 0002: Mesh Orientation Normalization for Rhino/Grasshopper Export Quality

## Status
Accepted

## Context
PotFoundry exports triangle meshes (STL today; OBJ/3MF planned) that users
import into CAD/parametric tooling — notably **Rhino** and **Grasshopper** — for
further modeling, boolean operations, capping, and volume analysis. These tools
(unlike most FDM slicers, which silently recompute winding) honor the mesh's
*winding order* and *face normals*. A mesh that is "watertight" in the loose
sense — every undirected edge shared by exactly two faces — can still import
incorrectly when:

1. **The whole mesh is wound inside-out** — normals point inward, the enclosed
   volume is negative, shading is inverted, and `Mesh.Volume` / capping / unions
   misbehave.
2. **Winding is inconsistent at a seam** — two adjacent faces disagree on which
   side is "out", producing shading discontinuities and broken solid operations.

### What was proved
The mesh builder in `potfoundry/core/geometry.py` constructs the surface from
several hand-wound triangle groups (outer wall, inner wall, rim cap, bottom
underside, top-of-slab, drain cylinder). Diagnostic analysis of the generated
meshes showed **both** failure modes, for **all five styles**:

- **Globally inverted**: divergence-theorem signed volume was *negative*
  (e.g. SuperformulaBlossom ≈ −105,460), i.e. normals pointed inward.
- **Locally inconsistent**: 240 directed edges (= `2 × n_theta`) were traversed
  the same way by both their faces. The inconsistency was localized to the
  **bottom-slab / drain seams** (inner-wall bottom ring, bottom underside, top
  slab, drain cylinder), which were wound opposite to the walls.

The pre-existing test `test_mesh_has_consistent_normals` only asserted that
normals were non-zero — its outward-orientation check was a `pass # Skip` no-op,
so the defect shipped undetected.

## Decision
Add a single, geometry-independent **orientation-normalization pass**,
`orient_mesh(verts, faces)`, applied at the end of `build_pot_mesh` so that both
preview and export consume the same corrected mesh (parity preserved).

The pass guarantees an orientable, outward-facing manifold regardless of how the
triangles were generated:

1. **Consistency** — flood-fill a per-face winding sign across shared edges
   (BFS over the dual graph) so every interior edge is traversed in opposite
   directions by its two faces. This is robust to *any* per-group winding
   mistake, present or future.
2. **Outward** — flip the whole mesh if the resulting signed volume is negative,
   so normals point outward (positive enclosed volume).

We chose a general post-pass over hand-fixing each group's winding because the
hand-wound seams are exactly what produced the bug; a single robust invariant is
more maintainable and protects new geometry (e.g. future drainage patterns,
internal lattices) for free.

### Performance
The pass is fully vectorized: edge adjacency via sort + `np.unique` grouping,
then a CSR frontier BFS (amortized O(E), each edge touched O(1) times). Measured
overhead on top of mesh generation:

| Resolution | Faces   | Build  | Orient | Budget |
|------------|---------|--------|--------|--------|
| 60×30      | 7,680   | ~4 ms  | ~7 ms  | 50 ms  |
| 168×84     | 57,792  | ~19 ms | ~47 ms | 200 ms |
| 336×168    | 228,480 | ~66 ms | ~191 ms| 1000 ms|

All performance regression tests continue to pass.

## Consequences
- **Positive**: Every exported mesh is now a consistently-oriented, outward
  manifold — correct shading and working solid/boolean ops in Rhino/Grasshopper;
  STL normals (auto-computed from winding) are outward; `Mesh.Volume` is
  positive and physically meaningful.
- **Positive**: New invariant guards future geometry changes via tests.
- **Neutral**: Golden-mesh hash tests are unaffected (they assert determinism
  and discrimination, not absolute hashes); face *count*, surface area, and
  bounding box are unchanged by re-winding.
- **Cost**: Modest per-build CPU overhead (see table), well within budget. The
  pass assumes a manifold input (edges shared by two faces); non-manifold edges
  are skipped rather than erroring, leaving their local orientation untouched.

## Validation
- `tests/test_mesh_orientation.py` — for every style asserts (a) globally
  consistent winding (each directed edge appears once with one reverse) and
  (b) positive signed volume (outward normals). Confirmed failing before the
  change, passing after.
- `tests/test_golden_meshes.py::test_mesh_has_consistent_normals` — strengthened
  from a no-op to assert non-degenerate normals and positive signed volume.
- End-to-end: a written binary STL re-parsed from disk yields positive signed
  volume from its stored facet vertices.
- `orient_mesh` validated on an independently-constructed, deliberately
  mis-wound cylinder: it repairs the winding (signed volume → +π·r²·h) and
  100% of side-wall normals point outward.
