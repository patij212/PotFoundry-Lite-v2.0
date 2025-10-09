# Changelog

All notable changes to PotFoundry Lite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.2.0] - 2024-10-09

### Added
- Snapshot color synchronization with Appearance & Preview Settings
- Thumbnail color synchronization with Appearance & Preview Settings
- Dedicated "Publish" button in Library section for easier publishing workflow
- Comprehensive code quality improvements and linting fixes

### Fixed
- **Critical**: Fixed thumbnail vertical elongation with orthographic projection and proper aspect ratios
- **Critical**: Fixed library to reflect actual database state by removing caching
- **Bug**: Fixed undefined `datetime` reference in publishing workflow
- **Bug**: Fixed duplicate `math` import in app.py
- **Bug**: Fixed StreamlitDuplicateElementKey error for preview_palette
- **Code Quality**: Removed 25+ semicolon violations (E702) for better readability
- **Code Quality**: Cleaned up unused imports across multiple files
- Removed ground grid from library thumbnails for cleaner appearance

### Changed
- Updated app version from 2.1.0-evo to 2.2.0
- Improved render quality with viridis colormap and better lighting
- Consolidated documentation into main README.md
- All tests passing (99 tests, 100% pass rate)

### Technical Improvements
- Enhanced render_mesh_snapshot_cached to use appearance settings
- Improved thumbnail generation with proper orthographic projection
- Better aspect ratio handling in 3D previews (1:1 XY, compressed Z)
- Cleaner code structure with proper statement separation

---

## [2.1.0-evo] - 2024-10

### Added
- Snapshot capture and comparison features
- Enhanced 3D preview with Plotly integration
- Library UI improvements with thumbnail previews
- Supabase integration for public library
- Deep linking for design sharing

### Changed
- Improved UI organization and layout
- Enhanced state management with history support
- Better preview caching and performance

---

## [2.0.0] - 2024

### Major Changes
- **All exports now use binary STL by default** - 80% smaller files, 10x faster
- ASCII STL deprecated but retained for backward compatibility

### New Features
- write_stl_binary() - Recommended binary STL writer
- Atomic file writes prevent corruption
- Auto-computed face normals

### Testing
- Total: 99 tests (100% pass rate)

### Performance
- **80% reduction** in file size (binary vs ASCII)
- **10x faster** binary STL writing

---

## [1.0.0] - 2024-Q1

### Initial Release
- Five artistic styles
- Streamlit-based UI
- Parametric pot generation
- STL export
- Watertight mesh generation
