# Verifier Round 1 — Critique of OBJ + 3MF Export Proposal

**Date**: 2026-03-09  
**Agent**: Verifier (Claude Opus 4.5)  
**Status**: ACCEPT WITH CRITICAL AMENDMENTS

---

## Summary Verdict: ACCEPT WITH CRITICAL AMENDMENTS

The Generator's proposal contains a **critical factual error**: 3MF export is NOT "Not started" — **it is fully implemented and operational**. The proposal's scope, effort estimate, and implementation plan are based on this incorrect premise.

---

## Critique

### C1 [CRITICAL]: 3MF Export Already Exists — Generator Missed Existing Implementation

**Generator's claim:** "3MF export | High | 3 days | Not started"

**Actual behavior:** 3MF export is **fully implemented** in `src/geometry/exporters/export3MF.ts` (275 lines).

**Evidence:**
```typescript
// src/geometry/exporters/export3MF.ts L1-20
/**
 * 3MF Export - Modern 3D Manufacturing Format export
 *
 * 3MF is a ZIP-based format that offers:
 * - 50-66% smaller files than binary STL (due to shared vertices + ZIP compression)
 * - Better precision (string-based coordinates)
 * - Material and color support (future extensibility)
 * - Native support in modern slicers (Cura, PrusaSlicer, etc.)
 */

import JSZip from 'jszip';
```

The file includes:
- `exportTo3MF()` function (L198-248)
- `download3MF()` function (L253-273)
- `generateModelXML()` with streaming support for large meshes (L64-193)
- `estimate3MFSize()` utility (L278-295)
- Proper XML templates for `[Content_Types].xml`, `_rels/.rels`, and `3D/3dmodel.model`

Furthermore, `stlExport.ts` already routes to 3MF:
```typescript
// src/geometry/stlExport.ts L35-37
if (format === '3mf') {
    const { exportTo3MF } = await import('./exporters/export3MF');
    return exportTo3MF(mesh, { name });
}
```

**Impact:** The Generator's 3-day estimate for 3MF implementation is obsolete. The work is already done.

**Required fix:** Generator must acknowledge existing implementation and reframe the proposal.

---

### C2 [CRITICAL]: UI Format Selector is Dead — Known Bug P0-B

**Generator's claim:** "Wire into ExportDialog alongside STL option" (implies UI work needed)

**Actual behavior:** The UI format selector **already exists** but is non-functional. This is documented as **P0-B** in `docs/audits/ui-v2-audit-2026-03-07.md`:

```
P0-B · Export format selector is dead UI — "3MF" selection has zero effect
```

**Evidence from audit:**
```tsx
// ExportTab.tsx L125 — local state, never leaves component
const [format, setFormat] = useState<ExportFormat>('stl');

// StatusFooter.tsx L79 — always STL
await exportSTL();    // ignores format entirely
```

**Evidence from codebase:**
```tsx
// src/ui/v2/tabs/ExportTab.tsx L66-69
type ExportFormat = 'stl' | '3mf';

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'stl', label: 'STL', description: 'Universal 3D print format' },
  { value: '3mf', label: '3MF', description: 'Modern format with metadata' },
];
```

The UI exists (lines 175-188 of ExportTab.tsx), but `format` state never reaches the export call.

**Documented fix (from audit):**
1. Add `exportFormat` to `src/state/slices/ui.ts`
2. ExportTab: replace `useState('stl')` with store selector
3. `useExport.ts`: add `format` param to `exportSTL()`
4. `StatusFooter.tsx`: read format from store, pass to export
5. Confirm not persisted (resets to 'stl' on reload)

**Impact:** This is a 5-file wiring task (~30-50 lines total), not a multi-day implementation.

**Required fix:** Generator must incorporate this documented fix instead of proposing new UI work.

---

### C3 [WARNING]: OBJ Export Scope Underestimated for Quality Parity

**Generator's claim:** "OBJ Export (~150-200 lines)"

**Verification:** Plausible for basic OBJ, but to achieve parity with the existing export infrastructure:

1. **Streaming export** for large meshes (current STL has `generateStreamingSTL`)
2. **Normal options** (per-vertex vs per-face normals)
3. **Material library** (.mtl) consideration
4. **Progress callbacks** like 3MF has `onProgress`

The minimal OBJ is ~80-100 lines. A production-quality implementation matching 3MF's feature set is ~200-250 lines.

**Required fix:** Specify OBJ feature scope. Recommend starting minimal and iterating.

---

### C4 [NOTE]: Winding Order Question — Already Solved

**Generator's open question:** "Winding order — is current mesh CCW front-facing?"

**Answer:** YES. The mesh uses CCW winding, guaranteed by `emitTriCCW()` in OuterWallTessellator.ts:

```typescript
// src/renderers/webgpu/parametric/OuterWallTessellator.ts L210-229
function emitTriCCW(
    buf: number[],
    a: number, b: number, c: number,
    verts: Float32Array,
): void {
    const au = verts[a * 3], at = verts[a * 3 + 1];
    const bu = verts[b * 3], bt = verts[b * 3 + 1];
    const cu = verts[c * 3], ct = verts[c * 3 + 1];
    const cross = (bu - au) * (ct - at) - (cu - au) * (bt - at);
    if (Math.abs(cross) < 1e-12) {
        buf.push(0, 0, 0); // degenerate
    } else if (cross >= 0) {
        buf.push(a, b, c);
    } else {
        buf.push(a, c, b);  // swap for CCW
    }
}
```

This is reinforced by `CODE_QUALITY_GUIDE.md`:
> "Face winding is consistent (counter-clockwise when viewed from outside)"

**OBJ convention:** CCW is front-facing by default. No winding normalization needed.

---

### C5 [NOTE]: Vertex Deduplication Question — Not Needed

**Generator's open question:** "Vertex deduplication — needed or redundant vertices acceptable?"

**Answer:** Current mesh already uses indexed format with shared vertices. The 3MF export directly uses `mesh.indices`, which reference shared vertices. STL is per-triangle (no indexing), but that's inherent to the STL format, not a data issue.

**Evidence:**
```typescript
// src/geometry/exporters/export3MF.ts L97-100
for (let i = 0; i < triangleCount; i++) {
    const v1 = indices[i * 3];
    const v2 = indices[i * 3 + 1];
    const v3 = indices[i * 3 + 2];
```

For OBJ, the same indexed format will produce optimal output. No deduplication required.

---

### C6 [NOTE]: JSZip vs pako Question — Already Decided

**Generator's open question:** "JSZip vs pako + manual ZIP — which is lighter?"

**Answer:** JSZip is already integrated and operational:
```typescript
// src/geometry/exporters/export3MF.ts L17
import JSZip from 'jszip';
```

Switching to pako would require rewriting. No action needed.

---

### C7 [WARNING]: Effort Estimate is 4x Too High

**Generator's estimate:** "4-5 days"

**Corrected estimate:**

| Task | Actual Effort |
|------|---------------|
| OBJ export implementation | 1-1.5 days |
| UI wiring (P0-B fix) | 0.5 days |
| Tests | 0.5 days |
| **Total** | **2-2.5 days** |

3MF implementation effort: **0 days** (already done).

---

## Accepted Items

### ✅ Export isolation claim verified

The export pathway is indeed isolated from the render pipeline:
- Export reads from `MeshData` (vertices, indices, triangleCount)
- No render state dependencies
- `stlExport.ts` and `export3MF.ts` are pure data transformation functions

### ✅ Roadmap alignment verified

ROADMAP.md v3.2 does list OBJ/3MF as High priority.

### ✅ Low technical risk verified

Export formats are output-only transforms. Failure cannot corrupt rendering.

---

## Open Questions for Generator

1. **Why was `export3MF.ts` missed?** Did the search methodology not include `src/geometry/exporters/`?
2. **Was the audit document reviewed?** The P0-B fix is fully documented with line numbers.
3. **Should OBJ include .mtl support?** The Generator mentioned it as an open question but didn't propose a decision.

---

## Implementation Conditions (ACCEPT)

The proposal is **ACCEPTED** with these mandatory amendments:

### Amendment A1: Acknowledge 3MF exists
Remove all 3MF implementation tasks. 3MF is operational except for UI wiring.

### Amendment A2: Incorporate P0-B fix
Replace "Add UI format selector" with the documented 5-step P0-B fix from the audit.

### Amendment A3: Update effort estimate
Revise from 4-5 days to 2-2.5 days.

### Amendment A4: Define OBJ scope
Specify:
- Minimal OBJ (vertices, normals, faces) for V1
- Optional: .mtl file, progress callback, streaming for V2

### Amendment A5: Add tests for existing 3MF
Before shipping, add tests for `export3MF.ts` which currently has no test file.

---

## Revised Implementation Plan for Executioner

### Phase 1: OBJ Export (1-1.5 days)
1. Create `src/geometry/exporters/exportOBJ.ts` (~150 lines)
2. Wire into `stlExport.ts` routing (like 3MF)
3. Add `src/geometry/exporters/exportOBJ.test.ts`

### Phase 2: UI Wiring (0.5 days)
Follow P0-B fix:
1. Add `exportFormat` to store
2. Wire ExportTab to store
3. Pass format through `useExport` → `downloadMesh()`
4. StatusFooter reads format from store

### Phase 3: Validation (0.5 days)
1. Add `export3MF.test.ts`
2. E2E: export both formats, validate file structure
3. Manual test: import into Blender/PrusaSlicer

---

## Signature

**Verifier verdict:** ACCEPT WITH CRITICAL AMENDMENTS

The Generator's **directional recommendation** (OBJ + 3MF as next phase) is sound. The **implementation details** require significant correction due to the missed existing 3MF implementation and documented P0-B fix.

The Executioner should proceed with the revised plan above, not the Generator's original proposal.
