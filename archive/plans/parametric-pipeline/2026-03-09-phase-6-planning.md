# Phase 6 — Large Structural Work Planning

**Date:** 2026-03-09  
**Status:** PLANNING  
**Author:** Master Agent  

---

## Overview

Phase 6 contains the high-risk, high-effort items from the Known Issues audit that require dedicated planning cycles. These cannot be done opportunistically — each requires architecture design, phased implementation, and careful validation.

| Item | Description | Est. Effort | Risk | Dependencies |
|------|-------------|-------------|------|--------------|
| **III-1** | webgpu_core.ts decomposition | 20+ hours (4 phases) | HIGH | webgpu_core.ts `as any` elimination |
| **VII-1** | Mobile responsiveness | Multi-sprint | Moderate | None |
| **VII-2** | OBJ/3MF export formats | 2-3 days each | Low | None |

---

## III-1: webgpu_core.ts Decomposition

### Current State

`webgpu_core.ts` is a **5500+ line monolith** containing:
- GPU initialization (~400 lines)
- Buffer management (~600 lines)
- Input/event handlers (~800 lines)
- Axis overlay helper (~200 lines)
- Render loop (~1000 lines)
- Mesh generation interface (~500 lines)
- Camera state management (~400 lines)
- Shader uniform marshalling (~600 lines)
- Debug tooling (~300 lines)
- Miscellaneous utilities (~700 lines)

The file has **54 `as any` casts** and deep internal coupling where functions at line 5400 reference closures from line 2100.

### Prerequisite: `as any` Elimination

Before decomposition, eliminate type-safety gaps that would propagate to extracted modules.

**Proposal created:** `generator-round-1-webgpu-core-as-any.md`
**Estimated effort:** 4 hours
**Status:** Awaiting Verifier review

### Decomposition Strategy (Proposed)

**Phase 1: Extract Axis Overlay (~200 lines) → `AxisOverlay.ts`**
- Self-contained 2D canvas rendering
- Minimal dependencies on main render state
- Low risk — clearly bounded scope
- Est: 2-3 hours + validation

**Phase 2: Extract Input Handlers (~800 lines) → `InputManager.ts`**
- Pointer, touch, keyboard, wheel events
- Requires interface for camera state updates
- Moderate risk — event subscription lifecycle
- Est: 4-6 hours + validation

**Phase 3: Extract Buffer Management (~600 lines) → `BufferLayout.ts`**
- Uniform buffer construction, vertex buffer management
- Requires explicit typed interfaces for buffer schemas
- Moderate risk — GPU synchronization concerns
- Est: 4-6 hours + validation

**Phase 4: Type Controller Interface → Discriminated unions**
- Replace `updateParams: (payload: any)` with typed payloads
- Requires auditing all call sites across React components
- High risk — API surface change
- Est: 3-4 hours + validation

### Success Criteria

- [ ] Each extracted module is independently testable
- [ ] No `as any` casts in extracted modules
- [ ] `npm run typecheck` passes after each phase
- [ ] `npm test` (89 files, 1903 tests) passes after each phase
- [ ] Main render loop unchanged in behavior
- [ ] DevTools integration preserved

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Closure scope breaks | Create explicit state object passed to extracted modules |
| Type narrowing loss | Define discriminated unions before extraction |
| Test coverage gaps | Add integration tests before each phase |
| Render loop regression | Visual regression testing via Playwright screenshots |

---

## VII-1: Mobile Responsiveness

### Current State

- Control panels designed for desktop (fixed width, mouse interactions)
- Touch targets too small for mobile
- No responsive breakpoints in CSS
- V2 UI (`AppUIv2.tsx`) has no mobile layout variant

### Scope

1. **CSS Breakpoints** — Add responsive styles for common mobile widths (320px, 375px, 414px)
2. **Touch-Friendly Controls** — Increase hit targets to minimum 44x44px
3. **Panel Reorganization** — Collapsible/stackable panels on mobile
4. **WebGPU Canvas Sizing** — Handle resize on orientation change

### Approach

**Option A: CSS-Only Progressive Enhancement**
- Add Tailwind/CSS media queries to existing components
- Minimal code changes
- Some layout compromises
- Est: 1-2 sprints

**Option B: Adaptive Layout with Mobile Variants**
- Create mobile-specific component variants
- Optimal UX but more code
- Higher maintenance burden
- Est: 2-3 sprints

**Recommended:** Option A initially, evolve to Option B if user feedback demands.

### Dependencies

- None (can proceed in parallel with III-1)

---

## VII-2: OBJ/3MF Export Formats

### Current State

- Only binary STL export supported
- Export pipeline: `ParametricExportComputer.ts` → `exportSTL()` → binary ArrayBuffer

### OBJ Export (Est. 2-3 days)

**Format:** Wavefront OBJ (text-based)
- Vertex positions: `v x y z`
- Normals: `vn nx ny nz`
- Faces: `f v1//n1 v2//n2 v3//n3`

**Implementation:**
1. Add `exportOBJ()` function parallel to `exportSTL()`
2. Text assembly from same vertex/triangle data
3. Optional: MTL material file for color

**Complexity:** Low — format is straightforward ASCII

### 3MF Export (Est. 2-3 days)

**Format:** 3D Manufacturing Format (ZIP with XML)
- `[Content_Types].xml` — MIME types
- `3D/3dmodel.model` — Mesh XML
- Optional: Texture/color data

**Implementation:**
1. Add JSZip or pako dependency for ZIP creation
2. Generate XML mesh description
3. Package into 3MF archive

**Complexity:** Moderate — XML schema compliance, ZIP packaging

### Dependencies

- None (can proceed in parallel with other work)

---

## Implementation Schedule

### Immediate (This Week)

| Item | Assignee | Est. |
|------|----------|------|
| webgpu_core.ts `as any` elimination (Phase 0 for III-1) | Executioner | 4h |
| Verifier review of as-any proposal | Verifier | 1h |

### Next Sprint

| Item | Assignee | Est. |
|------|----------|------|
| III-1 Phase 1: Extract AxisOverlay | Executioner | 2-3h |
| III-1 Phase 2: Extract InputManager | Executioner | 4-6h |
| VII-2: OBJ export | Executioner | 2-3d |

### Following Sprint

| Item | Assignee | Est. |
|------|----------|------|
| III-1 Phase 3: Extract BufferLayout | Executioner | 4-6h |
| III-1 Phase 4: Type Controller Interface | Executioner | 3-4h |
| VII-1: Mobile responsiveness start | Executioner | 1-2 sprints |
| VII-2: 3MF export | Executioner | 2-3d |

---

## Open Questions (For Generator/Verifier Cycle)

1. **III-1 Extraction Order:** Should BufferLayout come before InputManager? Buffer state is more foundational.

2. **VII-1 Framework Choice:** CSS-only vs. dedicated mobile components? Cost/benefit analysis needed.

3. **VII-2 3MF Complexity:** Include color/texture support in initial implementation, or phase it?

4. **webgpu_core.ts Test Coverage:** Current tests cover public API. Need unit tests for internal functions before extraction?

---

## Agent Sign-off

_Awaiting Generator/Verifier/Executioner review of this planning document._

### Master Note (2026-03-09)

This document establishes the roadmap for Phase 6 work. The critical path is:

```
webgpu_core.ts `as any` elimination → III-1 Phase 1 → III-1 Phase 2 → ...
```

The `as any` work is a **prerequisite** — decomposing a file with 54 type-safety gaps would propagate those gaps to all extracted modules.

VII-1 and VII-2 can proceed in parallel with III-1 as they have no technical dependencies.
