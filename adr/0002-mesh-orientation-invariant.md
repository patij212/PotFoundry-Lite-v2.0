# ADR 0002: Outward-Oriented, Consistently-Wound Export Meshes

## Status
Accepted

## Context
PotFoundry generates triangle meshes and exports them as binary STL for
downstream tools: slicers, and — increasingly the quality bar we are targeting —
CAD packages such as **Rhino** and **Grasshopper**. Those tools rely on face
winding / normals for shading, boolean operations, offsetting and wall-thickness
analysis. A mesh that is not consistently oriented (adjacent triangles disagree
on which side is "out") or that is globally inside-out (normals point into the
solid) imports with black / inverted patches and misbehaves under boolean and
thickness operations, even when the geometry is otherwise watertight.

### What was wrong
`build_pot_mesh` (in both `potfoundry/core/geometry.py` and the legacy fallback
`potfoundry/geometry.py`) produced meshes that were **watertight but not
correctly oriented**:

- **Globally inside-out.** The signed volume of every style's mesh was negative
  (e.g. `-105628` for `SuperformulaBlossom` at 60×30), i.e. face normals pointed
  *into* the solid shell.
- **Locally inconsistent.** 120 *directed* edges appeared more than once,
  concentrated entirely at the bottom (z=0 and z=t_bottom): the drain / bottom
  cap patches were wound opposite to the walls they connect to.

The existing `test_mesh_is_watertight` only checks that *undirected* edges appear
exactly twice, which is satisfied even when caps are wound backwards, so the
defect was invisible to the suite. `test_mesh_has_consistent_normals` punted on
the actual orientation check (`pass  # Skip strict check for now`).

## Decision
Fix orientation **at construction** (zero runtime cost) rather than as a
post-process pass, and pin it with rigorous invariants.

The mesh is a closed manifold, so orientation is a purely topological property —
independent of pot dimensions and of the decorative style function. A
brute-force search over the 2⁶ winding combinations of the six patch groups
(outer wall, inner wall, rim, bottom-underside, top-of-slab, drain-cylinder)
found exactly two globally consistent solutions (a mesh and its mirror). The one
with **positive** signed volume reverses the winding of the **outer wall, inner
wall, rim, and bottom-underside** patches while leaving top-of-slab and
drain-cylinder as they were. This combination is applied directly in both mesh
builders.

### Enforced invariants (`tests/test_mesh_orientation.py`)
For every style:
1. **Global consistency** — every directed edge `(a, b)` appears exactly once.
2. **Outward orientation** — signed volume (divergence theorem) is positive.
3. **Sanity** — outer-wall face normals have a positive radial component
   (isolated precisely via the builder's vertex layout).

Together, (1) + (2) are a theorem-level guarantee that *all* normals point
outward from the solid.

## What was proved
- Before: `bad_directed_edges = 120`, `signed_volume < 0` for all five styles.
- After: `bad_directed_edges = 0`, `signed_volume > 0` for all five styles, in
  both the primary and legacy builders.
- End-to-end: a binary STL exported through the app's writer now stores facet
  normals that agree with the outward winding (min dot product = 1.0).

## Consequences
- **Positive:** Meshes import into Rhino/Grasshopper (and slicers) with correct
  outward normals; boolean/thickness/shading operations behave. STL facet
  normals, auto-computed from winding, are now correct.
- **Neutral:** Vertex positions, vertex/face counts, bounding box and surface
  area are unchanged (a winding flip preserves them), so golden-metric and
  performance regression tests are unaffected. The change is zero-cost — it only
  reorders triangle indices at build time.
- **Follow-up:** The near-no-op `test_mesh_has_consistent_normals` is now
  superseded by the stronger invariants and could be retired or hardened.
