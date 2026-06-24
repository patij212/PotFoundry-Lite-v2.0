# ADR 0002: Guarantee Outward-Facing Normals for CAD/Slicer Export

## Status
Accepted

## Context
PotFoundry exports generated pots as binary STL for downstream use in
Rhino / Grasshopper, slicers, and other CAD/CAM tooling. All of these consumers
assume a closed solid whose triangle winding produces **outward-facing** face
normals. STL stores a normal per facet, and `write_stl_binary` derives that
normal directly from the triangle winding, so a wrongly-wound mesh exports a
literally inside-out solid.

While advancing toward Rhino/Grasshopper export quality we ran a mesh-quality
diagnostic and found two defects in `build_pot_mesh` (present in **both**
`potfoundry/core/geometry.py` — the canonical builder used by the app — and the
legacy `potfoundry/geometry.py` used by `pfui/imports.py`):

1. **Globally inverted normals.** The signed volume (divergence theorem,
   `V = 1/6 · Σ v0·(v1×v2)`) was **negative** for every style. On a consistently
   wound closed manifold a negative signed volume means all normals point
   inward. Rhino/Grasshopper then treat the solid as a void; shading is
   inside-out and boolean operations fail or invert.

2. **A locally inverted patch.** Independent of the global sign, the
   **top-of-bottom-slab** and **drain-cylinder** face groups were wound
   *backwards relative to their neighbours*. The directed-edge test found
   `2 · n_theta` inconsistently-wound edges concentrated at the two drain rings
   (z = 0 and z = t_bottom, r = r_drain). A global flip cannot fix a
   locally-inverted patch — after a uniform flip those faces are still
   inconsistent with the walls.

The existing "consistent normals" golden test asserted nothing about
orientation (it ended in `pass  # Skip strict check for now`), so neither defect
was caught.

### Why a per-face radial heuristic is not enough
An obvious check is "outer-wall normals should point away from the Z axis."
This is unreliable for PotFoundry's decorative styles: superformula/Fourier
petals are strongly concave, so a correctly-outward normal on the inward slope
of a petal legitimately has a negative radial component, and inner-wall and
outer-wall radii overlap so the two cannot be cleanly separated by radius. The
heuristic produced ~60% "outward" even on a correctly oriented mesh.

## Decision
Adopt **winding consistency + positive signed volume** as the invariant that
defines a correctly oriented export, and enforce it at two levels:

1. **Fix the root cause at construction.** Reverse the winding of the
   top-slab and drain-cylinder triangle groups in both builders so the raw mesh
   is born consistently wound (zero inconsistent directed edges) for every
   style, with or without twist. This has zero runtime cost.

2. **Keep a cheap, vectorized safety net.** `orient_faces_outward(verts, faces)`
   computes the signed volume and flips the entire mesh if it is negative,
   guaranteeing outward normals even if a future change introduces a uniform
   inversion. It is O(F) numpy (~7 ms on a 57 k-face mesh; full build ≈ 32 ms,
   well under the 200 ms budget). `build_pot_mesh` now also reports
   `signed_volume_mm3` in its diagnostics.

A full flood-fill orientation propagation (à la `trimesh.fix_normals`) was
prototyped and would repair *arbitrary* local inconsistencies, but a pure-Python
flood-fill over ~58 k faces risks the <200 ms generation budget on the hot path.
Since the construction fix makes every shipped style consistent, the flood-fill
is unnecessary in production; the rigorous per-style consistency tests guard
against regressions instead.

## Consequences
- Exported STLs now read as correctly oriented, outward-facing solids in
  Rhino/Grasshopper and slicers (positive volume, no inverted patches).
- Mesh hashes/face arrays change (winding differs); golden tests assert
  counts/metrics and determinism rather than fixed hashes, so they are
  unaffected.
- New invariant is pinned by `tests/test_mesh_orientation.py` (signed volume,
  winding consistency per style, and an end-to-end "weld the exported STL and
  re-check" test) and by the rewritten `test_mesh_has_consistent_normals`.

## What was proved
- Before: signed volume negative for all 5 styles; `2·n_theta` inconsistent
  directed edges at the drain rings; the orientation test was a no-op.
- After: signed volume positive and **0** inconsistent directed edges for all
  styles (incl. twisted/phased); the exported-then-welded STL satisfies the same
  invariant end-to-end.
