# Generator Round 1 — Mobile Shader Desktop Parity

Date: 2026-03-13

## Problem Statement

The mobile preview shader (`preview_full_mobile.wgsl`) has five parity gaps with the desktop shader (styles.wgsl + preview_main.wgsl). The most critical is Bug A: users see missing outer-wall coverage on bottom discs, causing the pot to look "hollowed out" from below. Bug B hides all internal geometry (rim, bottom, drain) when showInner=false instead of just the inner wall. Bug C produces incorrect ambient shading direction. Two lighting parity gaps reduce visual quality.

## Segment Numbering Map

**Critical prerequisite**: Desktop and mobile use DIFFERENT segment numbering:

| Surface       | Desktop seg | Mobile seg |
|---------------|-------------|------------|
| Outer wall    | 0           | 0          |
| Inner wall    | 1           | 1          |
| Bottom top    | 2           | 3          |
| Bottom under  | 3           | 4          |
| Rim           | 4           | 2          |
| Drain         | 5           | 5          |

All proposals below use the **mobile** numbering.

---

## Root Cause Analysis

### Bug A — Bottom discs missing outer wall range
**File**: `preview_full_mobile.wgsl`, lines 104-125 (`seg_pt` for seg 3 and seg 4)  
**Root cause**: Mobile seg 3 (`bottom_top`) and seg 4 (`bottom_under`) compute `ri` from `inner_pt()` and `rd` from drain, then do `mix(rd, ri, v)`. This covers only the inner→drain zone. Desktop covers **outer→inner→drain** using a `seam_t` split derived from the ring count (`getf(28u)`).

Desktop (styles.wgsl:1888-1913, seg 2 = bottom_top) does:
```wgsl
let outer_bottom = outer_point(u, bottom);   // ← mobile has no outer_point()
let r_outer = length(outer_bottom.xy);
let r_inner = length(inner_bottom.xy);
let r_drain = clamp(drain_raw, 0.25, r_inner_cap);
let seam_t = 1.0 - (1.0 / max(rings, 1.0));
// v ∈ [0, seam_t]: outer → inner
// v ∈ [seam_t, 1]: inner → drain
```

Mobile doesn't have `outer_point()`, but it can be trivially computed:
- `outer_point(u, z)` = `surf(u, z / H)` (see styles.wgsl:1846-1849)
- For bottom_top at z=bottom: `surf(u, clamp(bottom / max(H, 1e-4), 0.0, 1.0))`
- For bottom_under at z=0: `surf(u, 0.0)`

### Bug B — showInner gating hides too much
**File**: `preview_full_mobile.wgsl`, line 152  
**Root cause**: `let total = cO + select(0, cI + cR + cB + cB + cD, showInner)` gates ALL non-outer segments behind `showInner`. Desktop (preview_main.wgsl:397-441) counts all segments unconditionally, then degenerates only segment 1 vertices.

### Bug C — Hemisphere ambient blend axis
**File**: `preview_full_mobile.wgsl`, line 200  
**Root cause**: `Nc.y * 0.5 + 0.5` blends on the **up** axis in camera space. Desktop uses `N_cam.z * 0.5 + 0.5` (the **forward** axis — where camera looks). Since the camera basis maps `forward` to Z for both desktop and mobile, the mobile shader should use `Nc.z`.

### Parity Gap 1 — Missing rim kicker lights
**File**: `preview_full_mobile.wgsl`, lines 205-210 (lighting block)  
The desktop `shade_color()` (preview_main.wgsl:291-295) adds two rim kicker lights for edge definition:
```wgsl
let rim_left_intensity = lambert(N_cam, rig.rim_left);   // simple lambert, NOT wrap
let rim_right_intensity = lambert(N_cam, rig.rim_right);
diffuse += vec3<f32>(1.0) * rim_left_intensity * 0.28;
diffuse += vec3<f32>(1.0) * rim_right_intensity * 0.28;
```
Mobile has only key + fill + back.

### Parity Gap 2 — Hardcoded lighting tuning
**File**: `preview_full_mobile.wgsl`, lines 198-220  
Desktop reads ambient/diffuse/fresnel tuning from uniforms:
```
ambient: getf(22u)  → scales ambient_strength = 0.08 + tuning.ambient * 0.35
diffuse: getf(23u)  → scales diffuse *= 0.4 + tuning.diffuse * 0.85
fresnel: getf(24u)  → scales fresnel_term = tuning.fresnel * fresnel * 0.8
```
Mobile hardcodes `ambient * 0.18`, `diffuse` unscaled, and `fresnel * 0.12` with no tuning input.

---

## Proposals

### Proposal 1: Bug A Fix — Add outer→inner zone to bottom discs (Moderate)

**Idea**: In `seg_pt` for seg 3 and seg 4, compute `r_outer` from `surf()` (which is the mobile's `outer_point` equivalent), then apply the same `seam_t` two-zone interpolation that desktop uses.

**Mechanism**: Replace the simple `mix(rd, ri, v)` with the desktop's seam_t split logic.

**Old code (seg 3, bottom_top, lines 104-115)**:
```wgsl
  if (seg == 3u) {
    // bottom_top — disc at z=bottom, inner to drain
    let ib = inner_pt(u, bottom);
    let ri = length(ib.xy);
    let rd = clamp(drain_raw, 0.25, max(ri - 0.2, 0.25));
    let r = mix(rd, ri, clamp(v, 0.0, 1.0));
    let tr = clamp(bottom / max(H, 1e-4), 0.0, 1.0);
    let th = twist_theta(u * TAU, tr);
    let dir = vec2<f32>(cos(th), sin(th));
    return vec3<f32>(dir * r, bottom + 1e-3);
  }
```

**New code (seg 3, bottom_top)**:
```wgsl
  if (seg == 3u) {
    // bottom_top — disc at z=bottom, outer→inner→drain (seam_t split)
    let tr = clamp(bottom / max(H, 1e-4), 0.0, 1.0);
    let ob = surf(u, tr);
    let r_outer = length(ob.xy);
    let ib = inner_pt(u, bottom);
    let r_inner = length(ib.xy);
    let r_inner_cap = max(r_inner - 0.2, 0.25);
    let rd = clamp(drain_raw, 0.25, r_inner_cap);
    let rings = max(getf(28u), 2.0);
    let seam_t = 1.0 - (1.0 / max(rings, 1.0));
    let t = clamp(v, 0.0, 1.0);
    var r: f32;
    if (t <= seam_t || seam_t <= 1e-4) {
      var local = 0.0;
      if (seam_t > 1e-4) { local = clamp(t / seam_t, 0.0, 1.0); }
      r = mix(r_inner, r_outer, 1.0 - local);
    } else {
      let denom = max(1.0 - seam_t, 1e-4);
      let local = clamp((t - seam_t) / denom, 0.0, 1.0);
      r = mix(rd, r_inner, 1.0 - local);
    }
    let th = twist_theta(u * TAU, tr);
    let dir = vec2<f32>(cos(th), sin(th));
    return vec3<f32>(dir * r, bottom + 1e-3);
  }
```

**Old code (seg 4, bottom_under, lines 116-126)**:
```wgsl
  if (seg == 4u) {
    // bottom_under — disc at z≈0, inner to drain (facing down)
    let ib = inner_pt(u, 0.0);
    let ri = length(ib.xy);
    let rd = clamp(drain_raw, 0.25, max(ri - 0.2, 0.25));
    let r = mix(rd, ri, clamp(v, 0.0, 1.0));
    let th = twist_theta(u * TAU, 0.0);
    let dir = vec2<f32>(cos(th), sin(th));
    return vec3<f32>(dir * r, -1e-3);
  }
```

**New code (seg 4, bottom_under)**:
```wgsl
  if (seg == 4u) {
    // bottom_under — disc at z≈0, outer→inner→drain (seam_t split, facing down)
    let ob = surf(u, 0.0);
    let r_outer = length(ob.xy);
    let ib = inner_pt(u, 0.0);
    let r_inner = length(ib.xy);
    let r_inner_cap = max(r_inner - 0.2, 0.25);
    let rd = clamp(drain_raw, 0.25, r_inner_cap);
    let rings = max(getf(28u), 2.0);
    let seam_t = 1.0 - (1.0 / max(rings, 1.0));
    let t = clamp(v, 0.0, 1.0);
    var r: f32;
    if (t <= seam_t || seam_t <= 1e-4) {
      var local = 0.0;
      if (seam_t > 1e-4) { local = clamp(t / seam_t, 0.0, 1.0); }
      r = mix(r_inner, r_outer, 1.0 - local);
    } else {
      let denom = max(1.0 - seam_t, 1e-4);
      let local = clamp((t - seam_t) / denom, 0.0, 1.0);
      r = mix(rd, r_inner, 1.0 - local);
    }
    let th = twist_theta(u * TAU, 0.0);
    let dir = vec2<f32>(cos(th), sin(th));
    return vec3<f32>(dir * r, -1e-3);
  }
```

**Mathematical basis**: The seam_t split allocates the outermost ring to the inner→drain zone (v > seam_t) and all remaining rings to the outer→inner zone (v ≤ seam_t). With `rings = getf(28u)`, `seam_t = 1 - 1/rings`. For rings=4: v ∈ [0, 0.75] maps outer→inner, v ∈ [0.75, 1] maps inner→drain.

**Files affected**: `preview_full_mobile.wgsl` (seg_pt function only)

**Trade-offs**: 
- +2 `surf()` calls per bottom vertex (one per disc). `surf()` involves `style_radius()` + trig — ~10 ALU ops. At typical 24×4 = 96 bottom quads × 6 verts = 576 vertices per disc, this adds ~1152 extra `surf()` calls total. Negligible on any GPU.
- Seam_t logic adds ~15 ALU ops per vertex (branch + clamp + mix). Trivial.

**Risk**: LOW. Direct port of battle-tested desktop logic. Only touches radial interpolation, does not change z-coords or twist.

**Size impact**: +~400 bytes composed WGSL.

**Assumptions** (for Verifier to attack):
1. `surf(u, bottom/H)` is equivalent to desktop's `outer_point(u, bottom)` — confirmed by styles.wgsl:1846-1849 where `outer_point(u, z) = surf(u, z/H)`.
2. `getf(28u)` (bottom_rings) is the correct uniform for `rings` in the seam_t formula — confirmed by both desktop seg 2 and mobile vertex count (`bottomR = getf(28u)`).
3. The interpolation direction matches desktop: v=0 starts at outer (large r), v=seam_t arrives at inner, v=1 arrives at drain (smallest r). Desktop maps `local = t/seam_t` → `r = mix(r_inner, r_outer, 1-local)`, so at local=0 (v=0): r=r_outer. At local=1 (v=seam_t): r=r_inner. ✓

---

### Proposal 2: Bug B Fix — Always count all segments (Conservative)

**Idea**: Remove the `select()` gating from the `total` computation. Always include all segments. Add a degenerate-triangle check specifically for segment 1 when `showInner` is false.

**Old code (lines 151-155)**:
```wgsl
  let showInner = getf(71u) >= 0.5;

  let cell = i32(lid) / 6;
  let total = cO + select(0, cI + cR + cB + cB + cD, showInner);
  if (cell >= total) {
```

**New code**:
```wgsl
  let showInner = getf(71u) >= 0.5;

  let cell = i32(lid) / 6;
  let total = cO + cI + cR + cB + cB + cD;
  if (cell >= total) {
```

Then **add** a degenerate-triangle early return for segment 1 right after the segment determination block (after the `if (seg >= 3u) { ny = bottomR; }` line, around line 172):

**Insert after existing segment determination** (after `if (seg >= 3u) { ny = bottomR; }`):
```wgsl
  // Hide inner wall when showInner is false (degenerate triangle, matching desktop)
  if (seg == 1u && !showInner) {
    o.pos = vec4<f32>(0.0, 0.0, -2.0, 1.0); o.col = vec3<f32>(0.0); o.ib = 0.0; return o;
  }
```

**Mathematical basis**: Desktop always allocates vertex buffer space for all 6 segments, then clips segment 1 via degenerate triangles. The `select()` approach skips allocating vertex indices for segments 1-5, which means zero vertex budget for rim/bottom/drain when showInner=false.

**Files affected**: `preview_full_mobile.wgsl` (vs_main function only)

**Trade-offs**: 
- When showInner=false, we now process ~5× more vertices (most clipped as degenerate). But the degenerate early-return is at the top of vertex processing, before any `seg_pt()` or lighting computation. GPU cost: near-zero (clipped before rasterization).

**Risk**: LOW. Strictly matches desktop behavior.

**Size impact**: +~80 bytes.

**Assumptions** (for Verifier to attack):
1. The early return for seg 1 is the only gating needed — desktop does exactly this and shows rim/bottom/drain/outer regardless of showInner.
2. The degenerate position `(0, 0, -2, 1)` is behind the near plane and will be clipped — same value desktop uses.

---

### Proposal 3: Bug C Fix — Hemisphere ambient axis (Conservative)

**Idea**: Change `Nc.y` to `Nc.z` in the hemisphere blend line.

**Old code (line 200)**:
```wgsl
  let hemi = mix(vec3<f32>(0.4, 0.35, 0.3), vec3<f32>(0.85, 0.9, 1.0), Nc.y * 0.5 + 0.5);
```

**New code**:
```wgsl
  let hemi = mix(vec3<f32>(0.4, 0.35, 0.3), vec3<f32>(0.85, 0.9, 1.0), Nc.z * 0.5 + 0.5);
```

**Mathematical basis**: Mobile builds camera basis the same way as desktop: `right = cross(fwd, worldUp)`, `up = cross(right, fwd)`. The `Nc` vector = `(dot(n, right), dot(n, up), dot(n, fwd))`. Desktop's hemisphere blend uses `N_cam.z` = the forward component. Normals facing toward the camera (z < 0 in camera space) get ground color; normals facing away get sky color. Using `Nc.y` (up component) produces wrong blending — top of pot gets sky color even when viewed from the side.

**Files affected**: `preview_full_mobile.wgsl` (1 line)

**Risk**: VERY LOW. Single character change with clear mathematical justification.

**Size impact**: 0 bytes (same length).

**Assumptions** (for Verifier to attack):
1. Mobile and desktop camera basis conventions are identical (right=X, up=Y, forward=Z). Mobile code at lines 188-192 matches desktop's `world_to_camera()` exactly.

---

### Proposal 4: Parity Gap 1 — Add rim kicker lights (Moderate)

**Idea**: Add two rim kicker lights matching desktop's directions and intensity, using simple lambert (not wrap-lambert).

**Old code (lines 205-210)**:
```wgsl
  // Wrap-lambert diffuse (softer shadows)
  let dk = max((dot(Nc, Lk) + 0.15) / 1.15, 0.0) * 0.55;
  let df = max((dot(Nc, Lf) + 0.25) / 1.25, 0.0) * 0.35;
  let db = max((dot(Nc, Lb) + 0.3) / 1.3, 0.0) * 0.22;
  let diffuse = vec3<f32>(1.0, 0.98, 0.95) * dk + vec3<f32>(0.92, 0.95, 1.0) * df + vec3<f32>(1.0, 0.92, 0.85) * db;
```

**New code**:
```wgsl
  // Wrap-lambert diffuse (softer shadows)
  let dk = max((dot(Nc, Lk) + 0.15) / 1.15, 0.0) * 0.55;
  let df = max((dot(Nc, Lf) + 0.25) / 1.25, 0.0) * 0.35;
  let db = max((dot(Nc, Lb) + 0.3) / 1.3, 0.0) * 0.22;
  // Rim kicker lights — simple lambert for edge definition
  let Lrl = normalize(vec3<f32>(-0.85, 0.2, 0.4));
  let Lrr = normalize(vec3<f32>(0.85, 0.2, 0.4));
  let drl = max(dot(Nc, Lrl), 0.0) * 0.28;
  let drr = max(dot(Nc, Lrr), 0.0) * 0.28;
  let diffuse = vec3<f32>(1.0, 0.98, 0.95) * dk + vec3<f32>(0.92, 0.95, 1.0) * df + vec3<f32>(1.0, 0.92, 0.85) * db + vec3<f32>(1.0) * (drl + drr);
```

**Mathematical basis**: Desktop light directions from `build_camera_rig()` (preview_main.wgsl:210-212): `rim_left = normalize((-0.85, 0.2, 0.4))`, `rim_right = normalize((0.85, 0.2, 0.4))`. Both use simple `lambert()` (not `wrap_lambert()`), intensity 0.28, white color.

**Files affected**: `preview_full_mobile.wgsl` (lighting block only)

**Trade-offs**: 
- +2 dot products + 2 max + 2 normalize per vertex. The normalize is on constants, so the WGSL compiler will fold them to literals. Net cost: 2 dot products + 2 max. Trivial.

**Risk**: LOW. These are additive lights — they can only brighten, never darken. Worst case: slightly brighter edges than expected, which is the desired effect.

**Size impact**: +~200 bytes.

**Assumptions** (for Verifier to attack):
1. Desktop uses white `vec3(1.0)` for rim kickers — confirmed at preview_main.wgsl:293-294.
2. Desktop uses simple `lambert()` not `wrap_lambert()` — confirmed at preview_main.wgsl:291-292 (calls `lambert()`, not `wrap_lambert()`).
3. The `normalize()` calls on constant vectors will be folded by the WGSL compiler — standard behavior, but Verifier may want to confirm.

---

### Proposal 5: Parity Gap 2 — Read lighting tuning uniforms (Conservative)

**Idea**: Read `getf(22u)`, `getf(23u)`, `getf(24u)` for ambient, diffuse, fresnel tuning and apply them the same way desktop does.

**Changes span 3 sections of the lighting code:**

**Change 1 — Ambient (line 201)**:

Old:
```wgsl
  let ambient = hemi * 0.18;
```
New:
```wgsl
  let tuning_ambient = clamp(getf(22u), 0.0, 1.0);
  let ambient = hemi * (0.08 + tuning_ambient * 0.35);
```

**Change 2 — Diffuse (after the diffuse accumulation, before spec)**:

Old (no tuning applied — the diffuse sum is used directly):
```wgsl
  let diffuse = vec3<f32>(1.0, 0.98, 0.95) * dk + ... ;
```
Add after the diffuse line:
```wgsl
  let tuning_diffuse = clamp(getf(23u), 0.0, 1.0);
  let diffuse_scaled = diffuse * (0.4 + tuning_diffuse * 0.85);
```
Then replace `diffuse` with `diffuse_scaled` in the final combination.

**Change 3 — Fresnel (line 222)**:

Old:
```wgsl
  let fresnel = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  ...
  let lit = base * (ambient + diffuse) + ... + vec3<f32>(fresnel * 0.12);
```
New:
```wgsl
  let fresnel = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  let tuning_fresnel = clamp(getf(24u), 0.0, 1.0);
  ...
  let lit = base * (ambient + diffuse_scaled) + ... + vec3<f32>(tuning_fresnel * fresnel * 0.8);
```

**Exact combined old→new for the full lighting block (lines 198-225)**:

**Old**:
```wgsl
  // Hemisphere ambient (sky/ground blend in camera space)
  let hemi = mix(vec3<f32>(0.4, 0.35, 0.3), vec3<f32>(0.85, 0.9, 1.0), Nc.y * 0.5 + 0.5);
  let ambient = hemi * 0.18;

  // Wrap-lambert diffuse (softer shadows)
  let dk = max((dot(Nc, Lk) + 0.15) / 1.15, 0.0) * 0.55;
  let df = max((dot(Nc, Lf) + 0.25) / 1.25, 0.0) * 0.35;
  let db = max((dot(Nc, Lb) + 0.3) / 1.3, 0.0) * 0.22;
  let diffuse = vec3<f32>(1.0, 0.98, 0.95) * dk + vec3<f32>(0.92, 0.95, 1.0) * df + vec3<f32>(1.0, 0.92, 0.85) * db;

  // Specular (Blinn-Phong, key + fill) in camera space
  let roughness = clamp(getf(70u), 0.02, 1.0);
  let gloss = pow(1.0 - roughness, 3.0);
  let sp = mix(18.0, 240.0, gloss);
  let specGain = clamp(getf(69u), 0.0, 1.0);
  let sk = pow(max(dot(Nc, normalize(Lk + Vc)), 0.0), sp * 1.5) * 1.4;
  let sf = pow(max(dot(Nc, normalize(Lf + Vc)), 0.0), sp * 0.7) * 0.65;
  let spec = (sk + sf) * specGain * 0.5;

  // Fresnel rim (Schlick) in camera space
  let NdV = max(dot(Nc, Vc), 0.0);
  let fresnel = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  let rim = pow(1.0 - NdV, 3.0) * 0.25;

  let lit = base * (ambient + diffuse) + vec3<f32>(0.97, 0.98, 1.0) * spec + vec3<f32>(0.9, 0.95, 1.0) * rim + vec3<f32>(fresnel * 0.12);
```

**New (all fixes combined — Bug C + Gap 1 + Gap 2)**:
```wgsl
  // Hemisphere ambient (sky/ground blend in camera space — forward axis)
  let hemi = mix(vec3<f32>(0.4, 0.35, 0.3), vec3<f32>(0.85, 0.9, 1.0), Nc.z * 0.5 + 0.5);
  let tuning_ambient = clamp(getf(22u), 0.0, 1.0);
  let ambient = hemi * (0.08 + tuning_ambient * 0.35);

  // Wrap-lambert diffuse (softer shadows)
  let dk = max((dot(Nc, Lk) + 0.15) / 1.15, 0.0) * 0.55;
  let df = max((dot(Nc, Lf) + 0.25) / 1.25, 0.0) * 0.35;
  let db = max((dot(Nc, Lb) + 0.3) / 1.3, 0.0) * 0.22;
  // Rim kicker lights — simple lambert for edge definition
  let Lrl = normalize(vec3<f32>(-0.85, 0.2, 0.4));
  let Lrr = normalize(vec3<f32>(0.85, 0.2, 0.4));
  let drl = max(dot(Nc, Lrl), 0.0) * 0.28;
  let drr = max(dot(Nc, Lrr), 0.0) * 0.28;
  let diffuse = vec3<f32>(1.0, 0.98, 0.95) * dk + vec3<f32>(0.92, 0.95, 1.0) * df + vec3<f32>(1.0, 0.92, 0.85) * db + vec3<f32>(1.0) * (drl + drr);
  let tuning_diffuse = clamp(getf(23u), 0.0, 1.0);
  let diffuse_scaled = diffuse * (0.4 + tuning_diffuse * 0.85);

  // Specular (Blinn-Phong, key + fill) in camera space
  let roughness = clamp(getf(70u), 0.02, 1.0);
  let gloss = pow(1.0 - roughness, 3.0);
  let sp = mix(18.0, 240.0, gloss);
  let specGain = clamp(getf(69u), 0.0, 1.0);
  let sk = pow(max(dot(Nc, normalize(Lk + Vc)), 0.0), sp * 1.5) * 1.4;
  let sf = pow(max(dot(Nc, normalize(Lf + Vc)), 0.0), sp * 0.7) * 0.65;
  let spec = (sk + sf) * specGain * 0.5;

  // Fresnel rim (Schlick) in camera space
  let NdV = max(dot(Nc, Vc), 0.0);
  let fresnel = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  let tuning_fresnel = clamp(getf(24u), 0.0, 1.0);
  let rim = pow(1.0 - NdV, 3.0) * 0.25;

  let lit = base * (ambient + diffuse_scaled) + vec3<f32>(0.97, 0.98, 1.0) * spec + vec3<f32>(0.9, 0.95, 1.0) * rim + vec3<f32>(tuning_fresnel * fresnel * 0.8);
```

**Mathematical basis**: Direct port of desktop `lighting_tuning()` scaling from preview_main.wgsl:156-163. Desktop clamps all three to [0,1]. The scaling formulas exactly match desktop's `shade_color()` at lines 271-272 (ambient), 298 (diffuse), 320 (fresnel).

**Files affected**: `preview_full_mobile.wgsl` (lighting block only)

**Trade-offs**: 
- +3 `getf()` calls (trivial uniform reads)
- When tuning values are default (ambient=0.5, diffuse=0.5, fresnel=0.5), the new scaling produces: ambient strength = 0.08 + 0.5×0.35 = 0.255 (was 0.18), diffuse scale = 0.4 + 0.5×0.85 = 0.825 (was 1.0), fresnel = 0.5×fresnel×0.8 (was fresnel×0.12). These are different from hardcoded — but they MATCH DESKTOP, which is the goal.

**Risk**: LOW. The tuning uniforms are already being written by the CPU for mobile (same uniform buffer). If they're ever not populated, `getf()` returns 0 and we get: ambient=0.08 (dim but functional), diffuse=0.4 (dimmer), fresnel=0 (no fresnel). Graceful degradation.

**Size impact**: +~150 bytes.

**Assumptions** (for Verifier to attack):
1. Uniform slots 22, 23, 24 are populated by the mobile preview CPU code — need Verifier to confirm in `MobilePreviewRenderer.ts` or the uniform upload path.
2. Desktop default tuning values are (0.5, 0.5, 0.5) — need Verifier to check the store defaults.

---

## Recommended Approach

Apply ALL five proposals. They are independent and non-conflicting:

| Fix | Priority | Risk | Size | Complexity |
|-----|----------|------|------|------------|
| Bug A (bottom discs) | HIGH | LOW | +400B | Moderate |
| Bug B (showInner) | HIGH | LOW | +80B | Easy |
| Bug C (hemi axis) | MEDIUM | VERY LOW | 0B | Trivial |
| Gap 1 (rim lights) | MEDIUM | LOW | +200B | Easy |
| Gap 2 (tuning) | LOW | LOW | +150B | Easy |

**Total size impact**: ~+830 bytes. Current 12.2 KB → ~13.0 KB. Well within 50 KB budget.

**Performance impact**: Negligible. ~2 extra `surf()` calls per bottom vertex + 5 extra ALU ops per vertex for lighting. On a mobile GPU processing ~3000 vertices, this is <0.01ms.

## Open Questions

1. **Uniform slot 22/23/24 population**: Does the mobile preview uniform upload code write these slots? If not, Gap 2 reads zeros and ambient becomes very dim (0.08). Verifier should trace the CPU uniform upload path.

2. **Normal direction for bottom discs**: Proposal 1 doesn't change the normal computation (`pot_normal` returns `(0,0,1)` for seg 3 and `(0,0,-1)` for seg 4). This is correct — the bottom disc normals should be purely vertical regardless of the outer→inner zone addition. But Verifier should confirm the desktop normal convention matches.

3. **Desktop seg numbering drift**: The segment numbering between desktop (0,1,2,3,4,5 = outer,inner,bottom_top,bottom_under,rim,drain) and mobile (0,1,2,3,4,5 = outer,inner,rim,bottom_top,bottom_under,drain) is a maintenance hazard. Should we align them? That's a separate refactoring task, not part of this parity fix.
