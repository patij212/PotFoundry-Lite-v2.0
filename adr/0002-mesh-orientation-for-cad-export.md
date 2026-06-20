# ADR 0002: Guarantee Outward, Consistently-Oriented Mesh for CAD Export

## Status
Accepted

## Context
PotFoundry is moving toward Rhino / Grasshopper export quality. Unlike a
slicer, which is forgiving about flipped normals, a solid-modeling kernel
(Rhino, Grasshopper, OpenNURBS) treats an imported mesh as a *closed solid*
and is strict about two properties:

1. **Consistent orientation** — the mesh must be an orientable closed
   manifold: every edge shared by two faces is traversed in *opposite*
   directions by those two faces. A shared edge wound the *same* way by both
   faces is a non-orientable fold; the kernel reports flipped/bad faces or
   naked edges.
2. **Outward normals** — the surface must be wound so normals point out of the
   enclosed solid. Inward normals import as an inverted ("inside-out") solid.

The existing watertightness test only verified that each *undirected* edge
appears in exactly two faces. That is necessary but **not sufficient**: it does
not catch folds where two faces wind a shared edge the same way.

### What was proved
A diagnostic over all five styles (`build_pot_mesh`, n_theta=120, n_z=60)
showed, for **both** mesh builders in the tree:

- **240 directed-edge inconsistencies** (= 2 × n_theta), localized to two cap
  junctions:
  - the *top-of-bottom-slab* cap conflicted with the *inner wall* along the
    shared inner-bottom ring, and
  - the *drain-cylinder* wall conflicted with the *bottom underside* along the
    shared drain-under ring.
- **Negative signed volume** for every style (~ −1.0e5 mm³), i.e. the whole
  shell was wound inside-out even where it was internally consistent.

These are exactly the defects that ruin a Rhino/Grasshopper import.

## Decision
Two changes, applied to **both** `potfoundry/core/geometry.py` (vectorized,
the package public API) and `potfoundry/geometry.py` (legacy scalar builder,
still used by the Streamlit UI via `pfui/imports.py`):

1. **Fix the two odd-one-out cap windings at construction.** Re-wind the
   top-of-bottom-slab cap and the drain-cylinder wall so they agree with their
   neighbours along the shared rings. This makes the shell a fully
   consistently-oriented manifold. (Derived as the minimal flip set from the
   orientation-agreement graph: flipping {slab-top, drain-cylinder} resolves
   all conflicts; verified empirically to give 0 inconsistent edges.)

2. **Add a single global orientation guarantee.** After assembly, compute the
   divergence-theorem signed volume and flip the entire face array once if it
   is negative. This guarantees outward normals regardless of the base winding
   convention, and is robust to future cap/style additions. The signed volume
   is also surfaced in `diagnostics["signed_volume_mm3"]` for UI/QA.

### Why not a general BFS re-orientation pass?
A topological BFS re-orientation would be more general but is O(faces) in pure
Python and would breach the mesh-generation performance budget (<200 ms at
168×84, <1 s at 336×168) on high-resolution meshes (200k+ faces). The
structured fix above is O(1) extra work and keeps generation timing unchanged
(measured ~31 ms typical, ~107 ms high-res after the change).

## Consequences
- Exported meshes are now valid closed solids with outward normals — directly
  importable into Rhino/Grasshopper without manual normal/face repair.
- New regression tests (`tests/test_mesh_export_quality.py`) lock in three
  export invariants — consistent orientation, positive signed volume, no
  degenerate faces — across all styles and **both** builders.
- Golden-mesh tests are unaffected: vertex positions and face counts are
  unchanged (only per-face winding order changed), and those tests assert
  counts/metrics, not face-index hashes.

### Known follow-up (not addressed here)
The tree carries **two diverging `build_pot_mesh` implementations**. The fix
was applied to both, but the duplication is a standing maintainability and
export-quality risk (a future change to one can silently regress the other).
Consolidating the Streamlit UI path onto the vectorized core builder — or
making the legacy module delegate to core — is recommended as a follow-up.
