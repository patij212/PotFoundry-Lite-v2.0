# Generator Round 1 — Next Development Phase Proposal

**Date**: 2026-03-09
**Agent**: Generator (Claude Opus 4.5)
**Status**: PROPOSAL

---

## Problem Statement

PotFoundry has successfully completed Phase 3f (UniformBlock integration) and R52 documentation. The codebase is in a healthy state:
- `webgpu_core.ts`: ~5300 lines (reduced from ~5500)
- Parametric pipeline: Fully modularized with 25+ dedicated modules in `parametric/`
- Test coverage: Robust (1976+ tests passing as of Phase 3f)

**The question**: What's the highest-value next development phase?

This proposal analyzes three candidate directions and makes a recommendation.

---

## Root Cause Analysis: Why Three Candidates?

### Candidate A: webgpu_core.ts Decomposition Continuation

**Current state**: `webgpu_core.ts` is still the largest file at ~5300 lines despite multiple extraction rounds.

**Remaining subsystems** (approximate line counts from grep analysis):
1. **Camera rig computation** (`getCachedRig`, `buildCameraRig`, view/projection matrices): ~300 lines
2. **Scene extents calculation** (`computeSceneExtents`): ~50 lines
3. **Render loop orchestration**: ~400 lines
4. **Debug overlay management** (`setDebugSegments`, `setDebugPoints`, pipelines): ~150 lines
5. **Parameter validation/merging**: ~100 lines

**Technical assessment**:
- Camera rig is **partially extracted** — `CameraController.ts` handles interaction, but rig *building* still lives in `webgpu_core.ts`
- The `getCachedRig` function is called 9 times from various locations (including VP nudge logic)
- VP nudge logic (~30 lines at L3769) **MUST** remain in webgpu_core.ts per Phase 3f mandate — it mutates `state.rotX` and calls `getCachedRig`

**Extraction risk**: HIGH. The camera rig is deeply coupled to:
- `state.displayRotX/Y` vs `state.rotX/Y` (transient vs persistent)
- `canvasAspect` calculations
- Projection mode switching (ortho vs perspective)
- VP matrix singularity handling

### Candidate B: Export Format Additions (OBJ + 3MF)

**ROADMAP.md v3.2 priorities**:
| Feature | Priority | Effort | Current State |
|---------|----------|--------|---------------|
| OBJ export | High | 2 days | Not started |
| 3MF export | High | 3 days | Not started |
| Export preview dimensions | Medium | 1 day | Not started |

**Technical assessment**:

**OBJ Export** (Text-based, simple):
- ASCII format with vertices, normals, faces
- No packaging required — single `.obj` file
- Implementation path: Add `objExport.ts` alongside existing `stlExport.ts`
- Reuse existing mesh generation pipeline (triangles already computed)
- Estimated: ~150-200 lines

**3MF Export** (XML + ZIP packaging):
- Required: ZIP library (JSZip or similar)
- XML metadata: `3D/3dmodel.model`, `_rels/.rels`, `[Content_Types].xml`
- Mesh format: indexed triangles in XML schema
- Material/color support possible (beyond STL capabilities)
- Estimated: ~400-500 lines + dependency

**Extraction risk**: LOW. Export happens post-mesh-generation. Completely isolated from render pipeline. Clean module boundary.

### Candidate C: User Experience Improvements

**TODO.md High Priority**:
- Keyboard shortcuts (Ctrl+Z, Ctrl+S, etc.)
- Measurement tools (calipers, diameter display)
- Cross-section view mode
- Undo/redo functionality

**Technical assessment**:

**Keyboard Shortcuts**:
- `InputManager.ts` already handles key state
- Need hotkey registry with conflict detection
- Platform-aware (Cmd vs Ctrl on Mac)
- Estimated: ~200 lines for registry + UI bindings

**Measurement Tools**:
- Requires raycasting against mesh (already have `worldRayFromCanvas`, `intersectRayCylinder`)
- UI overlay for dimension display
- 3D annotation rendering (new debug overlay type)
- Estimated: ~500+ lines (new subsystem)

**Cross-Section View**:
- GPU shader modification (clip plane)
- UI controls for plane position/orientation
- Requires changes to WGSL rendering shaders
- Estimated: ~300 lines (moderate risk — shader changes)

**Undo/Redo**:
- Command pattern implementation
- State snapshot system
- Memory management for history stack
- Zustand middleware or custom solution
- Estimated: ~400 lines (touches state management core)

**Extraction risk**: VARIES. Keyboard shortcuts low risk. Measurement tools medium. Cross-section and undo/redo touch core systems.

---

## Proposals

### Proposal 1: OBJ Export First (Conservative)

**Idea**: Implement OBJ export as a quick win, then 3MF as follow-up.

**Mechanism**:
1. Create `potfoundry-web/src/geometry/objExport.ts`
2. Export function: `exportToOBJ(mesh: MeshData): string`
3. Wire into ExportDialog alongside STL option
4. Add E2E test for OBJ output validity

**Mathematical basis**: OBJ is vertex/face list format. We already have:
- `verts: Float32Array` (x,y,z positions)
- `indices: Uint32Array` (triangle indices)
- `normals: Float32Array` (per-vertex normals)

Simple transformation:
```
v x1 y1 z1
v x2 y2 z2
...
vn nx1 ny1 nz1
vn nx2 ny2 nz2
...
f v1//n1 v2//n2 v3//n3
...
```

**Files affected**:
- NEW: `src/geometry/objExport.ts` (~150 lines)
- MODIFY: `src/geometry/stlExport.ts` (shared types/utilities)
- MODIFY: `src/ui/export/ExportDialog.tsx` (format selector)
- NEW: `src/geometry/objExport.test.ts` (~50 lines)

**Trade-offs**:
- ✅ Low risk — isolated from render pipeline
- ✅ High user visibility — commonly requested format
- ✅ Foundation for 3MF (similar mesh access patterns)
- ❌ Doesn't reduce technical debt
- ❌ No architectural improvement

**Assumptions** (for Verifier to attack):
1. Existing mesh data (verts/indices/normals) is sufficient for OBJ
2. No vertex deduplication needed (OBJ handles redundant vertices fine)
3. Winding order matches OBJ conventions (CCW front-facing)

### Proposal 2: 3MF Export with OBJ (Moderate)

**Idea**: Implement both export formats in a single phase.

**Mechanism**:
1. Add JSZip dependency (or similar lightweight ZIP)
2. Create `objExport.ts` first (simpler, validates mesh access patterns)
3. Create `threeMFExport.ts` with proper XML generation
4. Shared `exportUtils.ts` for common operations

**Mathematical basis**: 3MF uses indexed mesh format:
```xml
<mesh>
  <vertices>
    <vertex x="0" y="0" z="0" />
    ...
  </vertices>
  <triangles>
    <triangle v1="0" v2="1" v3="2" />
    ...
  </triangles>
</mesh>
```

**Files affected**:
- NEW: `src/geometry/objExport.ts` (~150 lines)
- NEW: `src/geometry/threeMFExport.ts` (~350 lines)
- NEW: `src/geometry/exportUtils.ts` (~100 lines)
- MODIFY: `package.json` (JSZip dependency)
- MODIFY: `src/ui/export/ExportDialog.tsx`
- NEW: Tests (~150 lines total)

**Trade-offs**:
- ✅ Completes both roadmap items
- ✅ 3MF enables future features (colors, multiple objects, metadata)
- ✅ Still isolated from render pipeline
- ❌ External dependency (JSZip ~100KB)
- ❌ More complex testing (ZIP validation)
- ❌ ~5 days combined effort

**Assumptions**:
1. JSZip is acceptable dependency (Cloudflare Pages compatible)
2. 3MF v1.0 spec sufficient (no need for extensions)
3. Single-material export first (no color data in current mesh)

### Proposal 3: Camera Rig Extraction (Radical — Architectural)

**Idea**: Extract camera rig computation to `CameraRigBuilder.ts`, continuing the decomposition trajectory.

**Mechanism**:
1. Create `src/camera/CameraRigBuilder.ts`
2. Move `buildCameraRig`, `getCachedRig`, rig caching logic
3. Move view/projection matrix utilities (`viewMatrixFromBasis`, `mat4PerspectiveFovLH`, etc.)
4. Keep VP nudge logic in `webgpu_core.ts` (per Phase 3f mandate)
5. CameraRigBuilder exports: `createCameraRig(state, options) => CameraRig`

**Mathematical basis**: Camera rig is a pure function:
- Inputs: state (rotX, rotY, zoom, panX, panY, canvasAspect, projectionMode)
- Outputs: eye position, view matrix, projection matrix, basis vectors
- No side effects (except caching)

**Files affected**:
- NEW: `src/camera/CameraRigBuilder.ts` (~300 lines)
- MODIFY: `src/webgpu_core.ts` (import + delegate, -200 lines)
- MODIFY: `src/camera_controller.ts` (import CameraRigBuilder)
- NEW: `src/camera/CameraRigBuilder.test.ts` (~100 lines)

**Trade-offs**:
- ✅ Continues decomposition momentum
- ✅ Improves testability (pure function extraction)
- ✅ Enables future camera system enhancements
- ❌ High coupling risk (9 call sites)
- ❌ VP nudge creates awkward interface
- ❌ ~3 days effort for ~200 LOC reduction
- ❌ No user-visible improvement

**Assumptions**:
1. Camera rig computation is side-effect free (except caching)
2. VP nudge can call imported function cleanly
3. TypeScript module boundaries don't add overhead

### Proposal 4: Keyboard Shortcuts (User-Facing Quick Win)

**Idea**: Implement a hotkey registry with common shortcuts.

**Mechanism**:
1. Create `src/hooks/useHotkeys.ts` — centralized hotkey registry
2. Define shortcuts: Ctrl+Z (undo stub), Ctrl+Shift+Z (redo stub), R (reset view), 1-6 (view presets)
3. Conflict detection for overlapping bindings
4. UI indicator (bottom bar or tooltip)

**Files affected**:
- NEW: `src/hooks/useHotkeys.ts` (~200 lines)
- MODIFY: `src/InputManager.ts` (delegate to hotkey system)
- MODIFY: `src/App.tsx` (install hotkey provider)
- NEW: Help dialog or keyboard shortcut reference

**Trade-offs**:
- ✅ High user visibility
- ✅ Low technical risk
- ✅ Foundation for undo/redo implementation
- ❌ Undo/redo are stubs without state management work
- ❌ Platform-specific behavior (Mac vs Windows)

---

## Recommended Approach

**Primary Recommendation: Proposal 2 (3MF Export with OBJ)**

### Rationale

1. **Roadmap alignment**: Both OBJ and 3MF are v3.2 High priority items
2. **User value**: Export formats are directly user-facing — people can use the pots they design
3. **Technical safety**: Export is completely isolated from render pipeline
4. **Foundation building**: 3MF's ZIP+XML architecture enables future features (materials, textures, multiple objects)
5. **Momentum preservation**: Quick wins (2-3 days per format) maintain velocity after Phase 3f

### Secondary Recommendation: Proposal 4 (Keyboard Shortcuts)

If export formats are deprioritized, keyboard shortcuts offer high user visibility with low risk.

### NOT Recommended: Camera Rig Extraction (Proposal 3)

The VP nudge constraint creates an awkward interface boundary. The coupling between `getCachedRig` and state mutation is too tight. This extraction would produce marginal LOC reduction (~200 lines) with high regression risk.

**The decomposition trajectory has reached diminishing returns** for camera-related code. Future decomposition should target:
- Gradient rendering (writeGradient function)
- Debug overlay pipeline management
- Parameter validation

These are lower coupling than camera rig.

---

## Risk Assessment

### Proposal 2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| JSZip bundle size | Medium | Low | Lazy-load, use minimal build |
| 3MF spec compliance | Low | Medium | Validate with 3MF reference implementation |
| Winding order mismatch | Low | High | Add explicit winding normalization |
| Memory pressure (large meshes) | Low | Medium | Stream-write for large exports |

### Critical Path Dependencies

1. OBJ must complete before 3MF (validates mesh access patterns)
2. ExportDialog UI changes block both formats
3. No render pipeline changes — completely isolated

---

## Estimated Impact

### Proposal 2 (Recommended)

| Metric | Value |
|--------|-------|
| New LOC | ~600-700 |
| Modified files | 5-6 |
| New dependencies | 1 (JSZip) |
| Test coverage | +150 lines |
| User-visible impact | HIGH |
| Technical debt change | Neutral |
| Estimated effort | 4-5 days |

### Step-by-Step Plan

#### Step 1: OBJ Export Foundation (Day 1-2)
1. Create `src/geometry/objExport.ts`
2. Implement `meshToOBJ(verts, indices, normals): string`
3. Add format option to ExportDialog
4. Write unit tests (golden file comparison)
5. E2E test: export → import in Blender/MeshLab

#### Step 2: Export Utilities (Day 2)
1. Extract shared utilities to `exportUtils.ts`
2. Vertex deduplication (if needed for 3MF)
3. Normal calculation utilities (per-face for OBJ variants)

#### Step 3: 3MF Packaging (Day 3-4)
1. Add JSZip dependency
2. Create `threeMFExport.ts`
3. Implement XML generation for 3D/3dmodel.model
4. Package with proper relationships and content types
5. Unit tests (validate ZIP structure)

#### Step 4: Integration & Polish (Day 5)
1. ExportDialog format selector polishing
2. Progress indicator for ZIP compression
3. Error handling for large meshes
4. Documentation update

---

## Open Questions

1. **JSZip vs pako + manual ZIP**: Should we use full JSZip or lighter pako for deflate?
2. **3MF Extensions**: Should we plan for 3MF Material extension in initial implementation?
3. **OBJ Material Library**: Should `.mtl` file be optional output?
4. **Vertex Deduplication**: Current STL has redundant vertices — should OBJ/3MF dedupe?

---

## Summary Table

| Proposal | Risk | Effort | User Value | Architectural Value | Recommendation |
|----------|------|--------|------------|---------------------|----------------|
| 1: OBJ Only | Low | 2 days | Medium | Low | Secondary |
| 2: OBJ + 3MF | Low | 5 days | High | Low | **PRIMARY** |
| 3: Camera Rig | High | 3 days | None | Medium | NOT recommended |
| 4: Hotkeys | Low | 2 days | Medium | Low | Tertiary |

---

## Appendix: Code Path Traces

### OBJ Export Data Flow
```
ExportDialog (onClick) 
  → meshBuilder.buildMesh(params, quality) 
  → { verts: Float32Array, indices: Uint32Array, normals: Float32Array }
  → objExport.meshToOBJ(verts, indices, normals)
  → "v x y z\n..." string
  → Blob → download
```

### 3MF Export Data Flow
```
ExportDialog (onClick)
  → meshBuilder.buildMesh(params, quality)
  → { verts, indices, normals }
  → threeMFExport.createPackage(verts, indices, normals)
  → JSZip instance with:
     - 3D/3dmodel.model (XML)
     - _rels/.rels
     - [Content_Types].xml
  → JSZip.generateAsync('blob')
  → download
```

### Camera Rig Call Sites (for reference, NOT recommended for extraction)
1. L2354 `resolveInteractionRig()`
2. L2383 `buildCameraRig helper`
3. L2890 `arcball drag`
4. L2963 `arcball inertia`
5. L3360 `turntable drag`
6. L3407 `turntable inertia`
7. L3669 `render loop`
8. L3769 `VP nudge rebuild`
