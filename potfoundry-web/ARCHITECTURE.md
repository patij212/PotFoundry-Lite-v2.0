# 🏗️ PotFoundry Web Architecture

> **Professional documentation for the WebGPU-powered parametric 3D pot designer**

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Core Modules](#core-modules)
4. [State Management](#state-management)
5. [Rendering Pipeline](#rendering-pipeline)
6. [Camera System](#camera-system)
7. [Authentication & Payments](#authentication--payments)
8. [Data Flow](#data-flow)
9. [Design Decisions](#design-decisions)
10. [Extension Guide](#extension-guide)

---

## Overview

PotFoundry Web is a **browser-based parametric 3D pot designer** built with cutting-edge web technologies. It generates customizable flower pots in real-time using WebGPU for GPU-accelerated rendering.

### Key Characteristics

| Aspect | Implementation |
|--------|----------------|
| **Rendering** | WebGPU (WGSL shaders) |
| **Framework** | React 18 with TypeScript |
| **State** | Zustand (slice pattern) |
| **Build** | Vite 5.4 |
| **Auth** | Supabase |
| **Payments** | Stripe Subscriptions |
| **Deployment** | Cloudflare Pages (edge) |

### Design Philosophy

1. **GPU-First**: All geometry computation runs on the GPU via WGSL shaders
2. **Reactive**: UI state drives rendering through unidirectional data flow
3. **Modular**: Clean separation between rendering, state, and UI layers
4. **Type-Safe**: Full TypeScript with strict mode enabled

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              React Application                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         UI Layer (ui/)                                   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │ │
│  │  │ Dimension    │ │ Style        │ │ Appearance   │ │ Export       │    │ │
│  │  │ Controls     │ │ Controls     │ │ Controls     │ │ Panel        │    │ │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘    │ │
│  └─────────┼────────────────┼────────────────┼────────────────┼────────────┘ │
│            │                │                │                │              │
│            └────────────────┴────────────────┴────────────────┘              │
│                                      │                                        │
│                                      ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    State Layer (state/)                                  │ │
│  │  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐ ┌────────────┐ │ │
│  │  │ geometry │ │   style   │ │   mesh    │ │ appearance │ │     ui     │ │ │
│  │  │  slice   │ │   slice   │ │   slice   │ │   slice    │ │   slice    │ │ │
│  │  └──────────┘ └───────────┘ └───────────┘ └────────────┘ └────────────┘ │ │
│  │              ▲                                                           │ │
│  │              │ persist to localStorage                                   │ │
│  └──────────────┼───────────────────────────────────────────────────────────┘ │
│                 │                                                             │
│                 ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    Bridge Layer (hooks/)                                 │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ useRendererBridge                                                 │   │ │
│  │  │ • Subscribes to Zustand state changes                            │   │ │
│  │  │ • Converts state to WebGPU params                                │   │ │
│  │  │ • Debounces rapid updates                                        │   │ │
│  │  └───────────────────────────────┬──────────────────────────────────┘   │ │
│  └──────────────────────────────────┼──────────────────────────────────────┘ │
│                                     │                                        │
│                                     ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    Rendering Layer                                       │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ WebGPU Controller (webgpu_core.ts - 5,200+ LOC)                  │   │ │
│  │  │ • Device/pipeline initialization                                  │   │ │
│  │  │ • Mesh generation (GPU compute)                                   │   │ │
│  │  │ • Uniform buffer management                                       │   │ │
│  │  │ • Render loop (requestAnimationFrame)                            │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ Camera Controller (camera_controller.ts - 1,240 LOC)             │   │ │
│  │  │ • Arcball rotation                                                │   │ │
│  │  │ • Orbit/pan/zoom                                                  │   │ │
│  │  │ • Free camera (WASD)                                              │   │ │
│  │  │ • Inertia & tweening                                              │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                     │                                        │
│                                     ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         GPU Pipeline                                     │ │
│  │  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐         │ │
│  │  │ Vertex Shader  │ -> │Fragment Shader │ -> │   Canvas       │         │ │
│  │  │ (WGSL)         │    │ (WGSL)         │    │   Output       │         │ │
│  │  └────────────────┘    └────────────────┘    └────────────────┘         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Modules

### `webgpu_core.ts` — Rendering Engine (5,200+ LOC)

The heart of PotFoundry's 3D rendering system.

#### Responsibilities

| Function | Description |
|----------|-------------|
| `mount()` | Initialize WebGPU device, create pipelines, start render loop |
| `updateParams()` | Accept new parameters, update uniform buffers |
| `dispose()` | Clean up GPU resources |
| `exportSTL()` | Generate STL binary for download |

#### Key Components

```typescript
// Initialization
const controller = await mount({
  canvas: canvasElement,
  initialParams: { H: 120, top_od: 140, ... },
  emit: (event) => console.log(event),
});

// Update parameters
controller.updateParams({ H: 150, styleId: 2 });

// Export STL
const stlBlob = controller.exportSTL({ quality: 'high' });

// Cleanup
controller.dispose();
```

#### Mesh Generation

The mesh is generated entirely on the GPU using WGSL compute shaders:

1. **Vertex Generation**: Parametric equations compute (x, y, z) positions
2. **Style Application**: Style functions modulate radius based on angle/height
3. **Normal Calculation**: Per-vertex normals for lighting
4. **Index Buffer**: Triangulation of the pot surface

#### Chain Strip Mesh Pipeline (Export)

The export path uses a CPU-based parametric mesh pipeline to guarantee watertight STL output. Feature chains (peaks, valleys) detected by the GPU are stitched into the outer wall mesh via a multi-stage process:

1. **Feature-Only Constraints** (`OuterWallTessellator.ts`): Chain edges are filtered to only include feature-to-feature edges (both endpoints have `pointIdx >= 0`). Support edges are no longer emitted.

2. **Graded Transition Vertices** (`insertGradedTransitionVertices()`): Instead of the legacy 8-pass density system, a single grading function inserts transition vertices around each feature edge. Vertices are spaced in concentric rings (3–5 rings) with geometrically increasing spacing (ratio 1.5×), ensuring smooth element-size transitions between fine chain-strip triangles and coarse grid cells.

3. **Stretch-Aware Spacing** (`estimateCircumferentialStretch()`): At each height `t`, the local circumferential stretch `R(t)/Rmin` is computed from the pot's parametric profile (`Rb`, `Rt`, `expn`). Graded vertex spacing is divided by this factor so that 3D triangle quality remains uniform even on flared pots.

4. **CDT Triangulation** (`ChainStripTriangulator.ts`): Each row band containing chain vertices is triangulated using Constrained Delaunay Triangulation (CDT). Constraint edges enforce feature chain connectivity. A sweep fallback handles degenerate cases.

5. **3D Quality Metrics** (`ChainStripOptimizer.ts`): After mesh construction, `computeChainStrip3DQuality()` analyzes chain-strip triangles in 3D space, reporting minimum angle, aspect ratio distribution, and area-ratio grading violations.

Key files:
- `OuterWallTessellator.ts` — Grid construction, chain vertex insertion, graded transitions
- `ChainStripTriangulator.ts` — CDT/sweep triangulation per row band
- `ChainStripOptimizer.ts` — Mesh diagnostics and 3D quality analysis
- `ParametricExportComputer.ts` — Full export pipeline orchestration

---

### `camera_controller.ts` — Camera System (1,240 LOC)

Sophisticated 3D camera with multiple interaction modes.

#### Camera Modes

| Mode | Description | Controls |
|------|-------------|----------|
| **Arcball** | Natural object inspection | Drag to rotate, scroll to zoom |
| **Orbit** | Traditional orbit camera | Left-drag rotate, right-drag pan |
| **Free** | First-person navigation | WASD + mouse look |

#### Key Features

```typescript
interface CameraController {
  // Mode switching
  setPayload(params: { cameraMode: 'arcball' | 'orbit' | 'free' }): void;
  
  // Arcball rotation with inertia
  applyArcballDelta(dx: number, dy: number): void;
  transferArcballInertia(): void; // Momentum after release
  
  // Free camera
  applyFreeLookRotation(dx: number, dy: number): void;
  applyFreeKeyboardInput(deltaMs: number): boolean;
  
  // Focus tweening
  focusOnPoint(target: Vec3, duration?: number): void;
  cancelFocusTween(): void;
}
```

#### Camera Math Utilities (`camera_basis.ts`)

- Quaternion operations (multiply, invert, slerp)
- Basis vectors (right, up, forward)
- Matrix construction for view transforms

---

### `state/store.ts` — Centralized State

Zustand store combining all slices with middleware.

```typescript
export const useAppStore = create<AppStore>()(
  devtools(           // Redux DevTools integration
    persist(          // LocalStorage persistence
      subscribeWithSelector((...a) => ({
        ...createGeometrySlice(...a),
        ...createStyleSlice(...a),
        ...createMeshSlice(...a),
        ...createAppearanceSlice(...a),
        ...createUISlice(...a),
        ...createPerformanceSlice(...a),
      })),
      { name: 'potfoundry-store' }
    )
  )
);
```

---

## State Management

### Slice Architecture

Each domain has its own slice with state and actions:

```
state/
├── store.ts           # Combined store
├── types.ts           # Type definitions
└── slices/
    ├── geometry.ts    # Pot dimensions (H, diameter, wall, drain)
    ├── style.ts       # Style selection & parameters
    ├── mesh.ts        # Resolution (n_theta, n_z)
    ├── appearance.ts  # Colors, lighting, wireframe
    ├── ui.ts          # Panel state, modals, fullscreen
    └── performance.ts # FPS, generation time metrics
```

### Slice Pattern

```typescript
// Example: geometry slice
export interface GeometrySlice {
  geometry: GeometryParams;
  setGeometryParam: (key: keyof GeometryParams, value: number) => void;
  setGeometryParams: (params: Partial<GeometryParams>) => void;
  resetGeometry: () => void;
  validateGeometry: () => ValidationResult;
}

export const createGeometrySlice: StateCreator<GeometrySlice> = (set, get) => ({
  geometry: DEFAULT_GEOMETRY,
  
  setGeometryParam: (key, value) => set((state) => ({
    geometry: { ...state.geometry, [key]: value }
  })),
  
  // ... other actions
});
```

### Persisted State

Only user preferences are persisted (not transient UI state):

```typescript
const PERSISTED_KEYS: (keyof AppStore)[] = [
  'geometry',    // Pot dimensions
  'style',       // Style selection
  'mesh',        // Quality settings
  'appearance',  // Colors, lighting
  // 'ui' and 'performance' are NOT persisted
];
```

---

## Rendering Pipeline

### Frame Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. requestAnimationFrame callback                               │
├─────────────────────────────────────────────────────────────────┤
│ 2. Check for parameter changes (dirty flags)                    │
├─────────────────────────────────────────────────────────────────┤
│ 3. If dirty: Update uniform buffers                             │
│    • Geometry params (H, Rt, Rb, t_wall, ...)                  │
│    • Style params (48-element float array)                      │
│    • Camera matrix (view-projection)                            │
│    • Colors, lighting                                           │
├─────────────────────────────────────────────────────────────────┤
│ 4. Execute render pass                                          │
│    • Bind pipeline                                              │
│    • Set bind groups (uniforms)                                 │
│    • Draw indexed (vertex buffer, index buffer)                 │
├─────────────────────────────────────────────────────────────────┤
│ 5. Present to canvas                                            │
├─────────────────────────────────────────────────────────────────┤
│ 6. Update performance metrics                                   │
└─────────────────────────────────────────────────────────────────┘
```

### WGSL Shader Structure

```wgsl
// Uniform buffer layout
struct Uniforms {
  mvp: mat4x4<f32>,           // Model-view-projection matrix
  modelMatrix: mat4x4<f32>,   // For normal transformation
  H: f32,                     // Pot height
  Rt: f32,                    // Top radius
  Rb: f32,                    // Bottom radius
  // ... 40+ more parameters
  styleParams: array<f32, 48>, // Style-specific parameters
}

@vertex
fn vertexMain(@location(0) position: vec3f, ...) -> VertexOutput {
  // Apply parametric pot equation
  // Apply style modulation
  // Transform to clip space
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  // Phong lighting
  // Color gradient (bottom -> mid -> top)
  // Output final color
}
```

---

## Camera System

### Arcball Rotation

The arcball provides intuitive rotation by projecting mouse movements onto a virtual sphere:

```
         ┌──────────────┐
        /              /|
       /    Sphere    / |
      /     ────     /  |
     /      ○ ←────/── Mouse ray intersection
    /              /   |
   └──────────────┘    |
   |              |    /
   |   Canvas     |   /
   |              |  /
   └──────────────┘─/
```

1. Convert screen coordinates to normalized device coordinates
2. Project onto unit sphere (or hyperbolic sheet if outside)
3. Compute rotation quaternion from start → current position
4. Apply to camera orientation

### Inertia System

After mouse release, momentum continues the rotation:

```typescript
// On pointer up
if (velocity > threshold) {
  inertiaAxis = normalize(angularVelocity);
  inertiaSpeed = magnitude(angularVelocity);
}

// Each frame
if (inertiaSpeed > 0) {
  const decay = exp(-friction * dt);
  inertiaSpeed *= decay;
  rotation = applyRotation(inertiaAxis, inertiaSpeed * dt);
}
```

---

## Authentication & Payments

### Auth Flow (Supabase)

```
┌─────────┐    ┌─────────────┐    ┌──────────────┐
│  User   │───>│ AuthModal   │───>│   Supabase   │
│         │    │             │    │   Auth API   │
└─────────┘    └─────────────┘    └──────────────┘
                     │                    │
                     │  onAuthChange      │
                     │<───────────────────│
                     │
                     ▼
              ┌─────────────┐
              │ AuthContext │
              │             │
              │ • user      │
              │ • session   │
              │ • profile   │
              └─────────────┘
```

**Supported Methods**:
- Email/password
- Magic link (passwordless)
- OAuth (Google, GitHub, etc.)

### Subscription Flow (Stripe)

```
┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  User   │───>│ PricingModal │───>│ Edge Func   │───>│  Stripe  │
│ clicks  │    │              │    │ (checkout)  │    │ Checkout │
│ "Pro"   │    └──────────────┘    └─────────────┘    └──────────┘
└─────────┘                                                  │
                                                             │
     ┌───────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   Webhook    │───>│  Supabase   │───>│ AuthContext  │
│  (success)   │    │  profiles   │    │  refreshes   │
└──────────────┘    └─────────────┘    └──────────────┘
```

## Data Flow

### Parameter Update Flow

```
User drags slider
       │
       ▼
┌──────────────────────┐
│ DimensionControls    │
│ setGeometryParam('H')│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Zustand Store        │
│ geometry.H = newVal  │
└──────────┬───────────┘
           │
           │ subscribe()
           ▼
┌──────────────────────┐
│ useRendererBridge    │
│ • Debounce 16ms      │
│ • Convert to params  │
└──────────┬───────────┘
           │
           │ controller.updateParams()
           ▼
┌──────────────────────┐
│ WebGPU Controller    │
│ • Mark dirty         │
│ • Update uniforms    │
│ • Trigger re-render  │
└──────────────────────┘
```

### Design Load Flow (Library)

```
User selects design
       │
       ▼
┌──────────────────────┐
│ LibraryPanel         │
│ loadDesign(entry)    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ syncStoreFromParams  │
│ • geometry.H = ...   │
│ • style.name = ...   │
│ • appearance = ...   │
└──────────┬───────────┘
           │
           │ (triggers subscriptions)
           ▼
┌──────────────────────┐
│ useRendererBridge    │
│ (automatic sync)     │
└──────────────────────┘
```

---

## Design Decisions

### Why WebGPU?

| Factor | WebGL | WebGPU |
|--------|-------|--------|
| **Performance** | Good | Excellent |
| **Compute shaders** | No | Yes |
| **Modern API** | Legacy | Current |
| **Future-proof** | Deprecated | Standard |

WebGPU enables all geometry computation on the GPU, resulting in 60+ FPS even with complex meshes.

### Why Zustand?

| Factor | Redux | Zustand | Context |
|--------|-------|---------|---------|
| **Boilerplate** | High | Low | None |
| **Performance** | Good | Excellent | Poor |
| **DevTools** | Yes | Yes | Limited |
| **Bundle size** | Large | 1.2KB | None |

Zustand's slice pattern provides Redux-like organization with minimal overhead.

### Why Supabase + Stripe?

- **Supabase**: Open-source Firebase alternative with excellent DX
- **Stripe**: Industry-standard payments with subscription management
- **Edge Functions**: Serverless backend on Cloudflare Workers

---

## Extension Guide

### Adding a New Style

1. **Define style ID** in `hooks/useRendererBridge.ts`:
```typescript
const STYLE_NAME_TO_ID: Record<string, number> = {
  ...,
  'NewStyle': 5, // New ID
};
```

2. **Add schema** in `state/slices/style.ts`:
```typescript
const STYLE_SCHEMAS: Record<StyleName, StyleSchema[]> = {
  ...,
  NewStyle: [
    { key: 'ns_param1', label: 'Parameter 1', min: 0, max: 1, default: 0.5 },
  ],
};
```

3. **Map parameters** in `useRendererBridge.ts`:
```typescript
case 'NewStyle': {
  styleParams[0] = getNum(opts.ns_param1, 0.5);
  break;
}
```

4. **Implement shader logic** in WGSL (potfoundry/wgsl/pot_preview.wgsl)

### Adding a New Control Panel

1. Create component in `ui/controls/`:
```typescript
// ui/controls/NewPanel.tsx
export function NewPanel() {
  const { someValue } = useAppStore((s) => s.newSlice);
  return <div>...</div>;
}
```

2. Add to `AppUI.tsx` tab system

3. Create corresponding Zustand slice in `state/slices/`

### Adding a New Export Format

1. Extend `hooks/useExport.ts`:
```typescript
export function useExport() {
  const exportOBJ = useCallback(() => {
    // Generate OBJ format
  }, []);
  
  return { exportSTL, exportOBJ };
}
```

2. Add UI button in `ExportPanel.tsx`

---

## Performance Considerations

### Optimization Strategies

1. **Debounced updates**: Slider changes debounced at 16ms (~60fps)
2. **Selective subscriptions**: Components only subscribe to needed state
3. **GPU-side computation**: Mesh generation on GPU, not CPU
4. **Lazy rendering**: Only re-render when uniforms change
5. **Memoization**: React.memo() for expensive components

### Performance Monitoring

```typescript
// state/slices/performance.ts
interface PerformanceState {
  fps: number;
  generationTime: number;
  triangleCount: number;
  vertexCount: number;
}
```

Available in UI via `usePerformance()` hook.

---

## File Reference

| File | LOC | Purpose |
|------|-----|---------|
| `webgpu_core.ts` | 5,200+ | WebGPU rendering engine |
| `camera_controller.ts` | 1,240 | 3D camera system |
| `camera_basis.ts` | 600+ | Quaternion/matrix math |
| `state/store.ts` | 290 | Zustand store setup |
| `hooks/useRendererBridge.ts` | 696 | State → WebGPU sync |
| `context/AuthContext.tsx` | 500+ | Authentication |
| `ui/controls/*.tsx` | 8 files | Control panels |

---

*Last Updated: December 2025*
*Version: 3.0*
