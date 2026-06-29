# ADR 0002: Mesh Orientation + OBJ Export for Rhino/Grasshopper Quality

## Status
Accepted

## Context
PotFoundry's only mesh export was binary STL, which targets slicers. Users who
take a pot into **Rhino** or **Grasshopper** (for further CAD work, rendering,
or NURBS rebuilding) reported two recurring problems:

1. The surface imports **inside-out** — normals point into the solid, so faces
   render black/inverted and boolean/offset operations fail until "Unify
   Normals" + "Flip" are run by hand.
2. The mesh imports as **unwelded triangle soup** with **no smooth normals**,
   because STL stores three raw coordinates per triangle with no shared
   topology. Every triangle is a separate fragment.

Slicers auto-repair both issues, which is why they went unnoticed while STL was
the only consumer. Rhino/Grasshopper respect what the file actually says.

### What we proved (tests, not assumptions)
- The procedural mesh was already watertight, manifold, and free of degenerate
  or duplicate faces — the base geometry was sound.
- But it was **not coherently oriented**: the outer wall, inner wall, rim, and
  bottom-underside triangles were wound *inward*, while the bottom-slab top and
  the drain cylinder were wound *outward*. The signed volume (divergence
  theorem) was **negative** (normals net inward), and exactly `2 * n_theta`
  directed edges were traversed the same way by both adjacent faces — the seam
  where the two coherent regions met (z = 0 and z = t_bottom).

## Decision

### 1. Orient the mesh coherently and outward in the builder (root-cause fix)
Flip the winding of the four inward-wound face groups in `build_pot_mesh` so the
whole mesh is *born* coherently oriented with outward normals. This is a pure
construction-order change: vertex positions, counts, areas, and watertightness
are unchanged, so all golden-metric tests still pass. Zero runtime cost (no
post-process pass — important given the 200 ms generation budget).

Guarded by `tests/test_mesh_orientation.py`: positive signed volume and fully
coherent orientation (every directed edge exactly once) across every style and
multiple parameter sets.

Considered and rejected: a runtime flood-fill "unify normals" pass. It would fix
the symptom but cost time per export and leave the builder emitting bad winding.
The builder fix pins the actual cause.

### 2. Add a Wavefront OBJ exporter (`potfoundry.core.io.obj.write_obj`)
OBJ preserves the welded vertex topology the builder already produces (one `v`
per vertex, faces referencing shared 1-based indices) and carries per-vertex
normals (`vn`). The import is a single connected, correctly oriented,
smooth-shaded mesh — a clean base for QuadRemesh / loft / reference in Rhino.

### 3. Crease-aware normals by default
Fully-smooth normals round off the hard rim/foot/drain edges a CAD user expects.
`write_obj(crease_angle_deg=30.0)` (default) splits normals at edges sharper than
the threshold so those edges stay crisp while walls stay smooth;
`crease_angle_deg=None` gives fully-smooth shading. Implemented in
`compute_corner_normals`, optimised so only the few hundred vertices on a crease
ring take the expensive path (full-res crease export ~0.6 s vs ~1.9 s naive).

### 4. Surface OBJ in the app
`pfui.imports.WRITE_OBJ` exposes the writer; the Streamlit export flow offers a
"Download OBJ (Rhino/Grasshopper)" button alongside STL.

## Consequences
- **Positive:** Rhino/Grasshopper imports are correct out of the box — outward
  normals, welded topology, crisp functional edges. STL remains the slicer path.
- **Positive:** The orientation guarantee is now a tested invariant; future
  styles or cap changes that regress winding will fail CI.
- **Neutral:** OBJ files are larger than binary STL (ASCII, ~4 MB at full res vs
  ~2.8 MB), an acceptable trade for CAD fidelity.
- **Future work:** A true NURBS/section-curve export (closed profile rings for a
  Grasshopper loft, or a `.3dm` via rhino3dm) would let Rhino rebuild a smooth
  surface rather than a faceted mesh. Out of scope here; the coherent, welded
  mesh is the foundation it would build on.
