# TODO - Next Iteration

Comprehensive task list for PotFoundry Lite development, organized by priority and category.

Last Updated: 2024-10-09

---

## 🔴 High Priority (v2.3)

### Critical Bugs & Issues
- [ ] None currently identified

### User Experience Improvements
- [ ] Add "Copy Link" button next to "Open shared link" in Library publish success
- [ ] Implement skeleton/placeholder cards while Library thumbnails are loading
- [ ] Add visual feedback when auto-refresh is active in Library
- [ ] Improve error messages when Supabase connection fails
- [ ] Add retry logic for failed thumbnail uploads

### Performance Optimizations
- [ ] Optimize Library pagination with virtual scrolling for large collections
- [ ] Add lazy loading for Library thumbnails (load as user scrolls)
- [ ] Cache rendered previews more aggressively (check if parameters unchanged)
- [ ] Optimize mesh generation for high-resolution exports (parallel processing)

### Testing
- [ ] Add integration tests for Library publishing workflow
- [ ] Add tests for thumbnail generation with different color settings
- [ ] Add tests for snapshot color synchronization
- [ ] Add UI tests for preset management
- [ ] Add performance regression tests

---

## 🟡 Medium Priority (v2.4)

### New Features
- [ ] Export to OBJ format (in addition to STL)
- [ ] Export to 3MF format with color information
- [ ] Add "duplicate design" button to quickly clone current parameters
- [ ] Add design notes/description field (saved with snapshots)
- [ ] Implement design versioning (track parameter changes over time)
- [ ] Add comparison view: show two snapshots side-by-side with diff highlighting
- [ ] Batch export: generate multiple variations from parameter ranges

### Library Enhancements
- [ ] Add search functionality (by title, tags, style)
- [ ] Add sorting options (date, popularity, style, size)
- [ ] Add filtering by date range
- [ ] Show related designs (same style, similar parameters)
- [ ] Add "Report design" functionality for inappropriate content
- [ ] Add user profiles (optional, show all designs by a user)
- [ ] Implement design ratings/likes (optional)

### UI/UX Improvements
- [ ] Add keyboard shortcuts (Ctrl+E for export, Ctrl+S for snapshot, etc.)
- [ ] Add drag-and-drop for YAML batch config files
- [ ] Improve mobile responsiveness (currently optimized for desktop)
- [ ] Add dark/light theme toggle
- [ ] Add customizable UI layout (collapsible panels, draggable sections)
- [ ] Add "What's New" modal on version updates

### Documentation
- [ ] Create video tutorial (3-5 minutes) showing basic workflow
- [ ] Add interactive tutorial mode (step-by-step guidance)
- [ ] Create style showcase page with examples and parameters
- [ ] Document common troubleshooting scenarios
- [ ] Add FAQ section to README
- [ ] Create contribution guide with detailed workflow

---

## 🟢 Low Priority (v2.5+)

### Advanced Features
- [ ] Add custom style creation wizard (GUI-based formula builder)
- [ ] Implement parametric sweep/optimization (find best parameters for criteria)
- [ ] Add physics simulation preview (stress test, water capacity, stability)
- [ ] Support for multi-material designs (different colors/materials)
- [ ] Add texture mapping support
- [ ] Implement procedural texture generation
- [ ] Add support for custom drainage patterns

### Integration & Automation
- [ ] GitHub Actions workflow for automated testing
- [ ] Docker container for easy deployment
- [ ] API endpoint for headless generation
- [ ] Webhook support for batch processing notifications
- [ ] Integration with Thingiverse/Printables APIs
- [ ] Integration with slicing software (direct STL transfer)

### Analytics & Monitoring
- [ ] Add anonymous usage analytics (opt-in)
- [ ] Track popular styles and parameters
- [ ] Monitor export success/failure rates
- [ ] Performance monitoring dashboard
- [ ] Library growth metrics

### Code Quality
- [ ] Increase test coverage to 95%+
- [ ] Add mutation testing
- [ ] Implement property-based testing for mesh generation
- [ ] Add comprehensive type hints (mypy strict mode)
- [ ] Refactor large functions (app.py has some 100+ line functions)
- [ ] Extract UI components into reusable modules
- [ ] Add comprehensive API documentation with Sphinx

---

## 🔵 Future Vision (v3.0 - Qt Desktop App)

### Core Migration
- [ ] Research PySide6 vs PyQt6 licensing
- [ ] Prototype VTK integration for 3D rendering
- [ ] Design Qt application architecture
- [ ] Migrate state management to Qt signals/slots
- [ ] Implement multi-threaded mesh generation
- [ ] Add cancellable long-running operations

### Desktop Features
- [ ] Native file system integration
- [ ] Multi-window support (compare multiple designs)
- [ ] Advanced keyboard shortcuts
- [ ] Offline mode (full functionality without internet)
- [ ] Local design library with SQLite
- [ ] Import/export design collections

### Performance
- [ ] GPU-accelerated mesh generation (CUDA/OpenCL)
- [ ] Real-time preview updates (sub-100ms)
- [ ] Handle 1M+ triangle meshes smoothly
- [ ] Streaming STL export for very large files

### Packaging
- [ ] PyInstaller build scripts for Windows/macOS/Linux
- [ ] Auto-update mechanism
- [ ] Installer with custom branding
- [ ] Portable/standalone version (no Python required)

---

## 🛠️ Technical Debt

### Code Cleanup
- [ ] Remove deprecated functions (if any warnings appear)
- [ ] Consolidate duplicate code in preview rendering
- [ ] Standardize error handling (consistent try/except patterns)
- [ ] Remove commented-out code blocks
- [ ] Update all docstrings to Google style
- [ ] Add missing type hints (especially in app.py)

### Dependency Management
- [ ] Pin all dependency versions in requirements.txt
- [ ] Check for security vulnerabilities (pip-audit)
- [ ] Update to latest Streamlit version (test compatibility)
- [ ] Remove unused dependencies
- [ ] Add requirements-dev.txt for development tools

### Infrastructure
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Add pre-commit hooks (ruff, black, isort)
- [ ] Implement versioning strategy (semantic versioning)
- [ ] Add CONTRIBUTING.md with detailed guidelines
- [ ] Set up issue templates (bug report, feature request)
- [ ] Add pull request template

### Documentation Cleanup
- [ ] Remove or archive outdated docs (IMPLEMENTATION_COMPLETE.md, SNAPSHOT_FIX.md, etc.)
- [ ] Consolidate multiple README files (DONE in v2.2.0)
- [ ] Update all documentation to reference v2.2.0
- [ ] Add badges to README (build status, coverage, version)

---

## 📝 Notes

### Design Decisions to Review
- Should we support plugins/extensions for custom styles?
- Should Library be opt-in or opt-out?
- Should we implement user accounts (vs anonymous publishing)?
- Should we add commercial license management directly in app?

### Community Feedback Needed
- What features are users actually using? (needs analytics)
- Which styles are most popular?
- What export formats are needed?
- What's the typical workflow? (informs UI priorities)

### Research Topics
- Better mesh optimization algorithms (reduce triangles without quality loss)
- Alternative STL formats (AMF, 3MF with full metadata)
- Cloud-based rendering (offload heavy computation)
- Integration with CAD software (FreeCAD, Fusion 360)

---

## ✅ Recently Completed (v2.2.0)

- [x] Fix thumbnail vertical elongation
- [x] Synchronize snapshot/thumbnail colors with appearance settings
- [x] Remove ground grid from library thumbnails
- [x] Add dedicated Publish button
- [x] Fix library caching to reflect database state
- [x] Fix StreamlitDuplicateElementKey error
- [x] Clean up code quality (remove semicolons, unused imports)
- [x] Update app version to 2.2.0
- [x] Consolidate documentation into main README.md
- [x] Update CHANGELOG.md with v2.2.0 changes

---

## 📊 Metrics & Goals

### Current State (v2.2.0)
- ✅ 99 tests (100% pass rate)
- ✅ All performance targets met
- ✅ Zero critical bugs
- ✅ Comprehensive documentation

### Goals for v2.3
- 🎯 Add 20+ new tests (UI components, integration)
- 🎯 Increase code coverage to 90%+
- 🎯 Add 5+ user-requested features
- 🎯 Improve Library UX (search, sort, filter)
- 🎯 Performance: <50ms thumbnail generation

### Goals for v2.5
- 🎯 150+ tests
- 🎯 95% code coverage
- 🎯 Sub-100ms mesh generation for typical sizes
- 🎯 Support 3+ export formats
- 🎯 1000+ designs in public library

### Long-term Vision (v3.0)
- 🎯 Desktop application with native performance
- 🎯 Real-time preview updates
- 🎯 GPU acceleration
- 🎯 Plugin system for extensibility
- 🎯 Commercial license management

---

## 🤝 Contribution Guidelines

See CONTRIBUTING.md for:
- How to pick a task from this TODO
- Development workflow
- Testing requirements
- Code review process
- Documentation standards

Priority tasks are marked with 🔴 (high), 🟡 (medium), 🟢 (low), 🔵 (future).

When completing a task:
1. Move it to "Recently Completed" section
2. Update CHANGELOG.md with the change
3. Add tests for new functionality
4. Update relevant documentation
5. Bump version if appropriate

---

**This TODO is a living document. Update it regularly!**
