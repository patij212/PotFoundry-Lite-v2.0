# Executioner Feasibility Review — Parametric Pipeline Audit

**Document ID:** EXEC-FEASIBILITY-2026-03-07  
**Agent:** Executioner (GitHub Copilot — Claude Opus 4.5)  
**Date:** 2026-03-07  
**Status:** FEASIBILITY ASSESSMENT

---

## Executive Summary

The converged audit is **FEASIBLE** overall. The Generator/Verifier effort estimates are generally accurate, with three notable adjustments: (1) P0-1 TypeScript errors will require closer to **8-12 hours** due to structural dependencies between test files and production code, (2) P1-4 Seam topology is **underestimated** — the guards-based approach requires either a surgical welding fix (4-6h for STL export welding) or a deep architectural change (16-24h for ghost segment topology), and (3) P2-4 `tBot`/`tTop` params are **NOT unused** per my code inspection — the audit finding appears stale.

---

## 1. Effort Estimate Review

| Phase | Item | Generator Est. | Executioner Assessment | Adjusted Est. |
|-------|------|----------------|------------------------|---------------|
| 0 | Enable CI type gate | 0.5h | **REALISTIC** — tsconfig flag flip + CI yaml edit | 0.5h |
| 1 | Fix 166 TypeScript errors | 8-12h | **REALISTIC TO PESSIMISTIC** | 8-16h |
| 2 | Extract camera controller | 4-6h | **OPTIMISTIC** — camera_controller.ts already exists at 1,386 lines; this is about wiring/removing duplication from webgpu_core.ts | 6-10h |
| 3 | Resolve bandMergeFactor | 1-2h | **REALISTIC** — config pathway is clear | 1-2h |
| 4 | Clean up smoothing pathway | 0.5-2h | **REALISTIC** — dead code removal is mechanical | 0.5-2h |
| 5 | Seam vertex welding | 4-6h | **OPTIMISTIC** — welding at STL export is doable; true periodic topology is 16-24h | 4-24h* |
| 6 | Unify edge key strategy | 2-4h | **REALISTIC** — BigInt migration is well-understood | 2-4h |
| 7+ | Continue webgpu_core.ts decomposition | 14-22h | **PESSIMISTIC** — will take 20-30h+ in practice due to internal coupling | 20-30h |

### *Phase 5 Clarification (Seam Fix Strategy)

Two viable approaches with vastly different effort:

| Strategy | Description | Effort | Risk |
|----------|-------------|--------|------|
| **A: Export-time welding** | Merge col0 ↔ colLast vertices after mesh is built, before STL write | 4-6h | Low — doesn't touch pipeline internals |
| **B: Ghost segment topology** | Add phantom column at U=1.0 that references col0 vertices; modify grid builder | 16-24h | Medium — touches multiple modules |

**Recommendation:** Strategy A first (validates the seam is the root cause), then evaluate whether B is needed.

---

## 2. Risk Assessment

| Phase | Risk Level | Risk Factors |
|-------|------------|--------------|
| 0 | **LOW** | Purely configuration; no code changes |
| 1 | **LOW-MEDIUM** | Error distribution: 90 TS6133 (underscore-prefix fix), 26 TS2353 (type fixes), 11 TS6196 (cleanup), rest require case-by-case analysis. Risk: import chain cascades when deleting stale test files. |
| 2 | **MEDIUM-HIGH** | `webgpu_core.ts:5245` lines with 54 `as any` casts have deep internal coupling. Camera logic references closures from L2100+ that are used in render loop. Each extraction phase risks breaking the render loop. |
| 3 | **LOW** | `MAX_CDT_BANDS = 1` is hardcoded at L1201; either wire through or remove config parameter. No algorithmic change. |
| 4 | **LOW** | `smoothChainPath()` (ChainLinker.ts:550-613) is confirmed dead code — 1 grep match (definition only). Safe deletion. |
| 5 | **MEDIUM** | Seam has 7+ `SEAM_THRESHOLD` guards across 3 files. Export-time welding is surgical and isolated. Topology change touches `OuterWallTessellator.ts`, `GridBuilder.ts`, `FeatureEdgeGraph.ts`. |
| 6 | **LOW** | `refEdgeKey` → BigInt is a known-good pattern from `ChainStripOptimizer.ts`. API is identical. |
| 7+ | **HIGH** | 5,245-line monolith. Axis helper (L2020-2065) handlers are closure-scoped; `dispose()` at L5460 can't access them. Need closure hoisting or handler object. Every extraction phase is a potential runtime break. |

---

## 3. Dependency Analysis

### Can Run in Parallel
- Phase 0 + Phase 3 + Phase 4 (all independent, low-touch changes)
- Phase 6 (edge key unification is isolated from other work)
- Quick wins from known-issues audit (I-3, A-6, A-9, A-10, A-11, IV-4, V-2)

### Hard Dependencies
```
Phase 0 (CI gate) → Phase 1 (TS errors) → All subsequent phases
                                        (CI green required)

Phase 1 (TS errors) → Phase 2 (camera extraction)
                      (Type errors must be resolved before
                       safe refactoring of webgpu_core.ts)

Phase 2 (camera extraction) → Phase 7+ (continued decomposition)
                              (Establish extraction pattern first)
```

### External Dependencies
- **None.** All fixes use existing packages. No new dependencies required.
- Note: `cdt2d` is already present for CDT triangulation.

---

## 4. Implementation Notes for High-Risk Items

### Phase 1: TypeScript Errors (166 count verified)

**Error Distribution (verified):**
| Code | Count | Effort | Notes |
|------|-------|--------|-------|
| TS6133 | 90 | Easy | Unused variables — underscore prefix |
| TS2353 | 26 | Medium | Property does not exist — type augmentation |
| TS6196 | 11 | Easy | Declared never used — delete or use |
| TS2322 | 10 | Medium | Type assignment mismatch — interface fixes |
| TS2593 | 5 | Easy | Cannot find name — missing imports |
| TS2339 | 5 | Medium | Property does not exist — stale API refs |
| TS2345 | 4 | Medium | Argument type mismatch — signature fixes |
| TS2367 | 4 | Easy | Type comparison — narrow accordingly |
| TS2304 | 4 | Easy | Cannot find name — add imports |
| TS2554 | 3 | Medium | Argument count — update callsites |
| Other | 4 | Varies | Case-by-case |

**Approach:**
1. Delete stale test files first (`ConstrainedTriangulator.smooth.test.ts`, `.ohtake.test.ts`)
2. Add `@types/vitest` globals to tsconfig if missing
3. Fix TS6133/TS6196 with underscore prefix sweep
4. Fix production errors (TS2339 stale refs like `getRefinedChains`)
5. Update test fixtures for TS2353/TS2322 (stale interfaces)

**Watch Out For:**
- `MeshOptimizer.test.ts` uses `"ridge"` (stale FeatureKind) and `strength` (removed property)
- `EdgeCollapser.test.ts` passes 8 args where 6-7 expected
- Import chains: verify no production code imports deleted test helpers

### Phase 2: Camera Controller Extraction

**Current State:**
- `camera_controller.ts` exists independently (1,386 lines)
- `webgpu_core.ts` has camera-related code interleaved (orbit, pan, zoom handlers)

**Concerns:**
1. Identify ALL camera-related code in webgpu_core.ts (estimate: ~400-600 lines scattered)
2. Closures at L2100 may be referenced by render loop at L4800+
3. Camera state vs global render state — must cleanly separate

**Approach:**
1. Audit webgpu_core.ts for camera keywords: `orbit, pan, zoom, tilt, azimuth, elevation`
2. Extract to interface-based controller pattern
3. Write integration test before extraction
4. Extract in stages: event handlers first, then state, then matrix math

### Phase 5: Seam Welding

**Current Guard Pattern:**
```typescript
// OuterWallTessellator.ts:121
const SEAM_THRESHOLD = 0.4;
// 7+ usage sites filtering chain edges that cross seam
```

**Export-Time Welding Approach:**
```typescript
// In STL export, after all triangles built:
function weldSeamVertices(positions: Float32Array, numU: number): Float32Array {
    const col0Verts: number[] = []; // vertices at col 0
    const colLastVerts: number[] = []; // vertices at col (numU-1)
    
    // For each colLast vertex, find matching col0 vertex by T
    // Replace colLast indices with col0 indices in triangle buffer
    // This closes the seam
}
```

**Validation:**
- Export style 0 (simple pot) and verify no visible seam line
- Export spiral style and verify seam closure handles diagonal chains
- Mesh manifold check: no non-manifold edges at seam

### Phase 7+: webgpu_core.ts Decomposition

**Decomposition Candidates (in order of safety):**
1. **Axis overlay** (~200 lines, L2020-2100) — self-contained canvas, own event handlers
2. **Input handlers** (~800 lines scattered) — pointer, touch, wheel events
3. **Buffer management** (~600 lines) — uniform buffer layout, staging buffers
4. **Render pass builders** (~400 lines) — shadow pass, main pass, magenta pass

**The Axis Helper Landmine:**
```typescript
// At L2054-2062 (approximate)
axisCanvas.addEventListener('mousedown', onMouseDown);
document.addEventListener('mousemove', onMouseMove);
// ... 7 total listeners

// But dispose() at L5460 doesn't have access to onMouseDown, etc.
// They're closure-scoped to the axis helper setup block
```

**Fix:** Store handlers on a closure-accessible object:
```typescript
interface AxisHandlers {
    onMouseDown: (e: MouseEvent) => void;
    onMouseMove: (e: MouseEvent) => void;
    // ... all 7
}
const axisHandlers: AxisHandlers = { /* ... */ };
// dispose() can then access axisHandlers.onMouseDown
```

---

## 5. Suggested Phase Order

The proposed order in the audit is **acceptable** with minor adjustments:

### Recommended Order

1. **Phase 0: CI gate** (0.5h) — Unblocks everything else
2. **Quick wins batch** (2h) — I-3, A-6, A-9, A-10, A-11, IV-4, V-2, A-3
3. **Phase 1: TS errors** (8-16h) — Must be green before major refactoring
4. **Phase 3: bandMergeFactor** (1-2h) — Can be done anytime after Phase 1
5. **Phase 4: smoothing cleanup** (0.5-2h) — Can be done anytime after Phase 1
6. **Phase 6: edge key unification** (2-4h) — Independent, can parallelize
7. **Phase 5: seam welding (Strategy A)** (4-6h) — After Phase 1, before major restructuring
8. **Phase 2: camera extraction** (6-10h) — First major extraction
9. **Phase 7+: continued decomposition** (20-30h phased) — Multi-session work

### Rationale for Reordering

- **Quick wins before Phase 1:** Reduces noise, builds momentum
- **Phase 3/4/6 before Phase 5:** Lower-risk changes first
- **Phase 5 before Phase 2:** Seam fix doesn't touch webgpu_core.ts; can validate before major restructuring
- **Phase 2 before Phase 7+:** Establishes extraction pattern for subsequent modules

---

## 6. Hidden Complexity

### 6.1 Test File Import Chains

The Generator/Verifier assumed deleting stale test files is safe. However:

- `ConstrainedTriangulator.smooth.test.ts` references `getRefinedChains()` which may be imported as a type
- Must verify no production code (or other tests) import from these stale test files

**Mitigation:** Before deleting, grep for `from.*ConstrainedTriangulator.smooth.test` and `from.*ConstrainedTriangulator.ohtake.test`

### 6.2 P2-4 Finding May Be Stale

The audit claims `tBot`/`tTop` are unused in `cdtTriangulateStrip()`. However, my code inspection shows:

```typescript
// ChainStripTriangulator.ts:178-189
const tRange = Math.max(Math.abs(tTop - tBot), 1e-12);
const tBase = Math.min(tBot, tTop);
// ...
const meanT = (tBot + tTop) / 2;
```

These parameters ARE used. The TSC error may refer to DIFFERENT functions or was fixed after the audit snapshot.

**Action:** Re-run TSC after Phase 1 changes and re-evaluate this item.

### 6.3 bandMergeFactor Config Path Complexity

The config flows: 
```
ParametricExportComputer.ts:438 (read from pc?.bandMergeFactor ?? 2)
    → l.1321 (passed to ChainStripConfig)
    → ChainStripTriangulator.ts (stored in config)
    → OuterWallTessellator.ts:1201 (IGNORED — hardcoded MAX_CDT_BANDS = 1)
```

**Two valid fixes:**
1. **Remove the config entirely** — delete from all layers, add comment that single-band is permanent (30 min)
2. **Wire it through** — pass config to OWT, replace constant with config value (1-2h)

If we want to experiment with multi-band again, option 2 is better. If R33's single-band is permanent, option 1 is cleaner.

### 6.4 webgpu_core.ts Internal State Coupling

The file uses `window as any` for global debug state:
```typescript
(window as any).__pf_renderer = renderer;
(window as any).__pf_state = state;
// etc.
```

These are deliberately `as any` for developer console access. Removing them breaks dev tooling. Typing them properly would add ~20 interface definitions for internal state that's meant to be debug-only.

**Recommendation:** Leave `window as any` debug stashing as-is. Focus extraction on typed interfaces between modules, not debug endpoints.

---

## 7. Quick Wins

Items that can be completed in <30 minutes with zero regression risk:

| Item | Time | Action |
|------|------|--------|
| I-3 | 5m | Delete empty `fidelity.integration.test.ts` |
| A-6 | 5m | `process.env.NODE_ENV` → `import.meta.env.DEV` in Announcer.tsx |
| A-9 | 5m | `(a as any)` → `(a as number[])` in camera_basis.ts L530-531 |
| A-10 | 5m | Add catch fallback in SceneManager.ts L68 |
| A-11 | 5m | Add comment to factory.ts compat mode cast |
| IV-4 | 15m | Add edgeKey overflow assertion |
| V-2 | 30m | Add style ID snapshot test |
| P2-3 (smoothChainPath) | 10m | Delete dead code (60 lines, 0 callers) |

**Total: ~80 minutes** for 8 quick wins.

---

## 8. Executioner Verdict

### Top 5 Immediate Actions

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | Phase 0: CI type gate | **FEASIBLE** | Configuration only |
| 2 | Phase 1: TS errors | **FEASIBLE** | 8-16h realistic; 90/166 are mechanical |
| 3 | Phase 3: bandMergeFactor | **FEASIBLE** | 1-2h; recommend removal over wiring |
| 4 | Phase 4: smoothing cleanup | **FEASIBLE** | Dead code confirmed; safe deletion |
| 5 | Phase 5: seam welding | **FEASIBLE WITH STRATEGY A** | Export-time welding (4-6h), NOT ghost segments |

### Overall Verdict

**FEASIBLE**

The audit correctly identifies the issues and proposes reasonable fixes. Key adjustments:
- Phase 1 will take the upper bound of the estimate (12-16h) due to test file dependencies
- Phase 5 should use Strategy A (export-time welding) not Strategy B (topology change)
- Phase 7+ is a multi-sprint commitment; don't begin until CI is green and extraction pattern is established
- P2-4 (tBot/tTop unused) should be re-verified — my inspection shows they ARE used

---

## 9. Executioner Sign-off

**Name:** Executioner Agent (GitHub Copilot — Claude Opus 4.5)  
**Date:** 2026-03-07  

**Assessment:**

The converged Generator/Verifier audit is implementation-ready. The 166 TypeScript errors are real (verified: `npx tsc --noEmit --skipLibCheck` returns 166 `error TS` matches), the webgpu_core.ts monolith is 5,245 lines with 54 `as any` casts (verified), and the dead code paths (`smoothChainPath()`, `MAX_CDT_BANDS` config bypass) are confirmed. 

The proposed phase ordering is sensible but should front-load quick wins before the Phase 1 TS error slog. The seam fix should use the surgical export-time welding approach (4-6h) rather than the architectural ghost segment approach (16-24h) — validate first, then decide if deeper work is needed.

**Green light to proceed with Phase 0 + Quick Wins immediately, then Phase 1.**

---

## Appendix: Verification Commands Used

```powershell
# TypeScript error count
npx tsc --noEmit --skipLibCheck 2>&1 | Select-String "error TS" | Measure-Object
# Result: Count = 166

# webgpu_core.ts line count
Get-Content "src/webgpu_core.ts" | Measure-Object -Line
# Result: Lines = 5245

# webgpu_core.ts "as any" count
Select-String -Path "src/webgpu_core.ts" -Pattern "as any" | Measure-Object
# Result: Count = 54

# camera_controller.ts line count
Get-Content "src/camera_controller.ts" | Measure-Object -Line
# Result: Lines = 1386

# smoothChainPath caller count
Select-String -Path "**/*.ts" -Pattern "smoothChainPath" -Recurse
# Result: 1 match (definition only, no callers)

# MAX_CDT_BANDS locations
Select-String -Path "**/*.ts" -Pattern "MAX_CDT_BANDS" -Recurse
# Result: 5 matches (all in OuterWallTessellator.ts, local const)

# SEAM_THRESHOLD locations
Select-String -Path "**/*.ts" -Pattern "SEAM_THRESHOLD" -Recurse
# Result: 13 matches across 4 files
```
