# Executioner Feasibility Review — OBJ Export + UI Wiring

**Date**: 2026-03-09  
**Agent**: Executioner (Claude Opus 4.5)  
**Status**: **FEASIBLE**

---

## Summary

The revised plan from Verifier is **FEASIBLE** with minor clarifications. The infrastructure is already in place — this is a wiring task, not an architecture change.

---

## Verification Results

### ✅ 3MF Implementation Confirmed

`src/geometry/exporters/export3MF.ts` exists (275 lines):
- `exportTo3MF()` — returns Blob
- `download3MF()` — triggers browser download
- `estimate3MFSize()` — utility
- Streaming support for large meshes (>1M vertices)
- JSZip integration operational

### ✅ Routing Already Exists

`stlExport.ts` L35-37 already routes to 3MF:
```typescript
if (format === '3mf') {
    const { exportTo3MF } = await import('./exporters/export3MF');
    return exportTo3MF(mesh, { name });
}
```

### ✅ Dead UI Located

**Problem**: `ExportTab.tsx` L113 uses local state:
```typescript
const [format, setFormat] = useState<ExportFormat>('stl');
```
This never reaches the export call.

**Export path**: `StatusFooter.tsx` L70:
```typescript
await exportSTL();  // No format parameter
```

**Hook**: `useExport.ts` L304 — `exportSTL()` accepts only filename, always calls `downloadSTL()`.

---

## File-Level Impact Analysis

| File | Change Type | Lines | Risk |
|------|-------------|-------|------|
| `src/geometry/exporters/exportOBJ.ts` | **NEW** | ~120-150 | Low |
| `src/geometry/stlExport.ts` | Modify | +15 | Low |
| `src/state/slices/ui.ts` | Modify | +8 | Low |
| `src/ui/v2/tabs/ExportTab.tsx` | Modify | +5 | Low |
| `src/ui/v2/layout/StatusFooter.tsx` | Modify | +3 | Low |
| `src/hooks/useExport.ts` | Modify | +10 | Medium |
| `src/geometry/exporters/exportOBJ.test.ts` | **NEW** | ~80 | Low |
| `src/geometry/exporters/export3MF.test.ts` | **NEW** | ~60 | Low |

**Total new code**: ~260 lines  
**Total modifications**: ~40 lines

---

## Risk Zones

### Medium Risk: useExport.ts Signature Change

Adding a `format` parameter to `exportSTL()` affects:
- `StatusFooter.tsx` L70 — primary caller
- `AppUI.tsx` L60 — keyboard shortcut handler

Both need updates. The function should remain backward-compatible with a default of `'stl'`.

### Low Risk: Type Updates

`ExportFormat` type in `stlExport.ts` L18 needs `'obj'` added:
```typescript
export type ExportFormat = 'stl' | '3mf' | 'obj';
```

---

## Implementation Sequence

### Phase 1: OBJ Export (1 day)

**Step 1.1**: Create `src/geometry/exporters/exportOBJ.ts`

Pattern from export3MF.ts:
```typescript
export interface ExportOBJOptions {
    name?: string;
    includeNormals?: boolean;  // Per-vertex normals
    onProgress?: (progress: number, message: string) => void;
}

export async function exportToOBJ(mesh: MeshData, options?: ExportOBJOptions): Promise<Blob>;
export async function downloadOBJ(mesh: MeshData, filename?: string, options?: ExportOBJOptions): Promise<void>;
```

OBJ format is simpler than 3MF — ~120 lines expected:
- Header comment
- `v x y z` lines for vertices
- `vn nx ny nz` lines for normals (optional)
- `f v1 v2 v3` or `f v1//vn1 v2//vn2 v3//vn3` for faces

**Step 1.2**: Add routing in `stlExport.ts`

```typescript
// Add to ExportFormat type
export type ExportFormat = 'stl' | '3mf' | 'obj';

// Add to exportMesh()
if (format === 'obj') {
    const { exportToOBJ } = await import('./exporters/exportOBJ');
    return exportToOBJ(mesh, { name });
}

// Add to downloadMesh()
if (format === 'obj') {
    const { downloadOBJ } = await import('./exporters/exportOBJ');
    await downloadOBJ(mesh, filename, { name });
    return;
}
```

**Step 1.3**: Create `exportOBJ.test.ts`

Test cases:
- Basic triangle export
- Vertex count matches mesh
- Face indices are 1-based (OBJ convention)
- File header includes model name
- Normals optional (with/without)

### Phase 2: UI Wiring (0.5 days)

**Step 2.1**: Add `exportFormat` to UI state

In `src/state/slices/ui.ts`:
```typescript
export interface UIState {
    // ... existing fields
    exportFormat: ExportFormat;  // 'stl' | '3mf' | 'obj'
}

// In DEFAULT_UI_STATE
exportFormat: 'stl' as ExportFormat,

// Add action
setExportFormat: (format: ExportFormat) => void;
```

**Step 2.2**: Wire ExportTab to store

In `ExportTab.tsx`:
```typescript
// Replace L113:
const [format, setFormat] = useState<ExportFormat>('stl');

// With:
const format = useAppStore((s) => s.ui.exportFormat);
const setFormat = useAppStore((s) => s.setExportFormat);
```

Also add OBJ to FORMAT_OPTIONS array (L66-69):
```typescript
const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'stl', label: 'STL', description: 'Universal 3D print format' },
  { value: '3mf', label: '3MF', description: 'Modern format with metadata' },
  { value: 'obj', label: 'OBJ', description: 'Wavefront, Blender compatible' },
];
```

**Step 2.3**: Update useExport signature

In `useExport.ts`:
```typescript
const exportSTL = useCallback(async (
    filename: string = 'pot.stl',
    format: ExportFormat = 'stl'
): Promise<void> => {
    // ... existing mesh generation ...
    
    // Determine extension
    const ext = format === '3mf' ? '3mf' : format === 'obj' ? 'obj' : 'stl';
    const finalFilename = filename.endsWith(`.${ext}`)
        ? filename
        : `PotFoundry_${styleName}_${Date.now()}.${ext}`;
    
    // Use downloadMesh which routes by format
    await downloadMesh(result.mesh, finalFilename, { format, name: `PotFoundry ${style.name}` });
```

**Step 2.4**: Update StatusFooter to read format

In `StatusFooter.tsx`:
```typescript
const exportFormat = useAppStore((s) => s.ui.exportFormat);

const handleDownload = useCallback(async () => {
    if (progress.status === 'generating') return;
    await exportSTL(undefined, exportFormat);
}, [progress.status, exportSTL, exportFormat]);
```

### Phase 3: Tests (0.5 days)

1. `exportOBJ.test.ts` — unit tests for OBJ generation
2. `export3MF.test.ts` — unit tests for existing 3MF (currently missing)
3. Update `useExport.test.ts` — test format parameter routing

---

## Unstated Dependencies

1. **ExportFormat type location**: Currently defined in both `stlExport.ts` and `ExportTab.tsx`. Should consolidate to a single source (geometry types).

2. **Filename extension inference**: `downloadMesh()` in stlExport.ts already infers format from filename — need to ensure this doesn't conflict with explicit format parameter.

3. **AppUI.tsx keyboard shortcut**: Uses `exportSTL('binary')` at L60 which will need updating to match new signature or remain backward-compatible.

---

## Time Estimate Validation

Verifier's estimate of **2-2.5 days** is **accurate**.

| Phase | Task | Estimate |
|-------|------|----------|
| 1 | OBJ export implementation | 1 day |
| 2 | UI wiring (P0-B fix) | 0.5 days |
| 3 | Tests | 0.5 days |
| **Total** | | **2 days** |

---

## Questions Resolved

| Generator Question | Answer |
|-------------------|--------|
| Winding order? | CCW, guaranteed by `emitTriCCW()` — no normalization needed |
| Vertex dedup? | Already indexed format — OBJ will use indices directly |
| JSZip vs pako? | Already using JSZip — no change needed |
| .mtl support? | **Defer to V2** — not needed for MVP |

---

## Verdict: **FEASIBLE**

The implementation is straightforward:
- OBJ export follows the established 3MF pattern
- UI wiring is a documented 5-step fix with known line numbers
- No architectural changes required
- All integration points are identified

**Ready to proceed with implementation on coordinator approval.**

---

## Signature

**Executioner verdict**: FEASIBLE — proceed with 3-phase implementation
