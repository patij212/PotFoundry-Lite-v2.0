# ADR 0002: Consistent Outward Mesh Orientation for CAD Export

## Status
Accepted

## Context
PotFoundry exports pot meshes as binary STL for downstream use in slicers and,
increasingly, in CAD tools such as **Rhino / Grasshopper**. CAD import is far
less forgiving than slicing: it relies on consistent face winding and outward
normals to reconstruct a closed solid, to shade surfaces, and to run boolean /
mesh-repair operations. A mesh that is watertight but inconsistently wound (or
wound inward) imports "inside-out", shows seams Rhino reports as *naked* /
*non-manifold* edges, and breaks solid operations.

### What was wrong
`build_pot_mesh` assembles the pot from six structured face groups: outer wall,
inner wall, rim cap, bottom underside, top-of-slab, and drain cylinder. Audit
of the generated mesh (all five styles, every resolution) found:

- **Signed volume was negative** (divergence theorem, `V = 1/6 Σ v0·(v1×v2)`),
  i.e. the dominant orientation was inward — every export imported inside-out.
- **336 inconsistently-wound directed edges** (= 2 × n_theta) clustered at the
  bottom seams (z=0 and z=t_bottom). In a consistently oriented closed manifold
  every *directed* edge appears exactly once; here the outer wall, inner wall,
  rim cap, and bottom underside were wound opposite to the (correct) drain
  cylinder and slab top, so the shared rings were traversed the same way by both
  neighbours.

The mesh was already a clean closed 2-manifold (0 non-manifold *undirected*
edges), so it was orientable — the winding just needed correcting.

The pre-existing `test_mesh_has_consistent_normals` used a per-face radial dot
heuristic, which is unreliable for decorative (petalled) profiles whose faces
locally point inward even on the outer wall. That test had been stubbed to
`pass`, so the defect went undetected.

## Decision
1. **Fix the winding at construction time**, analytically, in both the live
   `potfoundry/core/geometry.py` and the legacy `potfoundry/geometry.py`. Each
   of the four mis-wound groups had its triangle winding reversed so the whole
   mesh is consistently **outward**-oriented by construction:
   - outer wall → normal radially out
   - inner wall → normal toward the axis (cavity is empty)
   - rim cap → normal up (+z)
   - bottom underside → normal down (−z)
   - top-of-slab (+z) and drain cylinder (toward axis) were already correct.

   This is the root-cause fix and costs **zero** runtime (~31 ms generation
   unchanged), so it applies to preview and export alike. A generic
   BFS-orientation pass was rejected for the hot path because it would breach
   the 200 ms generation budget; the analytic fix is exact and free.

2. **Guard it with divergence-theorem tests** (`tests/test_mesh_orientation.py`)
   rather than the radial heuristic. Signed-volume sign and the directed-edge
   count are exact for any closed manifold regardless of surface decoration.

3. **Add an end-to-end export round-trip** (`tests/test_stl_export_roundtrip.py`)
   that parses the written binary STL, welds vertices by coordinate the way a
   CAD importer does, and re-verifies watertightness, winding, and outward
   normals — plus that the stored per-facet normals agree with the winding.

## Consequences
- Exports now import right-side-out into Rhino/Grasshopper with no naked-edge
  seams; auto-computed STL facet normals are correct.
- Mesh **topology is unchanged** (same vertex/face counts), so golden-mesh
  count/metric tests and performance budgets are unaffected.
- Two duplicate geometry modules still exist and were fixed in lockstep;
  de-duplicating them remains future work (tracked separately) and is a latent
  risk if they drift.
- Future structured face groups must be added with outward winding; the
  orientation tests will catch regressions at every resolution and style.
