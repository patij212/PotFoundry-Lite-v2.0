# Exact Ray-Cast Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tessellated WebGPU preview with a per-pixel ray-cast of the true mathematical pot solid (bounded march + bisection), with progressive-accumulation anti-aliasing, flag-gated behind `?preview=raycast`.

**Architecture:** A new fullscreen-pass WGSL shader (`preview_raycast.wgsl`) evaluates an implicit inside/outside field built from the exact per-style `style_radius()` WGSL, marched and bisected per pixel. A `RaycastController` class owns the pipelines, accumulation textures, and reset/convergence state, and plugs into `webgpu_core.ts`'s existing frame path with a minimal diff (mesh path stays intact and remains the default). A small GPU compute kernel derives the conservative bounding radius from the same style function.

**Tech Stack:** TypeScript, WebGPU/WGSL, Vite (`?raw` shader imports), Vitest (unit), Playwright (e2e, real WebGPU).

**Spec:** `docs/superpowers/specs/2026-07-08-raycast-preview-design.md` (approved 2026-07-08).

## Global Constraints

- **GitNexus protocol (CLAUDE.md):** run `impact({target: "<symbol>", direction: "upstream"})` before editing any existing function/class/method; run `detect_changes()` (repo `PotFoundry-Lite-v2.0`) before each commit; warn on HIGH/CRITICAL.
- **Dirty worktree:** the branch `refactor/core-migration` carries unrelated uncommitted work (UI v3, export format). `git add` ONLY the files named in your task. Never `git add -A`.
- **ESLint 0-warnings policy:** a PostToolUse hook lints every edited `.ts`/`.tsx`. Fix warnings before moving on.
- **Flag default is `mesh`:** the ray-cast path must be OFF unless `?preview=raycast` or `localStorage['pf-preview-mode']='raycast'`. No behavior change for default users in any task.
- **Do not touch:** export pipelines, `src/geometry/**`, WebGL renderer, wireframe shaders, mobile mesh shaders (`preview_main_mobile.wgsl`, `preview_full_mobile.wgsl`).
- **Feature floor default:** 0.25 mm. **Bisection iterations:** 12. **Max samples:** 16 desktop / 8 mobile. **Step caps:** interactive 48 desktop / 24 mobile; accumulating 128 desktop / 64 mobile.
- All new runtime files live under `potfoundry-web/src/renderers/webgpu/raycast/` plus two shaders under `potfoundry-web/src/assets/shaders/`.
- Working directory for all commands: `potfoundry-web/`.
- E2E requires a dev server: `npm run dev` (port 3000) in a second terminal.

## Uniform cheat-sheet (getf indices — read-only reference)

`0`=H, `1`=Rt, `2`=Rb, `3`=profile exp, `4`=spinTurns, `5`=spinPhase, `6`=spinCurve, `7`=styleId, `13`=drainRadius (`DRAIN_RADIUS_OFFSET`), `14`=bellAmp, `15`=bellCenter, `25`=wall thickness, `26`=bottom (floor z, mm), `33`=sceneRadius, `36..38`=camera eye (`CAMERA_EYE_OFFSET`), `40..55`=VP matrix column-major (`VP_MATRIX_OFFSET`), `68`=grid flag, `71`=showInner (`SHOW_INNER_OFFSET`), `72`=bellWidth. Buffer = 76 floats (`UNIFORM_FLOAT_COUNT`), defined in `src/UniformBlock.ts`; WGSL constants in `src/assets/shaders/common.wgsl:9-22`.

---

### Task 1: Preview-mode flag resolution

**Files:**
- Create: `src/renderers/webgpu/raycast/previewMode.ts`
- Test: `src/renderers/webgpu/raycast/previewMode.test.ts`

**Interfaces:**
- Consumes: nothing (pure; injected `search` string and storage getter).
- Produces: `type PreviewMode = 'mesh' | 'raycast'`; `resolvePreviewMode(search: string, getItem: (k: string) => string | null): PreviewMode`; `PREVIEW_MODE_STORAGE_KEY = 'pf-preview-mode'`. Task 7 calls `resolvePreviewMode(window.location.search, k => localStorage.getItem(k))`; Task 8 writes the storage key.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderers/webgpu/raycast/previewMode.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePreviewMode, PREVIEW_MODE_STORAGE_KEY } from './previewMode';

const none = () => null;

describe('resolvePreviewMode', () => {
  it('defaults to mesh', () => {
    expect(resolvePreviewMode('', none)).toBe('mesh');
  });
  it('URL param raycast wins', () => {
    expect(resolvePreviewMode('?preview=raycast', none)).toBe('raycast');
  });
  it('URL param mesh overrides storage', () => {
    expect(resolvePreviewMode('?preview=mesh', () => 'raycast')).toBe('mesh');
  });
  it('storage raycast applies when no URL param', () => {
    expect(resolvePreviewMode('?other=1', (k) => (k === PREVIEW_MODE_STORAGE_KEY ? 'raycast' : null))).toBe('raycast');
  });
  it('unknown values fall back to mesh', () => {
    expect(resolvePreviewMode('?preview=banana', () => 'garbage')).toBe('mesh');
  });
  it('storage getter throwing falls back to mesh', () => {
    expect(resolvePreviewMode('', () => { throw new Error('denied'); })).toBe('mesh');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/webgpu/raycast/previewMode.test.ts`
Expected: FAIL — cannot resolve `./previewMode`.

- [ ] **Step 3: Write the implementation**

```ts
// src/renderers/webgpu/raycast/previewMode.ts
/**
 * Preview render-engine selection: classic tessellated mesh vs exact ray-cast.
 * Priority: URL `?preview=` param > localStorage > default 'mesh'.
 * Spec: docs/superpowers/specs/2026-07-08-raycast-preview-design.md §5
 */
export type PreviewMode = 'mesh' | 'raycast';

export const PREVIEW_MODE_STORAGE_KEY = 'pf-preview-mode';

function normalize(value: string | null): PreviewMode | null {
  if (value === 'raycast' || value === 'mesh') return value;
  return null;
}

export function resolvePreviewMode(
  search: string,
  getItem: (key: string) => string | null
): PreviewMode {
  const fromUrl = normalize(new URLSearchParams(search).get('preview'));
  if (fromUrl) return fromUrl;
  try {
    const stored = normalize(getItem(PREVIEW_MODE_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // storage unavailable (private mode / sandbox) — use default
  }
  return 'mesh';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/webgpu/raycast/previewMode.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/raycast/previewMode.ts src/renderers/webgpu/raycast/previewMode.test.ts
git commit -m "feat(raycast): preview-mode flag resolution (url > storage > mesh default)"
```

---

### Task 2: Pure math helpers — mat4 inverse, Halton sequence, f16 decode

**Files:**
- Create: `src/renderers/webgpu/raycast/rcMath.ts`
- Test: `src/renderers/webgpu/raycast/rcMath.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 6):
  - `invertMat4(m: Float32Array): Float32Array | null` — inverse of a column-major 4×4 (same layout as the VP matrix at `f32[40..55]`); `null` if singular.
  - `halton(index: number, base: number): number` — radical-inverse in `[0,1)`.
  - `decodeF16Array(src: Uint16Array): Float32Array` — IEEE binary16 → f32 (for rgba16float readback).

- [ ] **Step 1: Write the failing test**

```ts
// src/renderers/webgpu/raycast/rcMath.test.ts
import { describe, it, expect } from 'vitest';
import { invertMat4, halton, decodeF16Array } from './rcMath';

describe('invertMat4', () => {
  it('inverts identity to identity', () => {
    const I = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    expect(Array.from(invertMat4(I)!)).toEqual(Array.from(I));
  });
  it('M * inv(M) = I for a perspective-like matrix', () => {
    // column-major: scale + translate + w-coupling (perspective-ish, invertible)
    const M = new Float32Array([
      1.2, 0,   0,    0,
      0,   2.1, 0,    0,
      0,   0,  -1.02, -1,
      0.3, -0.5, -2.02, 0,
    ]);
    const inv = invertMat4(M)!;
    // multiply column-major: (M*inv)[col j][row i] = sum_k M[k*4+i]*inv[j*4+k]
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += M[k * 4 + i] * inv[j * 4 + k];
        expect(s).toBeCloseTo(i === j ? 1 : 0, 4);
      }
    }
  });
  it('returns null for singular matrix', () => {
    expect(invertMat4(new Float32Array(16))).toBeNull();
  });
});

describe('halton', () => {
  it('produces the base-2 radical inverse', () => {
    expect(halton(1, 2)).toBeCloseTo(0.5);
    expect(halton(2, 2)).toBeCloseTo(0.25);
    expect(halton(3, 2)).toBeCloseTo(0.75);
    expect(halton(4, 2)).toBeCloseTo(0.125);
  });
  it('produces the base-3 radical inverse', () => {
    expect(halton(1, 3)).toBeCloseTo(1 / 3);
    expect(halton(2, 3)).toBeCloseTo(2 / 3);
    expect(halton(3, 3)).toBeCloseTo(1 / 9);
  });
  it('index 0 is 0', () => {
    expect(halton(0, 2)).toBe(0);
  });
});

describe('decodeF16Array', () => {
  it('decodes known half-float bit patterns', () => {
    // 0x3C00 = 1.0, 0xC000 = -2.0, 0x0000 = 0, 0x3800 = 0.5
    const out = decodeF16Array(new Uint16Array([0x3c00, 0xc000, 0x0000, 0x3800]));
    expect(Array.from(out)).toEqual([1, -2, 0, 0.5]);
  });
  it('decodes subnormals and infinity', () => {
    const out = decodeF16Array(new Uint16Array([0x0001, 0x7c00]));
    expect(out[0]).toBeCloseTo(5.960464477539063e-8);
    expect(out[1]).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/webgpu/raycast/rcMath.test.ts`
Expected: FAIL — cannot resolve `./rcMath`.

- [ ] **Step 3: Write the implementation**

```ts
// src/renderers/webgpu/raycast/rcMath.ts
/**
 * Pure math helpers for the ray-cast preview. No GPU or DOM dependencies.
 */

/** Inverse of a column-major 4x4 matrix (standard cofactor expansion). */
export function invertMat4(m: Float32Array): Float32Array | null {
  const inv = new Float32Array(16);
  inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
  inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];

  const det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  for (let i = 0; i < 16; i++) inv[i] *= invDet;
  return inv;
}

/** Radical-inverse (Halton) sequence value in [0,1). halton(0, b) === 0. */
export function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/** Decode IEEE 754 binary16 values to f32 (rgba16float texture readback). */
export function decodeF16Array(src: Uint16Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const h = src[i];
    const sign = (h & 0x8000) ? -1 : 1;
    const exp = (h & 0x7c00) >> 10;
    const frac = h & 0x03ff;
    if (exp === 0) {
      out[i] = sign * frac * 2 ** -24; // subnormal
    } else if (exp === 0x1f) {
      out[i] = frac ? NaN : sign * Infinity;
    } else {
      out[i] = sign * (1 + frac / 1024) * 2 ** (exp - 15);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/webgpu/raycast/rcMath.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/raycast/rcMath.ts src/renderers/webgpu/raycast/rcMath.test.ts
git commit -m "feat(raycast): mat4 inverse, Halton sequence, f16 decode helpers"
```

---

### Task 3: Extract shared lighting WGSL module

The ray-cast shader must reuse `shade_color()` / `gradient_color()` / camera-basis code, which currently lives at the top of `preview_main.wgsl` (mesh-only file). Split it out; the composed desktop shader string must remain byte-identical.

**Files:**
- Create: `src/assets/shaders/preview_lighting.wgsl`
- Modify: `src/assets/shaders/preview_main.wgsl` (remove the moved lines)
- Modify: `src/renderers/webgpu/ShaderManager.ts` (load + compose the new module)
- Test: `src/renderers/webgpu/ShaderManager.test.ts` (add one test)

**Interfaces:**
- Consumes: current `preview_main.wgsl` content.
- Produces: `preview_lighting.wgsl` defining `CameraBasis`, `LightingTuning`, `LightingRig`, `world_to_camera`, `basis_is_valid`, `orthonormalize_basis`, `fallback_camera_basis`, `derived_camera_basis`, `load_basis_vec`, `camera_basis`, `lighting_tuning`, `phong_specular`, `ggx_distribution`, `fresnel_schlick`, `spec_power_from_roughness`, `build_camera_rig`, `lambert`, `wrap_lambert`, `VSOut`, `gradient_color`, `shade_color`. ShaderManager gains private field `lightingWgsl: string`. Task 4 composes `[constants, common, uniforms, styles, dispatch, lightingWgsl, raycastWgsl]`.

- [ ] **Step 1: Run impact analysis**

`impact({target: "getStyleWGSL", direction: "upstream"})` and `impact({target: "getUniversalWGSL", direction: "upstream"})` — report blast radius before editing.

- [ ] **Step 2: Capture the pre-refactor composed output (failing test first)**

Add to `src/renderers/webgpu/ShaderManager.test.ts`:

```ts
describe('lighting module extraction', () => {
  it('desktop composition contains exactly one shade_color and one gradient_color', () => {
    const wgsl = ShaderManager.getInstance().getStyleWGSL(0);
    expect(wgsl.match(/fn shade_color\(/g)?.length).toBe(1);
    expect(wgsl.match(/fn gradient_color\(/g)?.length).toBe(1);
    expect(wgsl.match(/fn vs_main\(/g)?.length).toBe(1);
  });
  it('universal composition contains exactly one shade_color', () => {
    const wgsl = ShaderManager.getInstance().getUniversalWGSL();
    expect(wgsl.match(/fn shade_color\(/g)?.length).toBe(1);
  });
});
```

Note: `ShaderManager` is a singleton and its mobile branch is driven by `isMobileDevice()`; the existing test file already handles instantiation — follow its established mocking pattern (jsdom UA is desktop by default).

Run: `npx vitest run src/renderers/webgpu/ShaderManager.test.ts`
Expected: PASS already (the functions exist once today) — this test is the *regression guard* for the split; it must still pass afterwards.

- [ ] **Step 3: Perform the split**

Cut **lines 1–336** of `preview_main.wgsl` — everything from the top-of-file comment through the closing brace of `fn shade_color(...)` (the last moved line is `}` after `return clamp(combined, ...)`) — into the new file `src/assets/shaders/preview_lighting.wgsl` verbatim. `preview_main.wgsl` then starts at the `fn ground_plane(vid: u32)` definition.

- [ ] **Step 4: Compose in ShaderManager**

In `ShaderManager.ts`:

```ts
import previewLightingWgsl from '../../assets/shaders/preview_lighting.wgsl?raw';
```

Add the field and load it in the constructor (next to `mainWgsl`):

```ts
private lightingWgsl: string = '';
// in constructor:
this.lightingWgsl = this.getShaderContent(previewLightingWgsl);
```

In `getStyleWGSL` (desktop branch), change the final array to:

```ts
return [
    this.constantsWgsl,    // 1. Constants
    this.commonWgsl,       // 2. Helpers
    this.uniformsWgsl,     // 3. Uniforms & style_param Definition
    optimizedStylesWgsl,   // 4. Styles (uses style_param)
    dispatchCode,          // 5. Dispatcher
    this.lightingWgsl,     // 6. Camera & lighting (shared with raycast)
    this.mainWgsl          // 7. Mesh vertex/fragment entry points
].join('\n');
```

In `getUniversalWGSL`, make the same change where `this.mainWgsl` appears in the returned array (insert `this.lightingWgsl` immediately before it). Also update the constructor's null-check log condition to include `this.lightingWgsl`. The mobile branch (`fullMobileWgsl`) is self-contained and does not change.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/renderers/webgpu/ShaderManager.test.ts && npm run typecheck`
Expected: PASS. Then a real-GPU sanity check (dev server running): `npx playwright test e2e/webgpu-rendering.spec.ts --project=chromium` — Expected: PASS (mesh preview unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/assets/shaders/preview_lighting.wgsl src/assets/shaders/preview_main.wgsl src/renderers/webgpu/ShaderManager.ts src/renderers/webgpu/ShaderManager.test.ts
git commit -m "refactor(shaders): extract preview_lighting.wgsl shared module (byte-identical composition)"
```

---

### Task 4: The ray-cast shader + `getRaycastWGSL`

**Files:**
- Create: `src/assets/shaders/preview_raycast.wgsl`
- Modify: `src/renderers/webgpu/ShaderManager.ts` (add `getRaycastWGSL`)
- Test: `src/renderers/webgpu/ShaderManager.test.ts` (add tests)

**Interfaces:**
- Consumes: `lightingWgsl` (Task 3), existing environment chain, `stripShaderCode`, `STYLE_FUNCTION_MAP`.
- Produces: `ShaderManager.getRaycastWGSL(styleId: number): string` with entry points `vs_raycast` / `fs_raycast`, and the `RaycastUniforms` uniform at `@group(0) @binding(8)` with this exact layout (Task 6 must write it byte-compatibly):

| bytes | field |
|---|---|
| 0–63 | `inv_vp: mat4x4<f32>` (column-major) |
| 64–71 | `jitter: vec2<f32>` (pixels) |
| 72 | `march_phase: f32` ∈ [0,1) |
| 76 | `sample_index: f32` |
| 80 | `r_max: f32` (raw GPU-computed max radius — Task 5 copies here) |
| 84 | `step_cap: f32` |
| 88 | `feature_floor: f32` (mm) |
| 92 | `debug_mode: f32` (0 shaded / 1 hit-data) |
| 96–103 | `canvas_size: vec2<f32>` |
| 104–111 | `_pad: vec2<f32>` |

Total 112 bytes.

- [ ] **Step 1: Write the failing assembly tests**

Add to `ShaderManager.test.ts`:

```ts
describe('getRaycastWGSL', () => {
  it('assembles raycast entry points with the style dispatch and lighting', () => {
    const wgsl = ShaderManager.getInstance().getRaycastWGSL(0);
    expect(wgsl).toContain('fn vs_raycast(');
    expect(wgsl).toContain('fn fs_raycast(');
    expect(wgsl).toContain('fn pot_field(');
    expect(wgsl).toContain('fn style_radius(');   // dispatch injected
    expect(wgsl).toContain('fn shade_color(');    // lighting module present
    expect(wgsl).toContain('@binding(8)');        // RC uniforms
    expect(wgsl).not.toContain('fn vs_main(');    // mesh entry points excluded
  });
  it('strips other styles (raycast for style 9 excludes gothic)', () => {
    const wgsl = ShaderManager.getInstance().getRaycastWGSL(9); // DragonScales region only
    expect(wgsl.match(/fn shade_color\(/g)?.length).toBe(1);
  });
});
```

Run: `npx vitest run src/renderers/webgpu/ShaderManager.test.ts`
Expected: FAIL — `getRaycastWGSL is not a function`.

- [ ] **Step 2: Write the shader**

Create `src/assets/shaders/preview_raycast.wgsl` with exactly this content:

```wgsl
// ============================================================================
// Exact Ray-Cast Preview
// Renders the true mathematical pot solid per pixel: bounded march + bisection
// against an implicit inside/outside field built from the exact style_radius().
// Fullscreen pass — no pot mesh. Composed after the style environment and
// preview_lighting.wgsl by ShaderManager.getRaycastWGSL().
// Spec: docs/superpowers/specs/2026-07-08-raycast-preview-design.md
// ============================================================================

struct RaycastUniforms {
  inv_vp: mat4x4<f32>,     // inverse of vp_matrix(), column-major
  jitter: vec2<f32>,       // sub-pixel jitter in pixels, [-0.5, 0.5]
  march_phase: f32,        // [0,1) march phase offset, jittered per sample
  sample_index: f32,       // accumulation sample counter (0 = first)
  r_max: f32,              // conservative max style radius (GPU-computed, raw)
  step_cap: f32,           // max march steps this frame
  feature_floor: f32,      // step-size floor in mm
  debug_mode: f32,         // 0 = shaded, 1 = hit-data readback
  canvas_size: vec2<f32>,  // physical pixels of the accumulation target
  _pad: vec2<f32>,
};
@group(0) @binding(8) var<uniform> RC : RaycastUniforms;

const RC_BISECT_ITERS : u32 = 12u;
const RC_BOUND_MARGIN : f32 = 1.10; // safety on the 128x128-sampled r_max
const RC_BOUND_PAD_MM : f32 = 1.0;
const RC_NORMAL_EPS : f32 = 0.002;  // mm — numerical-precision-scale differencing

// ---------------------------------------------------------------------------
// Implicit solid. Continuous scalar, negative inside the pot. This is the
// same solid the six mesh segments approximate (surface_point in styles.wgsl)
// but exact: outer styled wall, inner cavity, floor slab, drain hole.
// Uses the true model z in [0, H]; the mesh's BOTTOM_Z_OFFSET anti-z-fighting
// nudges are intentionally NOT replicated.
// p is in centered world space (mesh path subtracts 0.5*H from z).
// ---------------------------------------------------------------------------
fn pot_field(p: vec3<f32>) -> f32 {
  let H = max(getf(0u), 1e-4);
  let z = p.z + 0.5 * H;
  let t = clamp(z / H, 0.0, 1.0);
  let rho = length(p.xy);

  // Invert the twist analytically: twist is a pure per-height rotation.
  let turns = getf(4u);
  let phase = getf(5u);
  let curve = max(getf(6u), 1e-4);
  let delta = TAU * turns * pow(t, curve) + phase;
  let phi = atan2(p.y, p.x);
  let th = phi - delta; // style_radius wraps internally

  let style_id = i32(getf(7u));
  let r0 = r_base(t);
  let r_out = style_radius(style_id, th, t, r0);

  // Solid of revolution bounded by the styled outer surface and top/bottom planes.
  var f = max(rho - r_out, max(z - H, -z));

  let show_inner = getf(SHOW_INNER_OFFSET) >= 0.5;
  if (!show_inner) {
    return f;
  }

  let bottom = clamp(getf(26u), 0.0, H);
  let wall = max(getf(25u), 0.4);
  let r_in = max(r_out - wall, 0.5); // mirrors inner_point() in styles.wgsl

  // Cavity { rho < r_in AND z > bottom } — CSG subtract.
  let cavity = max(rho - r_in, bottom - z);
  f = max(f, -cavity);

  // Drain { rho < r_drain AND z < bottom } — CSG subtract.
  // Clamps mirror surface_point segments 2/3/5: drain_raw >= 0.25,
  // cap = inner radius at z=0 minus 0.2.
  let r0_base = r_base(0.0);
  let r_out0 = style_radius(style_id, phi - phase, 0.0, r0_base); // delta(0) = phase
  let r_in0 = max(r_out0 - wall, 0.5);
  let drain_raw = max(getf(DRAIN_RADIUS_OFFSET), 0.25);
  let r_drain = clamp(drain_raw, 0.25, max(r_in0 - 0.2, 0.25));
  let drain = max(rho - r_drain, z - bottom);
  f = max(f, -drain);

  return f;
}

fn pot_normal(p: vec3<f32>) -> vec3<f32> {
  let e = RC_NORMAL_EPS;
  let dx = pot_field(vec3<f32>(p.x + e, p.y, p.z)) - pot_field(vec3<f32>(p.x - e, p.y, p.z));
  let dy = pot_field(vec3<f32>(p.x, p.y + e, p.z)) - pot_field(vec3<f32>(p.x, p.y - e, p.z));
  let dz = pot_field(vec3<f32>(p.x, p.y, p.z + e)) - pot_field(vec3<f32>(p.x, p.y, p.z - e));
  return safe_normalize(vec3<f32>(dx, dy, dz));
}

// ---------------------------------------------------------------------------
// Ray / bounding-volume clip: slab z in [-H/2, H/2] ∩ cylinder rho <= r_bound.
// ---------------------------------------------------------------------------
struct RaySegment {
  hit: bool,
  t0: f32,
  t1: f32,
};

fn clip_to_bound(ro: vec3<f32>, rd: vec3<f32>) -> RaySegment {
  let H = max(getf(0u), 1e-4);
  let r_bound = RC.r_max * RC_BOUND_MARGIN + RC_BOUND_PAD_MM;
  let z_lo = -0.5 * H;
  let z_hi = 0.5 * H;

  var t0 = 0.0;
  var t1 = 1e9;

  if (abs(rd.z) < 1e-9) {
    if (ro.z < z_lo || ro.z > z_hi) {
      return RaySegment(false, 0.0, 0.0);
    }
  } else {
    let ta = (z_lo - ro.z) / rd.z;
    let tb = (z_hi - ro.z) / rd.z;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  }

  let a = dot(rd.xy, rd.xy);
  let b = 2.0 * dot(ro.xy, rd.xy);
  let c = dot(ro.xy, ro.xy) - r_bound * r_bound;
  if (a < 1e-12) {
    if (c > 0.0) {
      return RaySegment(false, 0.0, 0.0);
    }
  } else {
    let disc = b * b - 4.0 * a * c;
    if (disc < 0.0) {
      return RaySegment(false, 0.0, 0.0);
    }
    let sq = sqrt(disc);
    t0 = max(t0, (-b - sq) / (2.0 * a));
    t1 = min(t1, (-b + sq) / (2.0 * a));
  }

  if (t1 <= t0) {
    return RaySegment(false, 0.0, 0.0);
  }
  return RaySegment(true, t0, t1);
}

// ---------------------------------------------------------------------------
// Bounded march + bisection. Step ~ min(pixel footprint, feature floor),
// hard-capped at RC.step_cap; sign change refined by 12 bisection iterations
// (hit precision far below 0.001 mm — beyond f32 resolution).
// ---------------------------------------------------------------------------
struct RayHit {
  hit: bool,
  t: f32,
};

fn march_pot(ro: vec3<f32>, rd: vec3<f32>, footprint: f32) -> RayHit {
  let seg = clip_to_bound(ro, rd);
  if (!seg.hit) {
    return RayHit(false, 0.0);
  }

  let len = seg.t1 - seg.t0;
  let want = min(max(footprint, 1e-4), RC.feature_floor);
  let steps = clamp(ceil(len / want), 8.0, max(RC.step_cap, 8.0));
  let dt = len / steps;

  var t_prev = seg.t0 + RC.march_phase * dt;
  if (pot_field(ro + rd * t_prev) < 0.0) {
    return RayHit(true, t_prev); // camera starts inside the solid
  }

  for (var i = 1.0; i <= steps; i += 1.0) {
    let tc = min(seg.t0 + RC.march_phase * dt + i * dt, seg.t1);
    if (pot_field(ro + rd * tc) < 0.0) {
      var lo = t_prev;
      var hi = tc;
      for (var k = 0u; k < RC_BISECT_ITERS; k += 1u) {
        let mid = 0.5 * (lo + hi);
        if (pot_field(ro + rd * mid) < 0.0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return RayHit(true, 0.5 * (lo + hi));
    }
    t_prev = tc;
    if (tc >= seg.t1) {
      break;
    }
  }
  return RayHit(false, 0.0);
}

// ---------------------------------------------------------------------------
// Ground plane (z = -H/2) with analytically anti-aliased grid lines.
// Port of the mesh path's fs_main grid block; coverage is computed from
// distance-to-line vs the pixel footprint instead of hard ramps.
// Returns rgba with a = coverage (0 => let the background through).
// ---------------------------------------------------------------------------
fn grid_line_coverage(dist_mm: f32, half_width_mm: f32, fp_mm: f32) -> f32 {
  let aa = max(fp_mm, 1e-4);
  return clamp((half_width_mm + 0.5 * aa - dist_mm) / aa, 0.0, 1.0);
}

fn ground_grid_color(gp: vec3<f32>, fp_mm: f32) -> vec4<f32> {
  if (getf(GRID_FLAG_OFFSET) < 0.5) {
    return vec4<f32>(0.0);
  }
  let eye = vec3<f32>(
    getf(CAMERA_EYE_OFFSET + 0u),
    getf(CAMERA_EYE_OFFSET + 1u),
    getf(CAMERA_EYE_OFFSET + 2u)
  );
  let camera_distance = max(length(eye), 1.0);
  var grid_size = 50.0;
  if (camera_distance < 200.0) {
    grid_size = 10.0;
  } else if (camera_distance < 400.0) {
    grid_size = 25.0;
  }
  let zoom_scale = clamp(camera_distance / 160.0, 0.5, 3.5);
  let target_mm = 0.25 * zoom_scale;
  let minor_half = clamp(target_mm, 0.12, 1.2) * 0.5;
  let major_half = clamp(target_mm * 2.2, minor_half * 2.0 + 0.2, 3.0) * 0.5;
  let axis_half = clamp(target_mm * 1.35, 0.12, 1.5) * 0.5;

  let fx = fract(gp.x / grid_size);
  let fy = fract(gp.y / grid_size);
  let dist_x = min(fx, 1.0 - fx) * grid_size;
  let dist_y = min(fy, 1.0 - fy) * grid_size;

  let minor_cov = max(
    grid_line_coverage(dist_x, minor_half, fp_mm),
    grid_line_coverage(dist_y, minor_half, fp_mm)
  );

  let major_step = 5;
  var major_cov = 0.0;
  let major_ix = i32(floor(gp.x / grid_size + 0.5));
  let major_iy = i32(floor(gp.y / grid_size + 0.5));
  if ((major_ix % major_step) == 0) {
    major_cov = max(major_cov, grid_line_coverage(dist_x, major_half, fp_mm));
  }
  if ((major_iy % major_step) == 0) {
    major_cov = max(major_cov, grid_line_coverage(dist_y, major_half, fp_mm));
  }

  var axis_cov = 0.0;
  axis_cov = max(axis_cov, grid_line_coverage(abs(gp.x), axis_half, fp_mm));
  axis_cov = max(axis_cov, grid_line_coverage(abs(gp.y), axis_half, fp_mm));

  let line_color = vec3<f32>(0.72, 0.80, 0.93);
  let major_color = vec3<f32>(0.46, 0.56, 0.70);
  let axis_color = vec3<f32>(1.0, 0.65, 0.35);

  var color = line_color;
  var weight = minor_cov * 0.8;
  let major_w = major_cov * 1.1;
  if (major_w > weight) {
    color = major_color;
    weight = major_w;
  }
  let axis_w = axis_cov * 1.6;
  if (axis_w > weight) {
    color = axis_color;
    weight = axis_w;
  }
  let composite = clamp(weight, 0.0, 1.0);
  if (composite <= 1e-3) {
    return vec4<f32>(0.0);
  }
  let intensity = mix(0.15, 0.75, composite);
  return vec4<f32>(color * intensity, composite);
}

// Background gradient — same math as the mesh path fs_main background branch.
fn background_gradient(uv: vec2<f32>) -> vec3<f32> {
  let angle = uBg1.w;
  let center = vec2<f32>(0.5, 0.5);
  let centered = uv - center;
  let s = sin(-angle);
  let c = cos(-angle);
  let rotated = vec2<f32>(
    centered.x * c - centered.y * s,
    centered.x * s + centered.y * c
  );
  let t = clamp(rotated.y + 0.5, 0.0, 1.0);
  if (t <= 0.5) {
    let local = smoothstep(0.0, 0.5, t);
    return mix(uBg1.xyz, uBg2.xyz, local);
  }
  let local = smoothstep(0.5, 1.0, t);
  return mix(uBg2.xyz, uBg3.xyz, local);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------
struct RcVSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc_xy: vec2<f32>,
};

@vertex
fn vs_raycast(@builtin(vertex_index) vid: u32) -> RcVSOut {
  var xy = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out: RcVSOut;
  out.pos = vec4<f32>(xy[vid], 0.5, 1.0);
  out.ndc_xy = xy[vid];
  return out;
}

fn unproject(ndc: vec3<f32>) -> vec3<f32> {
  let w = RC.inv_vp * vec4<f32>(ndc, 1.0);
  return w.xyz / w.w;
}

struct RcFSOut {
  @location(0) color: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fs_raycast(in: RcVSOut) -> RcFSOut {
  let jitter_ndc = RC.jitter * 2.0 / max(RC.canvas_size, vec2<f32>(1.0, 1.0));
  let ndc = in.ndc_xy + jitter_ndc;

  // Unprojecting near+far handles perspective AND orthographic identically,
  // and guarantees exact agreement with vp_matrix() used by the overlays.
  let p_near = unproject(vec3<f32>(ndc, 0.0));
  let p_far = unproject(vec3<f32>(ndc, 1.0));
  let ro = p_near;
  let seg_vec = p_far - p_near;
  let ray_len = max(length(seg_vec), 1e-6);
  let rd = seg_vec / ray_len;

  // Per-pixel world footprint at both ends of the segment.
  let px_ndc = vec2<f32>(2.0 / max(RC.canvas_size.x, 1.0), 0.0);
  let fp_near = length(unproject(vec3<f32>(ndc + px_ndc, 0.0)) - p_near);
  let fp_far = length(unproject(vec3<f32>(ndc + px_ndc, 1.0)) - p_far);

  var out: RcFSOut;
  out.depth = 0.9999;

  let hit = march_pot(ro, rd, max(min(fp_near, fp_far), 1e-5));
  if (hit.hit) {
    let p = ro + rd * hit.t;
    let clip = vp_matrix() * vec4<f32>(p, 1.0);
    out.depth = clamp(clip.z / max(clip.w, 1e-9), 0.0, 1.0);
    if (RC.debug_mode > 0.5) {
      // Readback channel: hit distance along ray (mm), model z, radial rho.
      out.color = vec4<f32>(hit.t, p.z, length(p.xy), 1.0);
      return out;
    }
    let n = pot_normal(p);
    let H = max(getf(0u), 1e-4);
    let z_model = p.z + 0.5 * H;
    let eye = vec3<f32>(
      getf(CAMERA_EYE_OFFSET + 0u),
      getf(CAMERA_EYE_OFFSET + 1u),
      getf(CAMERA_EYE_OFFSET + 2u)
    );
    let base = gradient_color(clamp(z_model / H, 0.0, 1.0));
    let col = shade_color(base, n, eye - p);
    out.color = vec4<f32>(clamp(col, vec3<f32>(0.03), vec3<f32>(1.8)), 1.0);
    return out;
  }

  if (RC.debug_mode > 0.5) {
    out.color = vec4<f32>(-1.0, 0.0, 0.0, 1.0); // miss marker for readback
    return out;
  }

  // Ground plane at z = -H/2 (matches the mesh ground quad).
  let H2 = max(getf(0u), 1e-4);
  let ground_z = -0.5 * H2;
  if (abs(rd.z) > 1e-9) {
    let tg = (ground_z - ro.z) / rd.z;
    if (tg > 0.0) {
      let gp = ro + rd * tg;
      let base_r = max(getf(1u), getf(2u));
      let scene_r = getf(33u);
      let extent = max(max(base_r, scene_r), 1.0) * 2.4;
      if (abs(gp.x) <= extent && abs(gp.y) <= extent) {
        let fp_g = mix(fp_near, fp_far, clamp(tg / ray_len, 0.0, 1.0));
        let g = ground_grid_color(gp, fp_g);
        if (g.a > 1e-3) {
          let bgc = background_gradient(vec2<f32>((in.ndc_xy.x + 1.0) * 0.5, (in.ndc_xy.y + 1.0) * 0.5));
          out.color = vec4<f32>(mix(bgc, g.rgb, g.a), 1.0);
          let clipg = vp_matrix() * vec4<f32>(gp, 1.0);
          out.depth = clamp(clipg.z / max(clipg.w, 1e-9), 0.0, 1.0);
          return out;
        }
      }
    }
  }

  let uv = vec2<f32>((in.ndc_xy.x + 1.0) * 0.5, (in.ndc_xy.y + 1.0) * 0.5);
  out.color = vec4<f32>(background_gradient(uv), 1.0);
  return out;
}
```

- [ ] **Step 3: Add `getRaycastWGSL` to ShaderManager**

```ts
import previewRaycastWgsl from '../../assets/shaders/preview_raycast.wgsl?raw';
```

Field + constructor load (next to `lightingWgsl`):

```ts
private raycastWgsl: string = '';
// constructor:
this.raycastWgsl = this.getShaderContent(previewRaycastWgsl);
```

New public method (place after `getStyleWGSL`; reuse the identical `dispatchCode` template used there — copy it, do not refactor the existing method):

```ts
/**
 * Assembles the exact ray-cast preview shader (fullscreen pass, entry points
 * vs_raycast/fs_raycast). Same stripped per-style environment as getStyleWGSL,
 * plus the shared lighting module; excludes the mesh entry points.
 */
public getRaycastWGSL(styleId: number): string {
    const functionName = STYLE_FUNCTION_MAP[styleId] || 'sf_radius';
    const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH FOR STYLE ID ${styleId} (${functionName})
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(0.0, t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(TAU, t, r0);
}
`;
    const optimizedStylesWgsl = stripShaderCode(this.stylesWgsl, functionName);
    return [
        this.constantsWgsl,
        this.commonWgsl,
        this.uniformsWgsl,
        optimizedStylesWgsl,
        dispatchCode,
        this.lightingWgsl,
        this.raycastWgsl,
    ].join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/renderers/webgpu/ShaderManager.test.ts && npm run typecheck`
Expected: PASS. (Real-GPU compilation of this shader is verified in Task 7's smoke and Task 9's e2e.)

- [ ] **Step 5: Commit**

```bash
git add src/assets/shaders/preview_raycast.wgsl src/renderers/webgpu/ShaderManager.ts src/renderers/webgpu/ShaderManager.test.ts
git commit -m "feat(raycast): exact ray-cast preview shader (implicit solid, bounded march + bisection)"
```

---

### Task 5: Bounding-radius compute kernel + `getRaycastBoundWGSL`

The march needs a conservative `r_max`. Computing it with the *same WGSL style function* (128×128 (θ,t) sample max, +10% +1 mm margin applied in the raycast shader) avoids any CPU/GPU parity question.

**Files:**
- Create: `src/assets/shaders/raycast_bound.wgsl`
- Modify: `src/renderers/webgpu/ShaderManager.ts` (add `getRaycastBoundWGSL`)
- Test: `src/renderers/webgpu/ShaderManager.test.ts` (add test)

**Interfaces:**
- Consumes: environment chain (Task 3/4 fields).
- Produces: `ShaderManager.getRaycastBoundWGSL(styleId: number): string`, entry point `cs_bound`, storage output `@group(0) @binding(9)` = single `atomic<u32>` holding the max radius as positive-float bit pattern. Task 6 clears it to 0, dispatches `(1)` workgroup, and copies 4 bytes to RC uniform offset 80.

- [ ] **Step 1: Write the failing test**

```ts
describe('getRaycastBoundWGSL', () => {
  it('assembles the bound kernel with style dispatch and storage output', () => {
    const wgsl = ShaderManager.getInstance().getRaycastBoundWGSL(0);
    expect(wgsl).toContain('fn cs_bound(');
    expect(wgsl).toContain('@binding(9)');
    expect(wgsl).toContain('atomicMax');
    expect(wgsl).toContain('fn style_radius(');
  });
});
```

Run: `npx vitest run src/renderers/webgpu/ShaderManager.test.ts` — Expected: FAIL.

- [ ] **Step 2: Write the kernel**

`src/assets/shaders/raycast_bound.wgsl`:

```wgsl
// ============================================================================
// Conservative bounding radius for the ray-cast preview.
// Samples style_radius over a 128x128 (theta, t) grid and atomically reduces
// the max. Positive IEEE-754 floats order-preserve as u32 bit patterns, so
// atomicMax on bitcast<u32> is exact. The raycast shader applies a
// 1.10x + 1mm margin on top (RC_BOUND_MARGIN / RC_BOUND_PAD_MM).
// ============================================================================

struct BoundOut {
  bits: atomic<u32>,
};
@group(0) @binding(9) var<storage, read_write> BOUND : BoundOut;

const BOUND_N : u32 = 128u;

@compute @workgroup_size(256)
fn cs_bound(@builtin(local_invocation_index) li: u32) {
  var local_max = 0.0;
  let style_id = i32(getf(7u));
  let total = BOUND_N * BOUND_N;
  var idx = li;
  loop {
    if (idx >= total) {
      break;
    }
    let iu = idx % BOUND_N;
    let it = idx / BOUND_N;
    let th = (f32(iu) + 0.5) / f32(BOUND_N) * TAU;
    let t = f32(it) / f32(BOUND_N - 1u);
    let r = style_radius(style_id, th, t, r_base(t));
    local_max = max(local_max, r);
    idx += 256u;
  }
  atomicMax(&BOUND.bits, bitcast<u32>(max(local_max, 0.0)));
}
```

- [ ] **Step 3: Add `getRaycastBoundWGSL`**

In `ShaderManager.ts` — import `raycastBoundWgsl from '../../assets/shaders/raycast_bound.wgsl?raw'`, load into a `boundWgsl` field in the constructor, then:

```ts
/**
 * Assembles the bounding-radius compute kernel (entry point cs_bound).
 * Only bindings 0 (uniforms), 4 (style params) and 9 (output) are statically
 * referenced, so 'auto' pipeline layout needs only those three in the bind group.
 */
public getRaycastBoundWGSL(styleId: number): string {
    const functionName = STYLE_FUNCTION_MAP[styleId] || 'sf_radius';
    const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH FOR STYLE ID ${styleId} (${functionName})
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(0.0, t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(TAU, t, r0);
}
`;
    const optimizedStylesWgsl = stripShaderCode(this.stylesWgsl, functionName);
    return [
        this.constantsWgsl,
        this.commonWgsl,
        this.uniformsWgsl,
        optimizedStylesWgsl,
        dispatchCode,
        this.boundWgsl,
    ].join('\n');
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/renderers/webgpu/ShaderManager.test.ts && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assets/shaders/raycast_bound.wgsl src/renderers/webgpu/ShaderManager.ts src/renderers/webgpu/ShaderManager.test.ts
git commit -m "feat(raycast): GPU bounding-radius reduction kernel (same-WGSL, no CPU parity risk)"
```

---

### Task 6: RaycastController

The orchestrator: per-style raycast pipelines, resolve pipeline, accumulation textures, RC uniforms, bound compute, reset/convergence state, and the debug readback API.

**Files:**
- Create: `src/renderers/webgpu/raycast/RaycastController.ts`
- Test: `src/renderers/webgpu/raycast/RaycastController.test.ts` (uses `src/test/webgpu-mock.ts` — follow the mocking pattern used by `src/renderers/webgpu/SceneManager` tests / `src/test/integration.test.ts`)

**Interfaces:**
- Consumes: `ShaderManager.getRaycastWGSL/getRaycastBoundWGSL` (Tasks 4–5), `invertMat4/halton/decodeF16Array` (Task 2), `isMobileDevice` from `src/ResizeManager`, uniform offsets from `src/camera_constants` (`VP_MATRIX_OFFSET`).
- Produces (consumed verbatim by Task 7):

```ts
export interface RaycastSharedBuffers {
  uniform: GPUBuffer;
  style: GPUBuffer;
  c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer;
  bg1: GPUBuffer; bg2: GPUBuffer; bg3: GPUBuffer;
}
export class RaycastController {
  constructor(device: GPUDevice, format: GPUTextureFormat, buffers: RaycastSharedBuffers);
  setStyle(styleId: number): void;                 // kicks async compile; no-op if ready/in-flight
  isReady(styleId: number): boolean;
  notifyFrame(f32: Float32Array, styleParams: Float32Array | null, w: number, h: number): void;
  needsFrame(): boolean;                           // true until maxSamples accumulated
  encode(encoder: GPUCommandEncoder, swapView: GPUTextureView, depthView: GPUTextureView): boolean;
  setQuality(q: { stepCapInteractive?: number; stepCapAccum?: number; featureFloor?: number; maxSamples?: number }): void;
  setDebugMode(mode: 0 | 1): void;
  readbackPixels(x: number, y: number, w: number, h: number): Promise<Float32Array>; // rgba f32 per pixel
  dispose(): void;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/renderers/webgpu/raycast/RaycastController.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { RaycastController } from './RaycastController';
import { VP_MATRIX_OFFSET } from '../../../camera_constants';
// Follow the established GPU-mock import/setup used by SceneManager tests:
import { createMockDevice } from '../../../test/webgpu-mock';

function makeUniforms(): Float32Array {
  const f = new Float32Array(76);
  f[0] = 100; // H
  // identity VP so invVP succeeds
  f[VP_MATRIX_OFFSET + 0] = 1; f[VP_MATRIX_OFFSET + 5] = 1;
  f[VP_MATRIX_OFFSET + 10] = 1; f[VP_MATRIX_OFFSET + 15] = 1;
  return f;
}

describe('RaycastController accumulation state', () => {
  let ctrl: RaycastController;
  beforeEach(() => {
    const device = createMockDevice();
    const buf = () => device.createBuffer({ size: 16, usage: 0x40 | 0x8 });
    ctrl = new RaycastController(device as unknown as GPUDevice, 'bgra8unorm', {
      uniform: buf(), style: buf(),
      c1: buf(), c2: buf(), c3: buf(),
      bg1: buf(), bg2: buf(), bg3: buf(),
    });
  });

  it('needsFrame is true after a fresh notifyFrame', () => {
    ctrl.notifyFrame(makeUniforms(), null, 640, 480);
    expect(ctrl.needsFrame()).toBe(true);
  });

  it('unchanged uniforms advance the sample counter; change resets it', () => {
    const f = makeUniforms();
    ctrl.setQuality({ maxSamples: 3 });
    ctrl.notifyFrame(f, null, 640, 480);      // sample 0
    ctrl.notifyFrame(f, null, 640, 480);      // sample 1
    ctrl.notifyFrame(f, null, 640, 480);      // sample 2
    ctrl.notifyFrame(f, null, 640, 480);      // converged
    expect(ctrl.needsFrame()).toBe(false);
    const g = makeUniforms();
    g[0] = 120; // H changed
    ctrl.notifyFrame(g, null, 640, 480);
    expect(ctrl.needsFrame()).toBe(true);
  });

  it('resize resets accumulation', () => {
    const f = makeUniforms();
    ctrl.setQuality({ maxSamples: 1 });
    ctrl.notifyFrame(f, null, 640, 480);
    ctrl.notifyFrame(f, null, 640, 480);
    expect(ctrl.needsFrame()).toBe(false);
    ctrl.notifyFrame(f, null, 800, 600);
    expect(ctrl.needsFrame()).toBe(true);
  });

  it('isReady is false before setStyle compilation resolves', () => {
    expect(ctrl.isReady(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderers/webgpu/raycast/RaycastController.test.ts`
Expected: FAIL — module not found. (If `createMockDevice` is not the actual export name in `src/test/webgpu-mock.ts`, read that file first and use its real factory/setup — adapt the test imports, not the mock.)

- [ ] **Step 3: Implement the controller**

```ts
// src/renderers/webgpu/raycast/RaycastController.ts
/**
 * Exact ray-cast preview orchestrator.
 * Owns: per-style raycast render pipelines, the static resolve pipeline,
 * accumulation targets (rgba16float, additive blend), the RC uniform buffer,
 * and the GPU bounding-radius pass. Plugs into webgpu_core's frame path.
 * Spec: docs/superpowers/specs/2026-07-08-raycast-preview-design.md
 */
import { ShaderManager } from '../ShaderManager';
import { isMobileDevice } from '../../../ResizeManager';
import { VP_MATRIX_OFFSET } from '../../../camera_constants';
import { invertMat4, halton, decodeF16Array } from './rcMath';

export interface RaycastSharedBuffers {
  uniform: GPUBuffer;
  style: GPUBuffer;
  c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer;
  bg1: GPUBuffer; bg2: GPUBuffer; bg3: GPUBuffer;
}

const RC_UNIFORM_BYTES = 112;
const RC_RMAX_BYTE_OFFSET = 80;
const ACCUM_FORMAT: GPUTextureFormat = 'rgba16float';

const RESOLVE_WGSL = /* wgsl */ `
struct ResolveUniforms { inv_count: f32, _p0: f32, _p1: f32, _p2: f32, };
@group(0) @binding(0) var accum : texture_2d<f32>;
@group(0) @binding(1) var<uniform> RU : ResolveUniforms;

struct VSOut { @builtin(position) pos: vec4<f32>, };

@vertex
fn vs_resolve(@builtin(vertex_index) vid: u32) -> VSOut {
  var xy = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: VSOut;
  out.pos = vec4<f32>(xy[vid], 0.5, 1.0);
  return out;
}

@fragment
fn fs_resolve(in: VSOut) -> @location(0) vec4<f32> {
  let texel = textureLoad(accum, vec2<i32>(in.pos.xy), 0);
  return vec4<f32>(texel.rgb * RU.inv_count, 1.0);
}
`;

export class RaycastController {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private buffers: RaycastSharedBuffers;

  private pipelines = new Map<number, GPURenderPipeline>();
  private compiling = new Map<number, Promise<void>>();
  private boundPipelines = new Map<number, GPUComputePipeline>();
  private bindGroups = new Map<number, GPUBindGroup>();
  private boundBindGroups = new Map<number, GPUBindGroup>();

  private resolvePipeline: GPURenderPipeline | null = null;
  private resolveBindGroup: GPUBindGroup | null = null;
  private resolveUniform: GPUBuffer;

  private rcUniform: GPUBuffer;
  private boundResult: GPUBuffer;
  private boundZero: GPUBuffer;

  private accumTex: GPUTexture | null = null;
  private width = 0;
  private height = 0;

  private sampleIndex = 0;
  private lastSig: string | null = null;
  private boundDirty = true;
  private activeStyleId = -1;
  private lastF32: Float32Array | null = null;

  private mobile = isMobileDevice();
  private stepCapInteractive = this.mobile ? 24 : 48;
  private stepCapAccum = this.mobile ? 64 : 128;
  private featureFloor = 0.25;
  private maxSamples = this.mobile ? 8 : 16;
  private debugMode: 0 | 1 = 0;

  constructor(device: GPUDevice, format: GPUTextureFormat, buffers: RaycastSharedBuffers) {
    this.device = device;
    this.format = format;
    this.buffers = buffers;
    this.rcUniform = device.createBuffer({
      label: 'raycast:rc-uniforms',
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.boundResult = device.createBuffer({
      label: 'raycast:bound-result',
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.boundZero = device.createBuffer({
      label: 'raycast:bound-zero',
      size: 4,
      usage: GPUBufferUsage.COPY_SRC,
    });
    this.resolveUniform = device.createBuffer({
      label: 'raycast:resolve-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  public setQuality(q: { stepCapInteractive?: number; stepCapAccum?: number; featureFloor?: number; maxSamples?: number }): void {
    if (q.stepCapInteractive !== undefined) this.stepCapInteractive = q.stepCapInteractive;
    if (q.stepCapAccum !== undefined) this.stepCapAccum = q.stepCapAccum;
    if (q.featureFloor !== undefined) this.featureFloor = q.featureFloor;
    if (q.maxSamples !== undefined) this.maxSamples = q.maxSamples;
    this.lastSig = null; // force reset so new quality takes effect
  }

  public setDebugMode(mode: 0 | 1): void {
    this.debugMode = mode;
    this.lastSig = null;
  }

  public isReady(styleId: number): boolean {
    return this.pipelines.has(styleId) && this.resolvePipeline !== null;
  }

  public needsFrame(): boolean {
    return this.sampleIndex < this.maxSamples;
  }

  public setStyle(styleId: number): void {
    if (this.pipelines.has(styleId) || this.compiling.has(styleId)) return;
    const task = (async () => {
      const sm = ShaderManager.getInstance();
      const module = this.device.createShaderModule({
        label: `raycast_style_${styleId}.wgsl`,
        code: sm.getRaycastWGSL(styleId),
      });
      const pipeline = await this.device.createRenderPipelineAsync({
        label: `raycast:pipeline-${styleId}`,
        layout: 'auto',
        vertex: { module, entryPoint: 'vs_raycast' },
        fragment: {
          module,
          entryPoint: 'fs_raycast',
          targets: [{
            format: ACCUM_FORMAT,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
        // 'always' + write: jittered re-renders must never be killed by the
        // previous sample's depth; all samples of a pixel have ~equal depth.
        depthStencil: { depthWriteEnabled: true, depthCompare: 'always', format: 'depth24plus' },
      });
      this.pipelines.set(styleId, pipeline);
      this.bindGroups.set(styleId, this.createRaycastBindGroup(pipeline));

      const boundModule = this.device.createShaderModule({
        label: `raycast_bound_${styleId}.wgsl`,
        code: sm.getRaycastBoundWGSL(styleId),
      });
      const boundPipeline = await this.device.createComputePipelineAsync({
        label: `raycast:bound-${styleId}`,
        layout: 'auto',
        compute: { module: boundModule, entryPoint: 'cs_bound' },
      });
      this.boundPipelines.set(styleId, boundPipeline);
      this.boundBindGroups.set(styleId, this.device.createBindGroup({
        label: `raycast:bound-bg-${styleId}`,
        layout: boundPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.uniform } },
          { binding: 4, resource: { buffer: this.buffers.style } },
          { binding: 9, resource: { buffer: this.boundResult } },
        ],
      }));

      if (!this.resolvePipeline) {
        const rm = this.device.createShaderModule({ label: 'raycast_resolve.wgsl', code: RESOLVE_WGSL });
        this.resolvePipeline = await this.device.createRenderPipelineAsync({
          label: 'raycast:resolve',
          layout: 'auto',
          vertex: { module: rm, entryPoint: 'vs_resolve' },
          fragment: { module: rm, entryPoint: 'fs_resolve', targets: [{ format: this.format }] },
          primitive: { topology: 'triangle-list' },
        });
      }
    })();
    this.compiling.set(styleId, task);
    task
      .catch((e) => console.error(`[Raycast] pipeline compile failed for style ${styleId}`, e))
      .finally(() => this.compiling.delete(styleId));
  }

  private createRaycastBindGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    return this.device.createBindGroup({
      label: 'raycast:bind-group-main',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.uniform } },
        { binding: 1, resource: { buffer: this.buffers.c1 } },
        { binding: 2, resource: { buffer: this.buffers.c2 } },
        { binding: 3, resource: { buffer: this.buffers.c3 } },
        { binding: 4, resource: { buffer: this.buffers.style } },
        { binding: 5, resource: { buffer: this.buffers.bg1 } },
        { binding: 6, resource: { buffer: this.buffers.bg2 } },
        { binding: 7, resource: { buffer: this.buffers.bg3 } },
        { binding: 8, resource: { buffer: this.rcUniform } },
      ],
    });
  }

  private ensureTargets(w: number, h: number): void {
    if (this.accumTex && this.width === w && this.height === h) return;
    this.accumTex?.destroy();
    this.accumTex = this.device.createTexture({
      label: 'raycast:accum',
      size: [Math.max(1, w), Math.max(1, h)],
      format: ACCUM_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    this.width = w;
    this.height = h;
    this.resolveBindGroup = null; // texture view changed
    this.sampleIndex = 0;
    this.lastSig = null;
  }

  /**
   * Per-frame state update. Detects any change in the 76 preview uniforms,
   * style params, or canvas size; a change resets accumulation to sample 0.
   */
  public notifyFrame(f32: Float32Array, styleParams: Float32Array | null, w: number, h: number): void {
    this.ensureTargets(w, h);
    const styleId = Math.round(f32[7]);
    let sig = `${styleId}|${w}x${h}|${this.debugMode}|`;
    for (let i = 0; i < f32.length; i++) sig += f32[i] + ',';
    if (styleParams) for (let i = 0; i < styleParams.length; i++) sig += styleParams[i] + ',';

    if (sig !== this.lastSig) {
      this.sampleIndex = 0;
      this.lastSig = sig;
      if (styleId !== this.activeStyleId) {
        this.activeStyleId = styleId;
        this.boundDirty = true;
      } else {
        this.boundDirty = true; // params may change the max radius too — cheap, redo it
      }
    }
    this.lastF32 = f32;
  }

  private writeRcUniforms(): boolean {
    if (!this.lastF32) return false;
    const vp = this.lastF32.slice(VP_MATRIX_OFFSET, VP_MATRIX_OFFSET + 16);
    const inv = invertMat4(vp);
    if (!inv) return false;
    const data = new Float32Array(RC_UNIFORM_BYTES / 4);
    data.set(inv, 0);
    const s = this.sampleIndex;
    data[16] = s === 0 ? 0 : halton(s, 2) - 0.5; // jitter.x (px)
    data[17] = s === 0 ? 0 : halton(s, 3) - 0.5; // jitter.y (px)
    data[18] = s === 0 ? 0 : halton(s, 5);       // march_phase
    data[19] = s;                                 // sample_index
    // data[20] = r_max — written by the bound-pass buffer copy, keep 0 here
    data[21] = s === 0 ? this.stepCapInteractive : this.stepCapAccum;
    data[22] = this.featureFloor;
    data[23] = this.debugMode;
    data[24] = this.width;
    data[25] = this.height;
    // Write everything below r_max, then everything above it, so the GPU-copied
    // r_max at bytes 80-83 (data[20]) is never clobbered.
    this.device.queue.writeBuffer(this.rcUniform, 0, data.buffer, 0, RC_RMAX_BYTE_OFFSET);
    this.device.queue.writeBuffer(this.rcUniform, 84, data.buffer, 84, RC_UNIFORM_BYTES - 84);
    return true;
  }

  /**
   * Encodes this frame's GPU work: optional bound pass, one accumulation
   * sample (if not converged), and the resolve blit to the swapchain.
   * Returns false (encode nothing) if pipelines or state are not ready.
   */
  public encode(encoder: GPUCommandEncoder, swapView: GPUTextureView, depthView: GPUTextureView): boolean {
    const pipeline = this.pipelines.get(this.activeStyleId);
    const bindGroup = this.bindGroups.get(this.activeStyleId);
    const boundPipeline = this.boundPipelines.get(this.activeStyleId);
    const boundBindGroup = this.boundBindGroups.get(this.activeStyleId);
    if (!pipeline || !bindGroup || !this.resolvePipeline || !this.accumTex || !boundPipeline || !boundBindGroup) {
      return false;
    }
    if (!this.writeRcUniforms()) return false;

    if (this.boundDirty) {
      encoder.copyBufferToBuffer(this.boundZero, 0, this.boundResult, 0, 4);
      const cp = encoder.beginComputePass({ label: 'raycast:bound-pass' });
      cp.setPipeline(boundPipeline);
      cp.setBindGroup(0, boundBindGroup);
      cp.dispatchWorkgroups(1);
      cp.end();
      encoder.copyBufferToBuffer(this.boundResult, 0, this.rcUniform, RC_RMAX_BYTE_OFFSET, 4);
      this.boundDirty = false;
    }

    if (this.sampleIndex < this.maxSamples) {
      const accumView = this.accumTex.createView();
      const pass = encoder.beginRenderPass({
        label: 'raycast:sample-pass',
        colorAttachments: [{
          view: accumView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: this.sampleIndex === 0 ? 'clear' : 'load',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: depthView,
          depthClearValue: 1.0,
          depthLoadOp: this.sampleIndex === 0 ? 'clear' : 'load',
          depthStoreOp: 'store',
        },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      this.sampleIndex += 1;
    }

    const invCount = 1 / Math.max(1, this.sampleIndex);
    this.device.queue.writeBuffer(this.resolveUniform, 0, new Float32Array([invCount, 0, 0, 0]).buffer);
    if (!this.resolveBindGroup) {
      this.resolveBindGroup = this.device.createBindGroup({
        label: 'raycast:resolve-bg',
        layout: this.resolvePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.accumTex.createView() },
          { binding: 1, resource: { buffer: this.resolveUniform } },
        ],
      });
    }
    const resolvePass = encoder.beginRenderPass({
      label: 'raycast:resolve-pass',
      colorAttachments: [{
        view: swapView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    resolvePass.setPipeline(this.resolvePipeline);
    resolvePass.setBindGroup(0, this.resolveBindGroup);
    resolvePass.draw(3);
    resolvePass.end();
    return true;
  }

  /** Dev/e2e: read back a region of the accumulation texture as f32 rgba. */
  public async readbackPixels(x: number, y: number, w: number, h: number): Promise<Float32Array> {
    if (!this.accumTex) throw new Error('raycast: no accumulation texture');
    const bytesPerPixel = 8; // rgba16float
    const unpadded = w * bytesPerPixel;
    const padded = Math.ceil(unpadded / 256) * 256;
    const buf = this.device.createBuffer({
      label: 'raycast:readback',
      size: padded * h,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder({ label: 'raycast:readback-encoder' });
    encoder.copyTextureToBuffer(
      { texture: this.accumTex, origin: { x, y } },
      { buffer: buf, bytesPerRow: padded },
      { width: w, height: h }
    );
    this.device.queue.submit([encoder.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const raw = new Uint8Array(buf.getMappedRange()).slice();
    buf.unmap();
    buf.destroy();
    const out = new Float32Array(w * h * 4);
    for (let row = 0; row < h; row++) {
      const rowU16 = new Uint16Array(raw.buffer, row * padded, w * 4);
      out.set(decodeF16Array(rowU16), row * w * 4);
    }
    // Accumulated values are sums — normalize to per-sample means.
    const inv = 1 / Math.max(1, this.sampleIndex);
    for (let i = 0; i < out.length; i++) out[i] *= inv;
    return out;
  }

  public dispose(): void {
    this.accumTex?.destroy();
    this.rcUniform.destroy();
    this.boundResult.destroy();
    this.boundZero.destroy();
    this.resolveUniform.destroy();
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/renderers/webgpu/raycast/RaycastController.test.ts && npm run typecheck && npm run lint`
Expected: PASS. If the webgpu mock lacks a method the controller calls (e.g. `createComputePipelineAsync`, `copyBufferToBuffer`), extend `src/test/webgpu-mock.ts` with a stub in the same style as its existing methods — that file exists to be extended.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/webgpu/raycast/RaycastController.ts src/renderers/webgpu/raycast/RaycastController.test.ts src/test/webgpu-mock.ts
git commit -m "feat(raycast): RaycastController — pipelines, accumulation, bound pass, readback"
```

---

### Task 7: webgpu_core integration + dev API

Wire the controller into the production frame path with a minimal diff. Mesh path remains the default and fully intact.

**Files:**
- Modify: `src/webgpu_core.ts` (three insertion points, detailed below)
- Test: manual smoke via dev server + existing e2e regression (`e2e/webgpu-rendering.spec.ts`)

**Interfaces:**
- Consumes: `RaycastController`, `resolvePreviewMode` (Tasks 1, 6).
- Produces: `window.__pfRaycast` dev API `{ controller: RaycastController } | undefined` (used by Task 9 e2e); raycast rendering active when `resolvePreviewMode(...) === 'raycast'`.

- [ ] **Step 1: Run impact analysis**

`impact({target: "updateAndDraw", direction: "upstream"})` — this is the hot path; report the blast radius and proceed carefully. The design keeps every existing statement; raycast only *adds* branches.

- [ ] **Step 2: Locate the three anchors** (line numbers drift; anchor on code)

1. **Mount-scope setup** — find the `createBindGroupFactory({ ... })` call in `webgpu_core.ts` (search `createBindGroupFactory(`). The config object names the buffer variables in scope (uniform buffer, style param buffer, color and bg gradient buffers).
2. **Frame loop idle forcing** — `idleDetector?.setForceActive(Boolean(hasActiveAnimations));` (in `frame()`, around line 3967).
3. **Main pass** — `const renderPassDesc: GPURenderPassDescriptor = {` (~line 3393) and `pass.draw(safeDrawVerts);` (~line 3566). Also `device.queue.writeBuffer(uniformBuffer, 0, f32.buffer ...)` (~3266) — `f32` is the 76-float uniform array. Find the style-param write with `grep -n "writeBuffer(styleParamBuffer" src/webgpu_core.ts` and note the Float32Array variable it writes; that array is passed to `notifyFrame`.

- [ ] **Step 3: Mount-scope setup** (after the bind-group factory creation)

```ts
// --- Exact ray-cast preview (flag-gated; spec 2026-07-08) ---
import { RaycastController } from './renderers/webgpu/raycast/RaycastController';
import { resolvePreviewMode } from './renderers/webgpu/raycast/previewMode';
// (imports go to the top of the file with the others)

const previewMode = resolvePreviewMode(
  typeof window !== 'undefined' ? window.location.search : '',
  (k) => { try { return localStorage.getItem(k); } catch { return null; } }
);
let raycastController: RaycastController | null = null;
if (previewMode === 'raycast') {
  try {
    raycastController = new RaycastController(device, format, {
      uniform: uniformBuffer,
      style: styleParamBuffer,
      c1: colorBuffers.c1, c2: colorBuffers.c2, c3: colorBuffers.c3,
      bg1: bgBuffers.c1, bg2: bgBuffers.c2, bg3: bgBuffers.c3,
    });
    // Dev/e2e hook (mirrors the __pfConforming* lever convention)
    (window as unknown as { __pfRaycast?: object }).__pfRaycast = { controller: raycastController };
    console.log('[Raycast] Exact ray-cast preview ENABLED');
  } catch (e) {
    console.error('[Raycast] init failed — falling back to mesh preview', e);
    raycastController = null;
  }
}
```

Use the *actual* buffer variable names found at the `createBindGroupFactory` call site (the names above match `BindGroupFactoryConfig`: `uniformBuffer`, `styleParamBuffer`, `colorBuffers`, `bgBuffers` — verify against the call site and adjust if the local names differ). Also add `raycastController?.dispose()` in the mount's existing dispose/cleanup path (search `disposed = true`).

- [ ] **Step 4: Frame-loop idle forcing** — replace the single line:

```ts
idleDetector?.setForceActive(Boolean(hasActiveAnimations) || (raycastController?.needsFrame() ?? false));
```

- [ ] **Step 5: updateAndDraw branch**

Immediately **before** `const renderPassDesc: GPURenderPassDescriptor = {`:

```ts
// Exact ray-cast path: replaces background+ground+pot; debug overlays still
// draw on top via the main pass below with loadOp 'load'.
let raycastDrewFrame = false;
if (raycastController && cfg.showWireframe !== true) {
  raycastController.setStyle(reqStyleId);
  if (raycastController.isReady(reqStyleId)) {
    raycastController.notifyFrame(f32, lastStyleParamsF32 ?? null, canvas.width, canvas.height);
    raycastDrewFrame = raycastController.encode(encoder, textureView, depthView!);
  }
}
```

`lastStyleParamsF32` = the Float32Array written to `styleParamBuffer` (from Step 2.3; if it is built inline, assign it to a mount-scope `let lastStyleParamsF32: Float32Array | null = null` at its write site). `reqStyleId` already exists above the pass (line ~3510) — **move its declaration above this insertion if needed** (it is currently computed a few lines later; hoist the `const reqStyleId = ...` statement, do not duplicate it). `canvas` is the mount canvas variable in scope.

Then make the main pass composite instead of clear when raycast drew, by changing the two loadOps in `renderPassDesc`:

```ts
loadOp: raycastDrewFrame ? 'load' : 'clear',
```

(one for the color attachment, one for `depthLoadOp` — keep `clearValue`/`depthClearValue` as they are; they're ignored under 'load').

Finally, skip the mesh pot draw when raycast drew — wrap the single line `pass.draw(safeDrawVerts);` (and its `totalDrawCalls += 1;`):

```ts
if (!raycastDrewFrame) {
  lastOperation = 'draw-main';
  pass.draw(safeDrawVerts);
  totalDrawCalls += 1;
}
```

(Wireframe stays gated by `showWireframe`, which forces the mesh path entirely; debug lines/points blocks below run unchanged — their pipelines write with a small depth bias against the raycast depth, which is valid because `fs_raycast` writes `frag_depth` from the same `vp_matrix()`.)

- [ ] **Step 6: Typecheck, lint, run full unit suite**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS.

- [ ] **Step 7: Manual smoke (both modes)**

With `npm run dev` running:
1. `http://localhost:3000/` — default mesh preview unchanged.
2. `http://localhost:3000/?preview=raycast` — pot renders via ray-cast (console shows `[Raycast] Exact ray-cast preview ENABLED`), orbiting works, image visibly sharpens ~1s after releasing the mouse (accumulation), grid lines are stable (no shimmer), `?preview=raycast` + wireframe toggle falls back to mesh.
3. Regression: `npx playwright test e2e/webgpu-rendering.spec.ts --project=chromium` — Expected: PASS (mesh default untouched).

- [ ] **Step 8: Run `detect_changes()` and commit**

```bash
git add src/webgpu_core.ts
git commit -m "feat(raycast): wire exact ray-cast preview into webgpu_core (flag-gated, mesh default)"
```

---

### Task 8: Settings toggle

**Files:**
- Create: `src/ui/controls/PreviewModeSelect.tsx`
- Test: `src/ui/controls/PreviewModeSelect.test.tsx`
- Modify: the settings surface that hosts the renderer preference — find it with `grep -rn "pf-preferred-renderer" src/ui/` and render `<PreviewModeSelect />` adjacent to that control.

**Interfaces:**
- Consumes: `PREVIEW_MODE_STORAGE_KEY`, `resolvePreviewMode` (Task 1).
- Produces: self-contained component; writes `localStorage['pf-preview-mode']` and prompts reload.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/controls/PreviewModeSelect.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewModeSelect } from './PreviewModeSelect';
import { PREVIEW_MODE_STORAGE_KEY } from '../../renderers/webgpu/raycast/previewMode';

describe('PreviewModeSelect', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to mesh', () => {
    render(<PreviewModeSelect />);
    expect((screen.getByLabelText(/preview engine/i) as HTMLSelectElement).value).toBe('mesh');
  });

  it('persists selection to localStorage', () => {
    render(<PreviewModeSelect />);
    fireEvent.change(screen.getByLabelText(/preview engine/i), { target: { value: 'raycast' } });
    expect(localStorage.getItem(PREVIEW_MODE_STORAGE_KEY)).toBe('raycast');
  });

  it('reflects an existing stored value', () => {
    localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, 'raycast');
    render(<PreviewModeSelect />);
    expect((screen.getByLabelText(/preview engine/i) as HTMLSelectElement).value).toBe('raycast');
  });
});
```

Run: `npx vitest run src/ui/controls/PreviewModeSelect.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement**

```tsx
// src/ui/controls/PreviewModeSelect.tsx
/**
 * Preview engine selector: classic tessellated mesh vs exact ray-cast (beta).
 * Persists to localStorage; the renderer reads the flag at mount, so a reload
 * is required (same UX as the pf-preferred-renderer setting).
 */
import { useState } from 'react';
import {
  PREVIEW_MODE_STORAGE_KEY,
  resolvePreviewMode,
  type PreviewMode,
} from '../../renderers/webgpu/raycast/previewMode';

export function PreviewModeSelect() {
  const [mode, setMode] = useState<PreviewMode>(() =>
    resolvePreviewMode('', (k) => {
      try { return localStorage.getItem(k); } catch { return null; }
    })
  );
  const [dirty, setDirty] = useState(false);

  const onChange = (value: PreviewMode) => {
    setMode(value);
    setDirty(true);
    try { localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, value); } catch { /* storage unavailable */ }
  };

  return (
    <div>
      <label htmlFor="pf-preview-engine">Preview engine</label>
      <select
        id="pf-preview-engine"
        value={mode}
        onChange={(e) => onChange(e.target.value as PreviewMode)}
      >
        <option value="mesh">Standard (mesh)</option>
        <option value="raycast">Exact ray-cast (beta, WebGPU)</option>
      </select>
      {dirty && <p role="status">Reload the page to apply.</p>}
    </div>
  );
}
```

Match the class names / wrapper markup of the neighboring settings controls when placing it (read the host file first; keep its styling conventions).

- [ ] **Step 3: Run tests** — `npx vitest run src/ui/controls/PreviewModeSelect.test.tsx && npm run lint` — Expected: PASS.

- [ ] **Step 4: Place it in the settings surface** — render `<PreviewModeSelect />` next to the renderer-preference control found in Step 0 grep; run `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controls/PreviewModeSelect.tsx src/ui/controls/PreviewModeSelect.test.tsx <settings-host-file>
git commit -m "feat(raycast): settings toggle for preview engine (mesh default, reload to apply)"
```

---

### Task 9: E2E verification gate

**Files:**
- Create: `e2e/raycast-preview.spec.ts`
- Artifacts: `e2e/artifacts/raycast-ab/` (A/B screenshots per style)

**Interfaces:**
- Consumes: `window.__pfRaycast.controller` (Task 7), `?preview=raycast|mesh` URL flag, dev server on port 3000.
- Produces: the verification gate the default-flip decision rests on.

**Style switching:** styles must be driven the way existing GPU e2e specs do it — read `e2e/export-fidelity.spec.ts` first and reuse its style-selection helper/mechanism verbatim (do not invent a new one). The test below abstracts it as `selectStyle(page, styleId)`.

- [ ] **Step 1: Write the spec**

```ts
// e2e/raycast-preview.spec.ts
/**
 * Exact ray-cast preview — verification gate (spec 2026-07-08 §6).
 * Requires: npm run dev (port 3000). Run:
 *   npx playwright test e2e/raycast-preview.spec.ts --project=chromium
 * Adaptations vs plan: record any A-numbered deviations here (repo convention).
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ALL_STYLES = Array.from({ length: 20 }, (_, i) => i);
// Representative subset for the expensive probes:
const PROBE_STYLES = [0, 9, 5];

// Reuse the style-driving mechanism from e2e/export-fidelity.spec.ts — read it
// and implement selectStyle() identically to how that spec switches styles.
async function selectStyle(page: Page, styleId: number): Promise<void> {
  throw new Error(`implement using export-fidelity.spec.ts mechanism (style ${styleId})`);
}

async function waitForRaycastReady(page: Page, styleId: number): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const rc = (window as unknown as { __pfRaycast?: { controller?: { isReady(n: number): boolean } } }).__pfRaycast;
      return Boolean(rc?.controller?.isReady(id));
    },
    styleId,
    { timeout: 60_000 }
  );
  // let accumulation converge
  await page.waitForTimeout(1500);
}

/** Read back a center region via the controller's debug channel. */
async function readbackCenter(page: Page, w = 32, h = 32): Promise<number[]> {
  return page.evaluate(async ({ w, h }) => {
    const rc = (window as unknown as {
      __pfRaycast: { controller: {
        readbackPixels(x: number, y: number, w: number, h: number): Promise<Float32Array>;
      } };
    }).__pfRaycast;
    const canvas = document.querySelector('canvas')!;
    const cx = Math.floor(canvas.width / 2 - w / 2);
    const cy = Math.floor(canvas.height / 2 - h / 2);
    const px = await rc.controller.readbackPixels(cx, cy, w, h);
    return Array.from(px);
  }, { w, h });
}

test.describe('raycast preview gate', () => {
  test.setTimeout(120_000);

  for (const styleId of ALL_STYLES) {
    test(`style ${styleId}: renders non-degenerate frame`, async ({ page }) => {
      await page.goto(`${BASE}/?preview=raycast`);
      await selectStyle(page, styleId);
      await waitForRaycastReady(page, styleId);
      const px = await readbackCenter(page);
      const finite = px.every((v) => Number.isFinite(v));
      expect(finite).toBe(true);
      // shaded mode: some variance across the region (not a solid color)
      const rs = px.filter((_, i) => i % 4 === 0);
      const min = Math.min(...rs);
      const max = Math.max(...rs);
      expect(max).toBeGreaterThan(0.001);        // not black
      expect(max - min).toBeGreaterThan(1e-5);   // not constant
    });
  }

  for (const styleId of PROBE_STYLES) {
    test(`style ${styleId}: intersection exactness probe (prod vs high-precision)`, async ({ page }) => {
      await page.goto(`${BASE}/?preview=raycast`);
      await selectStyle(page, styleId);
      await waitForRaycastReady(page, styleId);

      const setQ = async (stepCap: number) => {
        await page.evaluate((cap) => {
          const rc = (window as unknown as {
            __pfRaycast: { controller: {
              setDebugMode(m: 0 | 1): void;
              setQuality(q: { stepCapInteractive?: number; stepCapAccum?: number; maxSamples?: number }): void;
            } };
          }).__pfRaycast;
          rc.controller.setDebugMode(1);
          rc.controller.setQuality({ stepCapInteractive: cap, stepCapAccum: cap, maxSamples: 1 });
        }, stepCap);
        await page.waitForTimeout(500); // one debug frame
      };

      await setQ(48);   // production interactive quality
      const prod = await readbackCenter(page, 48, 48);
      await setQ(512);  // reference quality: dense march, same bisection
      const ref = await readbackCenter(page, 48, 48);

      // channel 0 = hit distance along ray (mm); -1 = miss
      let mutualHits = 0;
      let maxDelta = 0;
      let disagree = 0;
      for (let i = 0; i < prod.length; i += 4) {
        const a = prod[i];
        const b = ref[i];
        if (a >= 0 && b >= 0) {
          mutualHits++;
          maxDelta = Math.max(maxDelta, Math.abs(a - b));
        } else if ((a >= 0) !== (b >= 0)) {
          disagree++;
        }
      }
      expect(mutualHits).toBeGreaterThan(48 * 48 * 0.5);
      // Bisection converges both to the same bracket ⇒ sub-0.001mm agreement
      // wherever the production march found the same first crossing.
      expect(maxDelta).toBeLessThan(0.001);
      // Grazing/thin-feature pixels may differ in hit/miss at low step count:
      expect(disagree).toBeLessThan(48 * 48 * 0.1);
    });
  }

  for (const styleId of ALL_STYLES) {
    test(`style ${styleId}: A/B screenshots`, async ({ page }) => {
      await page.goto(`${BASE}/?preview=mesh`);
      await selectStyle(page, styleId);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `e2e/artifacts/raycast-ab/style-${styleId}-mesh.png` });
      await page.goto(`${BASE}/?preview=raycast`);
      await selectStyle(page, styleId);
      await waitForRaycastReady(page, styleId);
      await page.screenshot({ path: `e2e/artifacts/raycast-ab/style-${styleId}-raycast.png` });
    });
  }

  test('perf smoke: interactive frame time is not catastrophic', async ({ page }) => {
    await page.goto(`${BASE}/?preview=raycast`);
    await selectStyle(page, 9); // DragonScales — heavy style
    await waitForRaycastReady(page, 9);
    const avgMs = await page.evaluate(async () => {
      // drag-orbit continuously so every frame is an interactive 1-spp frame
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, buttons: 1, pointerId: 1, bubbles: true }));
      const times: number[] = [];
      let last = performance.now();
      let x = cx;
      for (let i = 0; i < 60; i++) {
        x += 2;
        canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: cy, buttons: 1, pointerId: 1, bubbles: true }));
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        times.push(now - last);
        last = now;
      }
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: cy, pointerId: 1, bubbles: true }));
      times.sort((a, b) => a - b);
      return times.slice(5, 55).reduce((s, v) => s + v, 0) / 50; // trimmed mean
    });
    console.log(`[raycast perf] interactive avg frame ${avgMs.toFixed(1)}ms`);
    expect(avgMs).toBeLessThan(100); // catastrophe gate only; CI GPUs vary
  });
});
```

- [ ] **Step 2: Implement `selectStyle`** by reading `e2e/export-fidelity.spec.ts` and copying its style-switch mechanism; delete the `throw`.

- [ ] **Step 3: Run the gate** (dev server running)

Run: `npx playwright test e2e/raycast-preview.spec.ts --project=chromium`
Expected: all tests PASS; `e2e/artifacts/raycast-ab/` contains 40 screenshots. Eyeball at least styles 0, 5, 9, 12 A/B pairs — the raycast image should show the same pot with crisper silhouette/features and no faceting.

- [ ] **Step 4: Fix what the gate finds.** Real-GPU findings (WGSL compile errors, march misses, depth mismatches with overlays) are expected here; iterate on `preview_raycast.wgsl` / controller until green. Record any A-numbered adaptations in the spec-file header comment (repo convention).

- [ ] **Step 5: Commit**

```bash
git add e2e/raycast-preview.spec.ts
git commit -m "test(raycast): e2e verification gate — 20-style smoke, exactness probe, A/B, perf"
```

(Screenshots under `e2e/artifacts/` follow the repo's existing artifact conventions — commit them only if the existing `.gitignore` tracks that directory.)

---

### Task 10: Documentation + handoff

**Files:**
- Modify: `potfoundry-web/CLAUDE.md` (renderer files table + gotchas)
- Modify: `agents_journal.md` (append entry per `agents.md` protocol)

- [ ] **Step 1: CLAUDE.md** — in the "WebGPU Renderer Files" table add:

```markdown
| `raycast/RaycastController.ts` | Exact ray-cast preview (flag-gated: `?preview=raycast` / Settings → Preview engine / `localStorage['pf-preview-mode']`). Fullscreen bounded-march+bisection against the true style_radius solid; progressive accumulation AA (16 spp desktop / 8 mobile). Mesh preview remains the default and the wireframe/thumbnail/WebGL path. Dev API: `window.__pfRaycast.controller` (setQuality/setDebugMode/readbackPixels). Spec: `../docs/superpowers/specs/2026-07-08-raycast-preview-design.md`. |
```

And under Key Gotchas:

```markdown
**Ray-cast preview flag:** `resolvePreviewMode` (url > localStorage > mesh). The ray-cast
path is desktop+mobile WebGPU only; wireframe mode always uses the mesh path. The RC
uniform layout (112 bytes, r_max at byte 80 written by a GPU buffer copy) is shared between
`preview_raycast.wgsl` and `RaycastController.writeRcUniforms` — change both together.
```

- [ ] **Step 2: Journal entry** — append to `agents_journal.md` following the existing entry format: date, agent, what shipped (tasks 1–9), gate results (20-style smoke, probe numbers, perf number), and the open decision: *flip default to raycast after Patryk reviews the A/B artifacts*.

- [ ] **Step 3: Run `detect_changes()`, then commit**

```bash
git add CLAUDE.md ../agents_journal.md
git commit -m "docs(raycast): renderer docs + journal entry for exact ray-cast preview"
```

---

## Out of scope (explicit)

- Flipping the default to `raycast` — a separate one-line change **after** the user reviews the Task 9 gate evidence.
- Thumbnail renderer migration, WebGL parity, resolution-scale knob (RC uniform has reserved padding for it), wireframe-over-raycast.

## Self-review notes (completed)

- Spec §1 implicit solid → Task 4 `pot_field` (twist inversion, cavity, drain clamps, showInner). Spec §2 march/bisect/bound-clip → Task 4 + Task 5 (bound source is GPU, an improvement over the spec's CPU scan — same conservatism, zero parity risk; margin 1.10×+1mm in-shader). Spec §3 shading/normals/grid/depth → Tasks 3–4. Spec §4 accumulation → Tasks 2, 6 (jittered subpixel + march phase, Halton, reset-on-change, stop-at-N; the spec's optional mobile res-scale deferred as YAGNI — reserved uniform space noted). Spec §5 integration/flag → Tasks 1, 7, 8. Spec §6 gate → Task 9 (probe realized as prod-vs-dense-march self-consistency: the style function itself is already validated by the B5/perp-3D fidelity program; the new risk surface is the intersection code, which is what the probe exercises).
- Type consistency: `RaycastController` API names match between Tasks 6, 7, 9 (`setStyle`/`isReady`/`notifyFrame`/`needsFrame`/`encode`/`setQuality`/`setDebugMode`/`readbackPixels`); RC uniform byte layout stated identically in Tasks 4 and 6.
- Known execution-time lookups (deliberate, anchored): webgpu-mock factory name (Task 6), bind-group buffer variable names at the `createBindGroupFactory` call site (Task 7), style-param array variable (Task 7), settings host file (Task 8), style-switch helper (Task 9).
