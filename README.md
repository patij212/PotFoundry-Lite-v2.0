# 🏺 PotFoundry

**Parametric 3D plant pot designer with GPU-accelerated WebGPU rendering.**

Design beautiful, customizable flower pots in your browser. Adjust dimensions, choose artistic styles, and export production-ready STL files for 3D printing.

[![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-ff6b6b)](https://www.w3.org/TR/webgpu/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)]()

> **License & Commercial Use**
>
> - Free for **hobby, educational, and noncommercial use** under [PolyForm Noncommercial 1.0.0](LICENSE)
> - **Commercial use** requires a commercial license — see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)

---

## ✨ Features

### 🎨 Real-Time 3D Design
- **5 Artistic Styles**: SuperformulaBlossom, FourierBloom, SpiralRidges, SuperellipseMorph, HarmonicRipple
- **Live Parameter Control**: Instant feedback as you adjust dimensions and style options
- **WebGPU Rendering**: 60+ FPS GPU-accelerated rendering

### 📐 Full Parametric Control
| Parameter | Description |
|-----------|-------------|
| Height | Total pot height |
| Top/Bottom Diameter | Control the taper |
| Wall Thickness | Structural strength |
| Drainage Hole | Customizable drain size |
| Flare | Profile curvature |
| Spin/Twist | Helical rotation effects |

### 🎥 Advanced Camera System
- **Arcball Mode**: Natural rotation for inspection
- **Orbit Mode**: Classic pan/zoom/rotate
- **Free Mode**: WASD + mouse for first-person navigation
- **Smooth Inertia**: Momentum-based animations

### 💳 Built-In Monetization
- **Supabase Auth**: Email, magic links, OAuth
- **Stripe Subscriptions**: Free/Pro tiers with feature gating
- **Design Library**: Save, share, and publish designs

### 📦 Export
- **STL Export**: Binary format optimized for 3D printing
- **Multiple Quality Levels**: Low to Ultra resolution
- **Watertight Meshes**: Production-ready for slicing

---

## 🚀 Quick Start

### Web App (Primary)

```bash
cd potfoundry-web
npm install
npm run dev
```

Opens at **http://localhost:5173/** 

> 📖 See [potfoundry-web/README.md](potfoundry-web/README.md) for full documentation

### Requirements
- Node.js 18+
- Modern browser with WebGPU (Chrome 113+, Edge 113+, Firefox Nightly)

---

## 📁 Project Structure

```
PotFoundry/
├── potfoundry-web/              # 🌐 Main Web Application
│   ├── src/
│   │   ├── webgpu_core.ts       # WebGPU rendering (5,200+ LOC)
│   │   ├── camera_controller.ts # 3D camera system (1,240 LOC)
│   │   ├── state/               # Zustand state management
│   │   ├── hooks/               # React hooks
│   │   ├── ui/                  # UI components
│   │   └── context/             # React contexts (Auth, Library)
│   ├── README.md                # Web app documentation
│   └── ARCHITECTURE.md          # Technical architecture
│
├── potfoundry/                  # 🐍 Python Core Library
│   ├── geometry.py              # Mesh generation engine
│   ├── core/io/stl.py           # Binary STL writer
│   └── schema.py                # Pydantic validation
│
├── pfui/                        # 🎛️ Legacy Streamlit UI
│   └── (deprecated - see potfoundry-web)
│
├── tests/                       # 🧪 Test Suite (99 tests)
│   ├── test_*.py                # Unit & integration tests
│   └── pfui/                    # UI component tests
│
└── docs/                        # 📚 Additional Documentation
    └── guides/                  # Development guides
```

---

## 🔧 Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **3D Rendering** | WebGPU + WGSL Shaders |
| **State** | Zustand (slice pattern) |
| **UI** | Radix UI + Lucide Icons |
| **Auth** | Supabase |
| **Payments** | Stripe |
| **Deployment** | Cloudflare Pages |
| **Core Engine** | Python (NumPy, Pydantic) |

---

## 🎨 Available Styles

| Style | Description |
|-------|-------------|
| **SuperformulaBlossom** | Petal-like variations using Gielis superformula |
| **FourierBloom** | Organic shapes with Fourier series |
| **SpiralRidges** | Helical patterns with ridge variations |
| **SuperellipseMorph** | Smooth, rounded superellipse shapes |
| **HarmonicRipple** | Wave-like ripples with harmonic frequencies |

Each style has customizable parameters for unique designs.

---

## 📊 Performance

| Metric | Target | Achieved |
|--------|--------|----------|
| Preview FPS | 60 | ✅ 60+ |
| Mesh generation | <100ms | ✅ ~50ms |
| STL export | <100ms | ✅ ~15ms |
| Page load (gzip) | <200KB | ✅ ~167KB |

---

## 📚 Documentation

### Web Application
- **[potfoundry-web/README.md](potfoundry-web/README.md)** — Setup, features, development
- **[potfoundry-web/ARCHITECTURE.md](potfoundry-web/ARCHITECTURE.md)** — System design, modules, data flow

### Development
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — Development setup and workflows
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Contribution guidelines
- **[CODE_QUALITY_GUIDE.md](CODE_QUALITY_GUIDE.md)** — Coding standards

### Reference
- **[CHANGELOG.md](CHANGELOG.md)** — Version history
- **[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)** — Commercial licensing

---

## 🧪 Testing

```bash
# Python tests (core geometry)
pip install pytest pytest-cov
PYTHONPATH=. pytest -v

# TypeScript tests (web app)
cd potfoundry-web
npm run test
```

**Test Coverage**: 99 tests, 100% pass rate

---

## 🛠️ Development

### Web App Development

```bash
cd potfoundry-web
npm run dev         # Start dev server
npm run build       # Production build
npm run lint        # Run ESLint
npm run typecheck   # TypeScript check
```

### Python Core Development

```bash
# Linting
pip install ruff
ruff check .
ruff check . --fix

# Type checking
pip install mypy
mypy potfoundry/
```

---

## 🚀 Deployment

### Cloudflare Pages (Recommended)

1. Connect GitHub repository
2. Configure:
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - **Root directory**: `potfoundry-web`
3. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_STRIPE_PUBLISHABLE_KEY`
4. Deploy!

---

## 🔮 Roadmap

### Current (v2.1)
- ✅ WebGPU-powered web application
- ✅ 5 artistic styles with live control
- ✅ Supabase auth + Stripe subscriptions
- ✅ STL export with quality options

### Near-term (v2.2-2.5)
- [ ] Additional export formats (OBJ, 3MF)
- [ ] Design marketplace
- [ ] Mobile optimization
- [ ] More artistic styles

### Long-term (v3.0)
- [ ] Qt desktop application
- [ ] Plugin system
- [ ] Community features

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/patij212/PotFoundry-Lite-v2.0/issues)
- **Discussions**: [GitHub Discussions](https://github.com/patij212/PotFoundry-Lite-v2.0/discussions)
- **Commercial**: See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)

---

## 🙏 Acknowledgments

Built with:
- [React](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/)
- [WebGPU](https://www.w3.org/TR/webgpu/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [Radix UI](https://www.radix-ui.com/)
- [Supabase](https://supabase.com/)
- [Stripe](https://stripe.com/)
- [Vite](https://vitejs.dev/)

---

*Last Updated: December 2024*
