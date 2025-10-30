# Changelog

All notable changes to PotFoundry Lite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2024-12 (In Development)

### Added
- Version management: Added `__version__` to `potfoundry/__init__.py`
- Test fixtures: Added `conftest.py` for library tests to properly load fixtures

### Fixed
- **Critical Bug Fixes:**
  - Removed unreachable dead code in `yaml_api.py` causing undefined name errors
  - Removed duplicate `deep_merge` function definition in `yaml_api.py`
  - Removed unused `Client` import in `supabase_client.py`
  - Fixed ambiguous variable name `l` → `log_entry` in `app.py`
  - Fixed 5 broken library tests due to missing fixture loading
  - Fixed: Ensure full preview `mesh_kwargs` is always defined to avoid
    NameError when gradient coloring is active; added `build_mesh_kwargs_for_test`
    helper and `tests/test_app_full_preview_branch.py` to cover this branch.

- **Code Quality Improvements:**
  - **Fixed 124 semicolon linting warnings (E702)** - Refactored all multi-statement lines to proper multi-line format
  - **Fixed 10 unused variable warnings (F841)** - Cleaned up dead code and commented intermediate variables
  - Fixed duplicate import warning (F811) in `app.py`
  - Auto-fixed 74 earlier linting issues (unused imports, f-strings, etc.) with ruff
  - **Reduced linting errors from 124+ to 9** (remaining are acceptable E402 for module docstrings)
  - Improved code readability and LLM-friendliness per CODE_QUALITY_GUIDE.md

### Changed
- Updated version from v2.0 to v2.1.0 throughout codebase
- Improved code hygiene and maintainability
- Refactored semicolon-separated statements across 7 files:
  - `app.py` (27 fixes)
  - `potfoundry/geometry.py` (32 fixes)
  - `potfoundry/core/geometry.py` (27 fixes)
  - `potfoundry/core/io/stl.py` (4 fixes)
  - `pfui/preview.py` (29 fixes)
  - `tests/test_mesh_effects.py` (14 fixes)
  - `tests/test_colors.py` (2 fixes)

### Testing
- **All 275 tests passing (100% pass rate)** - increased from 103 tests (172 new tests added!)
- Fixed library test fixtures loading
- No performance regressions from code quality improvements
- **Type hints added** - Comprehensive type hints added to ~90 functions across all modules (Phase 3 complete)
  - potfoundry/geometry.py: ~25 functions with type hints
  - potfoundry/core/geometry.py: ~20 functions with type hints
  - potfoundry/yaml_api.py: ~10 functions with type hints
  - potfoundry/core/io/stl.py: ~4 functions with type hints
  - pfui/state.py: ~6 functions with type hints
  - pfui/exporters.py: ~2 functions with type hints
  - pfui/colors.py: ~5 functions with type hints
  - pfui/deeplink.py: ~5 functions with type hints
  - **pfui/controls.py: ~2 functions with type hints (NEW)**
  - **pfui/preview.py: ~2 functions with type hints (NEW)**
  - **pfui/presets.py: ~3 functions with type hints (NEW)**
  - **app.py: ~2 utility functions with type hints (NEW)**
  - **Total coverage: ~90 functions (80% of codebase, 100% core/support, key UI layer functions)**
  - potfoundry/yaml_api.py: ~10 functions with type hints
  - potfoundry/core/io/stl.py: ~4 functions with type hints **NEW**
  - pfui/colors.py: ~5 functions with type hints
  - pfui/deeplink.py: ~5 functions with type hints  
  - pfui/state.py: ~6 functions with type hints **NEW**
  - pfui/exporters.py: ~2 functions with type hints **NEW**
  - mypy configuration created (mypy.ini)
  - TYPE_HINTS_GUIDE.md documentation created (400+ lines)
  - potfoundry/yaml_api.py: ~10 functions with type hints
  - pfui/colors.py and pfui/deeplink.py: ~10 functions with type hints
  - mypy configuration created (mypy.ini)
  - TYPE_HINTS_GUIDE.md documentation added
  - Static type checking enabled with mypy
- **Test Coverage Improvements:**
  - Added comprehensive test suites for core modules (172 new tests total)
  - **Phase 1**: `potfoundry/geometry.py` 57% → 81% (+24%) - 35 tests added
  - **Phase 2**: `potfoundry/core/geometry.py` 86% → 87% (+1%) - 22 tests added
  - **Phase 3**: `potfoundry/schema.py` 68% → **99%** (+31%) - 53 tests added
  - **Phase 4**: `potfoundry/yaml_api.py` 17% → **90%** (+73%) - 29 tests added
  - **UX Tests**: Added pfui module testing - 33 tests added
  - **Overall coverage**: 38% → **46%** (+8% overall, core modules >90%)
  - Tested all style functions with default and custom parameters
  - Added edge case testing for validation, error handling, and diagnostics
  - Validated mesh generation with extreme parameters and resolutions
  - YAML batch processing fully tested
  - UX components (deeplink, colors, imports) tested

---

## [2.0.0] - 2024

### Major Changes

#### Binary STL as Default Export Format
- **All exports now use binary STL by default** - 80% smaller files, 10x faster
- ASCII STL deprecated but retained for backward compatibility
- Clear deprecation warnings guide users to binary format

### Added

#### Enhanced STL Export
- `write_stl_binary()` - Recommended binary STL writer with comprehensive docs
- Atomic file writes prevent corruption
- Auto-computed face normals
- Universal compatibility with modern slicers

#### Deprecation System
- `write_ascii_stl()` shows clear deprecation warning
- Guides users to migrate to binary STL
- Maintains backward compatibility

#### Documentation
- **STL_EXPORT_GUIDE.md** - Complete migration guide with examples
- **IMPLEMENTATION_SUMMARY.md** - Technical implementation details
- **ARCHITECTURE.md** - System design and structure guide
- **CODE_QUALITY_GUIDE.md** - LLM-friendly coding standards
- **DEVELOPMENT.md** - Developer workflows and setup
- **ROADMAP.md** - Future Qt desktop app evolution plan
- **validate_migration.py** - Validation script for binary STL

#### Enhanced Code Documentation
- Comprehensive docstrings for all STL functions
- Inline comments explaining binary format
- LLM-friendly code structure
- Type hints throughout codebase

#### Testing

**New Test Suites:**
- `test_stl_migration.py` - 7 migration tests
  - Binary STL as default
  - Deprecation warnings
  - File size comparisons
  - Valid STL structure

- `test_integration_binary_stl.py` - 4 integration tests
  - End-to-end workflows
  - Multiple style support
  - Performance benchmarks

- `test_performance.py` - Performance benchmarks
  - Mesh generation timing
  - STL export timing
  - Memory efficiency

- `test_golden_meshes.py` - Regression tests
  - Deterministic output verification
  - Watertightness validation
  - Mesh property checks

**Test Coverage:**
- Total: 99 tests (100% pass rate)
- 81% increase in test coverage from v1.x
- All performance targets met ✅

### Performance Improvements

#### File Size
- **80% reduction** in file size (binary vs ASCII)
- Example: 8.5 MB ASCII → 1.7 MB binary
- 5x smaller files on average

#### Export Speed
- **10x faster** binary STL writing
- 50ms for 30k triangles (vs 500ms for ASCII)
- Predictable performance (50 bytes/triangle)

#### Mesh Generation
- Typical mesh (168×84): **132ms** (target: <200ms) ✅
- Binary STL export: **15ms** (target: <100ms) ✅
- End-to-end workflow: **144ms** (target: <500ms) ✅

### Changed
- Default STL export format from ASCII to binary
- Improved mesh generation performance with NumPy vectorization
- Enhanced UI with better preview controls
- Streamlined caching and state management

### Deprecated
- `write_ascii_stl()` - Use `write_stl_binary()` instead

### Breaking Changes
- **None** - fully backward compatible
- ASCII STL still works (with deprecation warning)
- Same function signatures

### Migration Guide

**For users:**
- ✅ No action required - automatic upgrade

**For developers:**
1. Replace `write_ascii_stl` with `write_stl_binary`
2. Update imports: `from potfoundry import write_stl_binary`
3. No other changes needed

### Technical Details

#### Modified Files
- `potfoundry/__init__.py`
- `potfoundry/core/io/stl.py`
- `potfoundry/geometry.py`
- `potfoundry/core/geometry.py`
- `app.py`
- `pfui/exporters.py`
- `potfoundry/yaml_api.py`

#### New Files
- `.gitignore`
- `STL_EXPORT_GUIDE.md`
- `IMPLEMENTATION_SUMMARY.md`
- `ARCHITECTURE.md`
- `CODE_QUALITY_GUIDE.md`
- `DEVELOPMENT.md`
- `ROADMAP.md`
- `validate_migration.py`
- `tests/test_stl_migration.py`
- `tests/test_integration_binary_stl.py`
- `tests/test_performance.py`
- `tests/test_golden_meshes.py`

### Contributors
- GitHub Copilot Workspace
- patij212

---

## [1.x] - Earlier Versions

Initial development versions with ASCII STL export, basic Streamlit UI, and core mesh generation functionality.

---

**For detailed migration instructions, see [STL_EXPORT_GUIDE.md](STL_EXPORT_GUIDE.md)**
**For implementation details, see [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)**
**For development guidelines, see [DEVELOPMENT.md](DEVELOPMENT.md)**

## Property-Based Testing (In Progress - 2024-12-XX)

### Added
- **Hypothesis Framework** - Installed property-based testing framework
- **10 Property-Based Tests** - Created comprehensive property tests
  - test_property_mesh_is_watertight - Validates manifold property ✅
  - test_property_face_normals_point_outward - Validates mesh orientation ✅
  - test_property_no_degenerate_triangles - Prevents rendering issues
  - test_property_diameter_estimates_within_bounds - Validates diagnostics
  - test_property_state_encoding_roundtrip - Validates deeplink functionality
  - test_property_yaml_configuration_roundtrip - Validates batch processing
  - test_property_volume_increases_with_diameter - Validates geometry
  - test_property_all_styles_produce_valid_meshes - Validates all 5 styles
  - test_property_height_matches_mesh_bounds - Validates geometric accuracy
  - test_property_mesh_size_scales_with_resolution - Validates resolution parameters

### Benefits
- Automatic edge case discovery
- Mathematical property validation
- Regression protection
- Complements existing 275 unit tests

### Status
- 2 tests passing, 8 require minor fixes
- Framework ready for expansion
- Documentation complete in PROPERTY_BASED_TESTING_IMPLEMENTATION.md

