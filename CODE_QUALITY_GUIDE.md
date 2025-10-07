# Code Quality Guide for PotFoundry

## Purpose

This guide ensures PotFoundry code is:
1. **LLM-Friendly** - Easy for AI assistants to understand and modify
2. **Maintainable** - Clear structure and documentation
3. **Testable** - Isolated components with good test coverage
4. **Performant** - Optimized for speed without sacrificing clarity

---

## LLM-Friendly Code Principles

### 1. Comprehensive Docstrings

Every public function must have a complete docstring:

```python
def build_pot_mesh(
    H: float, Rt: float, Rb: float,
    t_wall: float, t_bottom: float, r_drain: float,
    expn: float, n_theta: int, n_z: int,
    r_outer_fn: Callable[[float, float, float, float, dict], float],
    style_opts: dict
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Generate a watertight triangular mesh for a parametric flower pot.
    
    This is the main entry point for mesh generation. It creates a complete
    pot model with:
    - Outer decorative wall (modulated by style function)
    - Inner wall (offset by wall thickness)
    - Top rim (bridging outer to inner)
    - Bottom surface with drainage hole
    
    All geometry is deterministic and reproducible given the same inputs.
    
    Args:
        H: Total height of the pot in millimeters (must be > 0)
        Rt: Top radius (half of top outer diameter) in mm (must be > 0)
        Rb: Bottom radius (half of bottom outer diameter) in mm (must be > 0)
        t_wall: Wall thickness in mm (must be > 0, typically 2-5mm)
        t_bottom: Bottom thickness in mm (must be >= 2.0mm for strength)
        r_drain: Drainage hole radius in mm (must be > 0 and < Rb - t_wall)
        expn: Flare exponent controlling taper shape (typically 0.7-1.6)
              - expn = 1.0: linear taper
              - expn > 1.0: flares toward top (common for flower pots)
              - expn < 1.0: flares toward bottom
        n_theta: Number of angular divisions around circumference (min 32, typical 168)
                 Higher values = smoother curves but larger file size
        n_z: Number of vertical divisions along height (min 16, typical 84)
             Higher values = smoother vertical gradients
        r_outer_fn: Style function defining decorative variations
                    Signature: (theta, z, r0, H, opts) -> radius
                    See STYLES dict for available functions
        style_opts: Dictionary of style-specific parameters
                    Contents depend on the r_outer_fn chosen
    
    Returns:
        A tuple of (vertices, faces, diagnostics):
        - vertices: np.ndarray of shape (N, 3) containing [x, y, z] coordinates
        - faces: np.ndarray of shape (M, 3) containing vertex indices [i, j, k]
        - diagnostics: dict with metadata:
            - 'estimated_top_od_mm': Measured top outer diameter
            - 'estimated_bottom_od_mm': Measured bottom outer diameter
            - 'clamped_vertices': Count of inner vertices clamped to drain radius
            - 'face_count': Total number of triangular faces
    
    Raises:
        AssertionError: If parameters are invalid (negative, out of range, etc.)
        ValueError: If style function is malformed or returns invalid values
    
    Example:
        >>> from potfoundry import build_pot_mesh, STYLES
        >>> style_fn = STYLES["SuperformulaBlossom"][0]
        >>> verts, faces, diag = build_pot_mesh(
        ...     H=120, Rt=70, Rb=50,
        ...     t_wall=3, t_bottom=3, r_drain=10,
        ...     expn=1.1, n_theta=168, n_z=84,
        ...     r_outer_fn=style_fn, style_opts={}
        ... )
        >>> print(f"Generated {len(faces)} triangles")
        >>> # Export to STL:
        >>> from potfoundry import write_stl_binary
        >>> write_stl_binary("pot.stl", "FlowerPot", verts, faces)
    
    Performance:
        - Typical execution time: 50-100ms for default resolution
        - Memory usage: O(n_theta * n_z) for vertex arrays
        - Fully vectorized with NumPy for speed
    
    Notes:
        - Mesh is guaranteed watertight (closed surface)
        - Face winding is consistent (counter-clockwise when viewed from outside)
        - Coordinates are in millimeters
        - Origin is at bottom center of pot
        - +Z axis points upward
    """
    # Implementation...
```

### 2. Inline Comments for Complex Logic

Use inline comments to explain **why**, not **what**:

```python
# ❌ Bad: Explaining what code does (obvious from reading)
# Calculate the radius
r = Rb + (Rt - Rb) * t

# ✅ Good: Explaining why we do it this way
# Use power curve to control where flare occurs along height
# expn > 1 concentrates flare near top (typical for flower pots)
# expn < 1 concentrates flare near bottom
r = Rb + (Rt - Rb) * (t ** expn)
```

```python
# ❌ Bad: Obvious comment
# Add 1.0 to avoid division by zero
epsilon = 1e-9

# ✅ Good: Explains design decision
# Small epsilon prevents numerical instability in sigmoid normalization
# while keeping the curve shape nearly unchanged (< 0.0001% error)
epsilon = 1e-9
```

### 3. Self-Documenting Names

Choose names that make code self-explanatory:

```python
# ❌ Bad: Cryptic abbreviations
def calc_r(t, h, b, e):
    return b + (h - b) * (t ** e)

# ✅ Good: Clear, descriptive names
def calculate_radius_at_height(
    normalized_height: float,
    bottom_radius: float,
    top_radius: float,
    flare_exponent: float
) -> float:
    """Interpolate radius between bottom and top using power curve."""
    return bottom_radius + (top_radius - bottom_radius) * (normalized_height ** flare_exponent)
```

### 4. Type Hints Everywhere

All function signatures must include type hints:

```python
from typing import Callable, Dict, Tuple
import numpy as np
from numpy.typing import NDArray

def style_function(
    theta: float,
    z: float,
    r0: float,
    H: float,
    opts: Dict[str, float]
) -> float:
    """Compute radius modulation at given angle and height."""
    pass

def build_rings(
    n_theta: int,
    heights: NDArray[np.float64]
) -> Tuple[NDArray[np.float64], list[int]]:
    """Generate vertex rings at specified heights."""
    pass
```

### 5. Small, Focused Functions

Break complex logic into digestible pieces:

```python
# ❌ Bad: 200-line monolithic function
def build_pot_mesh(...):
    # 200 lines of mixed concerns
    pass

# ✅ Good: Composed of smaller functions
def build_pot_mesh(...):
    """Generate complete pot mesh."""
    outer_verts, outer_faces = _build_outer_wall(...)
    inner_verts, inner_faces = _build_inner_wall(...)
    rim_faces = _bridge_top_rim(outer_verts, inner_verts, ...)
    bottom_verts, bottom_faces = _build_bottom(...)
    
    all_verts = np.vstack([outer_verts, inner_verts, bottom_verts])
    all_faces = np.vstack([outer_faces, inner_faces, rim_faces, bottom_faces])
    
    diagnostics = _compute_diagnostics(all_verts, all_faces)
    return all_verts, all_faces, diagnostics

def _build_outer_wall(...) -> Tuple[NDArray, NDArray]:
    """Generate outer wall vertices and faces (internal helper)."""
    # Focused on just outer wall
    pass
```

---

## Code Organization

### Module Structure

Each module should have a clear header explaining its purpose:

```python
"""Module: potfoundry/geometry.py

Purpose:
    Core geometry engine for generating parametric pot meshes.
    Provides style functions, mesh building, and export utilities.

Public API:
    - build_pot_mesh(...): Main mesh generation function
    - STYLES: Dict of available style functions
    - MeshQuality: Dataclass for resolution settings
    - PotDefaults: Dataclass for default dimensions

Internal Helpers:
    - base_radius(...): Base profile computation
    - _spin_twist_radians(...): Twist calculation
    - _theta_grid_cached(...): Cached angle arrays

Style Functions:
    - r_outer_superformula_blossom(...)
    - r_outer_fourier_bloom(...)
    - r_outer_spiral_ridges(...)
    - r_outer_superellipse_morph(...)
    - r_outer_harmonic_ripple(...)

Dependencies:
    - numpy: Array operations
    - math: Trigonometric functions
    - functools: LRU caching

External Dependencies:
    None (core is UI-agnostic)

Example Usage:
    >>> from potfoundry import build_pot_mesh, STYLES, write_stl_binary
    >>> verts, faces, diag = build_pot_mesh(
    ...     H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    ...     expn=1.1, n_theta=168, n_z=84,
    ...     r_outer_fn=STYLES["SuperformulaBlossom"][0],
    ...     style_opts={}
    ... )
    >>> write_stl_binary("pot.stl", "MyPot", verts, faces)

Architecture Notes:
    - Fully vectorized with NumPy for performance
    - All geometry in millimeters
    - Deterministic output (no random seeds)
    - Thread-safe (no global mutable state)
"""
```

### Import Organization

Group imports logically:

```python
# Standard library
from __future__ import annotations
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

# Third-party
import numpy as np
from pydantic import BaseModel, Field

# Local/relative
from .core.io.stl import write_stl_binary
from .schema import ConfigV2
```

---

## Testing Standards

### Test Organization

Each test file should match its module:

```
potfoundry/
    geometry.py         → tests/test_geometry.py
    schema.py           → tests/test_schema.py
    core/
        io/
            stl.py      → tests/test_stl_binary.py
```

### Test Structure

Use clear, descriptive test names:

```python
def test_build_pot_mesh_generates_watertight_mesh():
    """Verify that build_pot_mesh produces a closed surface."""
    verts, faces, diag = build_pot_mesh(
        H=100, Rt=60, Rb=40,
        t_wall=3, t_bottom=3, r_drain=8,
        expn=1.1, n_theta=120, n_z=60,
        r_outer_fn=STYLES["SuperformulaBlossom"][0],
        style_opts={}
    )
    
    # Watertight mesh properties
    assert faces.shape[0] > 0, "Should have faces"
    assert verts.shape[0] > 0, "Should have vertices"
    assert faces.max() < verts.shape[0], "All face indices valid"
    
    # Each edge appears exactly twice (once per adjacent face) in watertight mesh
    edges = set()
    for face in faces:
        for i in range(3):
            edge = tuple(sorted([face[i], face[(i + 1) % 3]]))
            edges.add(edge)
    
    # More comprehensive watertightness test would count edge occurrences
    # For now, just verify basic structure
    assert len(edges) > 0, "Mesh has edges"
```

### Test Categories

1. **Unit Tests** - Test individual functions in isolation
2. **Integration Tests** - Test workflows end-to-end
3. **Regression Tests** - Prevent known bugs from reappearing
4. **Performance Tests** - Ensure operations complete within time budget

```python
import pytest
import time

def test_mesh_generation_performance():
    """Verify mesh generation completes within performance budget."""
    start = time.time()
    
    verts, faces, diag = build_pot_mesh(
        H=120, Rt=70, Rb=50,
        t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=STYLES["SuperformulaBlossom"][0],
        style_opts={}
    )
    
    elapsed = time.time() - start
    
    # Should complete in well under 1 second for typical resolution
    assert elapsed < 0.5, f"Mesh generation took {elapsed:.3f}s, expected <0.5s"
```

---

## Performance Guidelines

### Vectorization

Always use NumPy vectorized operations instead of Python loops:

```python
# ❌ Bad: Python loop (slow)
result = []
for i in range(len(array)):
    result.append(array[i] * 2)
result = np.array(result)

# ✅ Good: Vectorized (fast)
result = array * 2
```

```python
# ❌ Bad: Nested loops
for i in range(rows):
    for j in range(cols):
        matrix[i, j] = compute_value(i, j)

# ✅ Good: Vectorized with meshgrid
i_grid, j_grid = np.meshgrid(np.arange(rows), np.arange(cols), indexing='ij')
matrix = compute_value_vectorized(i_grid, j_grid)
```

### Caching

Use `functools.lru_cache` for expensive, pure functions:

```python
from functools import lru_cache

@lru_cache(maxsize=8)
def _theta_grid_cached(n_theta: int) -> Tuple[NDArray, NDArray, NDArray]:
    """Generate and cache angle arrays (expensive to recompute).
    
    Returns precomputed theta, cos(theta), sin(theta) arrays.
    Cached because:
    - Computation is expensive for large n_theta
    - Same values used across multiple mesh generations
    - Pure function (deterministic output)
    """
    thetas = np.linspace(0.0, TAU, n_theta, endpoint=False)
    return thetas, np.cos(thetas), np.sin(thetas)
```

### Memory Efficiency

Pre-allocate arrays when size is known:

```python
# ❌ Bad: Growing list (reallocates repeatedly)
verts = []
for i in range(n):
    verts.append(compute_vertex(i))
verts = np.array(verts)

# ✅ Good: Pre-allocated array
verts = np.empty((n, 3), dtype=np.float64)
for i in range(n):
    verts[i] = compute_vertex(i)

# ✅ Better: Fully vectorized (no loop)
verts = compute_vertices_vectorized(np.arange(n))
```

---

## Error Handling

### Validate Inputs Early

Fail fast with clear error messages:

```python
def build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, ...):
    """Generate pot mesh with validated inputs."""
    
    # Validate early with informative messages
    if H <= 0:
        raise ValueError(f"Height must be positive, got H={H}")
    
    if Rt <= 0 or Rb <= 0:
        raise ValueError(f"Radii must be positive, got Rt={Rt}, Rb={Rb}")
    
    if t_wall <= 0:
        raise ValueError(f"Wall thickness must be positive, got t_wall={t_wall}")
    
    if t_bottom < 2.0:
        raise ValueError(
            f"Bottom thickness must be >= 2.0mm for structural integrity, "
            f"got t_bottom={t_bottom}"
        )
    
    if r_drain <= 0 or r_drain >= (Rb - t_wall - 2.0):
        raise ValueError(
            f"Drain radius must be in range (0, {Rb - t_wall - 2.0}), "
            f"got r_drain={r_drain}"
        )
    
    # Proceed with validated inputs...
```

### Assertions for Internal Invariants

Use assertions for logic that should never fail:

```python
# After mesh generation
assert faces.shape[1] == 3, "Faces must be triangular"
assert faces.min() >= 0, "Face indices must be non-negative"
assert faces.max() < len(verts), "Face indices must reference valid vertices"
```

---

## Git and Version Control

### Commit Messages

Format: `<type>: <short summary>`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code restructuring (no behavior change)
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat: Add new HarmonicRipple style with petal variations
fix: Prevent mesh collapse when wall thickness exceeds radius
docs: Add comprehensive docstrings to geometry functions
refactor: Extract rim bridging logic to separate function
perf: Vectorize inner wall vertex generation
test: Add golden mesh regression tests
```

### Pull Request Checklist

Before submitting:

- [ ] Code follows style guide
- [ ] All functions have docstrings
- [ ] Type hints added
- [ ] Tests added/updated
- [ ] Tests pass: `pytest -v`
- [ ] Linting clean: `ruff check .`
- [ ] App runs: `streamlit run app.py`
- [ ] No performance regressions
- [ ] Documentation updated
- [ ] CHANGELOG.md updated (if applicable)

---

## LLM Interaction Best Practices

### When Asking LLMs to Modify Code

1. **Provide context:**
   ```
   "I need to modify the build_pot_mesh function in potfoundry/geometry.py
   to add support for non-circular cross-sections. The function currently
   generates pots with circular horizontal slices. See ARCHITECTURE.md
   for the overall design."
   ```

2. **Be specific about constraints:**
   ```
   "Maintain backward compatibility - existing code using build_pot_mesh
   should continue to work unchanged. Add the new feature as an optional
   parameter with a default value."
   ```

3. **Request tests:**
   ```
   "Please also add test cases covering: (1) default behavior unchanged,
   (2) new parameter works for elliptical cross-sections, (3) edge case
   where major/minor axes are equal (should match circular)."
   ```

### When LLMs Are Modifying Your Code

Make it easy by:

1. **Comprehensive docstrings** - LLM knows what function does
2. **Type hints** - LLM knows expected types
3. **Example usage** - LLM can verify against examples
4. **Clear structure** - LLM can locate relevant code
5. **Good test coverage** - LLM can verify changes don't break things

---

## Anti-Patterns to Avoid

### ❌ Magic Numbers

```python
# Bad: What does 0.35 mean?
radius = base_radius * 0.35

# Good: Named constant with explanation
PETAL_AMPLITUDE_FACTOR = 0.35  # Calibrated for aesthetic balance
radius = base_radius * PETAL_AMPLITUDE_FACTOR
```

### ❌ Mutable Default Arguments

```python
# Bad: opts dict is shared across calls!
def style_function(theta, z, opts={}):
    opts.setdefault('param', 1.0)  # Mutates shared dict!

# Good: Use None and create new dict
def style_function(theta, z, opts=None):
    if opts is None:
        opts = {}
    param = opts.get('param', 1.0)  # Read-only access
```

### ❌ Global Mutable State

```python
# Bad: Global variables modified by functions
_cached_mesh = None

def build_pot_mesh(...):
    global _cached_mesh
    if _cached_mesh is None:
        _cached_mesh = compute_mesh(...)
    return _cached_mesh

# Good: Pure function or explicit cache parameter
@lru_cache(maxsize=8)
def build_pot_mesh(...):
    return compute_mesh(...)
```

### ❌ Overly Clever Code

```python
# Bad: Obscure one-liner
return [r0*(1+sum(a*f(k*t+p)for a,f,k,p in cs))for t in ts]

# Good: Clear, multi-line
results = []
for t in ts:
    modulation = sum(
        amplitude * func(frequency * t + phase)
        for amplitude, func, frequency, phase in coefficients
    )
    results.append(r0 * (1 + modulation))
return results

# Better: Vectorized and documented
def compute_modulated_radii(ts, r0, coefficients):
    """Compute radii with harmonic modulation at given parameters."""
    # Vectorized evaluation of sum of sinusoidal components
    modulation = np.sum([
        amplitude * func(frequency * ts + phase)
        for amplitude, func, frequency, phase in coefficients
    ], axis=0)
    return r0 * (1 + modulation)
```

---

## Summary Checklist

For every code file, ensure:

- [ ] Module has comprehensive header docstring
- [ ] All public functions have complete docstrings
- [ ] Complex logic has inline comments explaining "why"
- [ ] All functions have type hints
- [ ] No magic numbers (use named constants)
- [ ] Pure functions (no global mutable state)
- [ ] Vectorized with NumPy where applicable
- [ ] Cached where appropriate
- [ ] Input validation with clear error messages
- [ ] Tests covering main paths and edge cases
- [ ] Performance tested for critical paths
- [ ] Linting clean (`ruff check`)
- [ ] Imports organized logically

---

**Last Updated:** 2024  
**Applies To:** PotFoundry v2.0+
