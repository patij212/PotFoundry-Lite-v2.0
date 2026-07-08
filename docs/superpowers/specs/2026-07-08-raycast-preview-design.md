# Exact Ray-Cast Preview ("Ground-Truth Renderer") — Design

**Date:** 2026-07-08
**Status:** Approved (brainstorm session with Patryk)
**Scope:** `potfoundry-web/` live preview only. Export pipelines, WebGL fallback, wireframe mode untouched.

## Problem

The live preview renders a tessellated approximation of the mathematical model, with three
independent error sources plus aliasing:

1. **Tessellated silhouette** — `preview_main.wgsl` generates a uniform `cells_x × cells_y`
   quad grid per segment in the vertex shader; the pot's outline is polygonal.
2. **Per-vertex (Gouraud) shading** — `shade_color()` runs in the *vertex* shader and colors
   are interpolated across triangles; surface detail between grid corners is invented by
   interpolation, not computed.
3. **Grid-scale finite-difference normals** — `surface_normal(seg, u, v, du, dv)` differences
   at cell size, smearing creases and ridges.
4. **Aliasing** — geometric jaggies and shimmering ground-grid lines.

Goal: every rendered pixel computed from the actual WGSL style function — a pixel-perfect
image of the mathematical model with no grid, no interpolation, no aliasing in the
converged frame.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Exactness level | **Fully exact ray-cast** — silhouette, shading, normals all per-pixel exact; no pot mesh |
| Surface scope | **Complete solid** — outer wall, inner cavity, rim, floor, underside, drain as one implicit solid |
| Platforms | **All WebGPU** (desktop + mobile, quality-tiered); WebGL fallback keeps mesh path |
| Anti-aliasing | **Progressive accumulation** — 1 spp while interacting, converge to ≤16 spp when still |
| Intersection | **Bounded march + bisection** — no per-style Lipschitz bounds, no acceleration LUT |

## 1. The implicit solid

One function in the new shader, evaluated in world space:

```wgsl
fn pot_inside(p: vec3<f32>) -> f32  // >0 inside, <0 outside (not a distance)
```

- Convert `p` to cylindrical `(ρ, φ, z)`, `t = z/H`.
- **Un-twist analytically:** `θ = φ − twist_angle(t)`. Twist is a pure per-height rotation,
  so it is exactly invertible — no root-finding needed for the parametrization.
- **Outer bound:** `ρ ≤ style_radius(style_id, θ, t, r_base(t))` — the same dynamically
  dispatched, stripped style function the preview compiles today. One eval per sample.
- **Inner cavity** (only for `z ∈ [bottom, H]`): `ρ ≥ max(outer_r − wall, 0.5)`,
  mirroring `inner_point()` in `styles.wgsl`.
- **Floor slab** `z ∈ [0, bottom]`, minus **drain cylinder** `ρ < r_drain` with the same
  clamps as `surface_point` segments 2/3/5 (`drain_raw ≥ 0.25`, `r_inner_cap = r_inner − 0.2`,
  `BOTTOM_Z_OFFSET` on the underside).
- **"Show inner" off** ⇒ skip cavity/drain subtraction (render the solid pot), matching the
  existing `SHOW_INNER_OFFSET` toggle semantics.

This is by-construction the same solid the six mesh segments approximate — but exact,
including the rim edge and drain lip as true intersection curves.

## 2. Ray-cast algorithm (bounded march + bisection)

Full-screen pass (the existing background/ground/pot draw is replaced by one fragment
program). Per pixel:

1. **Primary ray** from the camera eye + basis already present in uniforms (reconstructed
   from the existing basis/FOV uniforms or a new inverse view-projection uniform — decided
   at implementation time; must match `vp_matrix()` exactly so debug overlays line up).
2. **Analytic bound clip:** intersect the ray with cylinder `ρ ≤ r_max` ∩ slab
   `z ∈ [−BOTTOM_Z_OFFSET, H]`. `r_max` is a conservative per-param-change bound computed
   CPU-side (1D profile scan / registry amplitude bound) and uploaded as a uniform.
   Rays missing the bound fall through to ground/background at near-zero cost.
3. **March** the clipped segment. Step size = `min(projected pixel footprint, feature floor)`
   (feature floor default 0.25 mm — below the smallest designed feature scale across the
   20 styles; exposed as a dev lever like the existing `__pfConforming*` knobs),
   hard step cap per quality tier (~48 desktop / ~24 mobile while interacting; ×2–4 during
   accumulation). Detect sign change of `pot_inside`.
4. **Bisect** the bracketing interval 12 iterations → hit accurate below 0.001 mm
   (beyond f32 resolution — i.e. exact for rendering purposes).
5. **Miss** ⇒ analytic ground-plane hit or background gradient.

**Thin-feature safety:** each accumulation frame jitters both the sub-pixel ray offset and
the march phase, so features thinner than one step cannot be systematically missed; they
converge in the accumulated image.

## 3. Shading — per-pixel, exact normals

- **Normal:** central differences of `pot_inside` at ε = 0.002 mm around the hit —
  numerical-precision-scale differencing, i.e. per-pixel analytic-quality normals.
  Creases/rim edges resolve to the correct facet per pixel.
- **Lighting:** reuse the existing `shade_color()` rig verbatim, moved from vertex to
  fragment stage. Gradient color from exact `t` at the hit.
- **Ground plane:** analytic ray-plane intersection; grid lines converted to analytically
  anti-aliased coverage (distance-to-line vs pixel footprint) — no shimmering.
  Background gradient logic unchanged.
- **Depth:** write `@builtin(frag_depth)` from the hit so debug overlays (magenta feature
  lines, green/blue points) and the axis indicator composite correctly.

## 4. Progressive accumulation

- Two `rgba16float` accumulation textures (ping-pong) + sample-count/jitter uniforms.
- **Interacting** (camera moving / any param changing): 1 sample/pixel, internal resolution
  scale (1.0 desktop, ~0.75 mobile), immediate display.
- **Still:** one jittered sample per frame (Halton sequence),
  `accum = mix(accum, new, 1/n)` up to n = 16 desktop / 8 mobile, then **stop dispatching**
  — zero GPU cost once converged.
- Any uniform/camera/canvas change resets n. Canvas sized at full `devicePixelRatio`.

## 5. Integration & rollout

- New `src/assets/shaders/preview_raycast.wgsl`, assembled by `ShaderManager` from the
  identical environment chain (constants → common → uniforms → stripped styles → dispatch):
  new `getRaycastWGSL(styleId)` beside `getStyleWGSL(styleId)`.
- `SceneManager`: ray-cast pipeline + accumulation resources.
  `WebGPURenderer`: interacting/converging state machine in the frame loop.
- **Flag-gated rollout:** Settings toggle + `?preview=mesh|raycast` URL param.
  Default ON for WebGPU once the verification gate passes. The mesh pipeline is kept
  intact — it still serves wireframe mode (inherently a mesh view), the thumbnail
  renderer (initially), and the fallback toggle.
- WebGL fallback: unchanged.

## 6. Verification gate

- **E2E (Playwright, real WebGPU):** render all 20 styles; assert non-black/non-NaN frames.
- **Exactness probe** (ray-cast analog of the B5 vertex gate): for a batch of screen pixels,
  unproject the ray CPU-side, root-find on the CPU/GPU-truth reference, compare against GPU
  hit depth. Tolerance: f32 floor.
- **A/B screenshots** (mesh vs ray-cast) per style for eyeball regression.
- **Perf smoke:** interactive frame-time budget assertion (desktop tier) so heavy styles
  (Voronoi, DragonScales) don't regress silently.

## Risks

- **Perf on weak GPUs** — main risk. Mitigated by res-scale + step caps while interacting;
  the converged still image is always full quality regardless of GPU.
- **Grazing silhouette rays** are the most expensive pixels (long in-bound path); the step
  cap bounds worst case and accumulation cleans the edge.
- **`r_max` bound too tight** would clip a style. The bound comes from a CPU-side
  conservative scan per param change, not a guess; the probe gate catches violations.

## Non-goals

- Export pipelines (unchanged — separate program).
- Wireframe mode (stays mesh-based by nature).
- WebGL/Three.js fallback parity.
- Thumbnail renderer migration (possible follow-up).
