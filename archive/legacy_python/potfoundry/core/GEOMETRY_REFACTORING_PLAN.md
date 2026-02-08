# Geometry Refactoring Plan - Phase 2.4

## Overview

Refactoring `potfoundry/core/geometry.py` (4,637 LOC) to improve architecture and make it easier to add new styles.

## Current Issues

1. **Monolithic file**: All styles mixed with core mesh building logic
2. **Hard to extend**: Adding new styles requires editing large file
3. **Experimental code mixed in**: Edge controls buried in style functions
4. **Poor discoverability**: Hard to find specific style implementations

## Solution: Package-Based Architecture

### New Structure

```
potfoundry/core/
├── geometry.py (~2,700 LOC) - Core mesh building only
├── styles/
│   ├── __init__.py - Style registry and exports
│   ├── harmonic_ripple.py
│   ├── spiral_ridges.py
│   ├── superellipse_morph.py
│   ├── superformula_blossom.py
│   ├── fourier_bloom.py
│   └── lowpoly_facet.py
└── experimental/
    ├── __init__.py - Experimental feature exports
    ├── edge_flow.py - Edge flow reconstruction
    └── edge_solidify.py - Edge preserving smoothing
```

## Implementation Steps

### Step 1: Create Package Structure ✅ DONE
- [x] Create `potfoundry/core/styles/` directory
- [x] Create `potfoundry/core/experimental/` directory
- [x] Add __init__.py files with documentation

### Step 2: Extract Simple Style Functions (In Progress)
- [ ] Extract `r_outer_harmonic_ripple` → `styles/harmonic_ripple.py`
- [ ] Extract `r_outer_spiral_ridges` → `styles/spiral_ridges.py`
- [ ] Extract `r_outer_superellipse_morph` → `styles/superellipse_morph.py`
- [ ] Extract `r_outer_fourier_bloom` → `styles/fourier_bloom.py`

### Step 3: Extract Complex Styles
- [ ] Extract `r_outer_superformula_blossom` → `styles/superformula_blossom.py`
  - Includes edge solidify logic (will be refactored to use experimental/)
- [ ] Extract `r_outer_lowpoly_facet` → `styles/lowpoly_facet.py`
  - Includes complex experimental features

### Step 4: Extract Experimental Features
- [ ] Extract edge flow reconstruction → `experimental/edge_flow.py`
- [ ] Extract edge solidify logic → `experimental/edge_solidify.py`
- [ ] Update SuperformulaBlossom to use experimental package

### Step 5: Update Core Geometry
- [ ] Update geometry.py imports
- [ ] Remove extracted code
- [ ] Add delegation to styles package
- [ ] Update style function lookup

### Step 6: Testing & Validation
- [ ] Run all 409 tests
- [ ] Verify backward compatibility
- [ ] Check performance (no regressions)
- [ ] Update documentation

## Benefits

1. **Easy Extension**: Add new style = create new file
2. **Clear Organization**: Each style self-contained
3. **Better Testing**: Test styles independently
4. **Maintainability**: Easier to find and modify code
5. **Experimental Isolation**: Clear separation of stable vs experimental

## Backward Compatibility

All existing imports will continue to work:
```python
# These will still work
from potfoundry.core.geometry import build_pot_mesh
from potfoundry.core.geometry import r_outer_harmonic_ripple  # Re-exported
```

Internal implementation will delegate to new packages transparently.

## Timeline

- **Step 1**: 30 minutes ✅ COMPLETE
- **Steps 2-3**: 2-3 hours (extract style functions)
- **Step 4**: 1-2 hours (extract experimental features)
- **Step 5**: 1 hour (update core)
- **Step 6**: 30 minutes (testing)

**Total**: 5-7 hours of methodical refactoring
