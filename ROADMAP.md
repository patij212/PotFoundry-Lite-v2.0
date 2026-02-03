# PotFoundry Roadmap

## Executive Summary

This document outlines the evolution of PotFoundry from its origins to the current WebGPU-powered web application and future plans.

**Current Status (v3.1.0):** Production-ready WebGPU React web application with real-time 3D preview, Supabase authentication, and Stripe subscriptions.

**Future Vision (v4.0):** Enhanced web platform with marketplace, mobile optimization, and community features.

> **Note**: The legacy Python/Streamlit UI and Qt Desktop plans have been archived. The project is effectively a "Web Platform" now.

---

## Current State (v3.1.0 - Feb 2026)

### ✅ Production Web Application

1. **WebGPU Rendering Engine**
   - 5,200+ lines of TypeScript
   - GPU-accelerated mesh generation
   - 60+ FPS real-time preview
   - WGSL shader-based geometry computation

2. **Advanced Camera System**
   - Arcball rotation with natural tumbling
   - Orbit mode with pan/zoom
   - Free camera with WASD + mouse look
   - Smooth inertia animations

3. **Complete UI Suite**
   - 8 control panels (Dimensions, Style, Mesh, Appearance, Camera, Export, Presets, Library)
   - Radix UI primitives for accessibility
   - Zustand state management with persistence
   - Responsive design

4. **5 Artistic Styles**
   - SuperformulaBlossom
   - FourierBloom
   - SpiralRidges
   - SuperellipseMorph
   - HarmonicRipple

5. **Export & Quality**
   - Binary STL export (optimized for 3D printing)
   - Multiple quality levels (Low → Ultra)
   - Watertight, manifold meshes

6. **Platform Features**
   - Supabase authentication (email, magic link, OAuth)
   - Stripe subscription management
   - Design presets and library
   - Cloudflare Pages deployment

---

## Near-Term Roadmap (v3.2 - v3.5)

### v3.2 - Export Enhancements (Q1 2026)

| Feature | Priority | Effort |
|---------|----------|--------|
| OBJ export format | High | 2 days |
| 3MF export format | High | 3 days |
| Export preview dimensions | Medium | 1 day |
| Batch export | Medium | 2 days |

### v3.3 - UI/UX Improvements (Q1 2026)

| Feature | Priority | Effort |
|---------|----------|--------|
| Mobile-responsive controls | High | 3 days |
| Keyboard shortcuts panel | Medium | 1 day |
| Dark/light theme toggle | Medium | 2 days |
| Undo/redo support | Medium | 3 days |
| Parameter locking | Low | 1 day |

### v3.4 - Advanced Styles (Q2 2026)

| Feature | Priority | Effort |
|---------|----------|--------|
| LowPolyFacet (dedicated shader) | High | 3 days |
| Voronoi pattern style | Medium | 4 days |
| User-defined style parameters | Medium | 3 days |
| Style blending | Low | 2 days |

### v3.5 - Community Features (Q2 2026)

| Feature | Priority | Effort |
|---------|----------|--------|
| Public design gallery | High | 5 days |
| Design sharing (public links) | High | 2 days |
| User profiles | Medium | 3 days |
| Design comments/ratings | Low | 3 days |

---

## Long-Term Roadmap (v4.0)

### v4.0 - Platform Evolution (2026-2027)

#### Marketplace
- [ ] Design marketplace for selling/buying designs
- [ ] Creator monetization (revenue sharing)
- [ ] Premium designs and collections
- [ ] License management

#### Advanced Features
- [ ] Real-time collaboration
- [ ] Design version history
- [ ] AI-assisted design suggestions
- [ ] Physical print integration (services API)

#### Mobile & PWA
- [ ] Progressive Web App (PWA) support
- [ ] Offline mode
- [ ] Touch-optimized camera controls
- [ ] Mobile export workflow

#### Plugin System
- [ ] Custom style plugins
- [ ] Export format plugins
- [ ] Third-party integrations
- [ ] Developer API

---

## Technical Debt & Improvements

### Code Quality
- [ ] Increase TypeScript strict mode coverage
- [ ] Add end-to-end tests (Playwright)
- [ ] Improve error handling and recovery
- [ ] Performance profiling and optimization

### Documentation
- [x] Web app README.md
- [x] Web app ARCHITECTURE.md
- [/] Consolidated Agents Guide (`agents.md`)
- [ ] API documentation
- [ ] User guide / tutorial

### Infrastructure
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Automated testing on PR
- [ ] Staging environment
- [ ] Performance monitoring

---

## Version History

| Version | Date | Focus |
|---------|------|-------|
| v1.0 | 2024 | Initial Streamlit app (Archived) |
| v2.0 | 2025 | Binary STL, schema validation |
| v3.0 | 2025 | WebGPU React web app |
| v3.1 | 2026 | Documentation cleanup, Polish |
| v3.2+ | 2026 | Enhanced export, Community |
| v4.0 | 2027 | Marketplace, Mobile, Plugins |

---

*Last Updated: February 2026*
*Version: 3.1.0*
