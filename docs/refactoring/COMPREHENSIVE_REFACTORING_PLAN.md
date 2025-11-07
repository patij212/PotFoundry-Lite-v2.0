# Comprehensive Codebase Refactoring Plan

**Goal:** Achieve absolutely pristine, modular architecture across the entire codebase for unlimited future upgrades.

## Current State Analysis

### Large Files Requiring Refactoring

| File | LOC | Target | Priority |
|------|-----|--------|----------|
| potfoundry/core/geometry.py | 3,359 | ~650 | **CRITICAL** |
| pfui/interactive_tab.py | 2,205 | ~400 | HIGH |
| pfui/schemas/style_schemas.py | 1,280 | N/A | OK (data) |
| potfoundry/core/styles/lowpoly_facet.py | 990 | ~600 | MEDIUM |
| potfoundry/integrations/supabase_client.py | 684 | ~400 | MEDIUM |
| potfoundry/library.py | 652 | ~400 | MEDIUM |
| pfui/controls.py | 514 | ~300 | LOW |
| pfui/presets.py | 475 | ~300 | LOW |

## Refactoring Phases

### Phase A: Core Geometry Mesh Builder (CRITICAL - 8-12 hours)

**Target:** Extract `build_pot_mesh` (~2,700 LOC) from geometry.py

**Create Package:** `potfoundry/core/mesh/`

**Modules to Create:**
1. `parameters.py` (50 LOC) - MeshQuality, PotDefaults, validation
2. `grid.py` (150 LOC) - Grid generation, caching, refinement
3. `outer_wall.py` (600 LOC) - Outer ring sampling, style integration
4. `inner_wall.py` (350 LOC) - Inner wall logic, drain clamping
5. `rim.py` (150 LOC) - Rim bridging, cap triangles
6. `drain.py` (100 LOC) - Drain hole geometry
7. `bottom.py` (100 LOC) - Bottom cap generation
8. `faces.py` (50 LOC) - Face array assembly
9. `diagnostics.py` (100 LOC) - Quality metrics

**Expected Result:**
- geometry.py: 3,359 → ~650 LOC (81% reduction)
- build_pot_mesh: 2,700 → ~400 LOC (85% reduction)
- Each component independently testable

### Phase B: Interactive Tab Refinement (HIGH - 4-6 hours)

**Target:** Break down pfui/interactive_tab.py (2,205 LOC)

**Create Package:** `pfui/tabs/`

**Modules to Create:**
1. `interactive/__init__.py` - Main render function
2. `interactive/sidebar.py` (400 LOC) - Sidebar controls
3. `interactive/preview.py` (300 LOC) - Preview management
4. `interactive/export.py` (200 LOC) - Export functionality
5. `interactive/library_publish.py` (150 LOC) - Library operations
6. `batch/__init__.py` - Batch tab (move from interactive_tab)
7. `library/__init__.py` - Library tab (move from interactive_tab)

**Expected Result:**
- interactive_tab.py: 2,205 → ~400 LOC (82% reduction)
- Clear tab organization
- Each tab in focused module

### Phase C: Integration Modules (MEDIUM - 3-4 hours)

**Target:** Clean up integration modules

**Supabase Client (684 LOC → ~400 LOC):**
- Extract `supabase/client.py` - Core client (~200 LOC)
- Extract `supabase/library_ops.py` - Library operations (~150 LOC)
- Extract `supabase/auth.py` - Authentication (~50 LOC)

**Library Module (652 LOC → ~400 LOC):**
- Extract `library/search.py` - Search operations
- Extract `library/storage.py` - Storage management
- Extract `library/metadata.py` - Metadata handling

### Phase D: Style Function Cleanup (LOW - 2-3 hours)

**Target:** Refine large style modules

**LowPolyFacet (990 LOC → ~600 LOC):**
- Move experimental features to `experimental/lowpoly/`
- Keep core style function clean and focused

**SuperformulaBlossom (339 LOC):**
- Already clean, verify structure

### Phase E: UI Component Organization (LOW - 2-3 hours)

**Target:** Organize UI modules

**Controls Module (514 LOC → ~300 LOC):**
- Extract to `pfui/controls/` package
- Split by control type (dimension, style, global, export)

**Presets Module (475 LOC):**
- Already reasonable, minor cleanup only

### Phase F: Code Quality & Documentation (2-3 hours)

**Tasks:**
1. Add comprehensive docstrings to all modules
2. Update type hints for full type coverage
3. Run ruff --fix for style consistency
4. Run mypy and fix all type issues
5. Update architectural documentation
6. Create module dependency diagrams

## Implementation Strategy

### Execution Order

1. **Phase A** (CRITICAL) - Mesh builder extraction
   - Highest impact (81% reduction in geometry.py)
   - Enables independent testing of components
   - Foundation for Qt migration

2. **Phase B** (HIGH) - Interactive tab cleanup
   - Major complexity reduction
   - Better tab organization
   - Prepares for Qt desktop app

3. **Phase C** (MEDIUM) - Integration cleanup
   - Cleaner external dependencies
   - Better separation of concerns

4. **Phase D** (LOW) - Style refinement
   - Minor improvements
   - Experimental isolation

5. **Phase E** (LOW) - UI organization
   - Polish and consistency

6. **Phase F** (FINAL) - Quality & docs
   - Ensure production readiness
   - Complete documentation

### Testing Strategy

After **each module extraction:**
1. Run full test suite: `PYTHONPATH=. python3 -m pytest`
2. Verify 409/409 tests pass
3. Check for performance regressions
4. Validate backward compatibility
5. Run linting: `ruff check .`
6. Run type checking: `mypy .`

### Success Criteria

**Code Metrics:**
- ✅ No file >1,000 LOC (except data schemas)
- ✅ All functions <200 LOC
- ✅ All classes <500 LOC
- ✅ Clear module boundaries
- ✅ No circular dependencies

**Quality Metrics:**
- ✅ 409/409 tests passing
- ✅ 92%+ code coverage maintained
- ✅ Zero ruff errors
- ✅ Zero mypy errors (or <10 minor)
- ✅ All public APIs documented

**Architecture Metrics:**
- ✅ Each component independently testable
- ✅ Clear separation of concerns
- ✅ Easy to locate code by feature
- ✅ Scalable for new features
- ✅ Ready for Qt migration

## Timeline

**Total Estimated Effort:** 22-32 hours

**Breakdown:**
- Phase A: 8-12 hours (CRITICAL)
- Phase B: 4-6 hours (HIGH)
- Phase C: 3-4 hours (MEDIUM)
- Phase D: 2-3 hours (LOW)
- Phase E: 2-3 hours (LOW)
- Phase F: 2-3 hours (FINAL)

**Execution Approach:**
- Systematic, methodical extraction
- Test after each module
- Commit frequently
- Zero behavioral changes
- Maintain 409/409 passing throughout

## Conclusion

This comprehensive refactoring will transform the codebase into an absolutely pristine, modular architecture ready for unlimited future upgrades. Every component will be focused, testable, and maintainable. The result will be production-grade code that's easy to understand, modify, and extend.
