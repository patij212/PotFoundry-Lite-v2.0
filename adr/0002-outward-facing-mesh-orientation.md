# ADR 0002: Outward-Facing Mesh Orientation for Rhino/Grasshopper-Grade Export

## Status
Accepted

## Context
PotFoundry exports pot designs as triangle meshes (binary STL today, with
Grasshopper/Rhino-quality export as the roadmap target). The existing mesh
builder, `build_pot_mesh`, produced meshes that were **watertight** — every
undirected edge is shared by exactly two faces — and the `test_mesh_is_watertight`
golden test passed.

Watertightness alone is not sufficient for high-quality CAD export. While
auditing export quality we found two latent defects in every mesh PotFoundry
generated, across all five styles and all resolutions:

1. **Globally inverted normals.** The signed volume computed from face winding
   was *negative* (e.g. ≈ −153,000 mm³ for a 120 mm SuperformulaBlossom),
   meaning STL face normals pointed *into* the solid. The outer wall had 0% of
   its normals pointing outward.

2. **Inconsistent winding (non-orientable as authored).** Roughly `2·n_theta`
   directed edges were traversed twice in the same direction, so adjacent base
   caps and walls disagreed about which way was "out." The bad edges were
   localized to the base (z = 0 and z = t_bottom).

Slicers usually auto-repair normals on import, which is why the defect went
unnoticed for STL/printing. Rhino and Grasshopper, however, rely on consistent
outward normals for closed-solid detection, shading, mesh booleans, and
NURBS/BREP conversion. Inverted or inconsistent normals degrade or break those
workflows — exactly the quality bar this work targets.

### Evidence (TDD)
`tests/test_mesh_orientation.py` pins two invariants on top of watertightness,
parametrized over all styles and a spread of sizes/resolutions (including odd
angular and vertical divisions):

- **Consistent orientation:** every directed edge `(a, b)` appears exactly once.
- **Outward orientation:** signed volume from face winding is strictly positive.

All 10 cases failed before the fix, confirming the defect was systemic rather
than a single bad cap.

## Decision
Add a vectorized orientation pass, `_orient_faces_outward`, applied at the end
of `build_pot_mesh`. The pot is a closed solid of revolution, so each face group
has a known outward reference direction:

| Group                 | Outward reference |
|-----------------------|-------------------|
| Outer wall            | +radial (away from axis) |
| Inner cavity wall     | −radial (toward axis) |
| Drain-hole cylinder   | −radial (toward drain axis) |
| Rim cap / slab top    | +z |
| Bottom underside      | −z |

The pass computes each face's geometric normal, compares it against its group's
reference, and reverses the winding of any face whose normal points inward.

### Why per-group references instead of a topological repair (BFS)?
A general orientation repair (flood-fill across face adjacency, then flip the
whole shell if signed volume is negative) is geometry-independent but runs in
pure Python over ~58k faces, which exceeds the project's 200 ms mesh-generation
budget (`tests/test_performance.py`). The per-group approach is O(F) NumPy with
negligible cost (typical-resolution generation stayed at ~29 ms).

The approach is safe because each wall group is a single-valued radial graph
`r(θ)` and each cap is planar, so every face in a group shares the same outward
sign and the group flips *uniformly*. This preserves the consistent, orientable
winding that watertightness requires while guaranteeing positive enclosed
volume. The orientation-consistency test guards against any future group whose
reference assignment is wrong (a non-uniform flip would reintroduce duplicated
directed edges and fail the test).

## Consequences
- Every exported mesh now has outward-facing, consistently-wound normals
  (positive signed volume) in addition to being watertight.
- Vertex/face counts and determinism are unchanged, so existing golden-mesh
  tests continue to pass; only winding order changed.
- Future face groups added to `build_pot_mesh` must register their outward
  reference in `group_specs`; the orientation tests will fail loudly otherwise.
- This establishes the clean-normals foundation required before adding
  Grasshopper/Rhino (`.3dm`) or surface-of-revolution export formats.
