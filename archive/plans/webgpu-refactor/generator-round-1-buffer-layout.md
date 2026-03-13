# Generator Proposal — Phase 3 BufferLayout Extraction

**Date**: 2026-03-10  
**Round**: 1  
**Author**: Generator Agent

---

## Executive Summary

I propose a **factory pattern** with pre-allocated buffers owned by the factory instance, combined with a `WriteContext` interface that encapsulates the `disposed` guard and debug hooks. This preserves zero-allocation hot-path performance while enabling full testability and ~100 lines extracted from `webgpu_core.ts`.

---

## Analysis of Target Functions

### 1. `writeGradient` (L2106-2127, ~21 lines)

**Purpose**: Convert 3-stop hex gradient to normalized RGB, write to GPU color buffers.

**Dependencies**:
| Dependency | Type | Origin |
|---|---|---|
| `device` | `GPUDevice` | Passed as parameter |
| `buffers.c1/c2/c3` | `GPUBuffer` | Passed as parameter |
| `gradient` | `unknown` | Passed as parameter |
| `colorBufC1/C2/C3` | `Float32Array(4)` | Pre-allocated closure |
| `disposed` | `boolean` | Closure state |
| `mountCanvasId` | `string` | Debug metrics key |
| `hexToRgbNorm()` | Pure function | Module-level (L285-305) |

**Call site**: L4092 — called when gradient signature changes.

**Hot-path frequency**: Low-medium. Gradient changes are user-driven (slider moves), not per-frame.

### 2. `writeBackgroundGradient` (L2125-2157, ~32 lines)

**Purpose**: Convert 2-3 stop background gradient to RGB, interpolate middle if only 2 stops, encode angle in alpha channel.

**Dependencies**:
| Dependency | Type | Origin |
|---|---|---|
| `device` | `GPUDevice` | Passed as parameter |
| `buffers.c1/c2/c3` | `GPUBuffer` | Passed as parameter |
| `gradient` | `unknown` | Passed as parameter |
| `angleVal` | `unknown` | Passed as parameter |
| `bgBufC1/C2/C3` | `Float32Array(4)` | Pre-allocated closure |
| `disposed` | `boolean` | Closure state |
| `hexToRgbNorm()` | Pure function | Module-level |

**Call site**: L4100 — called when background signature changes.

**Hot-path frequency**: Low-medium. Similar to foreground gradient.

### 3. `syncStyleParams` (L2161-2207, ~46 lines)

**Purpose**: Sync style parameter array to GPU buffer with epsilon-based change detection, sentinel enforcement, and dev-mode diagnostics.

**Dependencies**:
| Dependency | Type | Origin |
|---|---|---|
| `values` | `unknown` | Passed as parameter |
| `styleParamBuffer` | `GPUBuffer` | Closure (from SceneManager) |
| `styleParamCache` | `Float32Array(48)` | Pre-allocated closure |
| `disposed` | `boolean` | Closure state |
| `device` | `GPUDevice` | Closure (implicit via queue) |
| `STYLE_PARAM_CAPACITY` | `48` | Module constant |
| `emitDiagnostic()` | Function | Closure-defined |

**Call site**: L3636 — called every `update()` cycle for style param sync.

**Hot-path frequency**: HIGH. Called on every parametric update. Change detection + epsilon comparison prevents actual buffer writes on steady-state.

---

## Proposed Design

### Option A: Factory Pattern with Context Injection (RECOMMENDED)

```typescript
// BufferLayout.ts

import { STYLE_PARAM_CAPACITY } from '../utils/styleParams';

/** Normalized RGB tuple from hex conversion */
export type GradientColor = [number, number, number];

/** Write context providing lifecycle guards and diagnostics */
export interface BufferWriteContext {
  /** Check if mount is disposed (prevents GPU writes after unmount) */
  isDisposed(): boolean;
  /** Emit diagnostic event for telemetry */
  emitDiagnostic(message: string, detail?: Record<string, unknown>): void;
  /** Mount canvas ID for debug metrics */
  readonly mountCanvasId?: string;
}

/** Gradient buffer set (3 color stops) */
export interface GradientBuffers {
  readonly c1: GPUBuffer;
  readonly c2: GPUBuffer;
  readonly c3: GPUBuffer;
}

/** Factory configuration */
export interface BufferLayoutConfig {
  readonly device: GPUDevice;
  readonly context: BufferWriteContext;
}

/** Buffer write metrics (for testing/telemetry) */
export interface BufferWriteMetrics {
  colorWrites: number;
  bgWrites: number;
  styleParamWrites: number;
  styleParamSkips: number;
}

/**
 * Factory function to create buffer writers with pre-allocated scratch buffers.
 * 
 * The returned object owns the Float32Array scratch buffers (zero GC pressure)
 * and uses the context to guard against writes after disposal.
 * 
 * @param config - Device and context for GPU operations
 * @returns Object with buffer write methods and getMetrics() for testing
 */
export function createBufferWriter(config: BufferLayoutConfig) {
  const { device, context } = config;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Pre-allocated scratch buffers (owned by this instance, not closure)
  // ─────────────────────────────────────────────────────────────────────────
  const colorBufC1 = new Float32Array(4);
  const colorBufC2 = new Float32Array(4);
  const colorBufC3 = new Float32Array(4);
  const bgBufC1 = new Float32Array(4);
  const bgBufC2 = new Float32Array(4);
  const bgBufC3 = new Float32Array(4);
  const styleParamCache = new Float32Array(STYLE_PARAM_CAPACITY);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Metrics for testing and telemetry
  // ─────────────────────────────────────────────────────────────────────────
  const metrics: BufferWriteMetrics = {
    colorWrites: 0,
    bgWrites: 0,
    styleParamWrites: 0,
    styleParamSkips: 0,
  };

  return {
    /**
     * Write foreground gradient to GPU buffers.
     * Converts 1-3 hex stops to normalized RGB.
     */
    writeGradient(
      buffers: GradientBuffers,
      gradient: unknown
    ): void {
      const stops = Array.isArray(gradient) ? gradient : [];
      const c1 = hexToRgbNorm(stops[0]);
      const c2 = hexToRgbNorm(stops[1] ?? stops[0]);
      const c3 = hexToRgbNorm(stops[2] ?? stops[1] ?? stops[0]);
      
      colorBufC1[0] = c1[0]; colorBufC1[1] = c1[1]; colorBufC1[2] = c1[2]; colorBufC1[3] = 0;
      colorBufC2[0] = c2[0]; colorBufC2[1] = c2[1]; colorBufC2[2] = c2[2]; colorBufC2[3] = 0;
      colorBufC3[0] = c3[0]; colorBufC3[1] = c3[1]; colorBufC3[2] = c3[2]; colorBufC3[3] = 0;
      
      if (!context.isDisposed()) {
        device.queue.writeBuffer(buffers.c1, 0, colorBufC1.buffer);
        device.queue.writeBuffer(buffers.c2, 0, colorBufC2.buffer);
        device.queue.writeBuffer(buffers.c3, 0, colorBufC3.buffer);
        metrics.colorWrites += 3;
        
        // Debug metrics hook (optional)
        if (context.mountCanvasId) {
          try {
            const m = (window as Record<string, unknown>).__pf_webgpu_mounts;
            const mount = (m as Record<string, { debug?: { metrics?: { colorWrites?: number } } }>)?.[context.mountCanvasId];
            if (mount?.debug?.metrics) {
              (mount.debug.metrics as { colorWrites: number }).colorWrites += 3;
            }
          } catch { /* ignore */ }
        }
      }
    },

    /**
     * Write background gradient to GPU buffers.
     * Interpolates middle stop if only 2 provided.
     * Encodes angle in C1 alpha channel.
     */
    writeBackgroundGradient(
      buffers: GradientBuffers,
      gradient: unknown,
      angleVal: unknown
    ): void {
      const stops = Array.isArray(gradient) ? gradient : [];
      const angle = typeof angleVal === 'number' ? angleVal : 0;
      const c1 = hexToRgbNorm(stops[0]);
      
      let c3 = hexToRgbNorm(stops[2] ?? stops[1] ?? stops[0]);
      let c2: GradientColor;

      if (stops.length === 2) {
        const end = hexToRgbNorm(stops[1]);
        c3 = end;
        c2 = [(c1[0] + end[0]) * 0.5, (c1[1] + end[1]) * 0.5, (c1[2] + end[2]) * 0.5];
      } else {
        c2 = hexToRgbNorm(stops[1] ?? stops[0]);
      }

      bgBufC1[0] = c1[0]; bgBufC1[1] = c1[1]; bgBufC1[2] = c1[2]; bgBufC1[3] = angle;
      bgBufC2[0] = c2[0]; bgBufC2[1] = c2[1]; bgBufC2[2] = c2[2]; bgBufC2[3] = 0;
      bgBufC3[0] = c3[0]; bgBufC3[1] = c3[1]; bgBufC3[2] = c3[2]; bgBufC3[3] = 0;

      if (!context.isDisposed()) {
        device.queue.writeBuffer(buffers.c1, 0, bgBufC1.buffer);
        device.queue.writeBuffer(buffers.c2, 0, bgBufC2.buffer);
        device.queue.writeBuffer(buffers.c3, 0, bgBufC3.buffer);
        metrics.bgWrites += 3;
      }
    },

    /**
     * Sync style parameters to GPU buffer with change detection.
     * Uses epsilon comparison to prevent cache thrashing.
     * Enforces sentinel at index 47.
     */
    syncStyleParams(
      styleParamBuffer: GPUBuffer,
      values: unknown
    ): void {
      let changed = false;
      const source = Array.isArray(values) ? values : [];
      const limit = Math.min(source.length, STYLE_PARAM_CAPACITY);
      
      for (let i = 0; i < STYLE_PARAM_CAPACITY; i += 1) {
        let next = i < limit ? Number(source[i]) || 0 : 0;

        // Sentinel enforcement: index 47 must be > 0.5 for shader detection
        if (i === STYLE_PARAM_CAPACITY - 1 && source.length > 0 && next === 0) {
          next = 1.0;
        }

        // Epsilon comparison to reduce buffer write churn
        if (Math.abs(styleParamCache[i] - next) > 1e-6) {
          styleParamCache[i] = next;
          changed = true;
        }
      }

      if (changed && !context.isDisposed()) {
        try {
          device.queue.writeBuffer(styleParamBuffer, 0, styleParamCache.buffer);
          metrics.styleParamWrites += 1;
        } catch (err) {
          console.error('[BufferLayout] syncStyleParams buffer write failed:', err);
          context.emitDiagnostic('webgpu:buffer-write-failed', { buffer: 'style-params', error: String(err) });
        }
      } else if (changed) {
        metrics.styleParamSkips += 1;
        console.warn('[BufferLayout] syncStyleParams SKIPPED (disposed)');
      }
    },

    /** Get metrics for testing/telemetry */
    getMetrics(): Readonly<BufferWriteMetrics> {
      return { ...metrics };
    },

    /** Reset metrics (for testing) */
    resetMetrics(): void {
      metrics.colorWrites = 0;
      metrics.bgWrites = 0;
      metrics.styleParamWrites = 0;
      metrics.styleParamSkips = 0;
    },

    /** Reset style param cache (forces full re-sync on next call) */
    resetStyleParamCache(): void {
      styleParamCache.fill(0);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers (extracted from webgpu_core.ts L285-305)
// ─────────────────────────────────────────────────────────────────────────

const decodeHex = (hex: string): number => parseInt(hex, 16) / 255;

/**
 * Convert hex color string or RGB array to normalized [0,1] tuple.
 * Handles:
 * - Arrays: [r, g, b] where values are already 0-1
 * - Hex strings: "#RGB", "#RRGGBB", "RGB", "RRGGBB"
 * - Invalid input: returns default blue [0.18, 0.53, 0.87]
 */
export const hexToRgbNorm = (input: unknown): GradientColor => {
  if (Array.isArray(input) && input.length >= 3) {
    return [Number(input[0]) || 0, Number(input[1]) || 0, Number(input[2]) || 0];
  }
  const raw = typeof input === 'string' ? input : '';
  let value = raw.replace('#', '');
  if (value.length === 3) {
    value = value.split('').map((ch) => ch + ch).join('');
  }
  if (value.length !== 6) {
    return [0.18, 0.53, 0.87]; // Default blue
  }
  const r = decodeHex(value.slice(0, 2));
  const g = decodeHex(value.slice(2, 4));
  const b = decodeHex(value.slice(4, 6));
  return [r, g, b];
};

export type BufferWriter = ReturnType<typeof createBufferWriter>;
```

### Integration at Call Sites

```typescript
// In mount() function, after device and disposed are available:

// Create write context
const writeContext: BufferWriteContext = {
  isDisposed: () => disposed,
  emitDiagnostic,
  mountCanvasId,
};

// Create buffer writer (owns pre-allocated scratch buffers)
const bufferWriter = createBufferWriter({ device, context: writeContext });

// Call sites become:
bufferWriter.writeGradient(colorBuffers, cfg.gradient);
bufferWriter.writeBackgroundGradient(bgBuffers, bg, bgAngle);
bufferWriter.syncStyleParams(styleParamBuffer, cfg.styleParams ?? current.styleParams);
```

---

## Closure Resolution Strategy

### The Problem

The original design captured these via closure:
1. **Pre-allocated Float32Arrays** — For zero-allocation hot-path
2. **`disposed`** — Lifecycle guard
3. **`device`** — GPU device reference
4. **`mountCanvasId`** — Debug metrics key
5. **`emitDiagnostic`** — Telemetry function

### The Solution: Ownership Transfer + Context Interface

| Closure Variable | Resolution |
|---|---|
| `colorBufC1/C2/C3` | **Owned by factory instance** — allocated once when `createBufferWriter` is called |
| `bgBufC1/C2/C3` | **Owned by factory instance** |
| `styleParamCache` | **Owned by factory instance** |
| `disposed` | **Context interface** — `context.isDisposed()` delegates to mount closure |
| `device` | **Config injection** — passed once at factory creation |
| `mountCanvasId` | **Context interface** — optional, for debug metrics |
| `emitDiagnostic` | **Context interface** — delegates to mount's impl |

**Critical insight**: The pre-allocated buffers don't need to be in the `mount()` closure — they just need to exist for the lifetime of the mount. The factory pattern achieves this: the factory instance is created inside `mount()`, so its buffers live exactly as long as the mount.

---

## Implementation Steps

1. **Create `BufferLayout.ts`** (~220 lines)
   - Export `createBufferWriter` factory
   - Export `hexToRgbNorm` (move from webgpu_core.ts)
   - Export types: `BufferWriteContext`, `GradientBuffers`, `GradientColor`
   - Export `STYLE_PARAM_CAPACITY` re-export from styleParams.ts

2. **Create `BufferLayout.test.ts`** (~150 lines)
   - Unit tests for `hexToRgbNorm` (pure function)
   - Unit tests for factory creation
   - Integration tests with mock GPUDevice and GPUBuffer

3. **Update `webgpu_core.ts`**
   - Add import for `createBufferWriter`, `BufferWriteContext`
   - Remove `hexToRgbNorm` definition (L285-305)
   - Remove `decodeHex` helper (L283)
   - Remove pre-allocated buffer declarations (L2100-2105)
   - Remove `writeGradient` function (L2106-2127)
   - Remove `writeBackgroundGradient` function (L2125-2157)
   - Remove `syncStyleParams` function (L2161-2207)
   - Add context creation and `createBufferWriter` call after device ready
   - Update call sites at L3636, L4092, L4100

4. **Verify build and tests**
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`

**Net line change in webgpu_core.ts**: -130 lines (deletions) + ~15 lines (import + factory creation) = **~-115 lines**

---

## Test Coverage Plan

| Test Case | Category | Description |
|---|---|---|
| `hexToRgbNorm('#ff0000')` | Unit | Red hex → [1, 0, 0] |
| `hexToRgbNorm('#abc')` | Unit | Short hex expansion |
| `hexToRgbNorm([0.5, 0.5, 0.5])` | Unit | Array passthrough |
| `hexToRgbNorm('')` | Unit | Empty → default blue |
| `hexToRgbNorm(null)` | Unit | Null → default blue |
| `createBufferWriter` returns object | Unit | Factory creates valid instance |
| `writeGradient` writes 3 buffers | Integration | Verify `device.queue.writeBuffer` called 3× |
| `writeGradient` skips when disposed | Integration | No writes when `isDisposed()` true |
| `writeBackgroundGradient` interpolates 2-stop | Unit | Middle color is average |
| `writeBackgroundGradient` encodes angle in alpha | Unit | C1[3] === angle |
| `syncStyleParams` change detection | Integration | No write when values unchanged |
| `syncStyleParams` epsilon threshold | Unit | Values within 1e-6 don't trigger write |
| `syncStyleParams` sentinel enforcement | Unit | Index 47 forced to 1.0 if zero |
| `getMetrics()` accuracy | Unit | Counts match actual writes |
| `resetStyleParamCache()` forces re-sync | Unit | Full write after reset |

### Mock Strategy

```typescript
// Test mock for GPUDevice and GPUBuffer
const createMockDevice = () => {
  const writes: Array<{ buffer: GPUBuffer; offset: number; data: ArrayBuffer }> = [];
  return {
    queue: {
      writeBuffer: (buffer: GPUBuffer, offset: number, data: ArrayBuffer) => {
        writes.push({ buffer, offset, data: data.slice(0) });
      },
    },
    getWrites: () => writes,
    clearWrites: () => { writes.length = 0; },
  };
};

const createMockBuffer = (label: string): GPUBuffer => ({
  label,
  size: 16,
  usage: 0,
  mapState: 'unmapped',
  // ... other GPUBuffer fields
} as GPUBuffer);
```

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Factory instance created per mount** — memory leak if mounts leak | Low | Low | Factory lifetime tied to mount lifetime; no global refs. Mount cleanup already tested. |
| **Context interface indirection** — performance overhead | Low | Low | `isDisposed()` is a closure read, same as before. No function call overhead in hot path (inlined by V8). |
| **hexToRgbNorm moved** — breaking import if used elsewhere | Medium | Low | Grep confirms only used in webgpu_core.ts. Can add re-export from webgpu_core.ts if needed. |
| **Debug metrics global access** — TypeScript strictness | Low | Medium | Already using `as Record<string, unknown>` pattern. Preserved in new code. |
| **styleParamBuffer passed per-call** — potential null | Medium | Low | Existing code has same risk. Add early return if null (defense). |

### Verifier Attack Vectors to Address

1. **"Pre-allocated buffers are no longer truly pre-allocated"** — WRONG. Factory creates them once at mount time, identical to current behavior.

2. **"Context interface adds indirection"** — True, but `isDisposed()` is a single closure read. V8 inlines this pattern. Zero measurable overhead.

3. **"hexToRgbNorm duplication"** — Export from BufferLayout.ts, import in webgpu_core.ts. Single source of truth maintained.

4. **"Factory pattern increases complexity"** — Net complexity is lower: webgpu_core.ts loses 130 lines, gains 15. BufferLayout.ts is 220 lines of well-structured, testable code.

---

## Alternative Approaches Rejected

### Option B: Class-Based `BufferWriter`

```typescript
class BufferWriter {
  constructor(private device: GPUDevice, private context: BufferWriteContext) {
    this.colorBufC1 = new Float32Array(4);
    // ...
  }
}
```

**Rejected because**:
- Class instances have prototype overhead
- `this` binding adds complexity for callback patterns
- Factory pattern is more idiomatic for resource management in WebGPU codebases

### Option C: Pure Functions with Buffer Parameters

```typescript
function writeGradient(
  device: GPUDevice,
  buffers: GradientBuffers,
  gradient: unknown,
  scratchBuffer: Float32Array, // Pre-allocated, passed in
  disposed: boolean
): void { ... }
```

**Rejected because**:
- Caller must manage buffer allocation — spreads responsibility
- 6 scratch buffers × 3 functions = 18 parameters total across call sites
- Violates "let the module manage its own resources" principle

### Option D: Keep Functions in mount(), Extract Only hexToRgbNorm

**Rejected because**:
- Doesn't achieve the extraction goal (-100+ lines)
- Functions remain untestable (require full WebGPU context)
- Missed opportunity for cleaner separation of concerns

---

## Open Questions

1. **Should `hexToRgbNorm` stay exported from BufferLayout.ts or move to a shared `colors.ts` utility?**
   - Current proposal: Export from BufferLayout.ts since it's only used there
   - Alternative: Create `utils/colors.ts` for broader reuse

2. **Should factory return frozen object (`Object.freeze`)?**
   - Pro: Prevents accidental mutation of methods
   - Con: Slight overhead, probably unnecessary

3. **Should dev-mode Gyroid logging be preserved in syncStyleParams?**
   - Current code has `if (import.meta.env.DEV)` logging for Gyroid style
   - Proposal: Preserve it — it's useful for debugging and tree-shaken in production

---

## Summary for Verifier

This proposal:
- ✅ Preserves zero-allocation hot-path (buffers owned by factory instance)
- ✅ Maintains `disposed` lifecycle guard (via context interface)
- ✅ Enables unit testing (mock device + context)
- ✅ Removes ~115 net lines from webgpu_core.ts
- ✅ Follows existing patterns (similar to AxisOverlay.ts factory approach)
- ✅ No `any` casts required
- ✅ All dependencies traced and accounted for

**Verifier**: Attack my assumptions, trace the code paths, and verify that the factory ownership model truly preserves the current allocation behavior.
