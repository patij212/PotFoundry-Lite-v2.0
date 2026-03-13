# Master Approved — Phase 4: OBJ Export + UI Format Selector Fix

**Date:** 2026-03-09  
**Status:** APPROVED FOR IMPLEMENTATION  
**Author:** Master Agent  
**Debate Round:** Generator R1 → Verifier R1 → Executioner R1  

---

## Decision: APPROVED

## Unanimous Agreement Status

| Agent | Status | Key Finding | Document |
|-------|--------|-------------|----------|
| **Generator** | Proposed OBJ + 3MF | OBJ + 3MF export as roadmap priority | [generator-round-1-phase-next-proposal.md](generator-round-1-phase-next-proposal.md) |
| **Verifier** | ACCEPT_WITH_AMENDMENTS | 3MF already exists, UI selector is dead (P0-B bug) | [verifier-round-1-export-critique.md](verifier-round-1-export-critique.md) |
| **Executioner** | FEASIBLE | ~260 lines new, ~40 modifications | [executioner-feasibility-obj-export.md](executioner-feasibility-obj-export.md) |
| **Master** | APPROVED | This document |

---

## Problem Statement

1. **OBJ export missing** — High priority item in ROADMAP v3.2 (not implemented)
2. **UI format selector dead (P0-B)** — 3MF export exists but is unreachable from UI
3. **3MF tests missing** — No test coverage for existing export3MF.ts

---

## Critical Discovery: 3MF Already Implemented

The Generator's claim that 3MF export needs 3 days of work was **factually incorrect**.

- `src/geometry/exporters/export3MF.ts` — 275 lines, fully operational
- `src/geometry/stlExport.ts` L35-37 — Already routes to 3MF
- JSZip dependency already integrated

The UI format selector exists but is **dead code** — local state never reaches export call.

---

## Converged Implementation Plan

### Step 4-0: Create exportOBJ.ts Module

**Files:** `src/geometry/exporters/exportOBJ.ts`

**Action:** Create OBJ export following export3MF.ts pattern:

```typescript
export interface ExportOBJOptions {
  name?: string;
  includeNormals?: boolean;
  onProgress?: (progress: number, message: string) => void;
}

export async function exportToOBJ(
  mesh: MeshData,
  options?: ExportOBJOptions
): Promise<Blob>;

export async function downloadOBJ(
  mesh: MeshData,
  filename?: string,
  options?: ExportOBJOptions
): Promise<void>;
```

**OBJ Format Structure:**
```
# PotFoundry Export - [name]
# Generated: [timestamp]
# Vertices: [count], Triangles: [count]

v x1 y1 z1
v x2 y2 z2
...
vn nx1 ny1 nz1
vn nx2 ny2 nz2
...
f v1//vn1 v2//vn2 v3//vn3
...
```

**Key Implementation Notes:**
- OBJ uses 1-based indexing (not 0-based like JS arrays)
- Face format: `f v1 v2 v3` (no normals) or `f v1//vn1 v2//vn2 v3//vn3` (with normals)
- CCW winding order matches OBJ default convention — no conversion needed

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 4-1: Add OBJ Routing to stlExport.ts

**Files:** `src/geometry/stlExport.ts`

**Changes:**

1. **Update ExportFormat type** (line ~18):
```typescript
export type ExportFormat = 'stl' | '3mf' | 'obj';
```

2. **Add OBJ routing to exportMesh()** (after 3mf block):
```typescript
if (format === 'obj') {
  const { exportToOBJ } = await import('./exporters/exportOBJ');
  return exportToOBJ(mesh, { name });
}
```

3. **Add OBJ routing to downloadMesh()** (after 3mf block):
```typescript
if (format === 'obj') {
  const { downloadOBJ } = await import('./exporters/exportOBJ');
  await downloadOBJ(mesh, filename, { name });
  return;
}
```

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 4-2: Add exportFormat to UI State

**Files:** `src/state/slices/ui.ts`

**Changes:**

1. **Add to UIState interface**:
```typescript
export interface UIState {
  // ... existing fields
  exportFormat: ExportFormat;
}
```

2. **Add to DEFAULT_UI_STATE**:
```typescript
exportFormat: 'stl' as ExportFormat,
```

3. **Add setter action**:
```typescript
setExportFormat: (format: ExportFormat) =>
  set((state) => {
    state.ui.exportFormat = format;
  }),
```

4. **Import ExportFormat type** from stlExport.ts

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 4-3: Wire ExportTab to Store

**Files:** `src/ui/v2/tabs/ExportTab.tsx`

**Changes:**

1. **Replace local state with store** (line ~113):
```typescript
// Before:
const [format, setFormat] = useState<ExportFormat>('stl');

// After:
const format = useAppStore((s) => s.ui.exportFormat);
const setFormat = useAppStore((s) => s.setExportFormat);
```

2. **Add OBJ to FORMAT_OPTIONS** (line ~66-69):
```typescript
const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'stl', label: 'STL', description: 'Universal 3D print format' },
  { value: '3mf', label: '3MF', description: 'Modern format with metadata' },
  { value: 'obj', label: 'OBJ', description: 'Wavefront, Blender compatible' },
];
```

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 4-4: Update useExport Hook

**Files:** `src/hooks/useExport.ts`

**Changes:**

1. **Add format parameter to exportSTL** (line ~304):
```typescript
const exportSTL = useCallback(async (
  filename: string = 'pot.stl',
  format?: ExportFormat  // NEW optional parameter
): Promise<void> => {
```

2. **Read format from store if not provided**:
```typescript
const { exportFormat: storeFormat } = useAppStore.getState().ui;
const effectiveFormat = format ?? storeFormat;
```

3. **Determine correct extension**:
```typescript
const ext = effectiveFormat === '3mf' ? '3mf' : effectiveFormat === 'obj' ? 'obj' : 'stl';
const finalFilename = filename.endsWith(`.${ext}`)
  ? filename
  : `PotFoundry_${styleName}_${Date.now()}.${ext}`;
```

4. **Use downloadMesh with format**:
```typescript
await downloadMesh(result.mesh, finalFilename, { 
  format: effectiveFormat, 
  name: `PotFoundry ${style.name}` 
});
```

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 4-5: Update StatusFooter Export Call

**Files:** `src/ui/v2/layout/StatusFooter.tsx`

**Changes:**

1. **Pass format to exportSTL** (line ~70):
```typescript
// Before:
await exportSTL();

// After:
const format = useAppStore.getState().ui.exportFormat;
await exportSTL(undefined, format);
```

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 4-6: Create exportOBJ.test.ts

**Files:** `src/geometry/exporters/exportOBJ.test.ts`

**Test Cases:**
1. Basic triangle mesh export
2. Vertex count matches input mesh
3. Face indices are 1-based
4. Header includes model name
5. Normals included when requested
6. Normals omitted when not requested
7. Large mesh export doesn't timeout
8. Empty mesh edge case

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 4-7: Create export3MF.test.ts

**Files:** `src/geometry/exporters/export3MF.test.ts`

**Test Cases:**
1. Output is valid ZIP blob
2. ZIP contains required files: `[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model`
3. Model XML validates mesh structure
4. Vertex count matches input
5. Triangle count matches input
6. Large mesh export with streaming

**Validation:** `npm run typecheck && npm run lint && npm test`

---

## File Impact Summary

| File | Type | Lines Changed | Risk |
|------|------|---------------|------|
| `src/geometry/exporters/exportOBJ.ts` | NEW | ~120-150 | Low |
| `src/geometry/stlExport.ts` | Modify | +15 | Low |
| `src/state/slices/ui.ts` | Modify | +8 | Low |
| `src/ui/v2/tabs/ExportTab.tsx` | Modify | +5 | Low |
| `src/hooks/useExport.ts` | Modify | +15 | Medium |
| `src/ui/v2/layout/StatusFooter.tsx` | Modify | +3 | Low |
| `src/geometry/exporters/exportOBJ.test.ts` | NEW | ~80 | Low |
| `src/geometry/exporters/export3MF.test.ts` | NEW | ~60 | Low |

**Total New Code:** ~260 lines  
**Total Modifications:** ~46 lines

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OBJ index off-by-one | Medium | Medium | Test case for 1-based indexing |
| Export format not persisted on page reload | Low | Low | Confirm DEFAULT_UI_STATE resets to 'stl' |
| useExport signature break | Low | Medium | Backward-compatible optional parameter |
| Performance on large meshes | Low | Low | Follow streaming pattern from 3MF |

---

## Estimated Impact

| Metric | Value |
|--------|-------|
| New LOC | ~260 |
| Modified LOC | ~46 |
| Dependencies | None (JSZip already present) |
| Time estimate | **2-2.5 days** |
| User impact | HIGH — unlocks 3MF + OBJ export |

---

## Validation Protocol

### Per-Step (MANDATORY)
```bash
cd potfoundry-web
npm run typecheck    # 0 errors
npm run lint         # 0 warnings
npm test             # All tests pass
```

### Post-Implementation (MANDATORY)
1. Start dev server: `npm run dev`
2. Export mesh as STL → verify download
3. Export mesh as 3MF → verify download (ZIP with correct structure)
4. Export mesh as OBJ → verify download
5. Import OBJ into Blender → verify mesh looks correct
6. Reload page → verify format resets to STL

---

## Git Workflow

```bash
git checkout -b feat/phase4-obj-export

# Step 4-0
git commit -m "feat(export): add OBJ export module"

# Step 4-1
git commit -m "refactor(export): add OBJ routing to stlExport"

# Step 4-2
git commit -m "feat(state): add exportFormat to UI state"

# Step 4-3
git commit -m "fix(ExportTab): wire format selector to store (P0-B)"

# Step 4-4
git commit -m "refactor(useExport): add format parameter"

# Step 4-5
git commit -m "fix(StatusFooter): pass format to exportSTL"

# Step 4-6
git commit -m "test(export): add OBJ export tests"

# Step 4-7
git commit -m "test(export): add 3MF export tests"

git push -u origin feat/phase4-obj-export
```

---

## Master Sign-Off

**I, the Master Agent, approve this plan for implementation.**

All three specialist agents have converged:
- Generator identified export formats as highest-value next step
- Verifier discovered 3MF already exists + P0-B bug (critical amendments)
- Executioner confirmed feasibility with detailed file-level impact

**Key outcomes:**
1. ✅ OBJ export added (new feature)
2. ✅ 3MF export enabled in UI (bug fix P0-B)
3. ✅ Test coverage for both export formats (quality)

**Next agent:** The Executioner should implement steps 4-0 through 4-7 following this plan exactly, with full validation between each step.

---

*Document generated after Generator/Verifier/Executioner debate cycle. All agents reached unanimous agreement.*
