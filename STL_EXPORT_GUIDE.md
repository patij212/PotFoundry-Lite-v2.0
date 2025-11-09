# STL Export Migration Guide

> Note: This document has moved to docs/guides/STL_EXPORT_GUIDE.md. This root copy remains only as a pointer to the canonical version.

## Overview

PotFoundry has fully migrated to **binary STL** as the default and recommended export format. Binary STL files are:

- **50-90% smaller** than ASCII STL files
- **Much faster** to write and read
- **Universally supported** by all modern slicers and CAD tools

## For Users

All STL exports from PotFoundry are now in binary format by default:
- Streamlit app exports → Binary STL
- YAML batch builds → Binary STL
- Python API → Binary STL (recommended)

**No action required** - everything just works and produces smaller files!

## For Developers

### Recommended Usage (Binary STL)

```python
from potfoundry import write_stl_binary, build_pot_mesh

# Build a mesh
verts, faces, diagnostics = build_pot_mesh(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=168, n_z=84, r_outer_fn=..., style_opts={}
)

# Export to binary STL (recommended)
write_stl_binary("my_pot.stl", "FlowerPot", verts, faces)
```

### Legacy ASCII STL (Deprecated)

ASCII STL export is **deprecated** but retained for backward compatibility:

```python
from potfoundry import write_ascii_stl

# This will show a deprecation warning
write_ascii_stl("debug.stl", "DebugModel", verts, faces)
# DeprecationWarning: write_ascii_stl is deprecated.
# Use write_stl_binary instead. Binary STL files are smaller,
# faster, and universally supported.
```

### Migration Checklist

If you have code using `write_ascii_stl`:

1. ✅ Replace `write_ascii_stl` with `write_stl_binary`
2. ✅ Update imports: `from potfoundry import write_stl_binary`
3. ✅ No other changes needed - same function signature!

### Why Binary STL?

**File Size Comparison** (example 10,000 triangle mesh):
- ASCII STL: ~2.5 MB
- Binary STL: ~500 KB (5x smaller!)

**Write Performance**:
- ASCII STL: ~500ms
- Binary STL: ~50ms (10x faster!)

**Compatibility**:
- ✅ PrusaSlicer, Cura, Simplify3D
- ✅ Fusion 360, SolidWorks, Blender
- ✅ All modern 3D printing software

### Advanced: When to Use ASCII STL

ASCII STL is only recommended for:
- **Debugging** - You need to manually inspect the STL file contents
- **Legacy systems** - You're working with very old software (pre-2005)
- **Text-based version control** - You want to diff STL files (not recommended)

For 99% of use cases, **use binary STL**.

## Testing

All export paths are tested to ensure binary STL is working correctly:

```bash
# Run STL export tests
python -m pytest tests/test_stl_binary.py tests/test_stl_migration.py -v

# Run all tests
python -m pytest tests/ -v
```

## API Reference

### `write_stl_binary(path, name, vertices, faces, normals=None)`

Write mesh to binary STL file (RECOMMENDED).

**Parameters:**
- `path` (str | Path): Output file path
- `name` (str): Model name (embedded in STL header, max 80 chars)
- `vertices` (ndarray): Vertex array, shape (N, 3)
- `faces` (ndarray): Face indices, shape (M, 3)
- `normals` (ndarray, optional): Face normals, shape (M, 3). Auto-computed if None.

**Returns:**
- `Path`: Resolved path to the written file

**Example:**
```python
from potfoundry import write_stl_binary
import numpy as np

vertices = np.array([[0,0,0], [1,0,0], [0,1,0]])
faces = np.array([[0,1,2]])
write_stl_binary("triangle.stl", "MyTriangle", vertices, faces)
```

### `write_ascii_stl(path, name, vertices, faces)` [DEPRECATED]

Write mesh to ASCII STL file (LEGACY - use write_stl_binary instead).

Shows DeprecationWarning when called. Retained only for backward compatibility.

## Questions?

- **File too large?** → You're probably still using ASCII STL. Switch to `write_stl_binary`.
- **Need debugging?** → Binary STL can be opened in any slicer for visual inspection.
- **Version control?** → STL files (binary or ASCII) are not ideal for VCS. Consider versioning parameters instead.

---

**Last Updated:** 2024 - PotFoundry v2.0 Binary STL Migration
