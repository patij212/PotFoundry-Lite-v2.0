# PotFoundry Architecture Documentation

> **Comprehensive technical guide for the PotFoundry parametric pot design system**

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Web Application (potfoundry-web)](#web-application-potfoundry-web)
4. [Python Core (potfoundry)](#python-core-potfoundry)
5. [Integration Points](#integration-points)
6. [Design Decisions](#design-decisions)
7. [Development Guide](#development-guide)

---

## Overview

PotFoundry is a parametric 3D pot generator with two main components:

| Component | Purpose | Technology |
|-----------|---------|------------|
| **potfoundry-web** | Primary user-facing web application | React, TypeScript, WebGPU |
| **potfoundry** | Core geometry engine and utilities | Python, NumPy |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PotFoundry System                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    potfoundry-web (PRIMARY)                          │   │
│  │                                                                       │   │
│  │  • WebGPU-based 3D rendering                                         │   │
│  │  • React + TypeScript frontend                                        │   │
│  │  • Zustand state management                                           │   │
│  │  • Supabase auth + Stripe payments                                    │   │
│  │  • Cloudflare Pages deployment                                        │   │
│  │                                                                       │   │
│  │  📖 See: potfoundry-web/ARCHITECTURE.md                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    potfoundry (Core Engine)                          │   │
│  │                                                                       │   │
│  │  • Parametric geometry computation (NumPy)                           │   │
│  │  • Style functions (5 artistic styles)                               │   │
│  │  • Binary STL export                                                  │   │
│  │  • Pydantic v2 schema validation                                     │   │
│  │  • Batch processing (YAML API)                                       │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    pfui (Legacy Streamlit UI)                        │   │
│  │                                                                       │   │
│  │  ⚠️ Deprecated - Use potfoundry-web instead                          │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## System Architecture

### Directory Structure

```
PotFoundry-Lite-v2.0/
│
├── potfoundry-web/              # 🌐 PRIMARY: Web Application
│   ├── src/
│   │   ├── App.tsx              # Main React component
│   │   ├── webgpu_core.ts       # WebGPU engine (5,200+ LOC)
│   │   ├── camera_controller.ts # Camera system (1,240 LOC)
│   │   ├── state/               # Zustand stores (slices)
│   │   ├── hooks/               # Custom hooks
│   │   ├── ui/                  # React components
│   │   └── context/             # React contexts
│   ├── README.md
│   └── ARCHITECTURE.md          # 📖 Detailed web app docs
│
├── potfoundry/                  # 🐍 Core Python Library
│   ├── __init__.py              # Public API
│   ├── geometry.py              # Mesh generation engine
│   ├── schema.py                # Pydantic validation
│   ├── yaml_api.py              # Batch processing
│   └── core/
│       ├── geometry.py          # Alternative implementation
│       └── io/stl.py            # Binary STL writer
│
├── pfui/                        # ⚠️ Legacy Streamlit UI
│   └── (deprecated)
│
├── tests/                       # 🧪 Test Suite
│   ├── test_*.py                # 68+ test files
│   └── pfui/                    # UI tests
│
├── docs/                        # 📚 Documentation
│   ├── guides/                  # Development guides
│   └── ...
│
└── archive/                     # 📦 Historical files
```

---

## Web Application (potfoundry-web)

> **The primary user-facing product**

### Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| Framework | React 18 | Component UI |
| Language | TypeScript 5.5 | Type safety |
| 3D Engine | WebGPU + WGSL | GPU rendering |
| State | Zustand | State management |
| Build | Vite 5.4 | Dev server & bundling |
| Auth | Supabase | User authentication |
| Payments | Stripe | Subscriptions |
| Deploy | Cloudflare Pages | Edge hosting |

### Key Modules

| Module | LOC | Purpose |
|--------|-----|---------|
| `webgpu_core.ts` | 5,200+ | WebGPU device, pipelines, render loop |
| `camera_controller.ts` | 1,240 | Arcball, orbit, free camera modes |
| `state/store.ts` | 290 | Zustand store combining slices |
| `hooks/useRendererBridge.ts` | 696 | State → WebGPU synchronization |
| `ui/controls/*.tsx` | 8 panels | User interface controls |

### Data Flow

```
User Input → Zustand Store → useRendererBridge → WebGPU Controller → GPU
```

### Documentation

📖 **See [potfoundry-web/ARCHITECTURE.md](potfoundry-web/ARCHITECTURE.md)** for complete details including:
- Rendering pipeline
- Camera system
- State management patterns
- Authentication flow
- Extension guides

---

## Python Core (potfoundry)

> **UI-agnostic geometry engine**

### Design Principles

1. **No UI dependencies** — Can be used standalone, in scripts, or any UI
2. **Pure computation** — Geometry generation as functions
3. **Type-safe** — Pydantic v2 schemas for all configurations
4. **Tested** — 99 tests with regression coverage

### Key APIs

```python
from potfoundry import build_pot_mesh, write_stl_binary, STYLES

# Generate mesh
r_outer_fn, description = STYLES["SuperformulaBlossom"]
verts, faces, diag = build_pot_mesh(
    H=120,           # Height (mm)
    Rt=70,           # Top radius (mm)
    Rb=50,           # Bottom radius (mm)
    t_wall=3,        # Wall thickness
    t_bottom=3,      # Bottom thickness
    r_drain=10,      # Drain hole radius
    expn=1.1,        # Flare exponent
    n_theta=168,     # Angular resolution
    n_z=84,          # Height resolution
    r_outer_fn=r_outer_fn,
    style_opts={"a": 1.0, "b": 1.0, "m": 5, ...}
)

# Export to STL
write_stl_binary("pot.stl", "FlowerPot", verts, faces)
```

### Geometry Engine (`geometry.py`)

#### Style Functions

Each style modulates the radius at angle `θ` and height `z`:

```python
def r_outer_superformula_blossom(theta, z, r0, H, opts):
    """Gielis superformula creates petal-like variations."""
    m = opts.get('m', 5)
    n1, n2, n3 = opts.get('n1', 2), opts.get('n2', 7), opts.get('n3', 7)
    # ... superformula computation
    return r0 * modulation
```

| Style | Algorithm | Visual Effect |
|-------|-----------|---------------|
| SuperformulaBlossom | Gielis superformula | Petal variations |
| FourierBloom | Fourier series | Organic curves |
| SpiralRidges | Helical modulation | Spiral ridges |
| SuperellipseMorph | Lamé curves | Smooth superellipse |
| HarmonicRipple | Harmonic frequencies | Wave patterns |

#### Mesh Construction

1. **Outer wall**: Stacked circles with style modulation
2. **Inner wall**: Outer radius minus wall thickness
3. **Top rim**: Bridge between outer and inner edges
4. **Bottom**: Sloped surface with drain hole
5. **Triangulation**: Vectorized face generation

### STL Export (`core/io/stl.py`)

Binary STL format (50 bytes per triangle):

```python
def write_stl_binary(path, name, vertices, faces, normals=None):
    """Write watertight mesh to binary STL.
    
    Features:
    - Atomic writes (temp file → fsync → rename)
    - Auto-computed normals if not provided
    - Little-endian float32 per spec
    """
```

### Schema Validation (`schema.py`)

Pydantic v2 models for strict configuration:

```python
class DefaultsModel(BaseModel):
    height: PositiveFloat = 120.0
    top_od: PositiveFloat = 140.0
    bottom_od: PositiveFloat = 90.0
    wall: PositiveFloat = 3.0
    # ... with validation
```

### Batch Processing (`yaml_api.py`)

```yaml
# config.yaml
version: 2
outdir: "output"
defaults:
  height: 120
  top_od: 140
recipes:
  - name: "small_terracotta"
    preset: "terracotta"
    height: 80
```

```bash
python -m potfoundry.yaml_api config.yaml
```

---

## Integration Points

### Web App ↔ Python Core

Currently, the web app has its own WebGPU-based geometry generation that mirrors the Python implementation. The relationship is:

| Aspect | Web App | Python Core |
|--------|---------|-------------|
| Geometry | WGSL shaders | NumPy functions |
| Style params | TypeScript mapping | Python dicts |
| Export | Browser STL | Node.js/Python STL |
| Use case | Real-time preview | Server/batch processing |

### Shared Concepts

Both implementations share:
- **Style parameter names** (consistent across codebases)
- **Geometry formulas** (mathematically equivalent)
- **STL format** (binary, watertight)

---

## Design Decisions

### Why WebGPU (not WebGL)?

| Factor | WebGL | WebGPU |
|--------|-------|--------|
| Performance | Good | Excellent |
| Compute shaders | ❌ | ✅ |
| Modern API | Legacy | Current standard |
| GPU features | Limited | Full access |

WebGPU enables all geometry computation on the GPU.

### Why Zustand (not Redux/Context)?

| Factor | Redux | Zustand | Context |
|--------|-------|---------|---------|
| Boilerplate | High | Low | None |
| Performance | Good | Excellent | Poor |
| DevTools | ✅ | ✅ | Limited |
| Bundle | 7KB | 1.2KB | 0 |

Zustand's slice pattern provides Redux-like organization with minimal overhead.

### Why Separate Web App?

The original Streamlit UI had limitations:
- Full page reruns on every interaction
- Slow preview performance
- No offline capability
- Limited mobile support

The WebGPU app provides:
- 60+ FPS performance
- Real-time parameter updates
- Modern React architecture
- PWA potential

---

## Development Guide

### Web App Development

```bash
cd potfoundry-web
npm install
npm run dev         # Dev server at localhost:5173
npm run build       # Production build
npm run typecheck   # TypeScript verification
npm run lint        # ESLint
```

### Python Development

```bash
# Setup
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Testing
PYTHONPATH=. pytest -v

# Linting
ruff check .
ruff check . --fix

# Type checking
mypy potfoundry/
```

### Adding a New Style

**In Web App:**
1. Add style ID in `useRendererBridge.ts`
2. Define schema in `state/slices/style.ts`
3. Implement in WGSL shader

**In Python Core:**
1. Create style function in `geometry.py`
2. Register in `STYLES` dict
3. Add tests in `tests/`

---

## Performance Targets

| Metric | Target | Achieved |
|--------|--------|----------|
| Preview FPS | 60 | ✅ 60+ |
| Mesh generation (web) | <50ms | ✅ ~50ms |
| Mesh generation (Python) | <200ms | ✅ ~130ms |
| STL export (Python) | <100ms | ✅ ~15ms |
| Test suite | 100% pass | ✅ 99 tests |

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [potfoundry-web/README.md](potfoundry-web/README.md) | Web app setup & usage |
| [potfoundry-web/ARCHITECTURE.md](potfoundry-web/ARCHITECTURE.md) | Web app technical details |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Development workflows |
| [CODE_QUALITY_GUIDE.md](CODE_QUALITY_GUIDE.md) | Coding standards |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |

---

*Last Updated: December 2024*
*Version: 2.0*
