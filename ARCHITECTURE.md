# PotFoundry Architecture

**Version:** 3.1.0 (WebGPU Era)
**Last Updated:** February 2026

## 1. System Overview

PotFoundry uses a **modern client-side architecture** centered around WebGPU for high-performance 3D generation.

### Primary Components

1.  **PotFoundry Web (`potfoundry-web/`)**
    *   **Role**: The production application.
    *   **Tech Stack**: React, TypeScript, WebGPU, WGSL, Zustand, Vite.
    *   **Responsibility**: UI, State Management, Real-time 3D Rendering, Mesh Generation, STL Export.
    *   **Status**: **ACTIVE** (Main Product).

2.  **Python Core (`potfoundry/`)**
    *   **Role**: Reference implementation and geometric backend.
    *   **Tech Stack**: Python 3.10+, NumPy, Pydantic v2.
    *   **Responsibility**: Prototyping algorithms, verifying mathematical correctness, generating "golden" test data.
    *   **Status**: **REFERENCE ONLY** (Not used in the active web app).

> **Note**: The legacy Streamlit UI (`pfui/`) and `app.py` have been archived.

---

## 2. Web Application Architecture

See [potfoundry-web/ARCHITECTURE.md](potfoundry-web/ARCHITECTURE.md) for the deep-dive into the frontend internals.

**Key principles:**
*   **Client-Side computation**: Nothing is sent to a server. Mesh generation happens in the browser.
*   **Reactive State**: Zustand stores drive the UI and GPU buffers.
*   **Compute Shaders**: Heavy geometry logic is pushed to WGSL compute shaders.

---

## 3. Data Flow

```mermaid
graph TD
    User[User Interaction] -->|Zustand Action| Store[App Store]
    Store -->|Updates| ReactUI[React Components]
    Store -->|Updates| WebGPU[WebGPU Renderer]
    
    subgraph WebGPU Engine
        WebGPU -->|Dispatch| Compute[Compute Shaders]
        Compute -->|Write| Buffers[GPU Buffers]
        Buffers -->|Draw| Vertex[Vertex Shader]
        Vertex -->|Fragment| Screen[Canvas]
    end
    
    subgraph Export Pipeline
        User -->|Click Export| Worker[Web Worker]
        Worker -->|Math| CPUGen[TS/WASM Generation]
        CPUGen -->|Bytes| STL[Binary STL]
        STL -->|Download| Disk[User File]
    end
```

### 3.1 The "Hybrid" Pipeline
While the preview is purely GPU-based, the Export process uses a CPU+GPU hybrid pipeline (in `ParametricExportComputer.ts`) to ensure watertight meshes with precise feature tracking. See `docs/AGENT_CONTEXT_DISTILLED.md` §3 for the full 9-step pipeline architecture.
1.  **Speed**: 60fps Preview via WebGPU.
2.  **Accuracy**: Watertight, valid STL via comprehensive CPU checks for Export.

---

## 4. Directory Structure

### Primary Component: `potfoundry-web/`
The **React + TypeScript + WebGPU** application. This is the entire product.

### Archived Reference: `archive/legacy_python/`
The original Python Core (`potfoundry/`) and its tests (`tests/`). This code is **not used by the app**. It is kept purely for mathematical reference if needed.


---

## 5. Development Philosophy

1.  **Browser First**: All features must run in a standard browser (Chrome/Edge/Firefox Nightly) without backend dependencies.
2.  **Type Safety**: Strict TypeScript throughout. No `any`.
3.  **Performance**: Zero-copy where possible. Use TypedArrays.
4.  **Math Purity**: Algorithms should be mathematically derived (e.g. Superformula) rather than approximate.

---
