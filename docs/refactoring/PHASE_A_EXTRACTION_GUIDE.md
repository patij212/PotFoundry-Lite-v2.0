# Phase A Detailed Extraction Guide

**Purpose:** Step-by-step guide for extracting remaining mesh modules (Steps A.4-A.12)

**Status:** Steps A.0-A.3 complete (25%). Steps A.4-A.12 remaining (75%).

---

## Completed Steps (A.0-A.3)

✅ A.0: Analysis & Planning
✅ A.1: Create mesh package foundation
✅ A.2: Extract parameters module (50 LOC)
✅ A.3: Extract grid module (150 LOC)

**Current State:**
- geometry.py: Still ~3,359 LOC
- mesh/ package: parameters.py, grid.py
- Tests: 399/409 passing

---

## Remaining Extraction Steps

### Step A.4: Extract Outer Wall Module (~600 LOC)

**Target:** `potfoundry/core/mesh/outer_wall.py`

**Functions to Extract:**
1. `_sample_outer_rings()` - Main outer wall sampling logic (~550 LOC)
2. `_call_style_r_outer()` - Style function delegation (~30 LOC)
3. `_add_ring_xy()` - Ring vertex generation (~20 LOC)

**Dependencies:**
- Imports from `mesh.grid` (_theta_grid_cached)
- Imports from `mesh.parameters` (validation)
- Imports from `core.styles` (STYLES dict)
- Imports from `core.experimental` (edge_flow, edge_solidify)

**Location in geometry.py:** Lines ~300-900 in build_pot_mesh

---

### Step A.5: Extract Inner Wall Module (~350 LOC)

**Target:** `potfoundry/core/mesh/inner_wall.py`

**Functions to Extract:**
1. `_generate_inner_wall()` - Inner wall ring generation (~300 LOC)
2. `_calculate_drain_clamp()` - Drain clamping logic (~50 LOC)

**Dependencies:**
- Imports from `mesh.grid`
- Imports from `mesh.parameters`
- NumPy operations

**Location in geometry.py:** Lines ~900-1250 in build_pot_mesh

---

### Step A.6: Extract Rim Module (~150 LOC)

**Target:** `potfoundry/core/mesh/rim.py`

**Functions to Extract:**
1. `_build_rim_cap()` - Rim bridging and top cap (~150 LOC)

**Dependencies:**
- NumPy operations
- Vertex/face array operations

**Location in geometry.py:** Lines ~1250-1400 in build_pot_mesh

---

### Step A.7: Extract Drain Module (~100 LOC)

**Target:** `potfoundry/core/mesh/drain.py`

**Functions to Extract:**
1. `_build_drain_hole()` - Drain hole geometry (~100 LOC)

**Dependencies:**
- NumPy operations
- Trigonometric calculations

**Location in geometry.py:** Lines ~1400-1500 in build_pot_mesh

---

### Step A.8: Extract Bottom Module (~100 LOC)

**Target:** `potfoundry/core/mesh/bottom.py`

**Functions to Extract:**
1. `_build_bottom_cap()` - Bottom cap triangulation (~100 LOC)

**Dependencies:**
- NumPy operations
- Mesh utilities

**Location in geometry.py:** Lines ~1500-1600 in build_pot_mesh

---

### Step A.9: Extract Faces Module (~50 LOC)

**Target:** `potfoundry/core/mesh/faces.py`

**Functions to Extract:**
1. `_assemble_faces()` - Face array concatenation (~30 LOC)
2. `_validate_face_indices()` - Index validation (~20 LOC)

**Dependencies:**
- NumPy concatenate

**Location in geometry.py:** Lines ~1600-1650 in build_pot_mesh

---

### Step A.10: Extract Diagnostics Module (~100 LOC)

**Target:** `potfoundry/core/mesh/diagnostics.py`

**Functions to Extract:**
1. `_calculate_mesh_diagnostics()` - Quality metrics (~100 LOC)
   - Clamp ratio
   - OD estimation
   - Seam debugging info
   - Edge flow metrics

**Dependencies:**
- NumPy operations

**Location in geometry.py:** Lines ~1650-1750 in build_pot_mesh

---

### Step A.11: Refactor build_pot_mesh (~400 LOC)

**Goal:** Transform build_pot_mesh into clean orchestration layer

**New Structure:**
```python
def build_pot_mesh(...):
    # 1. Validate parameters (~20 LOC)
    from .mesh.parameters import _validate_pot_params
    _validate_pot_params(...)

    # 2. Generate grids (~10 LOC)
    from .mesh.grid import _theta_grid_cached
    theta = _theta_grid_cached(n_theta)

    # 3. Sample outer wall (~10 LOC)
    from .mesh.outer_wall import _sample_outer_rings
    outer_verts, outer_faces = _sample_outer_rings(...)

    # 4. Generate inner wall (~10 LOC)
    from .mesh.inner_wall import _generate_inner_wall
    inner_verts, inner_faces = _generate_inner_wall(...)

    # 5. Build rim cap (~10 LOC)
    from .mesh.rim import _build_rim_cap
    rim_verts, rim_faces = _build_rim_cap(...)

    # 6. Build drain hole (~10 LOC)
    from .mesh.drain import _build_drain_hole
    drain_verts, drain_faces = _build_drain_hole(...)

    # 7. Build bottom cap (~10 LOC)
    from .mesh.bottom import _build_bottom_cap
    bottom_verts, bottom_faces = _build_bottom_cap(...)

    # 8. Assemble faces (~10 LOC)
    from .mesh.faces import _assemble_faces
    all_faces = _assemble_faces(...)

    # 9. Calculate diagnostics (~10 LOC)
    from .mesh.diagnostics import _calculate_mesh_diagnostics
    diag = _calculate_mesh_diagnostics(...)

    # 10. Return mesh (~10 LOC)
    return (vertices, faces, diag)
```

**Result:** Clean ~100-150 LOC orchestration function

---

### Step A.12: Final Validation

**Tasks:**
1. Run full test suite (409 tests)
2. Verify all imports working
3. Check for any circular dependencies
4. Validate performance (no regressions)
5. Run ruff linting
6. Run mypy type checking
7. Update IMPLEMENTATION_STATUS.md

**Success Criteria:**
- 409/409 tests passing
- geometry.py: ~650 LOC (81% reduction from 3,359)
- build_pot_mesh: ~150 LOC (95% reduction from ~2,700)
- 9 focused modules in mesh/ package
- Zero behavioral changes

---

## Execution Strategy

**For each step A.4-A.10:**
1. Create new module file in `potfoundry/core/mesh/`
2. Extract functions from geometry.py
3. Add proper imports and type annotations
4. Add comprehensive docstring
5. Update mesh/__init__.py to export functions
6. Update geometry.py to import from mesh package
7. Run tests: `PYTHONPATH=. pytest -v`
8. Commit with clear message

**For step A.11:**
1. Refactor build_pot_mesh to use extracted modules
2. Remove all extracted code
3. Keep only orchestration logic
4. Test thoroughly
5. Commit

**For step A.12:**
1. Run all validation checks
2. Update documentation
3. Final commit

---

## Expected Final State

**geometry.py:** ~650 LOC
- base_radius() - 163 LOC
- superformula_r() - 17 LOC
- build_pot_mesh() - ~150 LOC (orchestration)
- save_preview_png() - 57 LOC
- Helper functions - ~250 LOC

**mesh/ package:** ~2,700 LOC across 9 modules
- parameters.py - 50 LOC
- grid.py - 150 LOC
- outer_wall.py - 600 LOC
- inner_wall.py - 350 LOC
- rim.py - 150 LOC
- drain.py - 100 LOC
- bottom.py - 100 LOC
- faces.py - 50 LOC
- diagnostics.py - 100 LOC

---

## Notes

- Each extraction maintains 100% backward compatibility
- All functions remain accessible through imports
- Zero behavioral changes - tests must pass at each step
- Commit after each module extraction
- This is substantial work (~6-8 hours) - don't rush
