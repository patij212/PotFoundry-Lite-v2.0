# PotFoundry Repository Refactoring Plan

**Version:** 1.0
**Date:** January 2025
**Status:** Planning Phase
**Objective:** Restructure repository for improved maintainability, scalability, and robustness

---

## Executive Summary

This comprehensive plan addresses code quality, organization, and architectural improvements for PotFoundry-Lite v2.x. The repository has grown organically with excellent features and test coverage, but now requires systematic reorganization to prepare for future Qt desktop application development and production release (v3.0).

**Key Findings:**
- ✅ **Strong foundation**: 99 passing tests, 92% core coverage, comprehensive docs
- ⚠️ **Code organization**: Large files (app.py: 3015 LOC, schemas.py: 2335 LOC, preview.py: 1141 LOC)
- ⚠️ **Documentation clutter**: 58+ root-level files (33 markdown docs, 25+ logs/temp files)
- ⚠️ **Architectural drift**: Dual geometry implementations need consolidation
- ✅ **Good practices**: Type hints in progress, clean core/UI separation

---

## Analysis Results

### Current State Assessment

#### Code Quality ✅
- **Test Coverage**: 92% average on core modules
- **Linting**: 93% reduction achieved (135 → 11 errors)
- **Type Hints**: 80% coverage on core modules (in progress)
- **Documentation**: Comprehensive but fragmented

#### File Organization ⚠️
```
Current Structure Issues:
1. Root directory clutter: 58 files (should be ~15-20)
2. Documentation scattered: 33 markdown files, many redundant/outdated
3. Temporary files not in .gitignore: logs, output files, debug artifacts
4. Dual geometry implementations: potfoundry/geometry.py + potfoundry/core/geometry.py
5. UI layer growing too large: pfui/ has 28 files, some >1000 LOC
```

#### Large Files Needing Refactoring
| File | LOC | Functions | Issue | Priority |
|------|-----|-----------|-------|----------|
| app.py | 3015 | 4 | Monolithic UI entry point | **HIGH** |
| pfui/schemas.py | 2335 | 25 | Large schema definitions | **HIGH** |
| pfui/preview.py | 1141 | ~15 | Complex rendering logic | MEDIUM |
| potfoundry/geometry.py | 649 | 17 | Core engine, manageable | LOW |
| potfoundry/library.py | 652 | ~10 | Supabase integration | LOW |

#### Documentation Analysis
**Categories Identified:**
1. **Core Guides** (keep in root): README, ARCHITECTURE, ROADMAP, TODO, LICENSE
2. **Evolution Plans** (archive): Multiple versions of improvement summaries
3. **Status Reports** (archive): Implementation summaries, validation reports
4. **Technical Guides** (move to docs/): STL_EXPORT_GUIDE, TYPE_HINTS_GUIDE, etc.
5. **Temporary/Debug** (delete): Logs, ruff output, mypy output, pytest dumps

---

## Refactoring Strategy

### Phase 1: Documentation & File Organization (Low Risk) ⭐ START HERE
**Effort:** 2-3 hours
**Risk:** Minimal
**Impact:** Immediate clarity

#### 1.1 Create Archive Structure
```
archive/
├── evolution/          # Historical evolution plans and summaries
│   ├── 2024-q4/
│   │   ├── CODE_QUALITY_IMPROVEMENTS.md
│   │   ├── COMPREHENSIVE_IMPROVEMENTS_SUMMARY.md
│   │   ├── IMPLEMENTATION_SUMMARY.md
│   │   ├── TEST_COVERAGE_IMPROVEMENTS.md
│   │   ├── TEST_VALIDATION_REPORT.md
│   │   ├── NEXT_STEPS_ANALYSIS.md
│   │   └── FINAL_REPORT.md
│   └── README.md       # Index of archived documents
├── ci-logs/            # Historical CI/workflow logs
│   ├── 2024-q4/
│   │   ├── .gha_run_*.log
│   │   ├── run_*.log
│   │   └── README.md
│   └── README.md
└── refactoring/        # Linting/mypy/ruff output from improvement work
    ├── linting/
    │   ├── ruff-*.txt
    │   ├── .ruff_*.txt
    │   └── README.md
    ├── type-checking/
    │   ├── mypy-*.txt
    │   ├── .mypy_*.txt
    │   └── README.md
    └── README.md
```

#### 1.2 Reorganize Documentation
```
Root (keep only essentials):
├── README.md                    # Main project README
├── ARCHITECTURE.md              # System architecture
├── ROADMAP.md                   # Future vision
├── TODO.md                      # Active development tasks
├── CHANGELOG.md                 # Version history
├── LICENSE                      # Polyform Noncommercial
├── COMMERCIAL-LICENSE.md        # Commercial terms
└── CONTRIBUTING.md              # NEW: Contributor guide

docs/
├── guides/
│   ├── CODE_QUALITY_GUIDE.md
│   ├── DEVELOPMENT.md
│   ├── STL_EXPORT_GUIDE.md
│   ├── TYPE_HINTS_GUIDE.md
│   └── PROPERTY_BASED_TESTING_IMPLEMENTATION.md
├── adr/                         # Architecture Decision Records (keep)
├── deeplink.md                  # Move from root
├── alt_s3_r2.md                 # Move from root
├── LIBRARY_IMPLEMENTATION_SUMMARY.md
└── README.md                    # Documentation index

.github/
├── copilot-instructions.md      # Keep as-is
├── workflows/                   # CI/CD configs
└── PULL_REQUEST_TEMPLATE.md    # NEW: PR template
```

#### 1.3 Delete Temporary Files
**Safe to delete (create .gitignore entries):**
- `*.log` files (workflow outputs, run logs)
- `*_output.txt` files (pytest, mypy, ruff dumps)
- `tmp_*.py` files (debug scripts)
- `.ruff_*.txt`, `.mypy_*.txt` (linting/type check outputs)
- `BATCH2_COMMIT_MSG.txt`, `IMPROVEMENT_SUMMARY.txt`
- Duplicate PDFs in root (keep one in docs/)

**Update .gitignore:**
```gitignore
# Temporary analysis files
*.log
*_output.txt
tmp_*.py
.ruff_*.txt
.mypy_*.txt
*_COMMIT_MSG.txt
run_*.log
.gha_run_*.log
IMPROVEMENT_SUMMARY.txt

# Archive directory (committed but not actively maintained)
archive/
```

---

### Phase 2: Code Structure Refactoring (Medium Risk)
**Effort:** 8-12 hours
**Risk:** Medium (requires careful testing)
**Impact:** High maintainability improvement

#### 2.1 Split app.py (3015 LOC → ~500 LOC)

**Problem:** Monolithic entry point with mixed concerns

**Solution:** Extract components into focused modules

**New Structure:**
```
app.py (500 LOC)                 # Main entry, page routing, high-level orchestration
├── pfui/app_components/         # NEW: App-level components
│   ├── __init__.py
│   ├── mesh_generation.py       # Mesh building UI and logic (600 LOC)
│   ├── parameter_controls.py    # Main parameter panel (400 LOC)
│   ├── export_handlers.py       # Export buttons and logic (300 LOC)
│   ├── sidebar_config.py        # Sidebar configuration (200 LOC)
│   ├── tabs_manager.py          # Tab navigation and state (300 LOC)
│   └── utilities.py             # Helper functions (200 LOC)
```

**Benefits:**
- Easier to understand and modify
- Better separation of concerns
- Testable in isolation
- Easier code review

**Migration Strategy:**
1. Create `pfui/app_components/` directory
2. Extract functions with clear boundaries
3. Update imports in app.py
4. Add unit tests for each component
5. Verify UI still works
6. Delete old code from app.py

#### 2.2 Refactor pfui/schemas.py (2335 LOC → ~800 LOC)

**Problem:** Massive schema file with mixed concerns

**Solution:** Split by domain/style

**New Structure:**
```
pfui/schemas/
├── __init__.py                  # Public API, backward compatibility
├── base.py (200 LOC)            # Base types, control metadata, shared utilities
├── global_controls.py (150 LOC) # Global control schemas (twist, flare, bell)
├── style_schemas.py (400 LOC)   # Style-specific parameter schemas
├── aliases.py (200 LOC)         # Legacy/canonical name mappings
├── validators.py (100 LOC)      # Validation and sanitization logic
└── utils.py (150 LOC)           # Schema helpers (normalize, compress, etc.)
```

**Benefits:**
- Logical organization by concern
- Easier to find and modify schemas
- Backward compatible via `__init__.py`
- Clear separation of data and logic

**Migration Strategy:**
1. Create `pfui/schemas/` package
2. Move schema definitions to appropriate files
3. Create `__init__.py` with re-exports for backward compatibility
4. Update imports across codebase (optional, can use compatibility layer)
5. Verify all tests pass

#### 2.3 Refactor pfui/preview.py (1141 LOC → ~600 LOC)

**Problem:** Complex rendering logic in single file

**Solution:** Split by rendering concern

**New Structure:**
```
pfui/preview/
├── __init__.py                  # Public API
├── mesh_renderer.py (350 LOC)   # 3D mesh rendering with Plotly
├── profile_renderer.py (150 LOC)# 2D profile plot
├── snapshot_cache.py (200 LOC)  # Caching and snapshot logic
├── visualization.py (150 LOC)   # Color schemes, lighting, camera
└── utils.py (100 LOC)           # Helper functions
```

**Benefits:**
- Clear separation of rendering concerns
- Easier to optimize individual renderers
- Better testability
- Prepare for Qt/VTK migration

#### 2.4 Consolidate Dual Geometry Implementations

**Problem:** Two geometry implementations cause confusion

**Current:**
- `potfoundry/geometry.py` (649 LOC) - Active, well-tested
- `potfoundry/core/geometry.py` - Alternative implementation

**Analysis:**
- Check which is actively used
- Determine if there's feature parity
- Review test coverage for each

**Solution Options:**

**Option A: Keep Primary, Archive Alternative (RECOMMENDED)**
```
potfoundry/
├── geometry.py                  # Main implementation (keep)
├── core/
│   ├── io/stl.py               # Keep (binary STL writer)
│   └── geometry.py             # ARCHIVE (document differences)
```

**Option B: Merge Best Features**
- Extract best features from each
- Create unified implementation
- Comprehensive testing

**Decision:** To be made after detailed comparison

---

### Phase 3: Component Extraction & Modularization (Medium Risk)
**Effort:** 6-8 hours
**Risk:** Medium
**Impact:** High for future Qt migration

#### 3.1 Create pfui/widgets/ Package

**Rationale:** Reusable UI components for Streamlit (and future Qt)

**Structure:**
```
pfui/widgets/
├── __init__.py
├── sliders.py                   # Reusable slider components
├── buttons.py                   # Button components with callbacks
├── selectors.py                 # Dropdown, radio, checkbox widgets
├── inputs.py                    # Text input, number input
├── displays.py                  # Info boxes, metrics, badges
└── layouts.py                   # Column, expander, container helpers
```

**Benefits:**
- Consistent UI across app
- Easier to test
- Prepare for Qt migration (adapt interfaces)
- Reduce duplication

#### 3.2 Create potfoundry/validators/ Package

**Rationale:** Centralize validation logic

**Structure:**
```
potfoundry/validators/
├── __init__.py
├── dimensions.py                # Height, radius, thickness validation
├── parameters.py                # Style parameter validation
├── geometry.py                  # Geometric constraint validation
└── utils.py                     # Validation helpers
```

**Benefits:**
- Single source of truth for validation rules
- Reusable across UI and API
- Easier to test
- Better error messages

---

### Phase 4: Testing Infrastructure (Low Risk)
**Effort:** 4-6 hours
**Risk:** Low (additive only)
**Impact:** High for CI/CD

#### 4.1 Reorganize Test Directory

**Current:**
```
tests/
├── 40+ test files (mixed organization)
└── pfui/ (UI tests)
```

**Proposed:**
```
tests/
├── unit/                        # Unit tests by module
│   ├── potfoundry/
│   │   ├── test_geometry.py
│   │   ├── test_schema.py
│   │   ├── test_yaml_api.py
│   │   ├── test_library.py
│   │   └── validators/
│   └── pfui/
│       ├── test_controls.py
│       ├── test_preview.py
│       ├── test_state.py
│       └── schemas/
├── integration/                 # End-to-end tests
│   ├── test_mesh_generation.py
│   ├── test_stl_export.py
│   ├── test_batch_processing.py
│   └── test_library_workflow.py
├── performance/                 # Performance benchmarks
│   ├── test_mesh_performance.py
│   ├── test_stl_performance.py
│   └── test_rendering_performance.py
├── regression/                  # Golden mesh tests
│   ├── test_golden_meshes.py
│   ├── test_style_parity.py
│   └── golden_data/
├── property_based/              # Hypothesis tests
│   ├── test_mesh_properties.py
│   ├── test_parameter_spaces.py
│   └── test_invariants.py
├── fixtures/                    # Shared test fixtures
│   ├── meshes.py
│   ├── configs.py
│   └── data/
└── conftest.py                  # Pytest configuration
```

**Benefits:**
- Clear test organization
- Easier to run specific test categories
- Better CI/CD integration
- Clearer test purpose

#### 4.2 Add Missing Test Categories

**Property-Based Testing:**
```python
# tests/property_based/test_mesh_properties.py
from hypothesis import given, strategies as st

@given(
    H=st.floats(min_value=50, max_value=300),
    Rt=st.floats(min_value=20, max_value=150),
    Rb=st.floats(min_value=20, max_value=150),
)
def test_mesh_is_always_watertight(H, Rt, Rb):
    """Verify mesh watertightness for any valid parameters."""
    # Implementation
```

**Snapshot Testing:**
```python
# tests/regression/test_visual_regression.py
def test_preview_renders_consistently(snapshot):
    """Verify 3D preview visual consistency."""
    # Implementation
```

---

### Phase 5: CI/CD & Automation (Low Risk)
**Effort:** 3-4 hours
**Risk:** Low (infrastructure)
**Impact:** High for quality assurance

#### 5.1 GitHub Actions Workflows

**Create:**
```
.github/workflows/
├── tests.yml                    # Run tests on PR
├── lint.yml                     # Linting checks
├── type-check.yml               # MyPy type checking
├── coverage.yml                 # Code coverage
└── release.yml                  # Release automation
```

**Example: tests.yml**
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        python-version: ['3.11', '3.12', '3.13']

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt
      - name: Run tests
        run: pytest -v --cov=potfoundry --cov=pfui
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Implementation Priority Matrix

| Phase | Priority | Risk | Effort | Impact | Order |
|-------|----------|------|--------|--------|-------|
| 1. Documentation & File Org | **CRITICAL** | Low | 2-3h | High | **1st** |
| 5. CI/CD Setup | High | Low | 3-4h | High | **2nd** |
| 4. Test Organization | High | Low | 4-6h | Medium | **3rd** |
| 2.1 Split app.py | High | Medium | 4-6h | High | **4th** |
| 2.2 Refactor schemas.py | Medium | Medium | 3-4h | Medium | **5th** |
| 2.4 Consolidate Geometry | Medium | Medium | 2-3h | Medium | **6th** |
| 3.1 Create pfui/widgets | Medium | Low | 4-5h | Medium | **7th** |
| 2.3 Refactor preview.py | Low | Medium | 3-4h | Medium | **8th** |
| 3.2 Create validators | Low | Low | 2-3h | Low | **9th** |

**Total Estimated Effort:** 27-38 hours
**Recommended Timeline:** 2-3 weeks (4-6 hours per session)

---

## Detailed Migration Guides

### Phase 1: Documentation Cleanup (READY TO IMPLEMENT)

#### Step 1: Create Archive Structure
```bash
# Create archive directories
mkdir -p archive/evolution/2024-q4
mkdir -p archive/ci-logs/2024-q4
mkdir -p archive/refactoring/linting
mkdir -p archive/refactoring/type-checking

# Move evolution documents
mv CODE_QUALITY_IMPROVEMENTS.md archive/evolution/2024-q4/
mv COMPREHENSIVE_IMPROVEMENTS_SUMMARY.md archive/evolution/2024-q4/
mv IMPLEMENTATION_SUMMARY.md archive/evolution/2024-q4/
mv TEST_COVERAGE_IMPROVEMENTS.md archive/evolution/2024-q4/
mv TEST_VALIDATION_REPORT.md archive/evolution/2024-q4/
mv NEXT_STEPS_ANALYSIS.md archive/evolution/2024-q4/
mv FINAL_REPORT.md archive/evolution/2024-q4/
mv REVIEW_SUMMARY.md archive/evolution/2024-q4/
mv EDGEFLOW_PROGRESS.md archive/evolution/2024-q4/
mv RELEASE_NOTES_v2.1.0.md archive/evolution/2024-q4/

# Move CI logs
mv .gha_run_*.log archive/ci-logs/2024-q4/ 2>/dev/null || true
mv run_*.log archive/ci-logs/2024-q4/ 2>/dev/null || true

# Move refactoring artifacts
mv ruff-*.txt archive/refactoring/linting/ 2>/dev/null || true
mv .ruff_*.txt archive/refactoring/linting/ 2>/dev/null || true
mv mypy-*.txt archive/refactoring/type-checking/ 2>/dev/null || true
mv .mypy_*.txt archive/refactoring/type-checking/ 2>/dev/null || true
```

#### Step 2: Reorganize docs/
```bash
# Create new structure
mkdir -p docs/guides

# Move technical guides
mv STL_EXPORT_GUIDE.md docs/guides/
mv TYPE_HINTS_GUIDE.md docs/guides/
mv CODE_QUALITY_GUIDE.md docs/guides/
mv DEVELOPMENT.md docs/guides/
mv PROPERTY_BASED_TESTING_IMPLEMENTATION.md docs/guides/

# Move specific documentation
mv docs/deeplink.md docs/
mv docs/alt_s3_r2.md docs/
```

#### Step 3: Update .gitignore
```bash
# Add new entries
cat >> .gitignore << 'EOF'

# Analysis and temporary files
*.log
*_output.txt
tmp_*.py
.ruff_*.txt
.mypy_*.txt
*_COMMIT_MSG.txt
run_*.log
.gha_run_*.log
IMPROVEMENT_SUMMARY.txt
TERMINAL_OUTPUT_CHECK.txt
_runs_all.json
.runs_grep.txt

# Archive directory (keep in git but don't actively update)
# archive/ is intentionally tracked for historical reference
EOF
```

#### Step 4: Delete Truly Temporary Files
```bash
# Safe to delete (not tracked or should not be tracked)
rm -f tmp_*.py
rm -f BATCH2_COMMIT_MSG.txt
rm -f IMPROVEMENT_SUMMARY.txt
rm -f TERMINAL_OUTPUT_CHECK.txt
rm -f .tmp_*.txt
```

#### Step 5: Create Archive READMEs
```markdown
# archive/README.md
# PotFoundry Archive

This directory contains historical documents from the evolution of PotFoundry.
These files are preserved for reference but are not actively maintained.

## Directory Structure

- `evolution/` - Historical improvement summaries and progress reports
- `ci-logs/` - Historical CI/CD run logs
- `refactoring/` - Linting and type-checking output from improvement work

## Usage

These documents provide context for past development decisions and progress.
For current development information, see the main repository documentation.
```

### Phase 2.1: Split app.py (DETAILED GUIDE)

#### Analysis First
```bash
# Count lines by section in app.py
grep -n "^def \|^class " app.py
# Identify natural boundaries
# Map dependencies between functions
```

#### Extraction Plan
```python
# pfui/app_components/__init__.py
"""App-level components for Streamlit interface.

This package contains high-level UI orchestration components extracted
from the monolithic app.py for better maintainability.

Public API:
    - render_mesh_generation_panel()
    - render_parameter_controls()
    - render_export_section()
    - configure_sidebar()
    - manage_tab_navigation()
"""

from .mesh_generation import render_mesh_generation_panel
from .parameter_controls import render_parameter_controls
from .export_handlers import render_export_section
from .sidebar_config import configure_sidebar
from .tabs_manager import manage_tab_navigation

__all__ = [
    'render_mesh_generation_panel',
    'render_parameter_controls',
    'render_export_section',
    'configure_sidebar',
    'manage_tab_navigation',
]
```

#### Testing Strategy
```python
# tests/unit/pfui/test_app_components.py
"""Unit tests for app components.

Tests each component in isolation without Streamlit context.
"""

def test_mesh_generation_panel_returns_valid_structure():
    """Verify mesh generation panel returns expected structure."""
    # Mock Streamlit context
    # Call render_mesh_generation_panel()
    # Assert structure matches expectations
    pass

def test_parameter_controls_validates_inputs():
    """Verify parameter controls validate user input."""
    pass
```

---

## Risk Mitigation

### Rollback Strategy
- Each phase in separate PR
- Git tags before major changes
- Feature flags for risky refactorings
- Comprehensive testing before merge

### Testing Requirements
- All existing 99 tests must pass
- New tests for refactored components
- Integration tests for extracted modules
- Performance regression tests

### Communication Plan
- PR for each phase with detailed description
- Update CHANGELOG.md with each change
- Mark TODO.md items as completed
- Document breaking changes (if any)

---

## Success Metrics

### Phase 1 Success Criteria
- [ ] Root directory has ≤20 files
- [ ] All documentation properly categorized
- [ ] No temporary files in repository
- [ ] Archive structure created with READMEs

### Phase 2 Success Criteria
- [ ] app.py reduced to ≤600 LOC
- [ ] pfui/schemas.py split into logical modules
- [ ] All tests pass (99/99)
- [ ] No performance regression

### Phase 3 Success Criteria
- [ ] Reusable widget components created
- [ ] Validation logic centralized
- [ ] Code duplication reduced by 30%

### Phase 4 Success Criteria
- [ ] Tests organized by category
- [ ] Property-based tests added
- [ ] Test coverage ≥95%

### Phase 5 Success Criteria
- [ ] CI/CD pipeline running
- [ ] All checks passing
- [ ] Coverage reports automated

---

## Next Steps

### Immediate Actions (Week 1)
1. **Review this plan** - Get feedback and approval
2. **Phase 1 execution** - Clean up documentation and files
3. **Create archive structure** - Preserve history
4. **Update .gitignore** - Prevent future clutter

### Short Term (Weeks 2-3)
4. **Set up CI/CD** - Automated testing and checks
5. **Reorganize tests** - Better structure
6. **Split app.py** - First major refactoring

### Medium Term (Weeks 4-6)
7. **Refactor schemas.py** - Modular organization
8. **Consolidate geometry** - Remove duplication
9. **Create widget library** - Reusable components

---

## Appendices

### A. File Inventory

**Root Directory (Current: 58 files → Target: ~15 files)**

Keep in root:
- README.md
- ARCHITECTURE.md
- ROADMAP.md
- TODO.md
- CHANGELOG.md
- LICENSE
- COMMERCIAL-LICENSE.md
- CONTRIBUTING.md (new)
- requirements.txt
- requirements-dev.txt
- pyproject.toml
- pytest.ini
- mypy.ini
- .gitignore
- .pre-commit-config.yaml

Move to archive/:
- CODE_QUALITY_IMPROVEMENTS.md
- COMPREHENSIVE_IMPROVEMENTS_SUMMARY.md
- IMPLEMENTATION_SUMMARY.md
- TEST_COVERAGE_IMPROVEMENTS.md
- TEST_VALIDATION_REPORT.md
- NEXT_STEPS_ANALYSIS.md
- FINAL_REPORT.md
- REVIEW_SUMMARY.md
- EDGEFLOW_PROGRESS.md
- RELEASE_NOTES_v2.1.0.md
- MYPY_TRIAGE.md
- MYPY_TRIAGE_FULL.md
- .pf_edge_flow_log.md

Move to docs/:
- STL_EXPORT_GUIDE.md → docs/guides/
- TYPE_HINTS_GUIDE.md → docs/guides/
- CODE_QUALITY_GUIDE.md → docs/guides/
- DEVELOPMENT.md → docs/guides/
- PROPERTY_BASED_TESTING_IMPLEMENTATION.md → docs/guides/

Delete (temporary):
- All .log files
- All *_output.txt files
- All tmp_*.py files
- All ruff-*.txt files
- All mypy-out*.txt files
- BATCH2_COMMIT_MSG.txt
- IMPROVEMENT_SUMMARY.txt
- TERMINAL_OUTPUT_CHECK.txt

### B. Complexity Analysis

**Functions >100 LOC (candidates for refactoring):**
- `app.py:main()` - Entry point orchestration
- `pfui/preview.py:render_mesh_snapshot_cached()` - Complex rendering
- `pfui/schemas.py:get_style_schemas()` - Large schema generation
- `potfoundry/geometry.py:build_pot_mesh()` - Core algorithm (acceptable complexity)

**Cyclomatic Complexity Targets:**
- Functions <15 complexity (current max ~25)
- Modules <50 complexity average
- Extract conditional logic into named functions

### C. Backward Compatibility

**Guaranteed:**
- Public API unchanged (`potfoundry/__init__.py`)
- Import paths maintained via `__init__.py` re-exports
- Test suite 100% passing
- CLI tools unchanged
- Configuration file formats unchanged

**Internal Changes:**
- File organization (transparent to users)
- Private function locations (OK to change)
- Test organization (transparent)
- Documentation structure (improved navigation)

---

**Document Version:** 1.0
**Last Updated:** January 2025
**Status:** Ready for Review and Implementation
**Estimated Completion:** 3-6 weeks (phased approach)
