# ADR 0002: Guaranteed Mesh Orientation for Export-Grade Output

## Status
Accepted

## Context
The roadmap target for PotFoundry is geometry that imports cleanly into
professional CAD/parametric tools (Rhino, Grasshopper) and modern slicers as a
**valid closed solid**. STL is the transport format, but a watertight STL is
not sufficient: the importer also requires *consistent winding* and *outward
normals* to reconstruct a solid rather than an inside-out shell or a mesh with
garbage normals.

`build_pot_mesh` assembles the pot from six hand-wound regions: outer wall,
inner wall, rim cap, bottom underside, top-of-slab, and drain cylinder. The
winding of each region was set by hand. Auditing the generated mesh revealed
two independent defects that the existing `test_golden_meshes.py` did not
catch (it only checks undirected-edge manifoldness):

1. **The entire mesh was inverted.** Signed volume was negative
   (~ -105,000 mm^3 for the reference pot), i.e. every facet normal pointed
   *into* the ceramic material. Rhino/slicers treat this as an inside-out
   solid.
2. **Two interior seams were mis-wound.** 120 directed edges (60 at the
   `inner wall ↔ top-of-slab` seam, 60 at the `drain cylinder ↔ bottom
   underside` seam) were traversed in the same direction by both adjacent
   faces, so neighboring normals disagreed.

### What was proved
A new test module `tests/test_mesh_quality.py` pins the three independent
invariants for **every style** and across plain/twisted/belled parameter sets:

- **watertight** — every undirected edge shared by exactly two faces;
- **consistent winding** — every directed edge traversed exactly once;
- **outward normals** — enclosed signed volume is positive.

These tests failed before the fix (120 inconsistent edges + negative volume)
and pass after it.

## Decision
1. **Fix winding at construction.** The surface forms a topological cycle
   `outer → rim → inner → top-of-slab → drain-cylinder → bottom → outer`.
   Reversing the winding of the top-of-slab and drain-cylinder regions makes
   all six regions mutually consistent (every directed edge once).
2. **Guarantee outward normals cheaply.** A new
   `potfoundry/core/mesh_ops.ensure_outward` computes the signed volume and, if
   negative, reverses every triangle's winding in one vectorized operation
   (`faces[:, ::-1]`). `build_pot_mesh` calls it as its final step. This is
   O(M), adds < 2 ms at the 168×84 reference resolution, and leaves the
   200 ms mesh-generation budget intact (measured ~44 ms mean).

### Alternatives considered
- **Full BFS re-orientation pass on every build.** Robust to any future
  topology change, but a pure-Python adjacency walk over ~58k faces risks the
  200 ms hot-path budget (the mesh is built for live preview as well as
  export). Rejected for the hot path; the regression tests guard construction
  instead.

## Consequences
- Exported STLs now present a consistently outward-oriented closed solid,
  importable into Rhino/Grasshopper without a manual "unify normals" /
  "flip" step.
- `mesh_ops.winding_report` is available to the app/CLI for export QA (it
  returns `is_export_ready`), and `signed_volume` is reusable for capacity and
  material-volume estimates.
- Face winding (vertex order within a triangle) changed for the reference
  meshes. The golden-mesh tests assert determinism and vertex/face *counts*
  rather than a stored winding hash, so they remain valid; no stored golden
  value needed updating.
