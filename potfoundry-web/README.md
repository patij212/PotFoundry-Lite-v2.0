# 🏺 PotFoundry Web

**A cutting-edge WebGPU-powered parametric 3D pot designer running entirely in your browser.**

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-ff6b6b)](https://www.w3.org/TR/webgpu/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)](https://vitejs.dev/)

---

## ✨ Features

### 🎨 Real-Time 3D Design
- **5 Artistic Styles**: SuperformulaBlossom, FourierBloom, SpiralRidges, SuperellipseMorph, HarmonicRipple
- **Live Parameter Control**: Adjust dimensions, style options, and appearance in real-time
- **WebGPU Rendering**: GPU-accelerated rendering at 60+ FPS

### 📐 Full Parametric Control
- **Dimensions**: Height, top/bottom diameter, wall thickness, drainage hole
- **Style Options**: Per-style parameters (amplitude, frequency, phase, etc.)
- **Mesh Quality**: Resolution control (n_theta × n_z)
- **Appearance**: Colors, lighting, wireframe overlay

### 🎥 Advanced Camera System
- **Arcball Mode**: Natural rotation around the pot
- **Orbit Mode**: Classic orbit camera with pan/zoom
- **Free Mode**: WASD + mouse for first-person navigation
- **Inertia**: Smooth deceleration for natural feel

### 💳 Monetization Ready
- **Supabase Auth**: Email/password, magic link, OAuth providers
- **Stripe Subscriptions**: Free/Pro tiers with seamless checkout
- **Feature Gating**: Export quality tiers based on subscription

### 📦 Export
- **STL Export**: Binary format optimized for 3D printing
- **Multiple Quality Levels**: Low, Medium, High, Ultra, Custom
- **Watertight Meshes**: Production-ready for slicing

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Modern browser with WebGPU support (Chrome 113+, Edge 113+, Firefox Nightly)

### Installation

```bash
# Navigate to the web app directory
cd potfoundry-web

# Install dependencies
npm install

# Start development server
npm run dev
```

The app opens at **http://localhost:5173/** (or the next available port).

### Build for Production

```bash
npm run build     # Creates dist/ folder
npm run preview   # Preview production build locally
```

---

## 🏗️ Project Structure

```
potfoundry-web/
├── src/
│   ├── App.tsx                 # Main application component
│   ├── main.tsx                # Entry point
│   │
│   ├── webgpu_core.ts          # 🎮 WebGPU rendering engine (5,200+ LOC)
│   ├── camera_controller.ts    # 📷 Camera system (1,240 LOC)
│   ├── camera_basis.ts         # Camera math utilities
│   ├── camera_constants.ts     # Camera configuration
│   ├── camera_helpers.ts       # Ray casting utilities
│   │
│   ├── types.ts                # Core TypeScript types
│   ├── types.d.ts              # Ambient type declarations
│   │
│   ├── state/                  # 📊 Zustand state management
│   │   ├── store.ts            # Combined store with middleware
│   │   ├── types.ts            # State type definitions
│   │   └── slices/             # State slices
│   │       ├── geometry.ts     # Pot dimensions
│   │       ├── style.ts        # Style selection & params
│   │       ├── mesh.ts         # Mesh quality settings
│   │       ├── appearance.ts   # Colors, lighting, wireframe
│   │       ├── ui.ts           # Panel state, modals
│   │       └── performance.ts  # Metrics tracking
│   │
│   ├── hooks/                  # 🪝 Custom React hooks
│   │   ├── useRendererBridge.ts    # Syncs Zustand → WebGPU controller
│   │   ├── useExport.ts            # STL export logic
│   │   ├── useExportTier.ts        # Subscription-based export limits
│   │   ├── useKeyboardShortcuts.ts # Keyboard navigation
│   │   └── usePerformanceTracker.ts
│   │
│   ├── context/                # 🔌 React contexts
│   │   ├── AuthContext.tsx     # Supabase authentication
│   │   ├── ControllerContext.tsx   # WebGPU controller access
│   │   └── LibraryContext.tsx  # Design library management
│   │
│   ├── ui/                     # 🎨 UI components
│   │   ├── AppUI.tsx           # Main UI container
│   │   ├── controls/           # Control panels
│   │   │   ├── DimensionControls.tsx
│   │   │   ├── StyleControls.tsx
│   │   │   ├── MeshControls.tsx
│   │   │   ├── AppearanceControls.tsx
│   │   │   ├── CameraControls.tsx
│   │   │   ├── ExportPanel.tsx
│   │   │   ├── PresetPanel.tsx
│   │   │   └── LibraryPanel.tsx
│   │   ├── layout/             # Layout components
│   │   │   ├── Toolbar.tsx
│   │   │   └── ...
│   │   ├── auth/               # Authentication UI
│   │   │   ├── AuthModal.tsx
│   │   │   └── UserMenu.tsx
│   │   ├── pricing/            # Subscription UI
│   │   │   └── PricingModal.tsx
│   │   └── shared/             # Reusable components
│   │       ├── Slider.tsx
│   │       ├── Select.tsx
│   │       ├── Button.tsx
│   │       └── Toast.tsx
│   │
│   ├── services/               # 🔗 External services
│   │   └── supabase.ts         # Supabase client
│   │
│   ├── geometry/               # 📐 Mesh generation
│   │   └── ...
│   │
│   ├── presets/                # 💾 Preset definitions
│   │   └── ...
│   │
│   └── infra/                  # 🛠️ Infrastructure
│       └── logging/            # Debug utilities
│
├── functions/                  # ⚡ Edge functions (Cloudflare)
├── supabase/                   # 🗄️ Supabase config & migrations
├── dist/                       # 📦 Production build output
├── index.html                  # HTML entry point
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Dependencies & scripts
```

---

## 🔧 Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| **Framework** | React 18.3 | Component-based UI |
| **Language** | TypeScript 5.5 | Type-safe development |
| **Build** | Vite 5.4 | Fast dev server & bundling |
| **3D Rendering** | WebGPU | GPU-accelerated rendering |
| **State** | Zustand 5.0 | Lightweight state management |
| **UI Components** | Radix UI | Accessible primitives |
| **Icons** | Lucide React | Modern icon library |
| **Auth** | Supabase | Authentication & database |
| **Payments** | Stripe | Subscription management |
| **Deployment** | Cloudflare Pages | Edge hosting |

---

## 🎮 Architecture Overview

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
│  (DimensionControls, StyleControls, AppearanceControls...)  │
└─────────────────────────┬───────────────────────────────────┘
                          │ dispatch actions
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Zustand Store                             │
│  ┌──────────┬─────────┬────────┬────────────┬─────────────┐ │
│  │ geometry │  style  │  mesh  │ appearance │     ui      │ │
│  └──────────┴─────────┴────────┴────────────┴─────────────┘ │
│              persisted to localStorage                       │
└─────────────────────────┬───────────────────────────────────┘
                          │ useRendererBridge
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  WebGPU Controller                           │
│  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ webgpu_core  │  │ camera_controller│  │  WGSL Shaders  │ │
│  │  (5,200 LOC) │  │   (1,240 LOC)   │  │                 │ │
│  └──────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      GPU Pipeline                            │
│            (Vertex Buffer → Shader → Canvas)                │
└─────────────────────────────────────────────────────────────┘
```

### Key Modules

#### `webgpu_core.ts` (5,200+ LOC)
The heart of the rendering system:
- WebGPU device initialization and pipeline setup
- Mesh generation (parametric pot geometry)
- Shader compilation (WGSL)
- Render loop management
- Uniform buffer updates
- Export functionality

#### `camera_controller.ts` (1,240 LOC)
Sophisticated 3D camera system:
- **Arcball rotation**: Natural tumbling motion
- **Orbit mode**: Traditional orbit controls
- **Free mode**: WASD + mouse look
- **Inertia**: Momentum-based animations
- **Focus tweening**: Smooth camera transitions

#### `state/store.ts`
Centralized state management with:
- **Slices**: Modular state organization
- **Persistence**: LocalStorage sync for preferences
- **DevTools**: Redux DevTools integration (dev mode)
- **Subscriptions**: Efficient partial updates

---

## 🎨 Control Panels

| Panel | Description |
|-------|-------------|
| **Dimensions** | Height, diameter, wall thickness, drainage |
| **Style** | Select style, adjust per-style parameters |
| **Mesh** | Resolution (n_theta × n_z), quality presets |
| **Appearance** | Colors, gradients, lighting, wireframe |
| **Camera** | Mode selection, reset, presets |
| **Export** | STL download with quality options |
| **Presets** | Save/load design configurations |
| **Library** | Browse/publish community designs |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F11` | Toggle fullscreen |
| `W/A/S/D` | Move camera (Free mode) |
| `Shift` | Boost movement speed |
| `R` | Reset camera |
| `1-5` | Camera presets |

---

## 📦 Deployment

### Cloudflare Pages (Recommended)

1. Connect GitHub repository
2. Configure:
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - **Root directory**: `potfoundry-web`
3. Set environment variables in Cloudflare dashboard
4. Deploy!

### Manual Upload

```bash
npm run build
# Upload dist/ folder to any static host
```

---

## 📊 Build Stats

| Asset | Size | Gzipped |
|-------|------|---------|
| JavaScript | ~523 KB | ~159 KB |
| CSS | ~48 KB | ~8 KB |
| **Total** | ~571 KB | **~167 KB** |

---

## 🧪 Development

### Commands

```bash
npm run dev         # Start dev server
npm run build       # Production build
npm run preview     # Preview production build
npm run lint        # Run ESLint
npm run typecheck   # Run TypeScript compiler
npm run format      # Format with Prettier
npm run test        # Run Vitest tests
```

### Code Style

- ESLint + Prettier for formatting
- TypeScript strict mode
- React 18 best practices
- Zustand slice pattern for state

---

## 📄 License

- **Noncommercial Use**: [PolyForm Noncommercial 1.0.0](../LICENSE)
- **Commercial Use**: See [COMMERCIAL-LICENSE.md](../COMMERCIAL-LICENSE.md)

---

## 🔗 Links

- [Main Repository](../)
- [Architecture Documentation](./ARCHITECTURE.md)
- [API Documentation](../docs/)

---

*Last Updated: December 2025*
