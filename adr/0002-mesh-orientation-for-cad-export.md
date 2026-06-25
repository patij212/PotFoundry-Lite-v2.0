# ADR 0002: Guaranteed Outward Mesh Orientation for CAD Export

## Status
Accepted

## Context
PotFoundry meshes are consumed not only by slicers (which are tolerant of
winding) but increasingly by CAD/parametric tools — Rhino and Grasshopper in
particular — where mesh **face winding** (the vertex order that fixes each
triangle's normal direction) materially affects import quality.

A mesh can be topologically watertight (every edge shared by exactly two faces)
yet still import badly:

1. **Global inversion** — if every normal points *into* the solid, the model
   loads "inside-out": shading is wrong, Boolean/solid operations fail, and the
   user must manually flip normals.
2. **Local inconsistency** — if neighbouring face groups disagree on
   orientation, even an automatic "unify normals" pass cannot fully repair the
   surface.

### What was discovered
`build_pot_mesh()` builds the shell from six structured face groups (outer
wall, inner wall, rim cap, bottom underside, slab top, drain cylinder). The
divergence-theorem signed volume of the generated mesh was **negative for every
style**, and there were hundreds of inconsistently-wound directed edges.

Root-cause analysis (per-group signed-volume and per-group normal-vs-outward
checks) showed that four of the six groups were wound inward:

| group           | orientation before |
|-----------------|--------------------|
| outer wall      | inverted (inward)  |
| inner wall      | inverted           |
| rim cap         | inverted (−Z)      |
| bottom underside| inverted (+Z)      |
| slab top        | correct            |
| drain cylinder  | correct            |

This simultaneously explained both symptoms: the global inversion (4 of 6
groups flipped) and the two inconsistent seams `inner↔slab_top` and
`bot_under↔cyl` (where a flipped group met a correct one — exactly one full
ring of edges each).

## Decision
1. **Fix winding at the source, by construction.** The four inverted groups now
   emit triangles in counter-clockwise order as seen from outside the solid, so
   every surface's normal points away from the material:
   - outer wall → radially outward
   - inner wall → toward the axis (into the cavity)
   - rim cap → +Z, bottom underside → −Z
   This is a zero-cost change (only the order of indices in the face stacks)
   and keeps all six groups mutually consistent.

2. **Add a cheap, vectorised global safety net.** `build_pot_mesh()` runs the
   assembled mesh through `potfoundry.core.mesh.ensure_outward()`, which
   computes the signed volume in O(M) and reverses all faces if the mesh is
   globally inverted. This protects against a future group being added with the
   wrong global winding. It deliberately does **not** attempt to repair *local*
   inconsistency — that is guaranteed by construction and locked by tests.

3. **Reject a runtime BFS orientation pass.** A general per-face flood-fill
   orientation algorithm would be the most robust repair, but it is inherently
   sequential and would blow the performance budget (200 ms at 168×84, 1 s at
   336×168 ≈ 230k faces). Correct-by-construction + an O(M) global guard
   achieves the same export quality within budget.

## Consequences
- Exported binary STL now has a strictly positive signed volume and its stored
  facet normals agree 100% with face winding — a correct, outward-oriented solid
  on import into Rhino/Grasshopper.
- New invariants are enforced by `tests/test_mesh_orientation.py`:
  - consistent manifold orientation (every directed edge balanced),
  - strictly positive signed volume (outward normals),
  - the outermost mid-height face points outward (per-face sanity, all styles).
- `signed_volume()` and `ensure_outward()` are exposed from the top-level
  `potfoundry` package for downstream export/validation tooling.
- Plotly preview lighting is now physically correct (normals face the viewer
  from outside) rather than relying on double-sided shading.

## Notes
The legacy `potfoundry/geometry.py` module is **not** wired into the package
(`potfoundry/__init__.py` imports from `potfoundry/core/geometry.py`) and was
left untouched; it should be treated as dead code pending removal.
