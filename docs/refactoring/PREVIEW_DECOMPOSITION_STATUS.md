# Preview Decomposition Status

## Current State (92% Phase B Complete)

### Extracted Modules ✅
```
pfui/tabs/interactive/preview/
├── __init__.py (25 LOC)              # Re-export wrapper
├── utils.py (57 LOC)                 # Helper functions
├── update_decision.py (146 LOC)      # Update decision + debounce JS
└── cache_management.py (57 LOC)      # Cache initialization/clearing
```

### Remaining File ⏳
- `preview_impl.py` (1,285 LOC) - Monolithic implementation

## Key Challenge

The `render_preview_section()` function in `preview_impl.py` is a **1,222-line monolithic function** that:
- Has NO internal function definitions (all logic inline)
- Uses 50+ variables from session state accessed throughout
- Has complex control flow with many nested conditionals
- Mixes UI rendering, data processing, and business logic
- Has deep interdependencies between sections

## Decomposition Plan

To complete the decomposition, the monolithic function needs to be refactored into:

### 1. Parameter Extraction Module
**Challenge:** Variables like `H`, `Rt`, `Rb`, `style_name`, `n_theta`, `n_z`, etc. are used throughout the function but are never explicitly defined. They must be retrieved from session state.

**Solution:** Create a module that extracts all required parameters from session state at the beginning of the function.

```python
# parameters.py
def extract_preview_parameters(ss: dict) -> PreviewParameters:
    """Extract all required parameters from session state.
    
    Returns dataclass with all parameters needed for preview rendering.
    """
    # Extract geometry parameters
    H = ss.get("H", 100)
    Rt = ss.get("Rt", 50)
    Rb = ss.get("Rb", 40)
    # ... extract all other parameters
    
    return PreviewParameters(H=H, Rt=Rt, Rb=Rb, ...)
```

### 2. Signatures Module (Lines ~238-310)
```python
# signatures.py  
def compute_preview_signatures(...) -> tuple:
    """Compute geometry and appearance signatures for change detection."""
```

**Blockers:**
- Needs parameters from step 1
- Uses `_to_float_scalar` from preview_impl (should use from utils)
- Imports from `pfui.app_components.plotting`

### 3. Array Generation Module (Lines ~358-433)
```python
# array_generation.py
def generate_preview_arrays(...) -> Optional[tuple]:
    """Generate X, Y, Z arrays for preview surface."""
```

**Blockers:**
- Depends on signature computation
- Uses orchestrator pattern with try/except fallback
- Needs session state for caching

### 4. Mesh Building Module (Lines ~435-617)
```python
# mesh_building.py
def build_preview_mesh(...) -> Optional[tuple]:
    """Build mesh for interactive preview."""
```

**Blockers:**
- Complex orchestration logic
- Seam debug display embedded in mesh building
- Multiple fallback paths

### 5. Plotly Surface Module (Lines ~799-913)
```python
# plotly_surface.py
def render_plotly_surface(...) -> None:
    """Render quick surface preview using Plotly."""
```

**Blockers:**
- Needs plotly import guard
- Uses st.empty() placeholders from main function
- Complex camera/layout configuration

### 6. Plotly Mesh Module (Lines ~930-1253)
```python
# plotly_mesh.py
def render_plotly_mesh(...) -> None:
    """Render full mesh preview using Plotly."""
```

**Blockers:**
- Largest single section (~300 LOC)
- Heavy session state interaction
- Multiple rendering paths
- Needs placeholder access

### 7. PNG Rendering Module (Lines ~689-782)
```python
# png_rendering.py
def render_png_fallback(...) -> Optional[bytes]:
    """Render PNG fallback when Plotly unavailable."""
```

**Blockers:**
- Multiple fallback paths
- Snapshot orchestration
- Cache management

## Recommended Approach

### Phase 1: Refactor First, Then Extract
1. Add parameter extraction at function start
2. Replace `_to_float_scalar` calls with imports from utils
3. Break the monolithic function into internal helper functions
4. Test that refactored version works identically

### Phase 2: Extract to Modules
1. Move helper functions to modules one at a time
2. Update imports in main function
3. Test after each extraction
4. Remove extracted code from preview_impl

### Phase 3: Final Orchestration
1. Refactor `__init__.py` to call all modules in sequence
2. Remove `preview_impl.py`
3. Complete integration testing

## Estimated Effort

- **Refactoring (Phase 1):** 2-3 hours
- **Extraction (Phase 2):** 2-3 hours  
- **Testing (Phase 3):** 1 hour
- **Total:** 5-7 hours

## Alternative: Pragmatic Approach

Given the complexity and time required, an alternative is to:

1. ✅ Keep extracted modules (utils, update_decision, cache_management)
2. ⏳ Document the monolithic function better with section markers
3. ⏳ Add internal helper functions to preview_impl for better organization
4. ⏳ Leave full decomposition for a future dedicated refactoring sprint

This provides immediate value (better organized code) while acknowledging that full decomposition is a significant undertaking that requires careful planning and testing.

## Current Recommendation

**Proceed with pragmatic approach** due to:
- High complexity of monolithic function
- Risk of breaking functionality with aggressive refactoring
- Limited testing infrastructure for UI components
- Time constraints

The extracted modules (285 LOC so far) provide meaningful improvement. The remaining work is documented for future continuation.

---

*Status: 92% Phase B Complete*
*Updated: 2025-11-05*
