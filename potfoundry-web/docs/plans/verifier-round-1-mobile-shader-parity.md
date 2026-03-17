 Verifier Round 1 — Critique of Mobp Date: 2026-03-13

## Summary Verdict: ACCEPT WITH AMENDMENTS

Four of five proposals are sound. Proposal 5 (Gap 2 — tuning uniforms) has a **CRITICAL** error: the fresnel scaling is missing a `× 0.15` multiplier, which would make fresnel ~6.7× stronger than desktop. All other proposals pass verification with minor notes.

---

## Critique

### C1 [NOTE]: Bug A — Segment numbering map is correct
**Generator's claim**: Desktop seg 2/3 = bottom_top/under; mobile seg 3/4.
**Actual behavior**: Desktop routing in `preview_main.wgsl:411-433` goes outer(0)→inner(1)→bottom_top(2)→bottom_under(3)→rim(4)→drain(5). Mobile routing in `preview_full_mobile.wgsl:204-209` goes outer(0)→inner(1)→rim(2)→bottom_top(3)→bottom_under(4)→drain(5). Generator's numbering map is confirmed correct.

---

### C2 [NOTE]: Bug A — `surf(u, bottom/H)` equivalence confirmed
**Generator's claim**: `surf(u, clamp(bottom / max(H, 1e-4), 0.0, 1.0))` is equivalent to desktop's `outer_point(u, bottom)`.
**Actual behavior**: `styles.wgsl:1846-1849`:
```wgsl
fn outer_point(u: f32, z_mm: f32) -> vec3<f32> {
  let H = max(getf(0u), 1e-4);
  let ratio = clamp(z_mm / H, 0.0, 1.0);
  return surf(u, ratio);
}
```
Exact match. `BOTTOM_Z_OFFSET` in `common.wgsl:9` = `1e-3`, matching mobile's hardcoded `1e-3`.
**Verdict**: ✓ CONFIRMED.

---

### C3 [NOTE]: Bug A — seam_t interpolation direction verified
**Generator's claim**: v=0→outer (large r), v=seam_t→inner, v=1→drain (smallest r).
**Verification**: Desktop `styles.wgsl:1900-1911`:
- Branch `t <= seam_t`: `local = t / seam_t`, `r = mix(r_inner, r_outer, 1 - local)`. At t=0: local=0, r=r_outer. At t=seam_t: local=1, r=r_inner. ✓
- Branch `t > seam_t`: `local = (t-seam_t)/(1-seam_t)`, `r = mix(r_drain, r_inner, 1 - local)`. At t=seam_t: local=0, r=r_inner. At t=1: local=1, r=r_drain. ✓

Generator's proposed code is a character-for-character port of this logic (variable name `rd` vs `r_drain` is cosmetic). `getf(28u)` = BottomRings per `UniformBlock.ts:106`.
**Verdict**: ✓ CONFIRMED.

---

### C4 [NOTE]: Bug A — Desktop bottom_under uses z=0, not z=bottom, for outer point
**Generator's claim**: bottom_under uses `surf(u, 0.0)` for the outer radius.
**Actual behavior**: Desktop seg 3 (bottom_under), `styles.wgsl:1918`: `let outer_base = outer_point(u, 0.0)`. And the comment at line 1921 confirms: "Calculate inner radius at z=0 (where underside actually is), not at z=bottom".
**Verdict**: ✓ Generator correctly uses `surf(u, 0.0)` for seg 4 and `surf(u, tr)` for seg 3. Matches desktop.

---

### C5 [NOTE]: Bug B — Desktop counts all segments unconditionally confirmed
**Generator's claim**: Desktop always allocates vertex budget for all 6 segments, then degenerates only segment 1.
**Actual behavior**: `preview_main.wgsl:395-401` computes `cells_outer`, `cells_inner`, `cells_bottom_top`, `cells_bottom_under`, `cells_rim`, `cells_drain` unconditionally. The routing cascade at lines 411-433 routes ALL vertices without conditioning on `showInner`. Only at line 437-438 does the degenerate check occur:
```wgsl
let showInner = getf(SHOW_INNER_OFFSET) >= 0.5;
if (segment == 1u && !showInner) {
    out.pos = vec4<f32>(0.0, 0.0, -2.0, 1.0); // Behind near plane
```
Mobile's current `total = cO + select(0, cI + cR + cB + cB + cD, showInner)` zeroes out ALL non-outer segments when showInner=false. Bug confirmed.
**Verdict**: ✓ Fix is a correct port of desktop behavior.

---

### C6 [NOTE]: Bug B — Degenerate position `(0,0,-2,1)` clipping
**Generator's claim**: This is behind the near plane and will be clipped.
**Evidence**: Desktop uses the identical position (`preview_main.wgsl:441`). The near plane is stored in `getf(35u)` (UniformBlock.ts `Near: 35`). In clip space, z=-2 with w=1 means NDC z=-2, which is behind the near plane for any standard projection. Battle-tested in production.
**Verdict**: ✓ CONFIRMED.

---

### C7 [NOTE]: Bug B — Routing still works when all segments counted
**Verification**: Mobile routing (`preview_full_mobile.wgsl:204-209`):
```wgsl
if (lc >= cO) { lc -= cO; seg = 1u; }
if (seg == 1u && lc >= cI) { lc -= cI; seg = 2u; }
...
```
This is a linear cascade — each step conditionally subtracts and advances. With `total = cO + cI + cR + cB + cB + cD`, all cells [0, total) are routed correctly regardless of showInner. The `seg == 1u && !showInner` degenerate check occurs AFTER routing, so `lc` and `seg` are correctly determined first. Desktop does the same.
**Verdict**: ✓ No routing issues.

---

### C8 [WARNING]: Bug C — Camera basis sign difference in right vector
**Generator's claim**: Mobile and desktop camera basis conventions are identical (right=X, up=Y, forward=Z).
**Actual behavior**: Desktop `derived_camera_basis()` (`preview_main.wgsl:110`): `right = cross(worldUp, forward)`. Mobile (`preview_full_mobile.wgsl:236`): `right = cross(fwd, worldUp)`.

Since `cross(A, B) = -cross(B, A)`, we have `right_mobile = -right_desktop`.

However, `up` is derived differently too:
- Desktop: `up = cross(forward, right_d)` = `cross(fwd, right_d)`
- Mobile: `up = cross(right_m, fwd)` = `cross(-right_d, fwd)` = `-cross(right_d, fwd)` = `cross(fwd, right_d)` = `up_desktop`

So: `right_m = -right_d`, `up_m = up_d`, `fwd_m = fwd_d`.

Impact on hemisphere blend: `Nc.z = dot(n, fwd)` is identical in both. The fix from `.y` to `.z` is correct regardless of the right-vector sign difference. The sign difference only affects `Nc.x` (left-right mirror), which is irrelevant to the hemisphere blend axis.

However, the sign difference DOES affect the rim kicker lights (Gap 1). The desktop light direction `(-0.85, 0.2, 0.4)` interpreted in camera space means (negative right, up, forward). Since `right_m = -right_d`, "negative right" in desktop corresponds to "positive right" in mobile. This means:

- Desktop's `rim_left = normalize((-0.85, 0.2, 0.4))` is from camera-left
- In mobile's basis, the `(-0.85, 0.2, 0.4)` would be from camera-RIGHT (because right is negated)

The net result: the labels "left"/"right" are swapped, but since both lights have the same intensity (0.28) and white color, the sum `drl + drr` is identical. Total diffuse contribution is unchanged regardless of which light is "left" vs "right".

**Required action**: None — the sum is commutative. But Generator should ACKNOWLEDGE this basis difference in their proposal for documentation purposes.

**Verdict**: ✓ Bug C fix is correct. Gap 1 is functionally correct despite the basis sign difference, because the two rim kickers are symmetric in intensity.

---

### C9 [NOTE]: Gap 1 — `normalize()` constant folding confirmed
**Generator's claim**: The `normalize()` calls on constant vec3 arguments will be folded by the WGSL compiler.
**Evidence**: Both Tint (Chrome/Dawn) and Naga (Firefox) perform constant folding on built-in functions with constant arguments. `normalize(vec3<f32>(-0.85, 0.2, 0.4))` evaluates to approximately `vec3(-0.871, 0.205, 0.410)` at compile time. Zero runtime cost.
**Verdict**: ✓ CONFIRMED.

---

### C10 [WARNING]: Gap 1 — Desktop has 4 additional lights not in proposal
**Generator's claim**: Only rim left/right kicker lights are missing.
**Actual behavior**: Desktop `shade_color()` (`preview_main.wgsl:284-293`) includes these additional diffuse lights:
1. `rim_left_intensity * 0.28` — proposed by Generator ✓
2. `rim_right_intensity * 0.28` — proposed by Generator ✓
3. `top_intensity = lambert(N_cam, rig.top) * 0.18` (line 290-292) — NOT proposed
4. `bottom_intensity = lambert(N_cam, rig.bottom) * 0.15` (line 291-293) — NOT proposed

Desktop also adds rim-light specular contributions (lines 307-308):
```wgsl
specular += phong_specular(N_cam, V_cam, rig.rim_left, spec_power * 1.3) * 1.1;
specular += phong_specular(N_cam, V_cam, rig.rim_right, spec_power * 1.3) * 1.1;
specular += phong_specular(N_cam, V_cam, rig.back, spec_power * 0.9) * 0.5;
```

And desktop has SSS (`preview_main.wgsl:327-328`) and multi-directional rim silhouette lighting (`preview_main.wgsl:322-325`) absent from mobile.

**Assessment**: These are deliberate mobile simplifications for performance. The 5 proposals address the most impactful parity gaps. But Generator should explicitly state these as "accepted divergences" rather than leaving them unlisted.
**Verdict**: WARNING — not a blocker, but Generator should document the remaining intentional divergences for future reference.

---

### C11 [CRITICAL]: Gap 2 — Fresnel scaling missing `× 0.15` multiplier
**Generator's claim**: Replace `fresnel * 0.12` with `tuning_fresnel * fresnel * 0.8`.
**Actual desktop behavior**: Desktop `shade_color()` computes `fresnel_term = tuning.fresnel * fresnel * 0.8` (`preview_main.wgsl:317-318`), then applies it in the final combination as `fresnel_term * 0.15` (`preview_main.wgsl:334`):
```wgsl
let combined = lit_diffuse + spec_color + rim_color * 0.25 + sss_color + fresnel_term * 0.15;
```

The **total** desktop fresnel contribution is: `tuning.fresnel × fresnel × 0.8 × 0.15`

With defaults (tuning.fresnel=0.25):
| Path | Formula | Value at fresnel=1.0 |
|------|---------|---------------------|
| Desktop | 0.25 × 1.0 × 0.8 × 0.15 | **0.030** |
| Current mobile | 1.0 × 0.12 | 0.120 (4× desktop) |
| Generator's proposal | 0.25 × 1.0 × 0.8 | **0.200** (6.7× desktop!) |

**Counterexample**: At slider default (tuning_fresnel=0.25), at grazing angle (fresnel≈1.0), the Generator's proposal would add `vec3(0.2)` to the lit color — a visible white bloom on silhouettes. Desktop adds only `vec3(0.03)`. The mobile pot would appear to have an intense white halo at edges.

**Required fix**: Change the fresnel term in the `lit` line from:
```wgsl
vec3<f32>(tuning_fresnel * fresnel * 0.8)
```
to:
```wgsl
vec3<f32>(tuning_fresnel * fresnel * 0.12)
```
where `0.12 = 0.8 × 0.15`, absorbing both scaling factors. Or equivalently, keep the intermediate variable:
```wgsl
let fresnel_term = tuning_fresnel * fresnel * 0.8;
...
vec3<f32>(fresnel_term * 0.15)
```

**Verdict**: REJECT this specific line. The fix is trivial — one constant change. Everything else in Gap 2 is correct.

---

### C12 [NOTE]: Gap 2 — Uniform slots 22/23/24 ARE populated on the mobile path
**Generator's question**: Are these slots populated?
**Evidence**: The mobile preview uses the same `UniformBlock` and the same render loop. `webgpu_core.ts:2937` calls `uniformBlock.populateLighting(cfg)` unconditionally (not gated by mobile/desktop). `UniformBlock.ts:565-567` writes:
```typescript
buffer[O.Ambient] = clampNumber(c.ambient, 0.0);
buffer[O.Diffuse] = clampNumber(c.diffuse, 0.0);
buffer[O.Fresnel] = clampNumber(c.fresnel, 0.25);
```
The `cfg` comes from `appearanceToParams()` (`useRendererBridge.ts:187-230`) which resolves the lighting preset:
- Default preset: `'studio'` → `ambient: 0.3, diffuse: 0.7` (`appearance.ts:152-153`)
- Preset has no `fresnel` property → `c.fresnel = undefined` → `clampNumber(undefined, 0.25) = 0.25`

**Actual default values**:
| Slot | Uniform | Default | Source |
|------|---------|---------|--------|
| 22 | Ambient | 0.3 | Studio preset |
| 23 | Diffuse | 0.7 | Studio preset |
| 24 | Fresnel | 0.25 | clampNumber fallback |

**Verdict**: ✓ Slots ARE populated. Default values confirmed. Generator's "graceful degradation" claim is moot — these will never be zero in practice.

---

### C13 [NOTE]: Gap 2 — Default value lighting comparison
With confirmed defaults (ambient=0.3, diffuse=0.7, fresnel=0.25):

| Parameter | Desktop formula | Desktop value | Current mobile | Gap 2 proposed |
|-----------|----------------|---------------|----------------|----------------|
| Ambient | 0.08 + 0.3 × 0.35 | 0.185 | 0.18 | 0.185 ✓ |
| Diffuse | × (0.4 + 0.7 × 0.85) | × 0.995 | × 1.0 | × 0.995 ✓ |
| Fresnel | 0.25 × f × 0.8 × 0.15 | 0.030 × f | 0.12 × f | 0.20 × f ✗ |

The ambient and diffuse mappings are excellent — nearly identical to current hardcoded values at defaults, but now properly responsive to user preset changes. The fresnel is the ONLY broken term (see C11).

---

## Accepted Items

1. **Bug A (Proposal 1)**: ACCEPT. Correct seam_t port from desktop. `surf(u, t)` equivalence verified. Interpolation direction verified. `getf(28u)` usage verified. Both seg 3 and seg 4 patches are correct.

2. **Bug B (Proposal 2)**: ACCEPT. Total count fix and seg-1-only degenerate check exactly match desktop behavior. Routing logic verified to work correctly with unconditional total.

3. **Bug C (Proposal 3)**: ACCEPT. Single-character change `.y` → `.z` is mathematically correct. Desktop uses `N_cam.z` for hemisphere blend. Mobile's `Nc.z = dot(n, fwd)` is the same forward-axis component.

4. **Gap 1 (Proposal 4)**: ACCEPT. Rim kicker directions, intensity (0.28), color (white), and simple lambert (not wrap) all match desktop. `normalize()` on constants is folded at compile time. Camera basis sign difference in the right vector is immaterial due to symmetric intensities.

5. **Gap 2 (Proposal 5)**: ACCEPT WITH AMENDMENT. Ambient and diffuse tuning are correctly ported. Fresnel has a critical `× 0.15` multiplier missing (see C11). Fix is a one-constant change.

---

## Open Questions — Answers

### Q1: "Uniform slot 22/23/24 population"
**Answer**: YES, populated. Same `UniformBlock` and `populateLighting()` path for both desktop and mobile. See C12 for full trace.

### Q2: "Normal direction for bottom discs"
**Answer**: CONFIRMED correct. `pot_normal()` returns `(0,0,1)` for seg 3 (bottom_top, same as desktop seg 2 which is a flat disc facing up) and `(0,0,-1)` for seg 4 (bottom_under, same as desktop seg 3 which faces down). The normal is independent of radial position on the disc, which is correct for a planar surface.

### Q3: "Desktop seg numbering drift"
**Answer**: AGREE this is a maintenance hazard but DO NOT align during this parity fix. The segment ordering is embedded in both vertex routing and `seg_pt`/`surface_point` dispatch. Renumbering would touch every segment reference in both shaders. Out of scope and risky. File a separate issue.

---

## Implementation Conditions (for Executioner)

### Order of application
1. Bug B (showInner gating) — simplest, most impactful
2. Bug A (bottom disc seam_t) — moderate, high visual impact
3. Bug C (hemisphere axis) — trivial one-character fix
4. Gap 1 (rim kickers) — additive, no regression risk
5. Gap 2 (tuning uniforms) — WITH C11 AMENDMENT

### C11 Amendment — Exact fresnel fix
In the final `lit` computation, use:
```wgsl
vec3<f32>(tuning_fresnel * fresnel * 0.12)
```
NOT `vec3<f32>(tuning_fresnel * fresnel * 0.8)`.

The constant `0.12 = 0.8 × 0.15` combines the two scaling factors from desktop's `fresnel_term = tuning.fresnel × fresnel × 0.8` and `fresnel_term × 0.15`.

### Validation protocol
1. **Visual**: Compare desktop and mobile preview side-by-side with "Studio" lighting preset. Bottom discs should show full outer→inner→drain coverage. Hemisphere ambient should shade front-facing normals with sky color, not top-facing.
2. **Regression**: showInner=false should hide ONLY the inner wall. Rim, bottom, drain must remain visible.
3. **Boundary**: Test with `rings=2` (seam_t=0.5, maximum outer zone) and `rings=24` (seam_t=0.958, thin outer zone). Both should render continuous discs without gaps.
4. **Lighting**: Toggle through all 5 lighting presets. Mobile should track desktop intensity changes for ambient/diffuse. Fresnel should appear as subtle edge enhancement, not a bright halo.
5. **WGSL validation**: Run `validate_wgsl.cjs` on the composed mobile shader to catch any syntax errors from the patch.
