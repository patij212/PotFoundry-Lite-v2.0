# PotFoundry Architecture Documentation

## Overview

PotFoundry is a parametric 3D pot generator with a Streamlit UI. The codebase follows a clean separation between:
- **Core** geometry/logic (UI-agnostic)
- **UI** layer (Streamlit currently, Qt/PySide6 planned)
- **Adapters** for state management and batch processing

This document provides a comprehensive guide for LLMs and developers to understand, maintain, and extend the codebase.

---

## Directory Structure

```
PotFoundry-Lite-v2.0/
├── app.py                          # Streamlit application entry point
├── potfoundry/                     # Core library (UI-agnostic)
│   ├── __init__.py                # Public API exports
│   ├── geometry.py                # Main geometry engine (ACTIVE)
│   ├── schema.py                  # Pydantic v2 schemas for validation
│   ├── yaml_api.py                # YAML config loading and batch builds
│   └── core/                      # Refactored core (alternative layout)
│       ├── geometry.py            # Alternative geometry implementation
│       └── io/
│           └── stl.py             # Binary STL writer (recommended)
├── pfui/                          # Streamlit UI components
│   ├── imports.py                 # Flexible imports (supports both layouts)
│   ├── state.py                   # Session state management
│   ├── controls.py                # UI control widgets
│   ├── preview.py                 # 3D preview rendering
│   ├── presets.py                 # Preset management
│   ├── schemas.py                 # Style parameter schemas
│   ├── batch_tab.py               # Batch processing UI
│   └── ...                        # Other UI utilities
├── tests/                         # Test suite (pytest)
│   ├── test_stl_binary.py         # Binary STL tests
│   ├── test_stl_migration.py      # Migration tests
│   ├── test_styles_and_parity.py  # Style and mesh tests
│   └── pfui/                      # UI component tests
└── requirements.txt               # Python dependencies
```

---

## Core Architecture Principles

### 1. **UI-Agnostic Core**

The `potfoundry/` module is completely independent of Streamlit or any UI framework:

```python
# ✅ Core has NO dependencies on Streamlit, Qt, or any UI library
from potfoundry import build_pot_mesh, write_stl_binary, STYLES

# Build a mesh (pure computation)
verts, faces, diagnostics = build_pot_mesh(
    H=120, Rt=70, Rb=50,
    t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=168, n_z=84,
    r_outer_fn=STYLES["SuperformulaBlossom"][0],
    style_opts={}
)

# Export (pure I/O)
write_stl_binary("pot.stl", "FlowerPot", verts, faces)
```

**Why This Matters:**
- Core can be tested without UI
- Core can be reused in CLI tools, batch scripts, or future Qt app
- LLMs can work with core logic without UI complexity

### 2. **Separation of Concerns**

```
┌─────────────────────────────────────────┐
│          UI Layer (pfui/)               │
│  - Streamlit widgets                    │
│  - User input handling                  │
│  - Session state management             │
│  - Preview rendering                    │
└────────────┬────────────────────────────┘
             │ Uses
             ▼
┌─────────────────────────────────────────┐
│        Core Layer (potfoundry/)         │
│  - Geometry computation                 │
│  - Mesh generation                      │
│  - STL export                           │
│  - Schema validation                    │
└─────────────────────────────────────────┘
```

### 3. **Flexible Module Layout**

The codebase supports two layouts for backward compatibility:

**Layout A (Original):**
```python
from potfoundry.geometry import build_pot_mesh, STYLES
from potfoundry import write_stl_binary
```

**Layout B (Refactored):**
```python
from potfoundry.core.geometry import build_pot_mesh, STYLES
from potfoundry.core.io.stl import write_stl_binary
```

The `pfui/imports.py` module handles both automatically.

---

## Key Modules

### `potfoundry/geometry.py` (Core Engine)

**Purpose:** Generate parametric pot meshes with various artistic styles.

**Key Components:**

1. **Base Profile Functions**
   ```python
   def base_radius(z, H, Rb, Rt, expn, opts) -> float:
       """Compute base radius at height z with flare and bell effects."""
   ```
   - Handles the basic tapered shape (bottom radius Rb → top radius Rt)
   - Supports flare center warping (logistic sigmoid)
   - Optional bell-shaped mid-height bulge

2. **Style Functions** (decorative variations)
   ```python
   def r_outer_superformula_blossom(theta, z, r0, H, opts) -> float:
       """Petal-like variations using Gielis superformula."""
   ```
   - Each style modulates the radius at angle `theta` and height `z`
   - Styles are registered in `STYLES` dict: `{name: (function, description)}`
   - Current styles: SuperformulaBlossom, FourierBloom, SpiralRidges, etc.

3. **Twist/Spin Effects**
   ```python
   def _spin_twist_radians(z, H, opts) -> float:
       """Compute spiral twist angle at height z."""
   ```
   - Adds helical/spiral rotation to pot surface
   - Controlled by `spin_turns`, `spin_phase`, `spin_curve_exp` options

4. **Mesh Builder** (main entry point)
   ```python
   def build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain,
                      expn, n_theta, n_z, r_outer_fn, style_opts):
       """Generate watertight triangular mesh for a pot."""
       # Returns: (vertices [N,3], faces [M,3], diagnostics)
   ```

   **Algorithm:**
   - Generate outer wall rings (stacked circles with style modulation)
   - Generate inner wall rings (outer - wall thickness)
   - Cap top rim (outer → inner edge loop)
   - Build bottom surface with drain hole
   - Stitch faces using vectorized numpy indexing
   - Return watertight mesh + diagnostic info

### `potfoundry/core/io/stl.py` (Binary STL Export)

**Purpose:** Fast, compact STL file writing.

**Why Binary STL?**
- 50-90% smaller files than ASCII
- 10x faster write speed
- Universally supported by slicers

**Key Functions:**

```python
def write_stl_binary(path, name, vertices, faces, normals=None):
    """Write mesh to binary STL file (RECOMMENDED).

    Args:
        path: Output file path
        name: Model name (max 80 chars, embedded in header)
        vertices: np.ndarray shape (N, 3)
        faces: np.ndarray shape (M, 3), indices into vertices
        normals: Optional face normals (M, 3), auto-computed if None

    Returns:
        Path: Resolved path to written file
    """
```

**Implementation Details:**
- Uses atomic write (tmp file → fsync → rename) to prevent corruption
- Packs data with numpy struct arrays for speed
- Little-endian float32 format per STL spec
- Fixed 50 bytes per triangle (12 normal + 36 vertices + 2 attribute)

### `potfoundry/schema.py` (Validation)

**Purpose:** Pydantic v2 models for strict config validation.

**Key Models:**

```python
class DefaultsModel(BaseModel):
    """Default pot dimensions in millimeters."""
    height: PositiveFloat = 120.0
    top_od: PositiveFloat = 140.0
    bottom_od: PositiveFloat = 90.0
    wall: PositiveFloat = 3.0
    bottom: PositiveFloat = 3.0
    drain: PositiveFloat = 10.0
    flare_exp: PositiveFloat = 1.1

class ConfigV2(BaseModel):
    """YAML batch config schema (version 2)."""
    version: Literal[2] = 2
    outdir: str = "out"
    save_previews: bool = True
    mesh: MeshQualityModel
    defaults: DefaultsModel
    presets: Dict[str, PresetModel]
    recipes: List[RecipeModel]
```

**Migration Support:**
```python
def migrate_v1_to_v2(raw: dict) -> dict:
    """Convert legacy v1 YAML to v2 format."""
```

### `pfui/` (Streamlit UI Layer)

**Purpose:** User interface components for the Streamlit app.

**Key Modules:**

1. **`pfui/state.py`** - Session state management
   - Handles widget state persistence
   - Queue-based state updates (avoids Streamlit reruns)
   - Style-specific default values

2. **`pfui/controls.py`** - Reusable control widgets
   - Style-specific parameter controls
   - Twist/spin controls
   - Consistent UI patterns

3. **`pfui/preview.py`** - 3D visualization
   - Plotly-based interactive preview
   - Profile plot (2D cross-section)
   - Caching for performance

4. **`pfui/presets.py`** - Preset management
   - Save/load parameter sets
   - Built-in presets per style
   - User-defined presets in JSON

5. **`pfui/batch_tab.py`** - Batch processing UI
   - YAML config editor
   - Multi-pot generation
   - ZIP export

---

## Data Flow

### Single Pot Export (Streamlit UI)

```
User Input (sliders/inputs)
         ↓
   Streamlit State
         ↓
   Collect Parameters
   {H, Rt, Rb, t_wall, ...}
         ↓
   build_pot_mesh()
   (potfoundry/geometry.py)
         ↓
   vertices, faces, diagnostics
         ↓
   write_stl_binary()
   (potfoundry/core/io/stl.py)
         ↓
   pot.stl file
```

### Batch Processing (YAML)

```
YAML File
    ↓
load_config() → ConfigV2
(potfoundry/yaml_api.py)
    ↓
Validate with Pydantic
(potfoundry/schema.py)
    ↓
For each recipe:
  ├─ Resolve preset (if any)
  ├─ Merge with defaults
  ├─ build_pot_mesh()
  ├─ write_stl_binary()
  └─ Optional: save_preview_png()
    ↓
Output directory with STL files
```

---

## Geometry Algorithm Deep Dive

### How Mesh Generation Works

The `build_pot_mesh()` function creates a watertight mesh in these steps:

#### 1. **Outer Wall** (visible surface)

```python
# Sample height positions
z_outer = np.linspace(0, H, n_z)  # e.g., 84 vertical slices

# For each height level:
for z in z_outer:
    # Compute twist angle (for spiral effects)
    twist = _spin_twist_radians(z, H, style_opts)

    # Compute base radius at this height
    r0 = base_radius(z, H, Rb, Rt, expn, style_opts)

    # Apply style modulation around circumference
    for theta in thetas:  # e.g., 168 angles around
        r = r_outer_fn(theta, z, r0, H, style_opts)
        # Create vertex at (r*cos(theta+twist), r*sin(theta+twist), z)
```

Result: Stacked rings forming the outer wall.

#### 2. **Inner Wall** (inside the pot)

```python
# Same as outer, but radius = outer_radius - wall_thickness
r_inner = r_outer - t_wall
# Ensure doesn't go below drain hole radius
r_inner = max(r_inner, r_drain + safety_margin)
```

#### 3. **Top Rim** (outer edge → inner edge)

Bridges the top outer ring to the top inner ring.

#### 4. **Bottom Surface** (floor with drain)

```python
# Concentric rings from inner wall to drain hole center
# Creates sloped/flat bottom depending on t_bottom
# Drain hole is a circle of vertices at the center
```

#### 5. **Face Generation** (triangulation)

```python
# Vectorized face creation using numpy indexing
# For each pair of adjacent rings:
for i in range(n_rings - 1):
    for j in range(n_theta):
        j_next = (j + 1) % n_theta
        # Create two triangles per quad:
        # Triangle 1: [i,j], [i,j_next], [i+1,j]
        # Triangle 2: [i,j_next], [i+1,j_next], [i+1,j]
```

Result: `faces` array shape `(M, 3)` with vertex indices.

---

## Performance Optimizations

### Already Implemented

1. **Vectorization**
   - Theta grid pre-computed with `np.linspace`
   - Face generation uses numpy array indexing (not Python loops)
   - Vectorized normal computation with `np.cross`

2. **Caching**
   ```python
   @lru_cache(maxsize=8)
   def _theta_grid_cached(n_theta):
       """Cache angle arrays to avoid recomputation."""
   ```

3. **Binary STL**
   - Struct packing for fast serialization
   - Atomic writes prevent I/O errors

### Future Optimizations (from Evolution Plan)

1. **JIT Compilation** (optional)
   - Add Numba decorators for hot loops
   - Keep optional (not required for basic usage)

2. **Mesh Caching**
   - Cache mesh for unchanged parameters
   - Invalidate on parameter change

3. **Progressive Rendering**
   - Generate low-res preview quickly
   - Upgrade to high-res for export

---

## Testing Strategy

### Test Categories

1. **Unit Tests** (`tests/test_*.py`)
   - Individual function correctness
   - Edge cases and boundary conditions
   - Example: `test_styles_and_parity.py`

2. **Integration Tests** (`tests/test_integration_*.py`)
   - End-to-end workflows
   - Binary STL export
   - Multiple styles

3. **Migration Tests** (`tests/test_stl_migration.py`)
   - Deprecation warnings
   - File size validation
   - API compatibility

4. **UI Tests** (`tests/pfui/test_*.py`)
   - State management
   - Schema validation
   - Widget behavior

### Running Tests

```bash
# Install test dependencies
pip install pytest

# Run all tests
PYTHONPATH=/path/to/PotFoundry-Lite-v2.0 pytest -v

# Run specific test file
PYTHONPATH=/path/to/PotFoundry-Lite-v2.0 pytest tests/test_stl_binary.py -v

# Run with coverage
PYTHONPATH=/path/to/PotFoundry-Lite-v2.0 pytest --cov=potfoundry --cov=pfui
```

---

## Common Patterns for LLM Modifications

### Adding a New Style

1. **Define the style function:**
   ```python
   def r_outer_my_new_style(theta, z, r0, H, opts):
       """My custom decorative variation."""
       # Compute modulation based on theta, z, and opts
       amplitude = float(opts.get('my_param', 0.1))
       modulation = amplitude * math.sin(5 * theta)
       return r0 * (1.0 + modulation)
   ```

2. **Register in STYLES dict:**
   ```python
   STYLES = {
       "MyNewStyle": (r_outer_my_new_style, "Description of the effect"),
       # ... existing styles
   }
   ```

3. **Define parameter schema** (in `pfui/schemas.py`):
   ```python
   STYLE_SCHEMAS = {
       "MyNewStyle": [
           ("my_param", "range", 0.0, 0.5, 0.1, 0.01, "My Parameter"),
       ],
       # ...
   }
   ```

4. **Test the style:**
   ```python
   # Add to test_styles_and_parity.py
   def test_my_new_style():
       r_fn = STYLES["MyNewStyle"][0]
       verts, faces, diag = build_pot_mesh(
           H=100, Rt=60, Rb=40, t_wall=3, t_bottom=3, r_drain=8,
           expn=1.1, n_theta=120, n_z=60,
           r_outer_fn=r_fn, style_opts={'my_param': 0.2}
       )
       assert faces.shape[0] > 0
   ```

### Modifying Geometry Algorithm

**Best Practices:**
- Keep `build_pot_mesh()` signature stable (backward compatibility)
- Add new options via `style_opts` dict (extensible)
- Document new parameters in docstrings
- Add tests for new behavior
- Update `diagnostics` return value if adding metrics

### Adding UI Controls

**In `pfui/controls.py`:**
```python
def my_style_controls(style_key: str) -> Dict[str, Any]:
    """Return style-specific parameter widgets for MyNewStyle."""
    opts = {}
    opts['my_param'] = st.slider(
        "My Parameter",
        min_value=0.0, max_value=0.5, value=0.1, step=0.01,
        key=widget_key(style_key, 'my_param')
    )
    return opts
```

**In `pfui/schemas.py`:**
```python
STYLE_SCHEMAS["MyNewStyle"] = [
    ("my_param", "range", 0.0, 0.5, 0.1, 0.01, "My Parameter"),
]
```

---

## State Management (Streamlit Specific)

### How State Works

Streamlit reruns the entire script on every interaction. To preserve state:

1. **Session State** (`st.session_state`)
   - Persists across reruns
   - Widget values stored with unique keys

2. **Queue Pattern** (in `pfui/state.py`)
   ```python
   # Instead of modifying state directly during render:
   queue_update({"param1": value1})

   # Apply at start of next rerun:
   apply_pending_updates()
   ```

3. **Widget Keys**
   ```python
   # Style-specific keys to avoid collisions
   key = widget_key(style_key, "parameter_name")
   st.slider("Label", key=key)
   ```

### Avoiding Common Pitfalls

❌ **Don't:**
```python
# This causes infinite reruns!
st.session_state['value'] = new_value
st.rerun()
```

✅ **Do:**
```python
# Queue the update for next rerun
queue_update({'value': new_value})
st.rerun()
```

---

## Future Architecture Evolution

### Planned: Qt Desktop Application

From the Evolution Plan PDF, the roadmap includes:

1. **PySide6 + VTK UI**
   - High-performance 3D preview with GPU acceleration
   - Non-blocking mesh generation (worker threads)
   - Progress bars and cancel buttons

2. **MVVM Architecture**
   ```
   View (Qt Widgets)
        ↓
   ViewModel (adapters/)
        ↓
   Model (potfoundry/core)
   ```

3. **Packaging**
   - PyInstaller frozen binaries
   - Code signing and notarization
   - Per-OS installers

**Current Code Readiness:**
- ✅ Core is already UI-agnostic
- ✅ Schema validation in place
- ✅ Binary STL export optimized
- ⏳ Need to add threading/async support
- ⏳ Need to create Qt UI layer

---

## Documentation Standards

### For Functions

```python
def function_name(arg1: type1, arg2: type2) -> return_type:
    """One-line summary.

    Detailed description explaining what the function does,
    why it exists, and how it should be used.

    Args:
        arg1: Description of arg1
        arg2: Description of arg2

    Returns:
        Description of return value

    Raises:
        ExceptionType: When and why this exception occurs

    Example:
        >>> result = function_name(value1, value2)
        >>> print(result)
        expected_output
    """
```

### For Modules

```python
"""Module short description.

Longer explanation of the module's purpose, key components,
and how it fits into the overall architecture.

Public API:
    - function1: Brief description
    - function2: Brief description

Internal helpers:
    - _private_func: Brief description

Example:
    >>> from module import function1
    >>> result = function1(args)
"""
```

### For Classes

```python
class ClassName:
    """Short description.

    Longer explanation of purpose, usage patterns, and responsibilities.

    Attributes:
        attr1: Description
        attr2: Description

    Example:
        >>> obj = ClassName(arg1, arg2)
        >>> obj.method()
    """
```

---

## Debugging Guide

### Common Issues

**1. Import Errors**
```python
# Problem: Module not found
ModuleNotFoundError: No module named 'potfoundry'

# Solution: Set PYTHONPATH
export PYTHONPATH=/path/to/PotFoundry-Lite-v2.0:$PYTHONPATH
python script.py
```

**2. Mesh Generation Issues**
```python
# Problem: Invalid mesh (holes, flipped normals)
# Debug: Check diagnostics
verts, faces, diag = build_pot_mesh(...)
print(diag)
# Look for: clamped_vertices, estimated dimensions

# Validation: Count vertices and faces
print(f"Vertices: {len(verts)}, Faces: {len(faces)}")
# Should have: vertices ≈ n_theta * n_z * 2 (outer + inner walls)
```

**3. STL Export Issues**
```python
# Problem: File not created or corrupted
# Check: Path exists and is writable
from pathlib import Path
path = Path("output.stl")
path.parent.mkdir(parents=True, exist_ok=True)

# Verify: File size and structure
path.stat().st_size  # Should be: 84 + (50 * num_faces)
```

**4. Streamlit State Issues**
```python
# Problem: Values not persisting
# Debug: Check session state
import streamlit as st
print(st.session_state)

# Ensure: Widget keys are unique and stable
key = widget_key(style_key, "param")  # ✅
key = f"{style_name}_param"  # ❌ changes if style_name changes
```

---

## Contributing Guidelines

### Before Making Changes

1. **Run tests:**
   ```bash
   PYTHONPATH=. pytest -v
   ```

2. **Check linting:**
   ```bash
   pip install ruff
   ruff check .
   ```

3. **Verify app works:**
   ```bash
   streamlit run app.py
   ```

### Making Changes

1. **Keep changes minimal** - modify only what's necessary
2. **Maintain backward compatibility** - don't break existing APIs
3. **Add tests** for new functionality
4. **Update documentation** in this file and docstrings
5. **Follow existing patterns** for consistency

### Pull Request Checklist

- [ ] Tests pass: `pytest -v`
- [ ] Linting clean: `ruff check .`
- [ ] App runs: `streamlit run app.py`
- [ ] Documentation updated
- [ ] Backward compatible (or deprecation path provided)

---

## Key Takeaways for LLMs

1. **Core is UI-agnostic** - `potfoundry/` has no Streamlit/Qt dependencies
2. **Two geometry layouts** - Use `pfui/imports.py` for compatibility
3. **Binary STL is default** - ASCII STL is deprecated
4. **Pydantic v2 for validation** - Use `schema.py` models
5. **Queue pattern for state** - Use `queue_update()` in Streamlit
6. **Vectorized mesh gen** - Numpy arrays, not Python loops
7. **Comprehensive tests** - Always run `pytest` before committing
8. **LLM-friendly docs** - Every module/function has clear docstrings

---

## Quick Reference

### File Size Expectations

- **ASCII STL:** ~250 bytes per triangle
- **Binary STL:** 50 bytes per triangle
- **Typical pot:** 30k-100k triangles → 1.5-5 MB binary

### Performance Targets

- **Mesh generation:** <100ms for typical resolution (168×84)
- **Binary STL write:** <50ms for 30k triangles
- **Preview render:** <200ms (Plotly)

### Default Values

```python
MeshQuality(n_theta=168, n_z=84)  # Good quality
PotDefaults(
    height=120.0,     # mm
    top_od=140.0,     # mm (outer diameter)
    bottom_od=90.0,   # mm
    wall=3.0,         # mm
    bottom=3.0,       # mm
    drain=10.0,       # mm (radius)
    flare_exp=1.1     # >1 flares toward top
)
```

---

**Last Updated:** 2024
**Version:** 2.0 (Binary STL Migration Complete)
**Architecture Status:** Streamlit app stable, Qt desktop planned
