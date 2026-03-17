# Generator Round 1 — ThumbnailRenderer Device Sharing
Date: 2026-03-14

## Problem Statement

`ThumbnailRenderer.ts` creates its **own** `GPUDevice` via bare `navigator.gpu.requestAdapter()` at line 84 — no mobile adapter strategy (no `getBestAdapter()` 3-tier fallback), no compatibility mode, no `device.lost` handler. This spawns a **second** `GPUDevice` competing with the main `WebGPURenderer.device` for GPU memory and command queues.

On mobile (Adreno 730, Chrome 145), two concurrent GPUDevices exceed driver limits; the second `requestDevice()` either fails silently or causes the first device to be lost.

Additionally, `DesignThumbnail.tsx:42` uses raw `window.devicePixelRatio` with no cap — a Pixel 7 at DPR 2.75 renders 17 thumbnails at 385×330 pixels each, creating 17 render-target + depth + readback buffer sets in quick succession. That's ~50 GPU allocations in a burst.

## Root Cause Analysis

### The dual-device problem
- `WebGPURenderer.ts:67-135` — `init()` calls `getBestAdapter()` (3-tier: high-perf → default → compatibility), then `adapter.requestDevice(deviceDescriptor)` with explicit `requiredLimits`.
- `ThumbnailRenderer.ts:84-95` — `_doInit()` calls bare `navigator.gpu.requestAdapter()` (no power preference, no compatibility fallback), then bare `adapter.requestDevice()` (no limits). Two different adapters, two different devices.
- `webgpu_core.ts:941-949` — Main init creates `WebGPURenderer`, calls `renderer.init()`, extracts `device`. This device is the "canonical" one.
- `ThumbnailRenderer` is instantiated lazily via `getInstance()` when `DesignThumbnail` first renders. `PresetPanel.tsx:68` creates 17 `DesignThumbnail` components, each calling `renderThumbnail()`.

### The timing race
- `webgpu_core.ts:942` — `renderer.init()` is async. The React tree renders before it completes.
- `PresetPanel.tsx` is on the Design tab — it renders on first load.
- `DesignThumbnail.tsx:64-80` — `useEffect` fires when `isVisible` becomes true (IntersectionObserver). By that time, `webgpu_core.ts` may or may not have finished `init()`.
- Currently, `ThumbnailRenderer._doInit()` creates its own device, so it doesn't depend on the main renderer's timing. After the fix, it WILL depend on it.

### No device-lost handling
- `ThumbnailRenderer.ts` has zero `device.lost` handling. If the device is lost (common on Android during backgrounding), all subsequent GPU operations throw, producing uncaught errors and broken thumbnails.
- `WebGPURenderer.ts:144-146` has a `device.lost` handler but it only logs.
- `webgpu_core.ts:971-980` has a deferred `device.lost` handler (500ms delay) that does proper cleanup.

## Proposals

### Proposal 1: `setDevice()` Injection with Promise-Gated Queue (Recommended)

**Idea**: Add a `setDevice(device: GPUDevice)` method to `ThumbnailRenderer`. Remove all adapter/device creation from `_doInit()`. Replace `_doInit()` with `_initResources(device)` that creates only GPU resources (buffers, layouts, pipelines) on the injected device. Pending `renderThumbnail()` calls wait on a Promise that resolves when `setDevice()` is called.

**Mechanism**:

```
ThumbnailRenderer lifecycle:
  1. getInstance() — creates singleton (no GPU work)
  2. renderThumbnail() calls enqueue into this.queue
  3. processQueue() calls this.waitForDevice() which returns a Promise
  4. webgpu_core.ts calls ThumbnailRenderer.getInstance().setDevice(device)
  5. waitForDevice() resolves → processQueue() runs → buffers created → renders execute
  6. If device.lost fires → this.deviceLost = true → pending requests resolve(null)
```

**Device injection API**:
```typescript
// On ThumbnailRenderer:
setDevice(device: GPUDevice): void
  - Stores device reference
  - Calls _initResources(device) to create buffers/layouts
  - Resolves the deviceReady promise → unblocks queued renders
  - Registers device.lost handler

// On caller side (webgpu_core.ts, after renderer.init()):
ThumbnailRenderer.getInstance().setDevice(device);
```

**Internal state machine**:
```typescript
private device: GPUDevice | null = null;
private deviceReady: Promise<GPUDevice | null>;
private deviceReadyResolve: ((device: GPUDevice | null) => void) | null = null;
private deviceLost = false;

constructor() {
    this.deviceReady = new Promise(resolve => {
        this.deviceReadyResolve = resolve;
    });
}
```

**Key design decisions**:

1. **`_doInit()` → `_initResources(device)`**: The current `_doInit()` does adapter negotiation (lines 78-95) AND resource creation (lines 98-163). Split: delete lines 78-95, keep lines 98-163 but use the injected device.

2. **Queue draining**: `processQueue()` currently calls `this.initialize()` which calls `_doInit()`. Replace with:
   ```typescript
   private async processQueue(): Promise<void> {
       if (this.processing || this.queue.length === 0) return;
       this.processing = true;

       const device = await this.deviceReady;
       if (!device || this.deviceLost || !this.resources) {
           // Fail all pending
           while (this.queue.length > 0) {
               this.queue.shift()!.resolve(null);
           }
           this.processing = false;
           return;
       }
       // ... rest unchanged
   }
   ```

3. **Device-lost handler** (registered in `setDevice()`):
   ```typescript
   device.lost.then(() => {
       this.deviceLost = true;
       // Destroy GPU resources (they're invalid now)
       this.destroyResources();
       // Fail any queued requests
       while (this.queue.length > 0) {
           this.queue.shift()!.resolve(null);
       }
   });
   ```

4. **No import of WebGPURenderer**: `ThumbnailRenderer` receives a bare `GPUDevice` — it has no dependency on `WebGPURenderer`. Injection happens from `webgpu_core.ts`, which already holds both.

**Files affected**:
| File | Change |
|------|--------|
| `ThumbnailRenderer.ts` | Remove adapter/device creation. Add `setDevice()`. Replace `initialize()` + `_doInit()` with `_initResources()`. Add device-lost handler. Add `deviceReady` promise. |
| `webgpu_core.ts` | After `renderer.init()` succeeds (line 949), add `ThumbnailRenderer.getInstance().setDevice(device)`. Single import, single line. |
| `DesignThumbnail.tsx` | No changes needed — `renderThumbnail()` API unchanged. |
| `PresetPanel.tsx` | No changes needed. |

**Trade-offs**:
- (+) Clean separation. ThumbnailRenderer knows nothing about WebGPURenderer.
- (+) Queued requests naturally wait for device.
- (+) Device-lost is handled properly.
- (+) Trivial injection site (one line in webgpu_core.ts).
- (-) If `webgpu_core.ts` init fails, thumbnails show "Preview unavailable" (correct graceful degradation).
- (-) If user navigates away before device is ready, queued renders complete pointlessly (harmless — they resolve to ImageData and React has already unmounted the canvas).

**Assumptions** (for Verifier to attack):
1. `device.lost` fires before any subsequent GPU operations fail — i.e., we can rely on the lost handler being called rather than catching errors in every `createTexture`/`writeBuffer`.
2. A single `GPUDevice` can handle both the main render loop AND thumbnail rendering without queue contention. The main render loop does `requestAnimationFrame` → `commandEncoder` → `queue.submit()`. Thumbnail does the same interleaved. Since WebGPU command queues are serialized per-device, this is safe — commands execute in submission order. But could it cause frame drops?
3. The `deviceReady` Promise pattern doesn't leak if `setDevice()` is never called (e.g., WebGL fallback path). The Promise resolves to `null` in `dispose()`, or the singleton is GC'd along with the Promise.
4. `webgpu_core.ts` calls `setDevice()` synchronously after `renderer.init()`. There's no risk of a race between `setDevice()` and `processQueue()` because `processQueue()` awaits `this.deviceReady`, which won't resolve until `setDevice()` runs.

---

### Proposal 2: Mobile DPR Capping for Thumbnails

**Idea**: Cap thumbnail DPR to 1.0 on mobile. Thumbnails are 140×105 CSS pixels (PresetPanel.tsx:76). At DPR 2.75, that's 385×289 GPU pixels. At DPR 1.0, it's 140×105 — **7.6× fewer pixels per thumbnail**. Across 17 thumbnails, that's a massive reduction in GPU memory and readback bandwidth.

**Mechanism**: The DPR is currently computed in `DesignThumbnail.tsx:42`:
```typescript
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
```
No mobile check whatsoever.

Proposed change:
```typescript
const dpr = typeof window !== 'undefined'
    ? (isMobileDevice() ? 1.0 : Math.min(window.devicePixelRatio || 1, 2.0))
    : 1;
```

This caps mobile thumbnails at 1:1 pixel mapping and desktop at 2.0x. Thumbnails are ~100px CSS elements — 1:1 is plenty of resolution for a tiny preview card.

**Files affected**:
| File | Change |
|------|--------|
| `DesignThumbnail.tsx` | Import `isMobileDevice` from `ResizeManager`. Cap DPR. |

**Trade-offs**:
- (+) 7.6× less GPU work per thumbnail on mobile.
- (+) Smaller readback buffers → less `mapAsync` pressure.
- (+) Thumbnails are tiny — visual quality loss is imperceptible.
- (-) Desktop at DPR 3.0 is capped at 2.0 — acceptable for a 140px element.
- (-) Adds an import dependency from UI to `ResizeManager` (but `ResizeManager` is already used widely).

**Assumptions**:
1. `isMobileDevice()` is safe to call from component render (it checks `navigator.userAgent` synchronously — no side effects).
2. 140×105 pixels is sufficient resolution for a thumbnail on a phone screen where physical pixel density compensates for lower rendered resolution.

---

### Proposal 3: Readback Throttling (Moderate)

**Idea**: Add an inter-render delay in `processQueue()` on mobile to prevent GPU stalls from 17 consecutive `mapAsync(READ)` calls.

**Mechanism**: After each `doRender()` completes, insert a `requestAnimationFrame`-paced delay on mobile:
```typescript
while (this.queue.length > 0) {
    const request = this.queue.shift()!;
    try {
        const imageData = await this.doRender(request);
        request.resolve(imageData);
    } catch (err) {
        request.resolve(null);
    }
    // On mobile, yield to the main render loop between thumbnails
    if (isMobileDevice()) {
        await new Promise(r => requestAnimationFrame(r));
    }
}
```

Each `doRender()` does: `queue.submit()` → `queue.onSubmittedWorkDone()` → `readBuffer.mapAsync(READ)` → copy → destroy. The `requestAnimationFrame` yield gives the main render loop a chance to submit its frame between thumbnail renders.

**Files affected**:
| File | Change |
|------|--------|
| `ThumbnailRenderer.ts` | Import `isMobileDevice`. Add rAF yield in `processQueue()`. |

**Trade-offs**:
- (+) Prevents GPU queue starvation on mobile.
- (+) Main renderer keeps animating during thumbnail generation.
- (-) 17 thumbnails × 16ms rAF delay = ~270ms total additional time to render all thumbnails. Acceptable since they load lazily and IntersectionObserver only triggers visible ones.
- (-) Adds `requestAnimationFrame` in a service class (unusual but not wrong).

**Assumptions**:
1. `requestAnimationFrame` in a service class is acceptable. Alternative: `setTimeout(0)` to simply yield the microtask queue. But rAF specifically aligns with the rendering pipeline.
2. The IntersectionObserver threshold (0.1 with 50px rootMargin) means not all 17 render at once — maybe 4-6 are visible initially. The throttle is still helpful for that initial burst.

---

### Proposal 4: Shared Pipeline Layout (Radical — Lower Priority)

**Idea**: ThumbnailRenderer currently duplicates the bind group layout and pipeline layout from the main renderer (`ThumbnailRenderer.ts:128-162`). Since it now shares the device, it could share the pipeline layout from `SceneManager`. This would also allow sharing compiled shader modules (expensive on mobile).

**Why I'd defer this**: It creates a dependency between ThumbnailRenderer and SceneManager. The current layout duplication costs ~1KB of GPU metadata — negligible. Shader compilation caching already exists via `pipelineCache` (line 152). The risk/reward ratio is poor for a first pass.

**Files affected** (hypothetical):
- `ThumbnailRenderer.ts` — accept `GPUPipelineLayout` and `GPUBindGroupLayout` in addition to device
- `SceneManager.ts` — expose `pipelineLayout` and `bindGroupLayout` as public
- `webgpu_core.ts` — pass both to ThumbnailRenderer

**Trade-offs**:
- (+) Eliminates pipeline layout duplication.
- (+) Could share shader modules → faster first thumbnail.
- (-) Tight coupling between ThumbnailRenderer and SceneManager's internal layout.
- (-) If SceneManager layout changes, ThumbnailRenderer breaks.
- (-) Minimal real-world perf gain.

**Assumptions**:
1. The bind group layout in ThumbnailRenderer (`ThumbnailRenderer.ts:128-147`) is identical to the one created by SceneManager for the main pipeline. (Needs verification — the entry visibility flags might differ.)

---

## Recommended Approach

**Ship Proposals 1 + 2 together. Add Proposal 3 if mobile testing shows frame drops.**

Rationale:
- **Proposal 1** (device sharing) eliminates the dual-device problem — the root cause of mobile crashes.
- **Proposal 2** (DPR capping) reduces GPU work by 7.6× per thumbnail on mobile — a simple multiplicative win.
- **Proposal 3** (throttling) is insurance against GPU queue contention. May not be needed if DPR capping sufficiently reduces the load. Test first, add if needed.
- **Proposal 4** (shared layouts) is over-engineering for the problem at hand. Defer.

### Combined change summary

| File | Changes |
|------|---------|
| `ThumbnailRenderer.ts` | Remove `_doInit()` adapter/device creation (lines 78-95). Add `setDevice(device: GPUDevice)`. Add `_initResources(device: GPUDevice)`. Add `deviceReady` promise + resolve. Add `deviceLost` flag + handler. Update `processQueue()` to await device. Update `dispose()` to resolve promise with null. |
| `webgpu_core.ts` | Add import of `ThumbnailRenderer`. Add one line after line 949: `ThumbnailRenderer.getInstance().setDevice(device);` |
| `DesignThumbnail.tsx` | Import `isMobileDevice`. Cap DPR: mobile=1.0, desktop=min(dpr, 2.0). |

Total: ~50 lines changed across 3 files. No API surface change for consumers (`renderThumbnail()` signature unchanged).

## Risk Assessment

1. **Timing race between React render and device injection**: LOW. The `deviceReady` promise naturally queues requests. If `setDevice()` is never called (WebGL fallback), the promise hangs. Mitigate: add a 10-second timeout in `processQueue()` that resolves queued requests with null if device never arrives.

2. **GPU queue contention**: MEDIUM. The main render loop and thumbnail rendering now share one command queue. On mobile, if 4 thumbnails render during the first few frames, the main preview may stutter. Mitigation: Proposal 3 (rAF throttle) if needed.

3. **Device-lost during thumbnail render**: LOW. The `device.lost` handler in Proposal 1 covers this. Individual `doRender()` calls may throw if the device is lost mid-render — the existing try/catch in `processQueue()` handles this.

4. **Pipeline layout compatibility**: LOW. ThumbnailRenderer creates its own `GPUBindGroupLayout` and `GPURenderPipeline`. These are valid on any `GPUDevice` that supports the required features (uniform buffers, basic vertex/fragment). No exotic features used.

5. **Memory cleanup on device loss**: MEDIUM. When `device.lost` fires, all GPU resources are invalid but not freed. `destroyResources()` should call `.destroy()` on all buffers — this is safe even on a lost device (it's a no-op per spec). Current `dispose()` already does this.

6. **WebGL fallback path**: LOW. If `webgpu_core.ts` takes the WebGL fallback path, `setDevice()` is never called. Thumbnails show "Preview unavailable". This is correct behavior — thumbnails require WebGPU shaders that WebGL can't run.

## Open Questions

1. **Should ThumbnailRenderer have a timeout?** If `webgpu_core.ts` init fails or takes >10s, queued thumbnail requests hang forever. A timeout (resolve with null) seems prudent but could race with legitimately slow mobile init.

2. **Should we share the same `GPUDevice.queue` or is there a way to create a separate queue on the same device?** WebGPU spec says `device.queue` is the only queue per device. So sharing is mandatory — the question is whether interleaving is a problem in practice.

3. **Does `DesignThumbnail` need to re-render if the device is recovered after loss?** Currently no — thumbnails are render-once (`hasRendered` flag). If the device is lost and recovered, already-rendered thumbnails keep their `putImageData` result (2D canvas, not GPU). Only thumbnails that were in-flight during device loss would fail.
