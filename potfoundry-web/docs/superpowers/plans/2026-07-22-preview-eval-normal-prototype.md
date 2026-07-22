# Preview Eval-Compute + Neighbor-Normal Prototype — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove — in the real app, behind a dev flag — that computing preview surface normals from an eval-compute position grid (instead of the per-vertex 7× `surface_normal` finite-difference) is visually identical, and that it enables a compile-once / instant-switch preview.

**Architecture:** Split the live preview into three GPU stages instead of one monolithic per-style render pipeline: **(1)** a *universal* position-eval compute pass (`style_id` via uniform) that writes a per-vertex position buffer; **(2)** a *style-independent* neighbor-normal compute pass that derives normals from grid neighbors of that buffer; **(3)** a *style-independent* render pipeline that reads position+normal buffers and lights. Only stage 1 depends on style, and it is compiled once (universal), so a style switch becomes a uniform write + two compute dispatches — no shader compilation.

**Tech Stack:** TypeScript, WebGPU (WGSL), Vitest (jsdom) for assembly-level unit tests, Playwright + system Edge for on-hardware compile/fidelity/perf gates (jsdom has no GPU).

## Global Constraints

- Style IDs are permanent; never renumber. (CLAUDE.md)
- ESLint 0-warnings policy — any warning fails `npm run lint`. (CLAUDE.md)
- WGSL: `vec3<f32>` needs 16-byte alignment in storage/uniform structs; missing padding silently corrupts. (CLAUDE.md)
- The new path is **flag-gated and OFF by default** for this entire plan. The current procedural `surface_normal` path remains the default and untouched fallback.
- Dev-flag convention mirrors existing levers (`window.__pfRaycast`, `__pfDsRingStrips`): gate on `localStorage['pf-preview-eval']==='1'` OR `window.__pfPreviewEval===true`.
- Measured baseline to beat/preserve (real HW, NVIDIA Turing, this machine): per-style preview compile 7–19 s; universal position-eval compile **15.2 s** (one-time); neighbor-normal compile **63 ms**; buffer-read render **49 ms**.
- Run the dev server for in-app gates on the isolated `dev-verify` port (3057) to avoid colliding with concurrent sessions.

---

## File Structure

- `src/renderers/webgpu/ShaderManager.ts` — **Modify.** Add `getEvalPositionWGSL()` (universal position-eval compute) and `getNeighborNormalWGSL()` (style-free normal compute). Reuses existing raw-WGSL members + the universal dispatch already used by `getUniversalWGSL()`.
- `src/renderers/webgpu/PreviewEvalComputer.ts` — **Create.** Owns the two compute pipelines + the position/normal storage buffers; `ensureCompiled()`, `resize(vertexCount)`, `evaluate(styleId)`. Mirrors `ExportComputer`'s ResourceScope/compute-pass pattern.
- `src/assets/shaders/preview_eval_readnormal.wgsl` — **Create.** Prototype fragment/vertex delta: same as `preview_main.wgsl` but reads `n_local` from a bound normal buffer instead of calling `surface_normal`. (Phase A isolates the normal source only; position stays procedural so the image-diff isolates exactly one variable.)
- `src/webgpu_core.ts` — **Modify.** Behind the flag: construct `PreviewEvalComputer`, dispatch on style/param change, select the read-normal shader for the preview pipeline. Untouched when flag off.
- `e2e/_preview_eval_fidelity.mjs` — **Create.** Playwright gate: drives the app twice (flag off vs on) for a set of styles, screenshots the pot, pixel-diffs. Also records in-app startup + switch timings from the DevConsole.
- `src/renderers/webgpu/ShaderManager.eval.test.ts` — **Create.** Vitest: assembly-level assertions on the new WGSL (entry points present, single-eval, no `surface_normal` reference in the normal shader).

---

## Task 1: ShaderManager — universal position-eval compute WGSL

**Files:**
- Modify: `src/renderers/webgpu/ShaderManager.ts`
- Test: `src/renderers/webgpu/ShaderManager.eval.test.ts`

**Interfaces:**
- Consumes: existing private members `constantsWgsl`, `commonWgsl`, `uniformsWgsl`, `stylesWgsl`; the universal `style_radius` switch-dispatch already built inside `getUniversalWGSL()` (extract it into a private `buildUniversalDispatch(): string` if not already isolated).
- Produces: `getEvalPositionWGSL(): string` — a compute shader with `@compute @workgroup_size(64) fn eval_pos(...)` that binds the same group-0 uniforms as the preview and writes `array<vec3<f32>>` positions at `@group(1) @binding(0)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { ShaderManager } from './ShaderManager';

describe('getEvalPositionWGSL', () => {
  it('is a compute shader that calls surface_point once and writes positions', () => {
    const wgsl = ShaderManager.getInstance().getEvalPositionWGSL();
    expect(wgsl).toMatch(/@compute\s+@workgroup_size\(64\)\s+fn\s+eval_pos/);
    // universal dispatch present (all styles reachable)
    expect(wgsl).toContain('fn style_radius(');
    // writes a position storage buffer
    expect(wgsl).toMatch(/var<storage,\s*read_write>\s+\w+\s*:\s*array<vec3<f32>>/);
    // single surface_point call in the entry (position only, no normal re-eval)
    const body = wgsl.slice(wgsl.indexOf('fn eval_pos'));
    expect((body.match(/surface_point\(/g) || []).length).toBe(1);
    expect(body).not.toContain('surface_normal(');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/webgpu/ShaderManager.eval.test.ts --environment jsdom`
Expected: FAIL — `getEvalPositionWGSL is not a function`.

- [ ] **Step 3: Implement `getEvalPositionWGSL`**

Add to `ShaderManager` (reusing the universal dispatch that `getUniversalWGSL` already emits; factor it into `buildUniversalDispatch()` if inline). The entry mirrors the validated probe:

```ts
public getEvalPositionWGSL(): string {
  const evalEntry = `
@group(1) @binding(0) var<storage, read_write> pf_pos_out: array<vec3<f32>>;

// One thread per preview vertex. Vertex index -> (segment,u,v) is provided by the
// host as three parallel index buffers to avoid re-deriving the cell walk here.
@group(1) @binding(1) var<storage, read> pf_seg_in: array<u32>;
@group(1) @binding(2) var<storage, read> pf_uv_in: array<vec2<f32>>;

@compute @workgroup_size(64)
fn eval_pos(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pf_pos_out)) { return; }
  let uv = pf_uv_in[i];
  pf_pos_out[i] = surface_point(pf_seg_in[i], uv.x, uv.y);
}
`;
  return [
    this.constantsWgsl,
    this.commonWgsl,
    this.uniformsWgsl,
    this.stylesWgsl,             // ALL styles (unstripped) — universal
    this.buildUniversalDispatch(), // switch(style_id) -> style fn, from getf(7u)
    evalEntry,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/webgpu/ShaderManager.eval.test.ts --environment jsdom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/ShaderManager.ts src/renderers/webgpu/ShaderManager.eval.test.ts
git commit -m "feat(preview): universal position-eval compute WGSL (flag-off, unused)"
```

---

## Task 2: ShaderManager — style-free neighbor-normal compute WGSL

**Files:**
- Modify: `src/renderers/webgpu/ShaderManager.ts`
- Test: `src/renderers/webgpu/ShaderManager.eval.test.ts`

**Interfaces:**
- Produces: `getNeighborNormalWGSL(): string` — `@compute fn norm_from_nbr(...)`, reads the position buffer + a per-vertex neighbor-index buffer, writes `array<vec3<f32>>` normals. **References no style code** (so it compiles once, ~63 ms).

- [ ] **Step 1: Write the failing test**

```ts
it('neighbor-normal shader has no style dependency', () => {
  const wgsl = ShaderManager.getInstance().getNeighborNormalWGSL();
  expect(wgsl).toMatch(/@compute\s+@workgroup_size\(64\)\s+fn\s+norm_from_nbr/);
  expect(wgsl).not.toContain('style_radius');
  expect(wgsl).not.toContain('surface_point');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/webgpu/ShaderManager.eval.test.ts --environment jsdom`
Expected: FAIL — `getNeighborNormalWGSL is not a function`.

- [ ] **Step 3: Implement `getNeighborNormalWGSL`**

The host precomputes, per vertex, the four neighbor indices (`iL,iR,iD,iU`) that reproduce the current central-difference stencil (`du=1/cells_x`, `dv=1/cells_y`), including **u-wrap** (periodic θ) and **v one-sided at top/bottom**, and **caps** flagged to emit a constant normal (matching `surface_normal`'s seg 2/3/4 early-returns). This keeps the shader style-free.

```ts
public getNeighborNormalWGSL(): string {
  return `
struct Nbr { iL: u32, iR: u32, iD: u32, iU: u32, flags: u32, _pad: u32 };
@group(0) @binding(0) var<storage, read> pf_pos_in: array<vec3<f32>>;
@group(0) @binding(1) var<storage, read> pf_nbr_in: array<Nbr>;
@group(0) @binding(2) var<storage, read_write> pf_norm_out: array<vec3<f32>>;

const FLAG_CAP_UP: u32 = 1u;   // seg 2/4 -> +Z
const FLAG_CAP_DOWN: u32 = 2u; // seg 3   -> -Z
const FLAG_INNER: u32 = 4u;    // seg 1   -> flip

@compute @workgroup_size(64)
fn norm_from_nbr(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pf_norm_out)) { return; }
  let nb = pf_nbr_in[i];
  if ((nb.flags & FLAG_CAP_UP) != 0u)   { pf_norm_out[i] = vec3<f32>(0.0, 0.0, 1.0); return; }
  if ((nb.flags & FLAG_CAP_DOWN) != 0u) { pf_norm_out[i] = vec3<f32>(0.0, 0.0, -1.0); return; }
  let du = pf_pos_in[nb.iR] - pf_pos_in[nb.iL];
  let dv = pf_pos_in[nb.iU] - pf_pos_in[nb.iD];
  var n = cross(du, dv);
  let l = length(n);
  if (l < 1e-6) { n = vec3<f32>(0.0, 0.0, 1.0); } else { n = n / l; }
  if ((nb.flags & FLAG_INNER) != 0u) { n = -n; }
  pf_norm_out[i] = n;
}
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/webgpu/ShaderManager.eval.test.ts --environment jsdom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/ShaderManager.ts src/renderers/webgpu/ShaderManager.eval.test.ts
git commit -m "feat(preview): style-free neighbor-normal compute WGSL"
```

---

## Task 3: On-hardware compile gate (Playwright)

**Files:**
- Create: `e2e/_preview_eval_compile.mjs`

**Interfaces:**
- Consumes: `getEvalPositionWGSL()`, `getNeighborNormalWGSL()` (dumped to disk by a tiny vitest, as done during investigation).
- Produces: printed compile timings; **acceptance gate** — `eval_pos` ≤ 20 s, `norm_from_nbr` ≤ 300 ms, both `ok:true`, `isFallback:false`.

- [ ] **Step 1: Dump the two shaders** via a throwaway vitest (`writeFileSync` of `getEvalPositionWGSL()` / `getNeighborNormalWGSL()` to `e2e/.artifacts/`), env `jsdom`.

- [ ] **Step 2: Write the harness** — launch `chromium.launch({channel:'msedge', headless:false, args:['--enable-unsafe-webgpu']})`, `page.goto('file:///…/blank.html')`, `requestAdapter({powerPreference:'high-performance'})`, assert `!isFallbackAdapter`, `createShaderModule` + `createComputePipelineAsync({layout:'auto', compute:{module, entryPoint}})`, time each. (Pattern proven during investigation.)

- [ ] **Step 3: Run and verify the gate**

Run: `node e2e/_preview_eval_compile.mjs`
Expected: `eval_pos` ~15 s, `norm_from_nbr` < 100 ms, both ok. FAIL the task if `eval_pos > 20000` or `isFallback:true`.

- [ ] **Step 4: Commit**

```bash
git add e2e/_preview_eval_compile.mjs
git commit -m "test(preview): on-hardware compile gate for eval/normal compute"
```

---

## Task 4: PreviewEvalComputer — pipelines, buffers, dispatch

**Files:**
- Create: `src/renderers/webgpu/PreviewEvalComputer.ts`
- Test: covered by the in-app fidelity gate (Task 6); no jsdom unit test (needs a real device).

**Interfaces:**
- Consumes: a `GPUDevice`, the preview `uniformBuffer` + `styleParamBuffer` (group 0), and a computed `vertexCount` + the per-vertex `seg`/`uv`/`Nbr` index buffers (built CPU-side from the same cell-walk as `preview_main.wgsl:vs_main`).
- Produces:
  - `constructor(device, uniformBuffer, styleParamBuffer)`
  - `async ensureCompiled(): Promise<void>` — compiles both compute pipelines once (universal).
  - `resize(vertexCount, segBuf, uvBuf, nbrBuf): void` — (re)allocates `positionBuffer` + `normalBuffer` (`vec3` stride 16 B) and stores the index buffers.
  - `evaluate(): void` — encodes both dispatches (`ceil(vertexCount/64)` workgroups) into a command encoder and submits; call on style/param/dimension change.
  - getters `positionBuffer: GPUBuffer`, `normalBuffer: GPUBuffer`.

- [ ] **Step 1: Implement the class** mirroring `ExportComputer`'s ResourceScope + bind-group creation. Position/normal buffers use `GPUBufferUsage.STORAGE | COPY_SRC`; index buffers `STORAGE | COPY_DST`. Bind group 0 = {uniformBuffer, styleParamBuffer} to satisfy `getf`/`style_param`; group 1 = {positionBuffer, segBuf, uvBuf}.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint src/renderers/webgpu/PreviewEvalComputer.ts --max-warnings=0`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderers/webgpu/PreviewEvalComputer.ts
git commit -m "feat(preview): PreviewEvalComputer (compute pipelines + buffers, flag-off)"
```

---

## Task 5: Flag-gated in-app wiring (normal source only — isolates fidelity)

**Files:**
- Create: `src/assets/shaders/preview_eval_readnormal.wgsl` (copy of `preview_main.wgsl` with line 139 `let n_local = surface_normal(...)` replaced by `let n_local = pf_norm_in[pf_vertex_base + local_vid];` and a `@group(1) @binding(0) var<storage, read> pf_norm_in` declaration)
- Modify: `src/webgpu_core.ts` (behind the flag: build `PreviewEvalComputer`, `resize`+`evaluate` when `f32`/style change, bind the normal buffer, and select the read-normal preview pipeline)
- Modify: `src/renderers/webgpu/ShaderManager.ts` (`getStyleWGSL` gains an internal branch to emit the read-normal main when the flag is set)

- [ ] **Step 1** Read the flag once at mount (`localStorage['pf-preview-eval']==='1' || (window as any).__pfPreviewEval===true`); when false, **zero code-path change** (the entire block is skipped).
- [ ] **Step 2** When true: after `sceneManager.init`, construct `PreviewEvalComputer`, `await ensureCompiled()`, build the seg/uv/Nbr index buffers from `resolvedCounts`, `resize`, `evaluate`; bind `normalBuffer` into the preview pipeline's group 1.
- [ ] **Step 3** On param/style/dimension change (same trigger that rewrites `uniformBuffer`), call `evaluate()` again before the next `frame`.
- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npx eslint src/webgpu_core.ts src/renderers/webgpu/ShaderManager.ts --max-warnings=0`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/webgpu_core.ts src/renderers/webgpu/ShaderManager.ts src/assets/shaders/preview_eval_readnormal.wgsl
git commit -m "feat(preview): flag-gated eval-normal path (default off)"
```

---

## Task 6: In-app fidelity + latency gate (Playwright)

**Files:**
- Create: `e2e/_preview_eval_fidelity.mjs`

**Interfaces:**
- Produces: **acceptance gates** — (a) per-style max pixel ΔE between flag-off and flag-on pot region ≤ 2/255 on 8+ styles incl. CelticTriquetra/CelticKnot/DragonScales; (b) in-app style-switch wall-time (flag on) < 50 ms after warmup; (c) in-app first-paint after the one-time eval compile logged.

- [ ] **Step 1** Start dev server on the isolated port: `npm run dev -- --port 3057 --strictPort` (background). 
- [ ] **Step 2** Harness: for each style, load `http://localhost:3057/?renderer=webgpu`, set localStorage flag off → screenshot pot bbox; set flag on, reload → screenshot; compute max per-pixel diff over the pot region (mask out the gradient background). Assert ≤ threshold.
- [ ] **Step 3** Measure switch latency: with flag on and all pipelines warm, drive style changes via the store and record `performance.now()` deltas around the DevConsole "style applied" marker; assert < 50 ms (no compile).
- [ ] **Step 4: Run the gate**

Run: `node e2e/_preview_eval_fidelity.mjs`
Expected: all styles within ΔE threshold; switch < 50 ms. If any style exceeds ΔE, capture the diff image to `e2e/.artifacts/<style>_diff.png` and STOP — that is a real fidelity finding to root-cause (likely a seam/cap neighbor-index bug in Task 3's `Nbr` construction), not a threshold to loosen.

- [ ] **Step 5: Commit**

```bash
git add e2e/_preview_eval_fidelity.mjs
git commit -m "test(preview): in-app fidelity + switch-latency gate"
```

---

## Acceptance (this plan)

- Compile gate (Task 3): universal `eval_pos` ≤ 20 s once; `norm_from_nbr` ≤ 300 ms; hardware adapter.
- Fidelity gate (Task 6): neighbor-normal preview is pixel-identical (≤ 2/255) to the current `surface_normal` preview across the hard styles.
- Latency gate (Task 6): style switch < 50 ms with the flag on (proves no per-switch compile).

**Explicitly deferred to a follow-on plan (do NOT attempt here):** moving *position* into the eval pass so the render pipeline is fully style-independent; wireframe/debug-overlay/ray-cast coexistence; mobile path; removing the old `surface_normal` path; making the flag the default. Those are only worth planning once the three gates above pass.

## Self-Review

- **Spec coverage:** position-eval (T1), neighbor-normal (T2), compile budget (T3), runtime plumbing (T4/T5), fidelity+latency (T6) — all covered.
- **Placeholder scan:** none — shader bodies and gate thresholds are concrete.
- **Type consistency:** `getEvalPositionWGSL`/`getNeighborNormalWGSL`/`PreviewEvalComputer.{ensureCompiled,resize,evaluate,positionBuffer,normalBuffer}` used consistently across tasks.
- **Known risk to watch:** the `Nbr` neighbor-index construction (Task 5 host side) is where fidelity can break at seams/caps — the Task 6 gate is designed to catch exactly that.
