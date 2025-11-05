# Phase B: Interactive Tab Refinement - Analysis and Plan

**Date:** 2025-11-05  
**Status:** 📋 PLANNED - Ready for implementation  
**Estimated Effort:** 8-12 hours

---

## Current State

**File:** `pfui/interactive_tab.py`  
**Size:** 2,205 LOC  
**Type:** Monolithic function with inline logic

### Structure Analysis

The file contains a single large function `render_interactive_tab()` with these sections:

1. **SIDEBAR** (lines 81-418, ~337 LOC)
   - Units selector
   - Model inputs with debounced updates
   - Dimensions section (calls extracted component)
   - Profile section (calls extracted component)
   - Style options controls

2. **PREVIEW & EXPORT CONTROLS** (lines 418-483, ~65 LOC)
   - Preview mode selector
   - Export widgets (calls extracted component)

3. **HEALTH & WARNINGS** (lines 483-491, ~8 LOC)
   - Health badge display

4. **PREVIEW** (lines 491-1708, ~1,217 LOC) ⚠️ LARGEST SECTION
   - Preview controls
   - 3D interactive preview with Plotly
   - PNG preview rendering
   - Preview update logic
   - Mesh generation
   - Extensive error handling

5. **METRICS** (lines 1708-1765, ~57 LOC)
   - Mesh statistics display
   - Diagnostics information

6. **APPEARANCE** (lines 1765-1769, ~4 LOC)
   - Calls extracted appearance settings component

7. **SNAPSHOTS** (lines 1769-1793, ~24 LOC)
   - Calls extracted snapshots component

8. **EXPORT** (lines 1793-2187, ~394 LOC)
   - STL export logic
   - Library publishing
   - Deep link generation
   - Secret masking

9. **2D PROFILE** (lines 2187-2191, ~4 LOC)
   - Profile rendering

10. **PERFORMANCE** (lines 2191-2201, ~10 LOC)
    - Performance logs display
    - Cache clearing

---

## Challenges

### High Complexity Areas

1. **Preview Section** (~1,217 LOC)
   - Heavy Streamlit state management
   - Complex debounced update logic
   - Inline Plotly visualization code
   - Mesh generation orchestration
   - Error recovery logic

2. **Export Section** (~394 LOC)
   - Library integration
   - Deep link generation
   - Secret masking logic
   - Error handling

3. **State Dependencies**
   - Extensive use of `st.session_state`
   - Cross-section dependencies
   - Debounced update mechanism
   - Preview mode switching

4. **Inline Logic**
   - Some components already extracted to `app_components`
   - Others still inline (preview generation, export logic)
   - Mixed extraction state

---

## Recommended Extraction Strategy

### Phase 1: Extract Self-Contained Sections (2-3 hours)

**Priority 1: Metrics Module**
```python
# pfui/tabs/interactive/metrics.py (~100 LOC)
def render_metrics_section(diagnostics: dict) -> None:
    """Display mesh statistics and diagnostics."""
```

**Priority 2: Performance Module**
```python
# pfui/tabs/interactive/performance.py (~50 LOC)
def render_performance_section() -> None:
    """Display performance logs and cache controls."""
```

**Priority 3: Profile Module**
```python
# pfui/tabs/interactive/profile.py (~50 LOC)
def render_profile_section(H, Rt, Rb, expn, r_outer_fn, opts, t_wall) -> None:
    """Render 2D radial profile."""
```

### Phase 2: Extract Export Logic (2-3 hours)

**Export Module**
```python
# pfui/tabs/interactive/export.py (~450 LOC)
def render_export_section(
    vertices, faces, style_name, H, top_od, bottom_od,
    t_wall, t_bottom, r_drain, expn, opts,
    has_library: bool, library_read_only: bool
) -> None:
    """Handle STL export and library publishing."""
    
def _generate_deep_link(state: dict) -> str:
    """Generate shareable deep link."""
    
def _mask_secrets(text: str) -> str:
    """Mask sensitive information in links."""
```

### Phase 3: Extract Preview Logic (3-4 hours) ⚠️ MOST COMPLEX

**Preview Module**
```python
# pfui/tabs/interactive/preview.py (~1,300 LOC)
def render_preview_section(
    style_name, H, Rt, Rb, t_wall, t_bottom, r_drain,
    expn, opts, r_outer_fn
) -> tuple[vertices, faces, diagnostics]:
    """Render 3D preview and manage preview updates."""
    
def _should_update_preview() -> bool:
    """Check if preview needs updating based on debounce logic."""
    
def _render_plotly_preview(vertices, faces) -> None:
    """Render interactive Plotly preview."""
    
def _render_png_preview(vertices, faces) -> None:
    """Render static PNG preview."""
```

### Phase 4: Extract Sidebar Logic (2-3 hours)

**Sidebar Module**
```python
# pfui/tabs/interactive/sidebar.py (~450 LOC)
def render_sidebar_section() -> dict:
    """Render sidebar controls and return current parameters."""
    
def _mark_changed() -> None:
    """Mark parameters as changed for debounced updates."""
```

### Phase 5: Main Orchestration (1 hour)

**Main File**
```python
# pfui/interactive_tab.py (~200 LOC)
def render_interactive_tab(
    _has_library: bool = False,
    _library_read_only: bool = False,
) -> None:
    """Main orchestration of Interactive Designer tab."""
    # Sidebar
    params = render_sidebar_section()
    
    # Preview & controls
    vertices, faces, diagnostics = render_preview_section(**params)
    
    # Health
    render_health_section()
    
    # Metrics
    render_metrics_section(diagnostics)
    
    # Appearance (already extracted)
    
    # Snapshots (already extracted)
    
    # Export
    render_export_section(vertices, faces, ...)
    
    # Profile
    render_profile_section(...)
    
    # Performance
    render_performance_section()
```

---

## Alternative: Incremental Approach

Given the complexity, consider an incremental approach:

1. **Week 1:** Extract metrics, performance, profile (low complexity)
2. **Week 2:** Extract export logic (medium complexity)
3. **Week 3:** Extract preview logic (high complexity)
4. **Week 4:** Extract sidebar, finalize orchestration

---

## Benefits of Full Extraction

1. **Testability**
   - Each section can be tested independently
   - Easier to mock Streamlit state

2. **Maintainability**
   - Locate functionality quickly
   - Clear module boundaries
   - Easier to debug

3. **Reusability**
   - Preview logic could be reused in other tabs
   - Export logic is self-contained

4. **Performance**
   - Easier to profile individual sections
   - Better caching strategies possible

---

## Risks and Mitigation

### Risk 1: State Management Complexity
**Mitigation:** Keep state access centralized, pass only needed values

### Risk 2: Breaking Changes
**Mitigation:** Extensive testing after each extraction, maintain backward compatibility

### Risk 3: Streamlit-Specific Logic
**Mitigation:** Accept some Streamlit coupling, focus on logical separation

### Risk 4: Time Investment
**Mitigation:** Incremental approach, tackle easiest sections first

---

## Success Criteria

- [ ] All sections extracted to focused modules
- [ ] Main file reduced to ~200-400 LOC orchestration
- [ ] No functionality regressions
- [ ] Streamlit app runs without errors
- [ ] UI behavior unchanged
- [ ] State management preserved
- [ ] Preview debouncing still works
- [ ] Export and publishing functional

---

## Next Steps

1. Create `pfui/tabs/interactive/` package structure
2. Start with metrics module (smallest, most isolated)
3. Extract performance module
4. Extract profile module
5. Test after each extraction
6. Continue with export, preview, sidebar
7. Finalize main orchestration
8. Comprehensive testing
9. Documentation updates

---

## Estimated Timeline

- **Preparation:** 0.5 hours (package structure, planning)
- **Phase 1 (Metrics/Perf/Profile):** 2-3 hours
- **Phase 2 (Export):** 2-3 hours
- **Phase 3 (Preview):** 3-4 hours
- **Phase 4 (Sidebar):** 2-3 hours
- **Phase 5 (Orchestration):** 1 hour
- **Testing & Fixes:** 1-2 hours

**Total:** 12-17 hours (accounting for testing and iteration)

---

## Status

**Current:** Analysis complete, ready for implementation  
**Blocker:** None - can proceed when ready  
**Dependencies:** None - Phase D complete  

This is a significant refactoring that should be done carefully with extensive testing at each step.
