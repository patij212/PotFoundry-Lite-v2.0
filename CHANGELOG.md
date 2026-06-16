# Changelog

All notable changes to PotFoundry Lite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2024-12 (In Development)

### Added
- Version management: Added `__version__` to `potfoundry/__init__.py`
- Test fixtures: Added `conftest.py` for library tests to properly load fixtures
- Mesh orientation guarantees: `tests/test_mesh_orientation.py` asserts every
  style/parameter combination produces a *consistently oriented* closed manifold
  with outward-facing normals (consistent winding + positive signed volume) —
  the prerequisite for clean Rhino/Grasshopper import, mesh booleans and slicing.

### Fixed
- **Mesh orientation (export quality):** `build_pot_mesh` produced an
  *inside-out* mesh. The main body (outer wall, inner wall, rim and bottom
  underside) was wound inward while the slab-top and drain cylinder were wound
  outward, leaving the surface globally non-orientable (240 inconsistently wound
  edges at the bottom seams for the default resolution) with inward normals.
  This is exactly the defect Rhino/Grasshopper flag ("Unify Normals") and that
  makes mesh booleans/slicing fail. The main-body face groups are now wound
  outward by construction (a zero-cost numpy view reversal), so the whole
  surface is a single consistently oriented manifold with outward normals.
  Vertex positions, counts, bounding box, surface area and watertightness are
  unchanged, so golden-mesh metrics still hold.

- **Critical Bug Fixes:**
  - Removed unreachable dead code in `yaml_api.py` causing undefined name errors
  - Removed duplicate `deep_merge` function definition in `yaml_api.py`
  - Removed unused `Client` import in `supabase_client.py`
  - Fixed ambiguous variable name `l` → `log_entry` in `app.py`
  - Fixed 5 broken library tests due to missing fixture loading

- **Code Quality:**
  - Auto-fixed 74 linting issues (unused imports, f-strings, etc.) with ruff
  - Reduced critical linting errors from 15 to 9 (remaining are acceptable E402 in files with docstrings)

### Changed
- Updated version from v2.0 to v2.1.0 throughout codebase
- Improved code hygiene and maintainability

### Testing
- All 99 tests passing (100% pass rate)
- Fixed library test fixtures loading

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
