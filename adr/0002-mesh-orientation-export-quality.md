# ADR 0002 — Consistent outward mesh orientation for CAD export

Status: Accepted
Date: 2026-06-27

## Context

The export-quality target is clean import into Rhino / Grasshopper (and robust
behaviour in boolean/slicer pipelines). Those tools respect triangle **winding**:
a mesh whose faces are inconsistently wound, or globally inverted (normals
pointing inward), renders inside-out and breaks boolean operations.

The existing `TestMeshProperties.test_mesh_is_watertight` only checked that every
**undirected** edge is shared by exactly two faces. That is necessary but not
sufficient — it cannot detect orientation defects.

## What was proved (TDD)

A new test (`tests/test_mesh_orientation.py`) measured, on the raw output of
`build_pot_mesh` for every style:

- **240 inconsistent directed edges** — pairs of adjacent faces traversing their
  shared edge in the *same* direction (inconsistent winding). All localized at
  the base/drain region (z = 0 and z = t_bottom).
- **Negative signed volume** for all styles — the shell was wound so normals
  point *inward* (inside-out solid).

These failing tests pinned the root cause rather than a surface symptom.

## Decision

Two changes:

1. **Fix winding at construction (root cause, zero runtime cost).**
   An offline run of the orientation-repair algorithm showed each surface patch
   flips *uniformly*. The corrected windings are:
   - flip: outer wall, inner wall, rim cap, bottom underside
   - keep: top-of-bottom-slab, drain cylinder

   These were baked into `potfoundry/core/geometry.py`. `build_pot_mesh` now
   returns a consistently outward-oriented manifold directly, so the per-mesh
   generation performance budget (200 ms @ 168×84) is untouched (~33 ms).

2. **Add reusable repair utilities** in `potfoundry/core/mesh.py`
   (`orient_outward`, `signed_volume`, `is_consistently_oriented`), exported from
   the package. These harden the export pipeline for *any* mesh (imported,
   boolean results, future builders) but are intentionally **not** on the hot
   path — a pure-Python flood-fill repair costs ~160 ms at 30k faces and would
   blow the build/STL budgets if run every export.

## Alternatives considered

- **Run `orient_outward` inside `build_pot_mesh` / `write_stl_binary`.** Rejected:
  exceeds the performance budgets. The builder is structured and can be correct
  by construction, so repair-on-export is unnecessary overhead for our own meshes.
- **Global flip only.** Rejected: would fix the negative volume but not the 240
  inconsistent edges (the caps disagreed with the walls).

## Verification

- `tests/test_mesh_orientation.py`: per-style directed-edge consistency, positive
  signed volume, twist+clamp stress, and an **end-to-end binary-STL** check that
  reads the written file back and confirms every facet's stored normal agrees
  with its winding and the overall signed volume is positive.
- `tests/test_mesh_repair.py`: `orient_outward` repairs a globally inverted cube
  and a mixed-winding cube, preserves the triangle set, is idempotent, and
  handles the empty mesh.
- Full suite: 121 passed (was 103 before this work).
