# ADR 0002: Coherent Outward Mesh Orientation for CAD Export

## Status
Accepted

## Context
PotFoundry generates closed triangle meshes (pots) and exports them as binary STL
for downstream use in slicers and, increasingly, in CAD/parametric tools such as
**Rhino** and **Grasshopper**. Those tools are far stricter about mesh quality than
slicers: they expect a closed manifold whose faces are **coherently oriented** with
**outward-facing normals**. A mesh that is watertight but inside-out, or whose
faces disagree on winding, is reported as a "bad object" and renders/booleans
incorrectly until the user manually runs *Unify Normals* / *Flip*.

### What we found
Both mesh builders (`potfoundry/core/geometry.py`, the vectorized one used by the
package, and the legacy `potfoundry/geometry.py` used by `pfui`/`yaml_api`) produced
meshes that were watertight (every edge shared by exactly two faces) but:

1. **Globally inverted** — the dominant wall surfaces were wound so that face
   normals pointed *inward*. Signed volume (divergence theorem) was negative for
   every style. STL facet normals are derived from winding, so the exported file
   was inside-out.
2. **Locally incoherent** — the bottom underside and drain-cap triangles were wound
   opposite to the walls they joined, producing **240 edges** (= 2·`n_theta`) where
   the two adjacent faces traversed the shared edge in the *same* direction. Such a
   mesh is not a consistently oriented manifold even after a global flip.

This was invisible to the existing test suite: the watertight test only checked
edge-sharing (manifoldness), and the "consistent normals" test was a no-op
(`pass`).

## Decision
Fix orientation at **construction time** by correcting the triangle winding of each
surface piece so its normal points away from the solid material:

| Surface                      | Outward normal | Action      |
|------------------------------|----------------|-------------|
| Outer wall                   | +radial        | flip        |
| Inner (cavity) wall          | −radial        | flip        |
| Rim annulus (top)            | +z             | flip        |
| Base underside               | −z             | flip        |
| Cavity floor (top of slab)   | +z             | keep        |
| Drain cylinder wall          | −radial        | keep        |

Winding is purely topological (which corners of each quad, in which order) and is
independent of the style radius functions, so the fix is deterministic and adds
**zero runtime cost** — no post-process orientation repair is needed.

### Alternatives considered
- **Post-process orientation repair (BFS flood-fill + global flip).** More general
  and would catch future inverted pieces, but a pure-Python BFS over the largest
  supported mesh (~230k faces) does not fit the existing high-resolution
  performance budget (<1 s for `build_pot_mesh`), and a fully-vectorized coherent
  orientation is substantially more complex. The construction-time fix addresses
  the root cause directly, so the repair pass was not warranted.

## Consequences
- Exported STLs import into Rhino/Grasshopper already oriented; no manual
  *Unify Normals* needed.
- Signed volume is now positive for every style; STL facet normals match the
  geometric winding 1:1 (verified end-to-end by reading facets back).
- A new regression test, `tests/test_mesh_orientation.py`, asserts coherent winding
  (no boundary, non-manifold, or flipped edges) and positive signed volume across
  all five styles and a parameter envelope that includes inner-wall clamping. The
  previously vacuous normals test in `tests/test_golden_meshes.py` now asserts
  positive signed volume.
- The two near-duplicate builders remain a maintenance hazard (the fix had to be
  applied to both). Consolidating them onto a single implementation is recommended
  follow-up work, tracked separately.
