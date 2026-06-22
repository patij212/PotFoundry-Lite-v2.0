# ADR 0002: Guarantee Outward-Facing Mesh Orientation for CAD Export

## Status
Accepted

## Context
PotFoundry exports parametric pots as triangle meshes (binary STL). A key
quality goal is clean interchange with CAD tools, specifically
**Grasshopper/Rhino**. Unlike most slicers (PrusaSlicer, Cura), which silently
auto-repair face winding on import, Rhino and Grasshopper **respect the
orientation encoded in the mesh**. A mesh whose normals point the wrong way
imports "inside-out":

- shading/render is inverted,
- Rhino's `Volume` reports a negative value,
- mesh operations (offset, thicken, `MeshToNURB`, boolean) behave incorrectly.

### What was wrong
TDD investigation (`tests/test_mesh_orientation.py`) proved two coupled defects
in `build_pot_mesh`, present across **every** style and parameter combination:

1. **Globally inverted winding.** The closed mesh enclosed a *negative* signed
   volume (divergence theorem), i.e. every face normal pointed *into* the
   solid instead of out of it. Verified against a known outward-facing unit
   cube to confirm the sign convention.

2. **Locally inconsistent winding.** The "top-of-slab" and "drain-cylinder"
   patches were wound opposite to the walls. A directed-edge analysis found
   exactly `2 * n_theta` directed edges (the z=0 and z=t_bottom seam rings)
   traversed in the *same* direction by both adjacent faces — the signature of
   an orientation flip between adjacent surface patches. The mesh was still
   manifold (every undirected edge shared by two faces), which is why the
   pre-existing watertightness test did not catch it.

The existing `test_mesh_has_consistent_normals` test only asserted normals were
non-zero (`pass # Skip strict check`), so neither defect was covered.

## Decision

1. **Fix winding at the source.** Reverse the construction winding of the
   `tri_top*` (top-of-slab) and `tri_cyl*` (drain-cylinder) patches so the
   whole mesh is *consistently* oriented. This is a purely combinatorial fix
   (independent of style/parameters), so it holds for all inputs.

2. **Add a cheap, vectorized outward-orientation guard.** At the end of
   `build_pot_mesh`, `_orient_faces_outward` computes the mesh signed volume
   (O(faces), microseconds) and reverses *all* faces if it is negative. For a
   connected, consistently oriented closed manifold this guarantees outward
   normals.

We deliberately **avoided a generic flood-fill orientation repair** on the
build path: `build_pot_mesh` runs on the interactive preview path (and must
stay under the 200 ms / 50 ms performance budgets), and a Python flood-fill
over ~58k faces would blow that budget. The combinatorial patch fix plus a
vectorized global guard achieves correctness at effectively zero runtime cost.

### Why this is sound
For a connected, closed, orientable 2-manifold that is consistently oriented,
the signed volume is `+V` (V>0) iff all normals point outward and `-V` iff all
inward. The test suite therefore proves outward orientation by combining:
- manifold check (every undirected edge shared by exactly 2 faces),
- consistency check (every directed edge appears exactly once),
- positive signed volume.

These are backed by a rigorous, geometry-agnostic ray-cast (Möller–Trumbore)
parity test confirming that stepping along a face normal exits the solid —
this works on decorative/petalled surfaces where a naive "normal is radial"
heuristic is meaningless (normals there are strongly tangential).

## Consequences
- Exported STLs now enclose positive volume; stored STL normals agree 100% with
  outward winding. Meshes import correctly into Grasshopper/Rhino.
- Mesh **topology and dimensions are unchanged** (same vertex/face counts);
  only triangle winding (vertex order within faces) changed, so golden
  vertex/face-count and dimension tests are unaffected.
- Negligible performance impact (typical build ~27 ms, well under budget).
- New regression coverage: `tests/test_mesh_orientation.py` (manifold,
  consistent orientation, outward normals, no degenerate faces, ray-cast
  normal verification) across 6 style/parameter cases.

## Future work
- Add OBJ/3MF export (which can carry per-vertex normals and grouping) building
  on this guaranteed orientation.
- Optionally expose `_orient_faces_outward` publicly for use by any future
  externally-sourced meshes that need repair before export.
