# ADR 0002 — Consistently oriented, outward-facing meshes for CAD/slicer export

- Status: Accepted
- Date: 2026-06-26
- Context: PotFoundry-Lite v2.x, progressing toward Grasshopper/Rhino export quality.

## Context

Exported pots must round-trip cleanly into slicers and CAD tools (Rhino,
Grasshopper, etc.). Those tools expect an exported solid to be a **consistently
oriented closed two-manifold with outward-facing normals**:

- every edge shared by exactly two triangles (closed manifold),
- each interior edge traversed once in each direction (consistent winding /
  agreeing face normals),
- positive signed volume (normals point outward).

The pre-existing regression test `test_mesh_is_watertight` only verified the
weakest of these — that every edge appears exactly twice. A mesh can pass that
test while being inside-out or while having locally inconsistent winding, both
of which cause Rhino/Grasshopper to render flipped/black faces and to refuse to
treat the import as a solid.

## What was proved (TDD)

A diagnostic across all five styles and several resolutions showed two distinct,
reproducible defects in `build_pot_mesh` (`potfoundry/core/geometry.py`):

1. **Inside-out solid.** The outer wall (and the bulk of the mesh) was wound so
   that face normals pointed *inward*; the assembled mesh had **negative signed
   volume**. 0% of mid-wall outer faces pointed outward.
2. **Inconsistent cap winding.** The *top of bottom slab* and *drain cylinder*
   face groups were wound opposite to the walls they share an edge with,
   producing `2 * n_theta` inconsistently wound edges per mesh (e.g. 128 at
   `n_theta=64`) — undetected by the edge-count-only watertight test.

New tests in `tests/test_mesh_orientation.py` assert the full property
(closed-manifold + consistent winding + positive signed volume) for every style
at three resolutions and under global twist. They failed before the fix (21
failures) and pass after.

## Decision

1. **Fix the root cause in the builder.** The two mis-wound cap groups are now
   wound to agree with their neighbours, and a single vectorized winding flip of
   the assembled face array makes all normals point outward. This is O(F) with no
   measurable cost on the hot path (vs. ~250 ms for a generic flood-fill repair),
   and the mesh is now correct *by construction*.

2. **Add a reusable mesh-quality module** `potfoundry/core/mesh.py` with:
   - `signed_volume`, `edge_manifold_stats`, `is_oriented_manifold` — the
     validation oracle used independently by the tests; and
   - `orient_outward` — a general flood-fill repair pass that re-orients an
     arbitrary triangle soup into an outward oriented manifold (export-time
     safety net and a tool for externally sourced meshes).

   These are exported from the package's public API.

## Consequences

- Exported STLs are now genuine outward-oriented closed solids across all styles
  (verified end-to-end: positive STL signed volume, stored normals 100%
  consistent with winding).
- The orientation property is now pinned by tests, preventing regressions as new
  styles or cap geometry are added.
- The winding of faces changed; golden-mesh tests do not pin a stored
  face-winding hash (they compare run-to-run determinism, counts, dimensions and
  surface area), so they remain valid. Any future golden that stores a
  face-level hash must be regenerated against the oriented mesh.

## Follow-ups (toward fuller Rhino/Grasshopper quality)

- Indexed mesh export (OBJ/PLY/3MF) that preserves shared vertices, which Rhino
  and Grasshopper import as a welded mesh rather than a triangle soup.
- Degenerate/sliver-triangle culling at extreme parameters.
- Optional `orient_outward` guard wired into the export entry point.
