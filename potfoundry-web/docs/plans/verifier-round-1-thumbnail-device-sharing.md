# Verifier Round 1 — Critique of Generator Thumbnail Device Sharing Proposal
Date: 2026-03-14

## Summary Verdict: ACCEPT WITH AMENDMENTS

The core architecture (single device, `setDevice()` injection, promise-gated queue) is sound. However, I found **2 CRITICAL** issues that must be fixed, **3 WARNINGS** that should be addressed, and **5 NOTES** of factual inaccuracies or observations.

---

## Critique

### C1 [CRITICAL]: Promise hangs forever if WebGPU init fails — REGRESSION from current behavior

**Generator's claim**: "If user navigates away before device is ready, queued renders complete pointlessly (harmless)."

**Actual behavior**: The current code in `ThumbnailRenderer._doInit()` ([ThumbnailRenderer.ts](../../../potfoundry-web/src/services/ThumbnailRenderer.ts#L80-L95)) independently checks `navigator.gpu` and returns `false` if WebGPU is unavailable. The `processQueue()` method ([ThumbnailRenderer.ts](../../../potfoundry-web/src/services/ThumbnailRenderer.ts#L192-L200)) then resolves all pending requests with `null`, and `DesignThumbnail` shows "Preview unavailable" immediately.

After the proposed change, if `webgpu_core.ts` init fails (line 942-944 returns `fail()`), `setDevice()` is never called. `processQueue()` awaits `this.deviceReady` forever. Every `DesignThumbnail` that triggers `renderThumbnail()` creates a promise that never resolves. The component remains in "loading" state indefinitely. **This is a user-visible regression from "shows error" to "shows spinner forever".**

**Counterexample**: User on an older device where `navigator.gpu` exists but `requestAdapter()` returns null. Current behavior: thumbnail shows "Preview unavailable" within milliseconds. Proposed behavior: thumbnail loader spins forever.

**Required fix**: The `deviceReady` promise MUST have a timeout or explicit rejection path. Two options:
1. **Timeout**: In `processQueue()`, race `this.deviceReady` against a 5-second timeout. On timeout, resolve all queued requests with `null`.
2. **Explicit rejection**: Add a `rejectDevice()` method. In `webgpu_core.ts`, call `ThumbnailRenderer.getInstance().rejectDevice()` in the `fail()` path. Better than timeout because it's immediate.

Option 2 is superior — it's deterministic. Add it to ALL the `fail()` return paths in `webgpu_core.ts` (there are multiple — search for `return fail(`). Plus add a timeout as a safety net.

---

### C2 [CRITICAL]: 200ms stabilization delay — ThumbnailRenderer may GPU-crash on Windows

**Generator's claim**: Injection site is "after line 949" — `ThumbnailRenderer.getInstance().setDevice(device)`.

**Actual behavior**: After `const device = renderer.device!` at [webgpu_core.ts](../../../potfoundry-web/src/webgpu_core.ts#L948), the code immediately performs a **200ms stabilization delay** at [webgpu_core.ts](../../../potfoundry-web/src/webgpu_core.ts#L1001-L1003):

```typescript
// CRITICAL: Add stabilization delay before first GPU operation.
// Windows Dawn WebGPU backend crashes with "Instance reference no longer exists" if GPU
// operations (like createTexture) happen too soon after device creation.
await new Promise(resolve => setTimeout(resolve, 200));
```

If `setDevice()` is called at line 949 (before the 200ms delay), and `processQueue()` has queued requests, it will immediately call `_initResources()` which calls `device.createBuffer()`, `device.createBindGroupLayout()`, etc. **These GPU operations happen during the stabilization window**, potentially triggering the exact Windows Dawn crash the delay is designed to prevent.

**Required fix**: The `setDevice()` call MUST be placed AFTER the 200ms stabilization delay. The exact injection point should be after line ~1003 (after `await new Promise(resolve => setTimeout(resolve, 200))`), not at line 949.

Even better: place it after SceneManager.init() succeeds (~line 1015), since that's when the device is proven stable and the full pipeline is operational.

---

### C3 [WARNING]: Pipeline cache invalidation after device loss is incomplete

**Generator's claim**: `destroyResources()` handles cleanup on device loss.

**Actual behavior**: The proposal's device-lost handler calls `destroyResources()` and sets `this.deviceLost = true`. But it does NOT reset `this.deviceReady` to a new unresolved Promise. If the app somehow recovers (device re-creation), a new `setDevice()` call would:
1. Try to resolve an already-resolved Promise (no-op — Promises resolve once).
2. `processQueue()` would immediately get the OLD (lost) device from the resolved Promise.

**Counterexample**: Tab backgrounded on Android → device lost → user foregrounds → main renderer re-initializes → calls `setDevice(newDevice)` → Promise is already resolved → thumbnail renders fail silently.

**Required fix**: `setDevice()` must create a fresh `deviceReady` Promise each time it's called, or at minimum check if the device is different from the stored one and re-initialize. The simplest fix: in `setDevice()`, always create a new Promise and resolve it immediately:
```typescript
setDevice(device: GPUDevice): void {
    this.device = device;
    this.deviceLost = false;
    this.deviceReady = Promise.resolve(device);
    this._initResources(device);
    device.lost.then(() => { ... });
}
```

**Severity justification**: WARNING not CRITICAL because the main app doesn't currently recover from device loss either (`webgpu_core.ts` device.lost handler just logs). But the ThumbnailRenderer design should not have a structural bug even if the path isn't exercised today.

---

### C4 [WARNING]: `device.lost` does NOT fire before GPU operations fail

**Generator's assumption**: "device.lost fires before any subsequent GPU operations fail — i.e., we can rely on the lost handler being called rather than catching errors in every createTexture/writeBuffer."

**Actual behavior per WebGPU spec**: `device.lost` is a Promise that resolves asynchronously. GPU operations on a lost device don't throw — they return error objects silently (`createTexture` returns an error texture, `queue.submit` is a no-op, `mapAsync` rejects). The `device.lost` Promise may resolve AFTER several operations have already silently produced error outputs.

**Concrete scenario**: `doRender()` is mid-execution at the `device.queue.submit()` call ([ThumbnailRenderer.ts](../../../potfoundry-web/src/services/ThumbnailRenderer.ts#L352)). Device is lost. `submit()` silently no-ops. `onSubmittedWorkDone()` resolves (work is "done" — it was dropped). `readBuffer.mapAsync(READ)` then REJECTS with an OperationError. The existing `try/catch` in `processQueue()` ([ThumbnailRenderer.ts](../../../potfoundry-web/src/services/ThumbnailRenderer.ts#L206)) catches this and resolves with `null`. Meanwhile `device.lost` fires asynchronously and sets `deviceLost = true`.

**Assessment**: The existing `try/catch` pattern in `processQueue()` already handles the mid-render failure case by resolving with `null`. The `device.lost` handler is belt-and-suspenders for draining the queue. This is actually **safe in practice** despite the Generator's incorrect reasoning about the ordering guarantee. The defense-in-depth works.

**Required fix**: None functionally, but the Generator's WORDING should be corrected in documentation. The `device.lost` handler is not a pre-check — it's a cleanup for future requests. The `try/catch` around `doRender()` is the primary error handler.

---

### C5 [WARNING]: DPR line is computed during React render — recalculated on every re-render

**Generator's claim**: "DPR is currently computed in DesignThumbnail.tsx:42."

**Actual code** at [DesignThumbnail.tsx](../../../potfoundry-web/src/ui/shared/DesignThumbnail.tsx#L42):
```typescript
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
const renderWidth = Math.floor(width * dpr);
const renderHeight = Math.floor(height * dpr);
```

This is computed INSIDE the component body (not in useEffect or useMemo). It runs on every render, not just once. However, `DesignThumbnail` is wrapped in `memo()` with a custom comparator that short-circuits if `design.id`, `width`, and `height` are unchanged. So re-renders are rare. Still, the DPR should be memoized or computed in the effect that triggers rendering — not on every render cycle.

**Required fix for Proposal 2**: The DPR cap change is fine, but wrap it in `useMemo` to avoid unnecessary recalculation:
```typescript
const dpr = useMemo(() => {
    if (typeof window === 'undefined') return 1;
    return isMobileDevice() ? 1.0 : Math.min(window.devicePixelRatio || 1, 2.0);
}, []);
```

Note: empty dependency array is correct since DPR doesn't change during component lifetime (DPR changes trigger page-level handling via ResizeManager).

---

### C6 [NOTE]: Preset count is 15, not 17

**Generator's claim**: "PresetPanel.tsx:68 creates 17 DesignThumbnail components"

**Actual count**: `presets.ts` contains exactly **15 presets** (verified by counting `id:` fields at [presets.ts](../../../potfoundry-web/src/presets/presets.ts#L101)): classic-terracotta, classic-planter, classic-vase, modern-cylinder, modern-twist, modern-hex, organic-ripple, organic-bloom, organic-bamboo, geo-lowpoly, geo-voronoi, geo-spiral, exp-gyroid, exp-celtic, exp-interference.

**Impact**: Math is off (not 17 × 385×330 but 15 × whatever). Does not change the proposal's validity, but the "17 thumbnails at 385×330" claim is factually wrong. It's 15 thumbnails.

---

### C7 [NOTE]: Presets section has `defaultOpen={false}` — thumbnails don't render on first load

**Generator's claim**: "PresetPanel.tsx is on the Design tab — it renders on first load" and "17 thumbnails render during the first few frames."

**Actual behavior**: PresetPanel uses `<Section defaultOpen={false}>` at [PresetPanel.tsx](../../../potfoundry-web/src/ui/controls/PresetPanel.tsx#L253). The Section component uses Radix `Collapsible.Content` WITHOUT `forceMount` at [Section.tsx](../../../potfoundry-web/src/ui/shared/Section.tsx#L90-L92). Radix Collapsible does NOT mount children when collapsed.

**Consequence**: DesignThumbnail components are NOT in the DOM at page load. They only mount when the user clicks the "Presets" section header to expand it. By that time, `webgpu_core.ts` init has almost certainly completed (it takes ~300ms total with the 200ms delay). This significantly reduces the timing race severity.

**Impact**: The device-sharing design is still correct (queue pattern handles any timing), but the Generator's urgency about "17 thumbnails crashing mobile on first load" is overstated. The burst happens on user interaction, not on boot.

---

### C8 [NOTE]: Generator line number inaccuracies

Minor but worth documenting for the Executioner:

| Generator claim | Actual |
|---|---|
| `ThumbnailRenderer.ts` line 84 — `requestAdapter()` | Line **86** |
| `ThumbnailRenderer.ts` lines 78-95 — adapter/device creation | Lines **80-95** (`_doInit()` starts at 80) |
| `ThumbnailRenderer.ts` line 152 — `pipelineCache` | Line **155** (`pipelineCache` declared) / used in `doRender` at line 222 |
| `webgpu_core.ts` line 949 — device available | Line **948** (`const device = renderer.device!`) |
| `webgpu_core.ts` line 941 — "Main init creates WebGPURenderer" | Line **941** is correct |
| `PresetPanel.tsx` line 68 — "creates 17 DesignThumbnail" | Line 68 is the `PresetCard` button class, not where `DesignThumbnail` is created. `DesignThumbnail` is at **line 72** inside `PresetCard`. |

---

### C9 [NOTE]: Mobile shader is fully compatible with ThumbnailRenderer bind group layout

**Verified**: The mobile shader `preview_full_mobile.wgsl` at [preview_full_mobile.wgsl](../../../potfoundry-web/src/assets/shaders/preview_full_mobile.wgsl#L13-L20) declares:
- `@group(0) @binding(0)` — PreviewParams (uniform)
- `@group(0) @binding(1)` — uC1 (vec4)
- `@group(0) @binding(2)` — uC2 (vec4)
- `@group(0) @binding(3)` — uC3 (vec4)
- `@group(0) @binding(4)` — StyleParams (uniform)
- `@group(0) @binding(5)` — uBg1 (vec4)
- `@group(0) @binding(6)` — uBg2 (vec4)
- `@group(0) @binding(7)` — uBg3 (vec4)

This matches ThumbnailRenderer's `bindGroupLayout` at [ThumbnailRenderer.ts](../../../potfoundry-web/src/services/ThumbnailRenderer.ts#L128-L147) exactly (bindings 0-7, all uniform buffers).

Entry points `vs_main` (line 208) and `fs_main` (line 335) match ThumbnailRenderer's pipeline creation at [ThumbnailRenderer.ts](../../../potfoundry-web/src/services/ThumbnailRenderer.ts#L237-L240).

**Verdict**: CONFIRMED SAFE. No mobile shader incompatibility.

---

### C10 [NOTE]: `isMobileDevice()` is side-effect-free — safe during React render

**Verified** at [ResizeManager.ts](../../../potfoundry-web/src/ResizeManager.ts#L150-L169):
```typescript
export function isMobileDevice(): boolean {
  if (import.meta.env.VITE_MOBILE === '1') return true;
  if (MOBILE_UA_PATTERN.test(navigator.userAgent)) return true;
  if (navigator.maxTouchPoints > 0 && window.screen.width <= MOBILE_SCREEN_WIDTH_THRESHOLD) return true;
  return false;
}
```

All reads, no writes, no DOM manipulation. Safe to call during render.

**Verdict**: CONFIRMED SAFE.

---

### C11 — Race condition in processQueue: CONFIRMED SAFE

**Attack**: What if a second `renderThumbnail()` call arrives during the `await this.deviceReady`?

**Actual code** at [ThumbnailRenderer.ts](../../../potfoundry-web/src/services/ThumbnailRenderer.ts#L189-L212):
```typescript
private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    // ...
    while (this.queue.length > 0) { ... }
    this.processing = false;
}
```

The second call sees `this.processing === true` and returns immediately. Its request is already in `this.queue` (pushed by `renderThumbnail()` before calling `processQueue()`). The first call's `while` loop picks it up when it gets to it.

**Verdict**: CONFIRMED SAFE. Classic mutex-via-flag pattern, correct for single-threaded JS.

---

### C12 — GPU queue contention: LOW RISK but real

**Attack**: Can the main render loop and thumbnail rendering conflict on the command queue?

**Main render loop** at [webgpu_core.ts](../../../potfoundry-web/src/webgpu_core.ts#L3939-L3966): `const frame = (): void => { ... }` called via `requestAnimationFrame`. Submits at [webgpu_core.ts](../../../potfoundry-web/src/webgpu_core.ts#L3642): `device.queue.submit([commandBuffer])`.

**ThumbnailRenderer** at [ThumbnailRenderer.ts](../../../potfoundry-web/src/services/ThumbnailRenderer.ts#L352): `device.queue.submit([commandEncoder.finish()])` followed by `await device.queue.onSubmittedWorkDone()` then `await readBuffer.mapAsync(READ)`.

The `onSubmittedWorkDone()` + `mapAsync(READ)` blocks the thumbnail's async function until GPU work completes, but does NOT block the main thread or the rAF loop. The main renderer can still submit frames while thumbnail is waiting for readback. WebGPU serializes command buffer execution per-queue — they'll execute in submission order.

**Risk**: On low-end mobile GPUs, a thumbnail render could add ~2-5ms of GPU work to the queue, potentially causing a frame drop if it lands right before the main frame's command buffer. With 15 thumbnails in rapid succession, this could cause a perceptible stutter.

**Verdict**: LOW RISK. Proposal 3 (rAF throttle) is the correct mitigation if testing reveals frame drops. Generator correctly identified this as "add if needed."

---

## Accepted Items

1. **Proposal 1 core architecture** (device injection via `setDevice()` + promise-gated queue): ACCEPTED with amendments C1, C2, C3.
2. **Proposal 2** (DPR capping): ACCEPTED with amendment C5 (useMemo wrap).
3. **Proposal 3** (rAF throttle): ACCEPTED as optional — defer to testing. Design is sound.
4. **Proposal 4** (shared pipeline layout): ACCEPTED as "defer" — Generator's own conclusion is correct.
5. **Mobile shader compatibility**: CONFIRMED SAFE (C9).
6. **`isMobileDevice()` safety**: CONFIRMED SAFE (C10).
7. **Queue race condition safety**: CONFIRMED SAFE (C11).

---

## Implementation Conditions (for Executioner)

### Must-fix before implementation:

1. **C1 — Add explicit rejection path**: Add a `rejectDevice()` method to ThumbnailRenderer. Call it from every `fail()` return path in `webgpu_core.ts`. Also add a 10-second safety timeout in `processQueue()`. Both are required.

2. **C2 — Correct injection site**: Place `ThumbnailRenderer.getInstance().setDevice(device)` AFTER the 200ms stabilization delay AND after SceneManager.init() succeeds (approximately line 1015 of `webgpu_core.ts`, not line 949).

3. **C3 — Allow re-initialization**: `setDevice()` must overwrite `this.deviceReady` with `Promise.resolve(device)` so it works correctly if called a second time after device loss recovery.

4. **C5 — Wrap DPR in useMemo**: Avoid recomputation on every render.

### File change summary (revised from Generator):

| File | Changes |
|------|---------|
| `ThumbnailRenderer.ts` | Remove adapter/device lines 86-95. Add `setDevice(device)` with `deviceReady = Promise.resolve(device)` pattern. Add `rejectDevice()` with `deviceReady = Promise.resolve(null)`. Add `_initResources(device)`. Add device-lost handler. Add 10s timeout in `processQueue()`. Update `dispose()` to resolve null. |
| `webgpu_core.ts` | Add import. Add `setDevice(device)` call AFTER stabilization delay and SceneManager.init (~line 1015). Add `rejectDevice()` calls in all `fail()` paths after line 942. |
| `DesignThumbnail.tsx` | Import `isMobileDevice`. Wrap DPR computation in `useMemo`. Apply mobile=1.0 / desktop=min(dpr,2.0) cap. |

### Validation protocol:

1. **Desktop happy path**: All 15 preset thumbnails render correctly with shared device.
2. **Mobile DPR cap**: Verify thumbnail canvas dimensions are 140×105 on mobile (not 385×289).
3. **WebGPU unavailable path**: Force `navigator.gpu = undefined`. Verify thumbnails show "Preview unavailable" within 10 seconds (not hang forever).
4. **Device loss simulation**: Use Chrome DevTools "Lose WebGPU device" command. Verify thumbnails fail gracefully, no unhandled promise rejections.
5. **Timing test**: Open Presets section before WebGPU init completes (add artificial delay). Verify thumbnails eventually render after device is ready.
6. **No new ESLint warnings**: `npm run lint` passes clean.
7. **No new TypeScript errors**: `npm run typecheck` passes.
8. **Existing tests pass**: `npm test` passes.
