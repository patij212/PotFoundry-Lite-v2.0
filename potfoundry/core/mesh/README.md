# PotFoundry Mesh Package

**Package**: `potfoundry.core.mesh`  
**Purpose**: Modular mesh generation for 3D-printable flower pots  
**Version**: 2.1.0

---

## Overview

The `mesh` package provides focused, independently testable modules for constructing watertight triangular meshes for parametric flower pots. Each module handles a specific aspect of the mesh building process.

## Architecture

```
potfoundry/core/mesh/
├── __init__.py          - Package exports and public API
├── parameters.py        - Mesh quality settings and defaults
├── grid.py              - Theta and Z grid generation
├── outer_wall.py        - Outer wall ring sampling
├── inner_wall.py        - Inner wall with drain clamping
├── rim.py               - Rim cap geometry
├── drain.py             - Drain hole geometry  
├── faces.py             - Face array assembly
└── diagnostics.py       - Mesh quality metrics
```

## Module Descriptions

### parameters.py (40 LOC)
**Purpose**: Define mesh quality settings and default dimensions

**Classes**:
- `MeshQuality`: Resolution settings (n_theta, n_z)
- `PotDefaults`: Default dimensional parameters

**Usage**:
```python
from potfoundry.core.mesh import MeshQuality, PotDefaults

quality = MeshQuality(n_theta=168, n_z=84)  # High quality
defaults = PotDefaults()  # Standard 120mm tall pot
```

### grid.py (138 LOC)
**Purpose**: Generate angular and vertical grids with caching

**Functions**:
- `theta_grid_cached(n_theta)`: Cached theta grid with cos/sin precomputed
- `refine_z_outer_for_seams(z_outer, H, style_opts)`: Refine z-grid for LowPolyFacet seams

**Features**:
- LRU cache (maxsize=8) for theta grids
- Seam refinement for tier boundaries
- Performance optimized with vectorization

**Usage**:
```python
from potfoundry.core.mesh import theta_grid_cached, refine_z_outer_for_seams

thetas, cos_th, sin_th = theta_grid_cached(128)  # Cached grid
z_refined = refine_z_outer_for_seams(z_outer, H, style_opts)
```

### outer_wall.py (281 LOC)
**Purpose**: Generate outer wall rings with style application

**Functions**:
- `sample_outer_rings(...)`: Main outer wall sampling with diagnostics
- `spin_twist_radians(z, H, opts)`: Calculate twist angle at height
- `call_style_r_outer(...)`: Typed wrapper for style functions
- `add_ring_xy(...)`: Add a ring of vertices with twist

**Features**:
- Style function delegation
- Twist/spin support
- Debug seam tracking for LowPolyFacet
- Diameter estimation

**Usage**:
```python
from potfoundry.core.mesh import sample_outer_rings

outer_idx, samples, top_od, bottom_od, cx, sy, dbg1, dbg2, dbg3 = sample_outer_rings(
    H=H, Rb=Rb, Rt=Rt, expn=expn,
    style_opts=style_opts, r_outer_fn=style_fn,
    z_outer=z_outer, thetas=thetas, cos_th=cos_th, sin_th=sin_th,
    n_theta=n_theta, verts=verts, base_radius_fn=base_radius
)
```

### inner_wall.py (117 LOC)
**Purpose**: Generate inner wall with drain hole clamping

**Functions**:
- `generate_inner_wall(...)`: Inner wall rings with proximity clamping

**Features**:
- Automatic clamping near drain hole (min_radius = r_drain + 1mm)
- Prevents inner wall from collapsing into drain
- Returns clamp statistics for diagnostics

**Usage**:
```python
from potfoundry.core.mesh import generate_inner_wall

inner_idx, clamp_count, total_samples = generate_inner_wall(
    H=H, Rb=Rb, Rt=Rt, expn=expn, t_wall=t_wall, r_drain=r_drain,
    style_opts=style_opts, r_outer_fn=style_fn,
    z_inner=z_inner, thetas=thetas, cos_th=cos_th, sin_th=sin_th,
    n_theta=n_theta, verts=verts,
    base_radius_fn=base_radius, spin_twist_radians_fn=spin_twist_radians,
    call_style_r_outer_fn=call_style_r_outer, add_ring_xy_fn=add_ring_xy
)
```

### rim.py (78 LOC)
**Purpose**: Generate rim cap and inner wall faces

**Functions**:
- `build_inner_wall_faces(inner_idx, j_idx, jn)`: Triangulate inner wall
- `build_rim_cap(outer_idx, inner_idx, j_idx, jn)`: Connect top edges

**Features**:
- Vectorized face generation
- Outward-facing winding for normals
- Clean quads split into triangles

**Usage**:
```python
from potfoundry.core.mesh import build_inner_wall_faces, build_rim_cap

tri_in1, tri_in2 = build_inner_wall_faces(inner_idx, j_idx, jn)
tri_rim1, tri_rim2 = build_rim_cap(outer_idx, inner_idx, j_idx, jn)
```

### drain.py (120 LOC)
**Purpose**: Generate drain hole geometry

**Functions**:
- `build_drain_hole(...)`: Complete drain geometry with all faces

**Features**:
- Two rings of vertices (bottom and top of drain cylinder)
- Cylinder wall faces
- Bottom slab underside (outer to drain)
- Bottom slab top (inner to drain)

**Usage**:
```python
from potfoundry.core.mesh import build_drain_hole

tri_bot1, tri_bot2, tri_top1, tri_top2, tri_cyl1, tri_cyl2, drain_under, drain_top = build_drain_hole(
    r_drain=r_drain, t_bottom=t_bottom,
    cos_th=cos_th, sin_th=sin_th, verts=verts,
    outer_idx=outer_idx, inner_idx=inner_idx,
    j_idx=j_idx, jn=jn
)
```

### faces.py (36 LOC)
**Purpose**: Assemble all face arrays into final mesh

**Functions**:
- `assemble_faces(faces_out_parts)`: Combine all face arrays

**Usage**:
```python
from potfoundry.core.mesh import assemble_faces

faces_arr = assemble_faces(faces_out_parts)  # Returns numpy array
```

### diagnostics.py (91 LOC)
**Purpose**: Calculate mesh quality metrics

**Functions**:
- `calculate_mesh_diagnostics(...)`: Compute quality metrics

**Metrics**:
- Clamp ratio at bottom (how much clamping occurred)
- Estimated top/bottom outer diameters
- Seam debugging info (for LowPolyFacet)
- Edge flow verbose data (if collected)

**Usage**:
```python
from potfoundry.core.mesh import calculate_mesh_diagnostics

diagnostics = calculate_mesh_diagnostics(
    verts=verts, outer_idx=outer_idx,
    est_top_od=est_top_od, est_bottom_od=est_bottom_od,
    clamp_count=clamp_count, total_inner_samples=total_inner_samples,
    dbg_outward_picks=dbg_outward_picks, dbg_total_picks=dbg_total_picks,
    dbg_samples_collected=dbg_samples_collected
)
```

---

## Usage Example

```python
from potfoundry.core.mesh import (
    theta_grid_cached,
    refine_z_outer_for_seams,
    sample_outer_rings,
    generate_inner_wall,
    build_inner_wall_faces,
    build_rim_cap,
    build_drain_hole,
    assemble_faces,
    calculate_mesh_diagnostics,
)
import numpy as np

# Setup
H, Rt, Rb = 120.0, 70.0, 45.0
t_wall, t_bottom, r_drain = 3.0, 3.0, 10.0
n_theta, n_z = 128, 64
verts = []
faces_out_parts = []

# 1. Generate grids
thetas, cos_th, sin_th = theta_grid_cached(n_theta)
z_outer = np.linspace(0.0, H, n_z + 1)
z_outer = refine_z_outer_for_seams(z_outer, H, style_opts)
z_inner = np.linspace(t_bottom, H, n_z + 1)

# 2. Outer wall
outer_idx, r_samples, top_od, bot_od, cx, sy, dbg1, dbg2, dbg3 = sample_outer_rings(
    H=H, Rb=Rb, Rt=Rt, expn=1.1, style_opts=style_opts,
    r_outer_fn=style_fn, z_outer=z_outer,
    thetas=thetas, cos_th=cos_th, sin_th=sin_th,
    n_theta=n_theta, verts=verts, base_radius_fn=base_radius
)

# 3. Inner wall
inner_idx, clamp_count, total_samples = generate_inner_wall(
    H=H, Rb=Rb, Rt=Rt, expn=1.1, t_wall=t_wall, r_drain=r_drain,
    style_opts=style_opts, r_outer_fn=style_fn,
    z_inner=z_inner, thetas=thetas, cos_th=cos_th, sin_th=sin_th,
    n_theta=n_theta, verts=verts,
    base_radius_fn=base_radius, spin_twist_radians_fn=spin_twist_radians,
    call_style_r_outer_fn=call_style_r_outer, add_ring_xy_fn=add_ring_xy
)

# 4. Faces
j_idx = np.arange(n_theta, dtype=int)
jn = (j_idx + 1) % n_theta

tri_in1, tri_in2 = build_inner_wall_faces(inner_idx, j_idx, jn)
faces_out_parts.extend([tri_in1, tri_in2])

tri_rim1, tri_rim2 = build_rim_cap(outer_idx, inner_idx, j_idx, jn)
faces_out_parts.extend([tri_rim1, tri_rim2])

tri_bot1, tri_bot2, tri_top1, tri_top2, tri_cyl1, tri_cyl2, _, _ = build_drain_hole(
    r_drain=r_drain, t_bottom=t_bottom,
    cos_th=cos_th, sin_th=sin_th, verts=verts,
    outer_idx=outer_idx, inner_idx=inner_idx, j_idx=j_idx, jn=jn
)
faces_out_parts.extend([tri_bot1, tri_bot2, tri_top1, tri_top2, tri_cyl1, tri_cyl2])

# 5. Assemble
faces_arr = assemble_faces(faces_out_parts)

# 6. Diagnostics
diagnostics = calculate_mesh_diagnostics(
    verts=verts, outer_idx=outer_idx,
    est_top_od=top_od, est_bottom_od=bot_od,
    clamp_count=clamp_count, total_inner_samples=total_samples,
    dbg_outward_picks=dbg1, dbg_total_picks=dbg2,
    dbg_samples_collected=dbg3
)

# Result
vertices = np.array(verts, dtype=float)  # Shape: (N, 3)
faces = faces_arr  # Shape: (M, 3)
print(f"Generated mesh: {len(vertices)} vertices, {len(faces)} faces")
print(f"Diagnostics: {diagnostics}")
```

---

## Design Principles

### Modularity
Each module has a single, well-defined responsibility:
- Grid generation separate from wall generation
- Face generation separate from vertex generation
- Diagnostics separate from mesh construction

### Testability
Each module can be tested independently:
- Grid caching can be verified in isolation
- Wall generation doesn't depend on other wall types
- Face assembly is purely computational

### Performance
- **LRU caching** for theta grids (8 most recent sizes)
- **Vectorized operations** throughout (NumPy)
- **Minimal allocations** by reusing arrays where possible

### Type Safety
- **Comprehensive type hints** for all parameters
- **NumPy type annotations** for array shapes
- **Return type specifications** for all functions

### Documentation
- **Google-style docstrings** for all public functions
- **Parameter descriptions** with units and constraints
- **Usage examples** in module docstrings

---

## Performance Characteristics

### Time Complexity
- Grid generation: O(n_theta) with O(1) cache hit
- Outer wall: O(n_z × n_theta)
- Inner wall: O(n_z × n_theta)
- Faces: O(n_z × n_theta)
- **Total**: O(n_z × n_theta) - linear in mesh resolution

### Space Complexity
- Vertices: O(n_z × n_theta) 
- Faces: O(n_z × n_theta × 2) - two triangles per quad
- **Total**: O(n_z × n_theta)

### Typical Performance
- Default resolution (n_theta=168, n_z=84): 50-100ms
- High resolution (n_theta=256, n_z=128): 150-250ms
- Low resolution (n_theta=64, n_z=32): 10-20ms

---

## Backward Compatibility

All mesh functions are re-exported by `potfoundry.core.geometry` for backward compatibility:

```python
# New way (direct import)
from potfoundry.core.mesh import sample_outer_rings

# Old way (still works via re-export)
from potfoundry.core.geometry import MeshQuality  
```

This ensures existing code continues to work while new code can use the modular structure.

---

## Future Enhancements

### Planned (Phase A.5)
- Extract edge flow code to `mesh/edge_flow.py` (~2,500 LOC)
- Further reduce `build_pot_mesh()` to ~400 LOC

### Potential
- Add adaptive mesh refinement module
- Support for non-circular cross-sections
- Multi-material mesh generation
- Mesh simplification utilities

---

## Contributing

When adding new mesh functionality:

1. **Create focused module** (< 300 LOC target)
2. **Add comprehensive docstrings** (Google style)
3. **Include type hints** for all parameters
4. **Write tests** for new functionality
5. **Export via __init__.py** for public API
6. **Update this README** with new module docs

---

## References

- [PHASE_A_COMPLETION_SUMMARY.md](../../docs/refactoring/PHASE_A_COMPLETION_SUMMARY.md) - Refactoring details
- [FINAL_SESSION_REPORT.md](../../docs/refactoring/FINAL_SESSION_REPORT.md) - Session report
- [potfoundry/core/geometry.py](../geometry.py) - Main geometry module

---

**Last Updated**: 2025-11-05  
**Package Version**: 2.1.0  
**Maintainers**: PotFoundry Core Team
