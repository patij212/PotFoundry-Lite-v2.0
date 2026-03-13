# Mobile WebGPU — Limitations, Lessons & Reference

> Accumulated knowledge from shipping PotFoundry's WebGPU renderer to Android (Adreno 730, Chrome 145+).

---

## Shader Architecture

The mobile renderer uses a **single self-contained WGSL shader** (`preview_full_mobile.wgsl`) instead of the desktop's multi-file approach. All geometry segments (outer wall, inner wall, rim, bottom top, bottom underside, drain cylinder) and lighting are in one file. Only the style function is injected at `// __STYLE_SLOT__`.

**Current version**: v11 (370 lines base, ~14 KB without style injection)

---

## Hard Limits

| Constraint | Value | Source |
|---|---|---|
| Shader budget (bytes) | 50 KB (`MOBILE_SHADER_BUDGET`) | SceneManager.ts — prevents GPU TDR |
| Pipeline compilation timeout | 8 000 ms (`PIPELINE_TIMEOUT_MS`) | SceneManager.ts — prevents infinite Dawn hangs |
| Max DPR | 1.5 | ResizeManager — saves fill-rate bandwidth |
| Background warmup | Disabled on mobile | SceneManager.init — only compiles the active style |

## Known Device-Specific Issues

### Adreno 730 (Qualcomm Snapdragon 8 Gen 1)
- **Dawn/Tint WGSL validation is stricter than `wgsl_reflect`**. A shader that validates with `wgsl_reflect` may still be rejected by Dawn on the device. Always test on the actual phone.
- **`snorm` is a reserved keyword** in Dawn/Tint — do not use as a variable name.
- **Pipeline compilation is fast** (~19ms for 527-line shader) — the 8s timeout is conservative.
- **No `getCompilationInfo` warnings surfaced by default** — errors are logged via `console.error` which the DevConsole patch does NOT capture (see Logging section below).

---

## Logging Gotcha: ConsolePatch Doesn't Capture Errors

`ConsolePatch.ts` only intercepts `['log', 'info', 'debug']`. All `console.error` and `console.warn` calls are **invisible** on the phone's DevConsole overlay.

**Workaround (applied)**: Critical error paths in `SceneManager.ts` mirror their `console.error` calls with `console.log` so they appear in the DevConsole. Specifically:
- `CRITICAL INIT FAILURE` (init catch block)
- `Style N has M shader compilation error(s)` (getCompilationInfo)
- `PIPELINE FAILED Style N after Xms` (createRenderPipelineAsync failure)

**Future fix**: Extend ConsolePatch to also capture `'error'` and `'warn'`.

---

## Segment Mapping (Mobile vs Desktop)

| Segment | Desktop ID | Mobile ID | Notes |
|---|---|---|---|
| Outer wall | 0 | 0 | Same |
| Inner wall | 1 | 1 | Hidden via degenerate triangle when `showInner=false` |
| Bottom top | 2 | 3 | **Different order** |
| Bottom underside | 3 | 4 | **Different order** |
| Rim | 4 | 2 | **Different order** |
| Drain cylinder | 5 | 5 | Same |

---

## Lighting Model (v11)

Mobile matches desktop's camera-space lighting:

- **3 studio lights**: Key (front-top-right), Fill (front-left), Back (behind-above)
- **2 rim kicker lights**: Left and right side fill for edge definition
- **Hemisphere ambient**: Sky/ground blend on camera-space Z (forward axis, NOT Y)
- **Tuning uniforms**: `getf(22u)` ambient, `getf(23u)` diffuse, `getf(24u)` fresnel
- **Specular**: Blinn-Phong in camera space, roughness from `getf(70u)`, gain from `getf(69u)`
- **Fresnel**: Schlick approximation, final scaling `tuning_fresnel * fresnel * 0.12`

---

## Bottom Disc Geometry (v11 seam_t fix)

Bottom discs (segments 3 and 4) use a **two-zone radial interpolation**:
1. **Zone 1** (v: 0 → seam_t): Outer radius → Inner radius (uses `surf()` for outer to match wall profile)
2. **Zone 2** (v: seam_t → 1): Inner radius → Drain radius

`seam_t = 1.0 - (1.0 / max(bottomRings, 1.0))`

This closes the gap between the outer wall and the bottom disc that existed in v10 (which only interpolated inner→drain).

---

## Dev Server Setup for Phone Testing

```bash
cd potfoundry-web
npm run dev:mobile    # Starts on HTTPS, port 3443, host 0.0.0.0
```

The `dev:mobile` script sets `VITE_MOBILE=1` which:
1. Enables `@vitejs/plugin-basic-ssl` for HTTPS (required by WebGPU on Android)
2. Binds to `0.0.0.0` instead of `127.0.0.1`
3. Sets default port to 3443

Access from phone: `https://<your-lan-ip>:3443/`
- Accept the self-signed certificate warning (Advanced → Proceed)
- If the URL has `?renderer=webgl` from a previous fallback, change to `?renderer=webgpu`

---

## Debugging Checklist

When the mobile shader fails:

1. **Check the DevConsole** for `PIPELINE FAILED` or `SHADER ERROR` log lines
2. **Check the URL** — a previous fallback may have stuck `?renderer=webgl`
3. **Run `validate_wgsl_reflect.mjs`** locally — but remember Dawn may still reject what wgsl_reflect accepts
4. **Check shader size** — must be < 50 KB after style injection
5. **Check for reserved words** — Dawn's reserved word list is larger than the WGSL spec
6. **Check per-frame logging** — any `console.log` in the draw loop will flood the DevConsole and make it unusable

---

## File Reference

| File | Purpose |
|---|---|
| `src/assets/shaders/preview_full_mobile.wgsl` | Self-contained mobile shader (v11) |
| `src/renderers/webgpu/SceneManager.ts` | Pipeline compilation, budget guard, smoke test |
| `src/renderers/webgpu/ShaderManager.ts` | Style injection, mobile vs desktop shader selection |
| `src/infra/logging/ConsolePatch.ts` | Console interception (log/info/debug only) |
| `src/webgpu_core.ts` | Mount, init, render loop, uniform population |
| `validate_wgsl_reflect.mjs` | Local WGSL validation (not sufficient for mobile) |
| `compose_test.cjs` | Shader composition test (size, lines, brace balance) |
