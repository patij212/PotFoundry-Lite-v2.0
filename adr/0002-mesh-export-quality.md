# ADR 0002: Mesh Export Quality for Rhino / Grasshopper

## Status
Accepted

## Context
PotFoundry generates parametric pots as triangle meshes and exports them for
downstream CAD/CAM tools. The target of this work was **Rhino / Grasshopper
export quality**: an imported mesh should be recognised as a *valid closed
solid* — watertight, with consistently oriented, outward-facing normals — so it
can be shaded correctly, converted to a closed BREP, and used in boolean/mesh
operations without repair.

Two defects and one architectural hazard were found and fixed.

### 1. Meshes were wound inside-out with an incoherent drain sub-assembly
`build_pot_mesh` assembled ~6 regions (outer/inner walls, rim cap, bottom
underside, top slab, drain cylinder) with hand-written per-region winding and
**no coherence guarantee**. Diagnosis (see `tests/test_mesh_orientation.py`):

- The mesh was a closed manifold (every undirected edge shared by exactly two
  faces) — good.
- But **2·n_theta directed edges** appeared with the wrong multiplicity in every
  style and regime: adjacent faces disagreed on winding. A coherent-orientation
  BFS (run once, offline, at low resolution) showed the **top-slab and
  drain-cylinder** patches were wound against the rest of the shell.
- The whole shell also had **negative signed volume** (normals pointing inward).

Root-cause fix:
- Re-wind the top-slab and drain-cylinder triangles at construction so every
  shared edge is traversed in opposite directions by its two faces.
- Add `signed_volume()` and `orient_faces_outward()` and apply the latter at the
  end of `build_pot_mesh`. Outward orientation is now a *guaranteed pipeline
  property* (O(F), vectorized — flips all faces iff signed volume < 0), not a
  hand-tuned accident. This assumes the mesh is already coherently wound, which
  the construction fix ensures.

### 2. STL forces tolerance-based re-welding on import
Binary STL de-indexes every triangle into three standalone vertices (a default
pot: 14,880 shared vertices → 89,280). Rhino/Grasshopper must re-weld those by a
distance tolerance; a wrong guess yields naked edges and a not-closed mesh.

Fix: add an **indexed Wavefront OBJ writer** (`potfoundry.write_obj`) that
preserves the shared vertex table plus 1-based faces, so the importer welds
nothing and the mesh is guaranteed closed. Wired into `build_from_yaml` via
`export_formats`. (STL remains the default for slicers.)

### 3. Duplicate geometry modules silently diverged
`potfoundry/geometry.py` was an older, non-vectorized **copy** of
`potfoundry/core/geometry.py`. The package `__init__` and UI used the core copy,
but `yaml_api` imported the top-level copy. The orientation fix reached only the
core copy, so the **YAML/batch export path kept producing bad meshes** — caught
by the new `mesh_quality_report` gate flagging the default pot as not
export-ready.

Fix: `potfoundry/geometry.py` is now a thin re-export of `core.geometry` (single
source of truth). `tests/test_geometry_single_source.py` pins that both import
paths resolve to the same objects.

## Decision
- **Winding/orientation correctness is a pipeline invariant**, enforced in
  `build_pot_mesh` and validated by `mesh_quality_report()` (watertight,
  winding-consistent, outward, degenerate-face count, `export_ready`).
- **OBJ is the recommended format for Rhino/Grasshopper** (indexed, no
  re-welding); STL stays the default for slicers.
- **One geometry implementation** lives in `potfoundry.core.geometry`; the
  top-level module only re-exports it.

## Consequences
- Every style × parameter regime now exports a coherent, outward, watertight
  mesh (validated independently with `trimesh`: `is_watertight`,
  `is_winding_consistent`, `volume > 0`).
- `build_pot_mesh` diagnostics gain `signed_volume_mm3`; YAML manifests gain a
  per-pot `quality` report and `files` map.
- Changing mesh face winding does not affect existing golden tests (they pin
  `face_count`/`surface_area`/run-to-run hashes, all winding-independent).

## Follow-ups (not done here)
- Wire OBJ export + an export-readiness indicator into the Streamlit UI.
- Consider native Rhino `.3dm` export via `rhino3dm` (heavier dependency).
- Consider 3MF (indexed + metadata) as a slicer-friendly indexed format.
