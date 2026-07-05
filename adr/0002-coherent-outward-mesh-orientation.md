# ADR 0002: Coherent, Outward-Facing Mesh Orientation for CAD Export

## Status
Accepted

## Context
PotFoundry exports pot geometry as STL for downstream use in slicers and CAD
tools. A key target is **clean import into Rhino / Grasshopper**, which impose
requirements beyond simple watertightness:

1. **Coherent orientation** — every interior edge must be shared by exactly two
   faces that traverse it in *opposite* directions. Rhino reports a mesh that
   fails this as having "inconsistent normals" and boolean/solid operations
   become unreliable.
2. **Outward-facing normals** — the closed solid must have positive signed
   volume (divergence theorem). A negatively-oriented mesh is "inside-out";
   CAD kernels and slicers then treat the solid as inverted.

### The defect
The existing `build_pot_mesh` assembled the solid from several independently
wound patches (outer wall, inner wall, rim cap, bottom slab under-side, top of
bottom slab, drain cylinder). Diagnostics on the produced mesh showed, for
**every** style:

- `signed_volume < 0` — the whole solid was inside-out (all normals inward).
- `120` incoherent edges at the drain rings (`z = 0` and `z = t_bottom`),
  i.e. `2 × n_theta` seams where neighbouring patches disagreed on winding.

The mesh passed the existing watertightness test (each edge in exactly two
faces) because that test only counts edge multiplicity, not orientation. The
consistent-normals test explicitly skipped the check (`pass  # Skip strict
check for now`), so the defect was invisible to CI.

## Decision

Two complementary pieces:

1. **Bake correct winding into the builder.** The winding topology is
   style-independent (styles only modulate radii), so the correct, coherent,
   outward winding is deterministic. Each patch is now wound so the assembled
   solid is coherent and outward with **zero runtime cost** — no post-hoc
   repair in the hot path. This keeps mesh generation within its performance
   budget (< 200 ms at 168×84).

2. **Add `orient_mesh_coherently(verts, faces)` as a public utility.** A
   general BFS flood-fill repair pass that coherently orients any closed
   2-manifold and flips it outward via signed volume. It is *not* called on the
   builder hot path, but:
   - served as the **oracle** to derive the correct per-patch winding, and
   - remains available to validate or repair externally-sourced meshes.

   Also exposes `mesh_signed_volume(verts, faces)` as a small shared helper.

### Why not run the repair pass on every build?
A pure-Python flood-fill over ~58 k faces added ~40 ms, pushing the 168×84
build over the 200 ms performance budget. Because the builder's winding is
deterministic, baking the fix in is both faster and simpler than a general
repair on every export. The general pass is retained for robustness where the
mesh provenance is unknown.

## Consequences

- **Positive:** Exported STLs import into Rhino/Grasshopper as valid, coherent,
  right-side-out solids. Slicers fill them correctly. Boolean/solid operations
  are reliable. The property is now regression-guarded across all styles.
- **Neutral:** Face *ordering/winding* in the output arrays changed. The golden
  tests compare same-parameter hashes (determinism) and vertex/face **counts**,
  not absolute winding, so they remain green. Vertex data is unchanged.
- **Guarded by tests:** `tests/test_mesh_orientation.py` asserts, for every
  style, coherent orientation + positive signed volume, plus direct repair-path
  tests for `orient_mesh_coherently` (globally inverted mesh, single mis-wound
  face, already-correct mesh, empty mesh).

## References
- `potfoundry/core/geometry.py` — `build_pot_mesh`, `orient_mesh_coherently`,
  `mesh_signed_volume`
- `tests/test_mesh_orientation.py`
