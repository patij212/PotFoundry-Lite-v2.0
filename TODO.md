# TODO - PotFoundry Development Roadmap

This document tracks planned features, improvements, and technical debt for the **PotFoundry Web Application**.

**Last Updated:** March 2026
**Current Version:** v3.1.0 (WebGPU)
**Primary Product:** potfoundry-web (WebGPU React Application)

> **Note**: The legacy Python/Streamlit UI has been archived. All development is now focused on the WebGPU web application.

---

## 🌐 v3.2.0 - Web App Enhancements (Q1 2026)

### High Priority

#### User Experience
- [ ] Add inline help tooltips for all parameters
- [ ] Improve error messages with suggested fixes
- [ ] Add real-time validation feedback (red/green borders on inputs)
- [ ] Add "Undo/Redo" functionality for parameter changes
- [ ] Implement keyboard shortcuts (Ctrl+Z, Ctrl+S, etc.)
- [ ] Add progress indicators for long operations
- [ ] Improve mobile responsiveness

#### Preview & Visualization
- [ ] Add measurement tools in 3D preview (calipers, diameter display)
- [ ] Add cross-section view mode
- [ ] Improve lighting and material rendering in preview
- [ ] Add export preview as image (PNG, SVG)
- [ ] Add comparison mode (side-by-side designs)
- [x] **Wireframe rendering mode** - implemented with line-list pipeline
- [x] **Inner surface toggle** - implemented with shader uniform flag

#### Preset & State Management
- [ ] Enhanced preset management UI with thumbnails
- [ ] Preset categories and filtering
- [ ] Export/import presets as JSON
- [ ] Preset versioning and migration
- [ ] Auto-save functionality with recovery
- [ ] Design history with branching (git-like)

### Medium Priority

#### Performance
- [ ] Implement progressive mesh refinement for preview
- [ ] Add mesh simplification option for faster preview
- [ ] Cache more aggressively with smarter invalidation
- [ ] Profile and optimize hot paths (WASM candidates?)
- [ ] Add performance metrics dashboard

#### Export & Integration
- [ ] Add OBJ export format (Client-side)
- [ ] Add 3MF export format (Client-side, with metadata)
- [ ] Add STEP/IGES export (if feasible via WASM)
- [ ] Slicer integration (PrusaSlicer, Cura)
- [ ] Export with embedded settings/metadata

#### Documentation
- [ ] Add in-app tutorial/walkthrough
- [ ] Create video tutorials
- [ ] Add interactive examples
- [ ] Improve API documentation with more examples
- [ ] Add troubleshooting guide with common issues

### Low Priority

- [ ] Add design templates gallery
- [ ] Implement design collaboration features
- [ ] Add A/B testing framework for UI changes
- [ ] Internationalization (i18n) support
- [ ] Dark mode theme option

---

## 🎯 v3.3.0 - Advanced Features (Q2 2026)

### Style System Enhancements
- [ ] Add 3-5 new decorative styles
- [ ] Style preview thumbnails
- [ ] Style combination/layering system
- [ ] Custom style editor (formula-based)
- [ ] Style marketplace/sharing

### Parametric Features
- [ ] Multi-material support (dual extrusion planning)
- [ ] Internal structures (lattice, honeycomb)
- [ ] Drainage hole patterns (multiple holes, star pattern)
- [ ] Textured surfaces (knurling, diamond pattern)
- [ ] Embossed text/logos

### Analysis Tools
- [ ] Structural analysis (basic FEA preview)
- [ ] Water capacity calculator
- [ ] Soil volume calculator
- [ ] Printability analysis (overhang detection, support preview)
- [ ] Cost estimation (filament, time, electricity)

### Batch Processing
- [ ] Parametric sweeps (generate variations)
- [ ] Batch export with naming templates
- [ ] Design automation with scripts
- [ ] CSV import for bulk generation

---

## 🔧 Technical Debt & Code Quality

### WebGPU / TypeScript
- [ ] **Strict Typing**: Achieve 100% strict mode compliance in `potfoundry-web`.
- [ ] **Refactor `webgpu_core.ts`**: Break down the monolithic file into `Renderer`, `Scene`, `Geometry` modules.
- [ ] **Test Coverage**: Increase unit test coverage for `AdaptiveExportComputer` and `ConstrainedTriangulator`.
- [ ] **WASM Integration**: Explore moving heavy geometric computations (welding, triangulation) to Rust/WASM.

### Data Validation
- [ ] Unify validation logic between UI (React) and Core (if used).
- [ ] Add runtime schema validation for imported presets.

---

## 🧪 Testing Improvements

### Test Coverage
- [ ] Add UI tests (Playwright/Selenium)
- [ ] Add visual regression tests for previews
- [ ] Add load tests for large meshes (8k resolution)
- [ ] Add mutation testing
- [ ] Improve edge case coverage

### Test Infrastructure
- [ ] Set up test fixtures library
- [ ] Add test data generators
- [ ] Improve test organization
- [ ] Add performance benchmarking suite
- [ ] Set up test coverage reporting

---

## 📚 Documentation Improvements

### User Documentation
- [ ] Create user manual (PDF/online)
- [ ] Add FAQ section
- [ ] Create troubleshooting guide
- [ ] Add design guidelines (best practices)
- [ ] Create example gallery

### Developer Documentation
- [/] **Consolidated Agents Guide**: `agents.md` (In Progress)
- [ ] Add architecture decision records (ADRs)
- [ ] Create contribution guide
- [ ] Add plugin development guide
- [ ] Document release process
- [ ] Add performance optimization guide

---

## 🐛 Known Issues & Bug Fixes

### Critical
- [ ] **Seam Flattening**: The mesh pipeline has a known issue where the seam (0/360 degrees) is flattened, causing a visible artifact. (See `docs/AGENT_CONTEXT_DISTILLED.md` §4.4)
- [ ] **Memory Bounds**: High-resolution exports (8k) can hit WebGPU buffer limits or browser memory caps.

### High Priority
- [ ] Investigate occasional cache invalidation issues
- [ ] Fix edge cases in mesh watertightness validation
- [ ] Improve error handling for invalid parameter combinations

### Medium Priority
- [ ] Optimize memory usage for very high-resolution meshes
- [ ] Improve preview performance on low-end hardware
- [ ] Better handling of Unicode in file names

### Low Priority
- [ ] Improve Windows path handling edge cases
- [ ] Better error messages for network issues (library features)
- [ ] Improve handling of very small/large parameter values

---

## 🔌 Integration & Ecosystem

### Integrations
- [ ] FreeCAD plugin
- [ ] Blender add-on
- [ ] OpenSCAD library
- [ ] Thingiverse integration
- [ ] Printables.com integration

### API & SDK
- [ ] REST API for headless operation
- [ ] Command-line interface (CLI)
- [ ] TypeScript/WebGPU API documentation
- [ ] JavaScript/TypeScript bindings
- [ ] Docker containerization

---

## 📊 Analytics & Metrics

### Usage Analytics (Opt-in)
- [ ] Design parameter distributions
- [ ] Popular styles tracking
- [ ] Export format preferences
- [ ] Feature usage statistics
- [ ] Error rate monitoring

### Quality Metrics
- [ ] Code coverage dashboard
- [ ] Performance trend monitoring
- [ ] Bug rate tracking
- [ ] Test execution time tracking
- [ ] Documentation completeness

---

## 🌍 Community & Outreach

### Community Building
- [ ] Create community forum
- [ ] Set up Discord/Slack channel
- [ ] Monthly design challenges
- [ ] User showcase gallery
- [ ] Design sharing platform

### Education & Outreach
- [ ] Create tutorial series
- [ ] Workshop materials for makerspaces
- [ ] Educational license program
- [ ] Collaboration with 3D printing educators
- [ ] Conference presentations

---

## 💼 Commercial Development

### Commercial Features
- [ ] Commercial license management
- [ ] Enterprise support options
- [ ] Custom development services
- [ ] Training and consultation
- [ ] White-label options

### Business Infrastructure
- [ ] Payment processing integration
- [ ] License key generation/validation
- [ ] Customer support system
- [ ] Usage analytics (for commercial users)
- [ ] SLA guarantees

---

## 📝 Process Improvements

### Development Workflow
- [ ] Automated release notes generation
- [ ] Semantic versioning automation
- [ ] Automated changelog updates
- [ ] Branch protection rules
- [ ] Code review guidelines

### Quality Assurance
- [ ] Pre-commit hooks enforcement
- [ ] Automated security scanning
- [ ] Dependency vulnerability scanning
- [ ] License compliance checking
- [ ] Automated performance testing

---

## 🎯 Success Metrics

### v3.2 Goals
- [ ] 100 active users
- [ ] <5 critical bugs reported
- [ ] >95% test coverage
- [ ] <1s average mesh generation time
- [ ] 50+ GitHub stars

### v4.0 Goals
- [ ] 1000+ active users
- [ ] Commercial license sales
- [ ] <0.1% crash rate
- [ ] Active community (forum, Discord)

---

## 🔄 Continuous Improvements

### Ongoing Tasks
- [ ] Monitor and respond to user feedback
- [ ] Regular dependency updates
- [ ] Security patch monitoring
- [ ] Performance optimization
- [ ] Documentation updates
- [ ] Code refactoring
- [ ] Test maintenance
- [ ] Bug triage and fixing

---

**Note:** This TODO list is a living document. Items may be added, removed, or reprioritized based on user feedback, technical constraints, and strategic decisions.

**Contributing:** If you'd like to work on any of these items, please:
1. Check if an issue exists on GitHub
2. Comment on the issue to claim it
3. Follow the [DEVELOPMENT.md](DEVELOPMENT.md) guidelines
4. Submit a pull request when ready

**Questions?** Open a [GitHub Discussion](https://github.com/patij212/PotFoundry-Lite-v2.0/discussions) or [Issue](https://github.com/patij212/PotFoundry-Lite-v2.0/issues).
