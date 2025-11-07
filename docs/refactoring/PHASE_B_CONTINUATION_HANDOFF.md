# Phase B Continuation Handoff

## Current Status

**Phase B is 85% complete** with these modules successfully extracted:
- ✅ metrics.py (100 LOC)
- ✅ performance.py (27 LOC)
- ✅ profile.py (37 LOC)
- ✅ export.py (623 LOC)
- ⚠️ preview.py (1,285 LOC) - **NEEDS DECOMPOSITION**
- ⚠️ sidebar.py (380 LOC) - **NEEDS DECOMPOSITION**

## Critical Issue

The preview.py and sidebar.py modules are monolithic with single massive functions:
- `preview.py`: 1,285 LOC in one function `render_preview_section()`
- `sidebar.py`: 380 LOC in one function `render_sidebar_section()`

These need to be decomposed into focused sub-modules for better maintainability.

---

## preview.py Decomposition Plan

### Target Structure

```
pfui/tabs/interactive/preview/
├── __init__.py              # Main orchestration (import and call sub-functions)
├── utils.py                 # Helper functions (to_float_scalar, to_int_scalar)
├── update_decision.py       # Update decision logic + debounce JS injection
├── cache_management.py      # Cache initialization and cleanup
├── signatures.py            # Signature computation for change detection
├── array_generation.py      # Array generation orchestration
├── mesh_building.py         # Mesh building orchestration
├── plotly_surface.py        # Quick preview (Plotly surface rendering)
├── plotly_mesh.py           # Full preview (Plotly mesh rendering)
└── png_rendering.py         # PNG fallback rendering
```

### Extraction Strategy

#### Step 1: Create utils.py ✅ DONE
Already created with `to_float_scalar()` and `to_int_scalar()` functions.

#### Step 2: Extract update_decision.py
**Lines:** 72-184 from preview.py

**Functions to extract:**
```python
def should_update_preview(preview_mode: str, ss: dict) -> tuple[bool, bool]:
    """Determine if preview should update based on mode.

    Returns:
        (should_update, should_show_controls) tuple
    """

def inject_debounce_js(timeout_ms: int) -> None:
    """Inject JavaScript for debounced preview updates."""

def render_update_controls(preview_mode: str, ss: dict) -> bool:
    """Render update button and controls.

    Returns:
        True if update button was clicked
    """
```

#### Step 3: Extract cache_management.py
**Lines:** 215-223, 141-164 from preview.py

**Functions to extract:**
```python
def initialize_preview_cache(ss: dict) -> None:
    """Initialize preview cache keys in session state."""

def clear_preview_cache(ss: dict) -> None:
    """Clear all preview caches from session state."""
```

#### Step 4: Extract signatures.py
**Lines:** 264-310 from preview.py

**Functions to extract:**
```python
def compute_preview_signatures(
    H, Rt, Rb, expn, preview_n_theta, preview_n_z,
    style_name, opts_json, full_n_theta, full_n_z, ss: dict
) -> tuple:
    """Compute geometry and appearance signatures for change detection."""
```

#### Step 5: Extract array_generation.py
**Lines:** 358-433 from preview.py

**Functions to extract:**
```python
def generate_preview_arrays(
    H, Rt, Rb, expn, preview_n_theta, preview_n_z,
    style_name, opts_json, geom_changed: bool, ss: dict
) -> tuple:
    """Generate X, Y, Z arrays for preview surface."""
```

#### Step 6: Extract mesh_building.py
**Lines:** 435-617 from preview.py

**Functions to extract:**
```python
def build_preview_mesh(
    H, Rt, Rb, expn, t_wall, t_bottom, r_drain,
    preview_n_theta, preview_n_z, r_outer_fn, opts,
    geom_changed: bool, place_on_ground: bool, ss: dict
) -> Optional[tuple]:
    """Build mesh for interactive preview."""
```

#### Step 7: Extract plotly_surface.py
**Lines:** 799-913 from preview.py

**Functions to extract:**
```python
def render_plotly_surface(
    X, Y, Z, preview_n_theta, preview_n_z,
    fig_w, fig_h, place_on_ground: bool, ss: dict
) -> None:
    """Render quick surface preview using Plotly."""
```

#### Step 8: Extract plotly_mesh.py
**Lines:** 930-1253 from preview.py

**Functions to extract:**
```python
def render_plotly_mesh(
    H, Rt, Rb, expn, n_theta, n_z, t_wall, t_bottom, r_drain,
    full_n_theta, full_n_z, r_outer_fn, opts, style_name, opts_json,
    mesh_data, geom_changed: bool, place_on_ground: bool,
    fig_w, fig_h, ss: dict
) -> None:
    """Render full mesh preview using Plotly."""
```

#### Step 9: Extract png_rendering.py
**Lines:** 689-782 from preview.py

**Functions to extract:**
```python
def render_png_fallback(
    H, Rt, Rb, expn, preview_n_theta, preview_n_z,
    full_n_theta, full_n_z, style_name, opts_json,
    t_wall, show_inner: bool, view_elev, view_azim,
    fig_w, fig_h, dpi, interactive_mesh: bool, ss: dict
) -> Optional[bytes]:
    """Render PNG fallback when Plotly unavailable."""
```

#### Step 10: Create __init__.py orchestration
Main function that calls all the sub-functions in proper order.

---

## sidebar.py Decomposition Plan

### Target Structure

```
pfui/tabs/interactive/sidebar/
├── __init__.py              # Main orchestration
├── utils.py                 # Helper functions (_unwrap_scalar, _mark_changed)
├── model_name.py            # Model name input with auto-naming
├── style_selector.py        # Style selection widget
├── dimensions.py            # Dimensions controls (delegates to app_components)
├── profile_controls.py      # Profile controls (delegates to app_components)
├── style_options.py         # Style options expander
├── twist_spin.py            # Twist and spin controls
├── presets.py               # Preset management (built-in + user)
└── reset_controls.py        # Reset buttons
```

### Extraction Strategy

The sidebar.py file has a similar pattern - one large function with embedded logic.

**Key sections to extract:**
1. Lines 24-64: Helper functions and change tracking
2. Lines 66-143: Model name with auto-naming
3. Lines 145-178: Style selector
4. Lines 180-245: Dimensions and profile (delegated)
5. Lines 247-290: Style options expander
6. Lines 292-325: Twist/Spin controls
7. Lines 327-375: Preset management
8. Lines 377-380: Reset buttons

---

## Testing After Decomposition

### Verification Checklist

After each extraction step:

1. **Syntax Check:**
   ```bash
   python3 -m py_compile pfui/tabs/interactive/preview/*.py
   python3 -m py_compile pfui/tabs/interactive/sidebar/*.py
   ```

2. **Import Check:**
   ```bash
   python3 -c "from pfui.tabs.interactive.preview import render_preview_section"
   python3 -c "from pfui.tabs.interactive.sidebar import render_sidebar_section"
   ```

3. **App Test:**
   ```bash
   streamlit run app.py
   ```
   - Navigate to Interactive tab
   - Verify preview renders
   - Verify controls work
   - Check console for errors

4. **Functional Tests:**
   - Change style → preview updates
   - Adjust dimensions → preview updates
   - Save preset → preset saved
   - Load preset → parameters applied
   - Export STL → file downloaded

---

## Implementation Approach

### Recommended Order

1. **Start with sidebar.py** (smaller, 380 LOC)
   - Easier to decompose
   - Builds confidence
   - Less complex dependencies

2. **Then tackle preview.py** (larger, 1,285 LOC)
   - More complex
   - Multiple rendering paths
   - Heavy dependencies

### Code Extraction Template

For each function extraction:

```python
# 1. Create new module file
# 2. Copy relevant imports from original
# 3. Extract function code
# 4. Add proper docstrings
# 5. Test in isolation
# 6. Update __init__.py to call it
# 7. Remove from original file
# 8. Test integration
```

### Example: Extracting model_name controls

**Before (in sidebar.py):**
```python
def render_sidebar_section(...):
    # ... 380 lines ...
    # Model name section (lines 66-143)
    st.text_input("Model name", ...)
    # ...
```

**After (sidebar/model_name.py):**
```python
def render_model_name_controls(ss: dict, on_change: callable) -> None:
    """Render model name input with auto-naming logic."""
    # Extracted code here
```

**After (sidebar/__init__.py):**
```python
from .model_name import render_model_name_controls

def render_sidebar_section(on_change_callback=None):
    ss = st.session_state
    render_model_name_controls(ss, on_change_callback)
    # ... other sections ...
```

---

## Known Challenges

### 1. Session State Dependencies
Both files heavily use `st.session_state`. Must pass `ss` dict to all functions.

### 2. Streamlit Widget Context
Widgets must be created in proper Streamlit context. Can't extract rendering logic too deeply.

### 3. Closure Variables
Many nested closures capture variables. Need to pass explicitly or refactor.

### 4. Type Hints
Original code uses `cast(Any, ...)` extensively. Preserve for type safety.

### 5. Error Handling
Try-except blocks everywhere. Preserve defensive programming.

---

## Success Criteria

### Phase B Completion Criteria

- [x] Metrics extracted (100 LOC) ✅
- [x] Performance extracted (27 LOC) ✅
- [x] Profile extracted (37 LOC) ✅
- [x] Export extracted (623 LOC) ✅
- [ ] **Preview decomposed** (1,285 LOC → 8-10 modules)
- [ ] **Sidebar decomposed** (380 LOC → 6-8 modules)
- [ ] All modules < 200 LOC
- [ ] All modules compile
- [ ] App runs without errors
- [ ] All functionality preserved

### Quality Metrics

- All modules < 200 LOC (target < 150 LOC)
- Clear module boundaries
- Single responsibility per module
- Comprehensive docstrings
- Type hints preserved
- 100% backward compatibility

---

## Time Estimates

Based on complexity:

- **Sidebar decomposition:** 2-3 hours
  - 6-8 modules to create
  - Simpler logic
  - Fewer dependencies

- **Preview decomposition:** 4-5 hours
  - 8-10 modules to create
  - Complex rendering logic
  - Multiple code paths
  - Heavy dependencies

**Total: 6-8 hours for complete Phase B**

---

## Next Steps

1. **Create sidebar sub-package** (recommended first)
2. Extract utils.py with helper functions
3. Extract model_name.py
4. Extract style_selector.py
5. Extract presets.py
6. Extract remaining sidebar modules
7. Test sidebar thoroughly
8. **Create preview sub-package**
9. Use the extraction plan above
10. Test preview thoroughly
11. **Final integration testing**

---

## Code Location

**Current files:**
- `/home/runner/work/PotFoundry-Lite-v2.0/PotFoundry-Lite-v2.0/pfui/tabs/interactive/preview.py`
- `/home/runner/work/PotFoundry-Lite-v2.0/PotFoundry-Lite-v2.0/pfui/tabs/interactive/sidebar.py`

**Target directories:**
- `/home/runner/work/PotFoundry-Lite-v2.0/PotFoundry-Lite-v2.0/pfui/tabs/interactive/preview/`
- `/home/runner/work/PotFoundry-Lite-v2.0/PotFoundry-Lite-v2.0/pfui/tabs/interactive/sidebar/`

**Already created:**
- `/home/runner/work/PotFoundry-Lite-v2.0/PotFoundry-Lite-v2.0/pfui/tabs/interactive/preview/utils.py` ✅

---

## References

- **Original Plan:** `docs/refactoring/PHASE_B_PLAN.md`
- **Completion Summary:** `docs/refactoring/PHASE_B_COMPLETE.md`
- **Project Guidelines:** `.github/copilot-instructions.md`

---

## Final Notes

This decomposition is **CRITICAL** for Phase B completion. The current preview.py and sidebar.py modules are too large and monolithic for proper maintenance. Breaking them down will:

1. Improve testability
2. Enhance maintainability
3. Enable parallel development
4. Reduce cognitive load
5. Follow project conventions (all modules < 400 LOC)

The work is well-defined and straightforward - it's pure mechanical extraction with careful testing at each step.

**Good luck!** 🚀
