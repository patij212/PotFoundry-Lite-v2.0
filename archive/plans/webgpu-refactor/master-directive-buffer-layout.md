# Master Directive — Phase 3 BufferLayout Extraction

**Date**: 2026-03-10  
**Author**: Master Agent  
**Status**: APPROVED WITH AMENDMENTS

---

## Situation

Generator proposed a factory pattern for BufferLayout extraction. Verifier attacked with rigor and found:

1. **C2 (CRITICAL)**: `STYLE_PARAM_CAPACITY` at webgpu_core.ts L101 not addressed in removal steps
2. **C1 (WARNING)**: Error handling asymmetry — gradient writes lack try/catch that `syncStyleParams` has

Verdict: ACCEPT WITH AMENDMENTS.

---

## Master Judgment

Generator's design is **sound**. The factory pattern correctly solves the closure problem. I accept the proposal with the following mandatory amendments:

### Amendment 1: STYLE_PARAM_CAPACITY Consolidation (CRITICAL)

**Current state**: Duplicate definition at webgpu_core.ts L101 and utils/styleParams.ts L19.

**Required action**:
- Remove `const STYLE_PARAM_CAPACITY = 48;` from webgpu_core.ts L101
- Add import `import { STYLE_PARAM_CAPACITY } from './utils/styleParams';` at top of webgpu_core.ts
- BufferLayout.ts imports from `./utils/styleParams` (as Generator proposed)

### Amendment 2: Error Handling Parity (WARNING → REQUIRED)

**Current state**: `syncStyleParams` has try/catch; gradient writes don't.

**Required action**: Add try/catch to `writeGradient` and `writeBackgroundGradient` for consistency:

```typescript
writeGradient(buffers: GradientBuffers, gradient: unknown): void {
  // ... color conversion ...
  
  if (!context.isDisposed()) {
    try {
      device.queue.writeBuffer(buffers.c1, 0, colorBufC1.buffer);
      device.queue.writeBuffer(buffers.c2, 0, colorBufC2.buffer);
      device.queue.writeBuffer(buffers.c3, 0, colorBufC3.buffer);
      metrics.colorWrites += 3;
    } catch (err) {
      console.error('[BufferLayout] writeGradient buffer write failed:', err);
      context.emitDiagnostic('webgpu:buffer-write-failed', { buffer: 'color-gradient', error: String(err) });
    }
  }
}
```

Same pattern for `writeBackgroundGradient`.

### Amendment 3: Documentation (ACKNOWLEDGED)

The signature change for `syncStyleParams` (now takes `styleParamBuffer` as parameter) is acknowledged as intentional. Call sites must be updated:

```typescript
// Before (closure-captured buffer)
syncStyleParams(cfg.styleParams ?? current.styleParams);

// After (passed buffer)
bufferWriter.syncStyleParams(styleParamBuffer, cfg.styleParams ?? current.styleParams);
```

---

## Approved Implementation Plan

Executioner shall implement in this order:

### Step 1: Create BufferLayout.ts (~220 lines)

Location: `potfoundry-web/src/BufferLayout.ts`

Contents:
- `createBufferWriter(config)` factory function
- `hexToRgbNorm()` pure function (moved from webgpu_core.ts)
- `decodeHex()` helper (moved from webgpu_core.ts)
- Interface exports: `BufferWriteContext`, `GradientBuffers`, `GradientColor`, `BufferLayoutConfig`, `BufferWriteMetrics`, `BufferWriter`

Include error handling in all three write methods per Amendment 2.

### Step 2: Create BufferLayout.test.ts (~150 lines)

Location: `potfoundry-web/src/BufferLayout.test.ts`

Test coverage per Generator's plan:
- `hexToRgbNorm` unit tests (hex, array, invalid input)
- Factory creation test
- Integration tests with mock device/buffers
- Disposed guard test

### Step 3: Update webgpu_core.ts

Removals:
- L101: `const STYLE_PARAM_CAPACITY = 48;`
- L283-305: `decodeHex` and `hexToRgbNorm` functions
- L2100-2105: Pre-allocated Float32Array declarations
- L2106-2127: `writeGradient` function
- L2125-2157: `writeBackgroundGradient` function  
- L2161-2207: `syncStyleParams` function

Additions (at top):
```typescript
import { createBufferWriter, BufferWriteContext, hexToRgbNorm } from './BufferLayout';
import { STYLE_PARAM_CAPACITY } from './utils/styleParams';
```

Factory creation (after L1120):
```typescript
const writeContext: BufferWriteContext = {
  isDisposed: () => disposed,
  emitDiagnostic,
  mountCanvasId,
};
const bufferWriter = createBufferWriter({ device, context: writeContext });
```

Call site updates:
- L3636 → `bufferWriter.syncStyleParams(styleParamBuffer, cfg.styleParams ?? current.styleParams);`
- L4092 → `bufferWriter.writeGradient(colorBuffers, cfg.gradient);`
- L4100 → `bufferWriter.writeBackgroundGradient(bgBuffers, bg, bgAngle);`

### Step 4: Validation

```bash
npm run typecheck  # 0 errors
npm run lint       # 0 warnings
npm test           # all green
```

---

## Quality Gates

| Gate | Owner | Criteria |
|---|---|---|
| Type safety | Executioner | No `as any` casts in BufferLayout.ts |
| Error handling | Executioner | All three write methods have try/catch |
| Test coverage | Executioner | All test cases from Generator's plan pass |
| Line count | Master | webgpu_core.ts reduced by ~100+ lines |
| Build clean | Executioner | typecheck + lint + test all pass |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Factory instance lifecycle | Factory created inside mount(), lives exactly as long as mount |
| Import cycle | BufferLayout.ts has no imports from webgpu_core.ts |
| Debug metrics broken | Pattern preserved with same `window.__pf_webgpu_mounts` access |

---

## Master Sign-off

I approve this plan for implementation. Executioner may proceed.

**Unanimous Agreement Status**:
- Generator: ✅ Proposed factory pattern
- Verifier: ✅ Accepted with amendments
- Master: ✅ Incorporated amendments, approved

**Next step**: Dispatch Executioner with this directive.

---

*Master Agent — PotFoundry Multi-Agent Protocol*
