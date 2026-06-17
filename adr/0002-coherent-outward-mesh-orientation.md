# ADR 0002: Coherent outward mesh orientation for Rhino/Grasshopper export

- Status: Accepted
- Date: 2026-06-17
- Supersedes: —
- Related: `potfoundry/core/mesh_orient.py`, `potfoundry/core/geometry.py`,
  `tests/test_mesh_orientation.py`, `tests/test_mesh_orient_unit.py`

## Context

PotFoundry's goal for this work stream is **Rhino / Grasshopper export
quality**. Rhino, Grasshopper and most NURBS/CAD pipelines only treat an
imported mesh as a *solid* (for volume queries, booleans, thickening, shelling,
and correct shading) when the mesh is a **consistently-oriented, watertight
2-manifold whose face normals all point outward**.

The existing `build_pot_mesh()` produced meshes that were watertight (every
edge shared by exactly two faces) but **not coherently oriented**. Measuring the
generated mesh across all five styles revealed two distinct defects:

1. **Globally inverted winding.** The signed volume (divergence theorem) was
   *negative* for every style (e.g. `-153,265 mm³`). The outer wall normals
   pointed *inward*; the entire solid was wound inside-out. Slicers paper over
   this with even–odd fill rules — which is why STL printing still worked — but
   Rhino/Grasshopper import it as an inverted solid.

2. **Locally inconsistent junctions.** 160 interior edges were traversed in the
   *same* direction by both adjacent faces (a winding conflict). These localised
   exactly to two region junctions of the hand-assembled mesh:
   `bottom_slab_top ↔ inner_wall` (80 edges) and
   `bottom_underside ↔ drain_cyl` (80 edges). Rhino reports these as flipped /
   naked normals.

The mesh is assembled region-by-region (outer wall, inner wall, rim, bottom
slab, drain cylinder), and each region hard-codes its own winding. Hand-tuning
each region's winding to agree is possible but fragile: any future region, style
or topology change can silently reintroduce the defect, and the per-region rules
are not self-checking.

## Decision

Introduce a **generic, deterministic orientation pass**,
`potfoundry.core.mesh_orient.orient_outward(verts, faces)`, and run it as the
final step of both `build_pot_mesh()` implementations (the active
`potfoundry/core/geometry.py` and the legacy fallback `potfoundry/geometry.py`).

The pass works on any watertight 2-manifold, independent of how the mesh was
assembled:

1. **Coherent winding** is a 2-colouring of the dual graph. Each face gets a
   flip bit, and for every shared edge `e` between faces `i` and `j` we require
   `flip_i XOR flip_j = same_direction(e)`, where `same_direction(e)` is 1 when
   both faces currently wind `e` the same way. This linear system over GF(2) is
   solved by BFS over connected components.
2. **Outward sense** is then fixed globally: if the signed volume is negative,
   reverse all faces.

The pass keeps faces in their original row positions (only the vertex order
*within* a triangle may reverse), so it preserves determinism and the existing
golden-mesh hashing guarantees.

### Performance

A naïve pure-Python implementation cost ~330 ms at typical resolution
(168×84, ~57k faces), blowing the 200 ms mesh-generation budget. The accepted
implementation builds the edge adjacency with vectorised numpy and runs only the
GF(2) BFS in Python (on plain lists for fast scalar access). Full mesh build is
~100 ms, comfortably within budget.

## Consequences

- **Positive:** Generated meshes are now true outward solids (positive volume,
  zero orientation defects) for every style. They import into Rhino/Grasshopper
  as closed solids; volume, boolean and shelling operations behave correctly.
- **Positive:** The fix is a self-checking invariant, not a per-region rule.
  New styles or regions are automatically oriented and are guarded by
  `tests/test_mesh_orientation.py` (signed volume > 0, 0 orientation defects,
  correct outer/inner normal signs).
- **Positive:** `orient_outward` and `signed_volume` are exported from the
  package as reusable utilities and unit-tested directly in
  `tests/test_mesh_orient_unit.py`.
- **Neutral:** STL export already recomputes normals from winding, so corrected
  winding automatically yields correct STL normals.
- **Cost:** ~80 ms added to high-resolution mesh build. Accepted: well within
  the performance budget and justified by the correctness gain.

## Alternatives considered

- **Hand-fix each region's winding at construction.** Faster (zero overhead) but
  fragile and not self-checking; rejected in favour of a generic invariant.
- **Rely on slicer/CAD auto-repair.** Slicers tolerate inverted meshes but
  Rhino/Grasshopper do not; rejected because export quality is the explicit goal.
