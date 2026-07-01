# ADR 0002: Outward-Consistent Mesh Orientation for CAD/Slicer Export

## Status
Accepted

## Context
PotFoundry exports pot meshes to STL for downstream use in CAD (Rhino,
Grasshopper) and 3D-print slicers (PrusaSlicer, Cura). All of these tools
require an exported solid to be a **consistently oriented, closed, orientable
manifold whose facet normals point outward**. Both the ASCII and binary STL
writers derive each facet normal directly from triangle winding
(`normal = (b - a) x (c - a)`), so winding *is* the exported normal.

### The defect
Empirical probing of `build_pot_mesh` across all five styles and multiple
parameter sets revealed two orientation defects baked into every export:

1. **Global inversion** — the signed volume of the mesh was negative for every
   style/parameter combination, i.e. every facet's normal pointed *inward*. The
   exported solid was effectively "inside out"; slicers can interpret solid as
   void and vice-versa.
2. **Inconsistent winding** — exactly `2 * n_theta` edges (in the bottom/drain
   assembly) were traversed in the *same* direction by both adjacent faces. CAD
   tools flag such edges as naked / non-manifold even though each edge is
   topologically shared by two triangles.

The mesh was already **index-manifold** (every undirected edge shared by
exactly two faces), so the topology was sound — only the per-block winding was
wrong. The builder authored the outer wall, inner wall, rim annulus and bottom
underside with inward winding, while the slab-top and drain-cylinder blocks
were authored outward — internally inconsistent.

## Decision
Fix the winding **at construction time**, correct-by-construction, rather than
running a runtime orientation-repair pass.

A reference implementation of the standard consistent-orientation algorithm
(BFS over edge adjacency + global sign flip by signed volume) was used *once,
offline*, to derive which construction blocks needed reversal. Because the mesh
topology is identical across all styles (only vertex positions differ), the
per-block decision is uniform and stable:

| Block                 | Action | Correct outward normal      |
|-----------------------|--------|-----------------------------|
| Outer wall            | flip   | away from axis (+radial)    |
| Inner (cavity) wall   | flip   | toward axis (into cavity)   |
| Rim annulus           | flip   | up (+Z)                     |
| Bottom underside      | flip   | down (-Z)                   |
| Slab top (cavity floor) | keep | up (+Z)                     |
| Drain cylinder wall   | keep   | toward axis (into hole)     |

Each flip is a single vectorized winding reversal (`tri[:, ::-1]`) applied via
the `_rev` helper in `potfoundry/core/geometry.py`. This adds negligible cost
(build of a 168x84 mesh stays ~24 ms against a 200 ms budget) versus a
per-facet BFS repair, which would not fit the performance envelope for
high-resolution meshes (~230k faces).

## Consequences
- Exported STL solids (ASCII and binary) now have outward-consistent normals
  by construction; positive signed volume for all styles/parameters.
- The invariants are pinned by `tests/test_mesh_orientation.py`, which asserts
  index-manifoldness, consistent winding, positive signed volume, and that the
  binary STL's stored normals equal the winding normals — parameterized across
  all styles and an extreme-geometry parameter set.
- The fix is procedural and depends on the fixed mesh topology. Any future
  change to `build_pot_mesh` topology (new surface blocks, changed drain
  construction) must re-verify orientation; the orientation test suite guards
  against regressions.
- A hollow vessel's inner-cavity facets correctly point *inward*, so
  "all normals point away from the centroid" is **not** a valid check. Signed
  volume is the correct global orientation invariant and is what the tests use.
