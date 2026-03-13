// Ultra-Mobile Preview — v11 (desktop parity: seam_t bottom, showInner fix, tuned lighting)
// Self-contained. Only the style function is injected at __STYLE_SLOT__.
// Segments: 0=outer, 1=inner, 2=rim, 3=bottom_top, 4=bottom_under, 5=drain.
const TAU = 6.28318530718;
const PI = 3.14159265359;
const STYLE_PARAM_CAPACITY : u32 = 48u;

struct PreviewParamBlock { values: array<vec4<f32>, 19> }
struct StyleParamBlock  { values: array<vec4<f32>, 12> }
@group(0) @binding(0) var<uniform> PreviewParams : PreviewParamBlock;
@group(0) @binding(1) var<uniform> uC1  : vec4<f32>;
@group(0) @binding(2) var<uniform> uC2  : vec4<f32>;
@group(0) @binding(3) var<uniform> uC3  : vec4<f32>;
@group(0) @binding(4) var<uniform> StyleParams : StyleParamBlock;
@group(0) @binding(5) var<uniform> uBg1 : vec4<f32>;
@group(0) @binding(6) var<uniform> uBg2 : vec4<f32>;
@group(0) @binding(7) var<uniform> uBg3 : vec4<f32>;

fn getf(i: u32) -> f32 {
  let v = PreviewParams.values[i / 4u];
  let c = i % 4u;
  if (c == 0u) { return v.x; }
  if (c == 1u) { return v.y; }
  if (c == 2u) { return v.z; }
  return v.w;
}

fn style_param(i: u32) -> f32 {
  if (i >= STYLE_PARAM_CAPACITY) { return 0.0; }
  let v = StyleParams.values[i / 4u];
  let c = i % 4u;
  if (c == 0u) { return v.x; }
  if (c == 1u) { return v.y; }
  if (c == 2u) { return v.z; }
  return v.w;
}

fn style_params_active() -> bool { return style_param(STYLE_PARAM_CAPACITY - 1u) > 0.5; }

fn vp_matrix() -> mat4x4<f32> {
  let o = 40u;
  return mat4x4<f32>(
    vec4<f32>(getf(o), getf(o+1u), getf(o+2u), getf(o+3u)),
    vec4<f32>(getf(o+4u), getf(o+5u), getf(o+6u), getf(o+7u)),
    vec4<f32>(getf(o+8u), getf(o+9u), getf(o+10u), getf(o+11u)),
    vec4<f32>(getf(o+12u), getf(o+13u), getf(o+14u), getf(o+15u))
  );
}

fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn smoothstep2(e0: f32, e1: f32, x: f32) -> f32 {
  let t = sat((x - e0) / max(1e-6, e1 - e0)); return t * t * (3.0 - 2.0 * t);
}
fn ridge(d: f32, w: f32, s: f32) -> f32 { return pow(max(0.0, 1.0 - abs(d) / max(1e-6, w)), s); }
fn ridge_sin(p: f32, w: f32, s: f32) -> f32 { return pow(max(0.0, 1.0 - abs(sin(p)) / max(1e-6, w)), s); }
fn smax(a: f32, b: f32, k: f32) -> f32 { let h = clamp(0.5 + 0.5*(a-b)/k, 0.0, 1.0); return mix(b,a,h) + k*h*(1.0-h); }

fn r_base(t: f32) -> f32 {
  let m = getf(2u) + (getf(1u)-getf(2u)) * pow(max(t,0.0), max(getf(3u),1e-4));
  let bd = t - getf(15u); let bw = max(getf(72u), 0.1);
  return max(m * (1.0 + getf(14u) * exp(-(bd*bd)/(2.0*bw*bw))), 0.5);
}

fn twist_theta(theta: f32, t: f32) -> f32 {
  return theta + TAU * getf(4u) * pow(t, max(getf(6u), 1e-4)) + getf(5u);
}

fn superformula_value(theta: f32, m: f32, n1: f32, n2: f32, n3: f32, a: f32, b: f32) -> f32 {
  let cc = pow(abs(cos(m*theta/4.0)/max(a,1e-4)), n2);
  let ss = pow(abs(sin(m*theta/4.0)/max(b,1e-4)), n3);
  let d = pow(cc+ss, 1.0/max(n1,1e-4));
  if (d <= 1e-4) { return 0.0; }
  return clamp(1.0/d, 0.0, 4.0);
}


fn harmonic_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let petals = style_param(0u);
  let pet_amp = style_param(1u);
  let pet_ph = style_param(2u);
  let pet_zg = style_param(3u);
  let rip_freq = style_param(4u);
  let rip_amp = style_param(5u);
  let rip_ph = style_param(6u);
  let rip_zg = style_param(7u);
  let bell = style_param(8u);
  var f = 1.0 + pet_amp * cos(petals * theta + pet_ph + TAU * pet_zg * t);
  f *= 1.0 + rip_amp * sin(rip_freq * theta + rip_ph + TAU * rip_zg * t);
  f *= 1.0 + bell * exp(-((t - 0.5) * (t - 0.5)) / 0.04);
  return r0 * f;
}

fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return harmonic_radius(th, t, r0);
}



fn surf(u: f32, v: f32) -> vec3<f32> {
  let H = getf(0u); let t = clamp(v, 0.0, 1.0);
  let th0 = u * TAU;
  let r = style_radius(i32(getf(7u)), th0, t, r_base(t));
  let th = twist_theta(th0, t);
  return vec3<f32>(r*cos(th), r*sin(th), t*H);
}

fn inner_pt(u: f32, z_mm: f32) -> vec3<f32> {
  let H = max(getf(0u), 1e-4);
  let z = clamp(z_mm, 0.0, H);
  let outer = surf(u, z / H);
  let xy = outer.xy;
  let ln = length(xy);
  let wall = max(getf(25u), 0.4);
  let offset = max(ln - wall, 0.5);
  var dir = vec2<f32>(0.0, 1.0);
  if (ln > 1e-5) { dir = xy / ln; }
  return vec3<f32>(dir * offset, z);
}

// seg 0=outer, 1=inner, 2=rim, 3=bottom_top, 4=bottom_under, 5=drain
fn seg_pt(seg: u32, u: f32, v: f32) -> vec3<f32> {
  let H = getf(0u);
  if (seg == 0u) { return surf(u, v); }
  if (seg == 1u) {
    let bottom = clamp(getf(26u), 0.0, H);
    let z = mix(bottom, H, clamp(v, 0.0, 1.0));
    return inner_pt(u, z);
  }
  if (seg == 2u) {
    // rim — interpolate between outer and inner at z=H
    let outer_top = surf(u, 1.0);
    let inner_top = inner_pt(u, H);
    let r_outer = length(outer_top.xy);
    let r_inner = length(inner_top.xy);
    let r = mix(r_inner, r_outer, clamp(v, 0.0, 1.0));
    let th = twist_theta(u * TAU, 1.0);
    let dir = vec2<f32>(cos(th), sin(th));
    return vec3<f32>(dir * r, H);
  }
  // Common bottom/drain values
  let bottom = clamp(getf(26u), 0.0, H);
  let drain_raw = max(getf(13u), 0.25);
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
  // seg 5: drain cylinder — tube from z=0 to z=bottom at drain radius
  let ib0 = inner_pt(u, 0.0);
  let ri0 = length(ib0.xy);
  let rd = clamp(drain_raw, 0.25, max(ri0 - 0.2, 0.25));
  let z = mix(0.0, bottom, clamp(v, 0.0, 1.0));
  let tr = clamp(z / max(H, 1e-4), 0.0, 1.0);
  let th = twist_theta(u * TAU, tr);
  let dir = vec2<f32>(cos(th), sin(th));
  return vec3<f32>(dir * rd, z);
}

fn pot_normal(seg: u32, u: f32, v: f32, du: f32, dv: f32) -> vec3<f32> {
  if (seg == 2u || seg == 3u) { return vec3<f32>(0.0, 0.0, 1.0); }
  if (seg == 4u) { return vec3<f32>(0.0, 0.0, -1.0); }
  if (seg == 5u) {
    // drain cylinder: inward-facing radial normal
    let p = seg_pt(5u, u, v);
    let ln = length(p.xy);
    if (ln < 1e-5) { return vec3<f32>(0.0, 0.0, 1.0); }
    return vec3<f32>(-p.xy / ln, 0.0);
  }
  let pu = seg_pt(seg, u + du, v) - seg_pt(seg, u - du, v);
  let pv = seg_pt(seg, u, clamp(v + dv, 0.0, 1.0)) - seg_pt(seg, u, clamp(v - dv, 0.0, 1.0));
  let nn = cross(pu, pv);
  if (length(nn) < 1e-6) { return vec3<f32>(0.0, 0.0, 1.0); }
  var n = normalize(nn);
  if (seg == 1u) { n = -n; }
  return n;
}

struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) col: vec3<f32>, @location(1) ib: f32 }

@vertex fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  var o: VSOut;
  if (vid < 3u) {
    var bg = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
    o.pos = vec4<f32>(bg[vid], 0.99, 1.0);
    o.col = vec3<f32>((bg[vid].x+1.0)*0.5, (bg[vid].y+1.0)*0.5, 0.0);
    o.ib = 1.0; return o;
  }
  let lid = vid - 3u;
  let nx = max(i32(getf(16u)), 1);
  let outerY = max(i32(getf(17u)), 1);
  let innerY = max(i32(getf(27u)), 1);
  let rimR = max(i32(getf(30u)), 1);
  let bottomR = max(i32(getf(28u)), 2);
  let cO = nx * outerY;
  let cI = nx * innerY;
  let cR = nx * rimR;
  let cB = nx * bottomR;
  let cD = nx * bottomR; // drain uses same ring count
  let showInner = getf(71u) >= 0.5;

  let cell = i32(lid) / 6;
  let total = cO + cI + cR + cB + cB + cD;
  if (cell >= total) {
    o.pos = vec4<f32>(0.0,0.0,-2.0,1.0); o.col = vec3<f32>(0.0); o.ib = 0.0; return o;
  }

  // Determine segment and local cell
  var seg = 0u;
  var lc = cell;
  if (lc >= cO) { lc -= cO; seg = 1u; }
  if (seg == 1u && lc >= cI) { lc -= cI; seg = 2u; }
  if (seg == 2u && lc >= cR) { lc -= cR; seg = 3u; }
  if (seg == 3u && lc >= cB) { lc -= cB; seg = 4u; }
  if (seg == 4u && lc >= cB) { lc -= cB; seg = 5u; }
  var ny = outerY;
  if (seg == 1u) { ny = innerY; }
  if (seg == 2u) { ny = rimR; }
  if (seg >= 3u) { ny = bottomR; }

  // Hide inner wall when showInner is false (degenerate triangle, matching desktop)
  if (seg == 1u && !showInner) {
    o.pos = vec4<f32>(0.0, 0.0, -2.0, 1.0); o.col = vec3<f32>(0.0); o.ib = 0.0; return o;
  }

  let corner = i32(lid) % 6;
  let cx = lc % nx; let cy = lc / nx;
  let dx = f32(nx); let dy = f32(ny);
  let u0 = f32(cx)/dx; let v0 = f32(cy)/dy;
  let u1 = f32(cx+1)/dx; let v1 = f32(cy+1)/dy;
  var u = select(u1, u0, corner==0 || corner==1 || corner==4);
  var v = select(v1, v0, corner==0 || corner==2 || corner==3);

  let H = getf(0u);
  let p = seg_pt(seg, u, v);
  let n = pot_normal(seg, u, v, 1.0 / dx, 1.0 / dy);
  let eye = vec3<f32>(getf(36u), getf(37u), getf(38u));
  let w = vec4<f32>(p.x, p.y, p.z - 0.5*H, 1.0);
  let Vd = normalize(eye - w.xyz);

  // Camera basis (look-at-origin, Z-up world)
  let fwd = normalize(-eye);
  var right = cross(fwd, vec3<f32>(0.0, 0.0, 1.0));
  if (length(right) < 1e-4) { right = vec3<f32>(1.0, 0.0, 0.0); }
  right = normalize(right);
  let up = normalize(cross(right, fwd));

  // Transform normal and view into camera space
  let Nc = vec3<f32>(dot(n, right), dot(n, up), dot(n, fwd));
  let Vc = vec3<f32>(dot(Vd, right), dot(Vd, up), dot(Vd, fwd));

  // Height-based gradient color (smoothstep for desktop parity)
  let hr = clamp(p.z / max(H, 1e-4), 0.0, 1.0);
  var base: vec3<f32>;
  if (hr <= 0.5) {
    let t2 = hr * 2.0; let st = t2 * t2 * (3.0 - 2.0 * t2);
    base = mix(uC1.xyz, uC2.xyz, st);
  } else {
    let t2 = (hr - 0.5) * 2.0; let st = t2 * t2 * (3.0 - 2.0 * t2);
    base = mix(uC2.xyz, uC3.xyz, st);
  }

  // 3-light studio rig in camera space (key + fill + back)
  let Lk = normalize(vec3<f32>(0.3, 0.5, -0.85));  // key: front-top-right
  let Lf = normalize(vec3<f32>(-0.6, 0.3, -0.6));   // fill: front-left
  let Lb = normalize(vec3<f32>(0.0, 0.9, 0.35));    // back: behind-above

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

  let lit = base * (ambient + diffuse_scaled) + vec3<f32>(0.97, 0.98, 1.0) * spec + vec3<f32>(0.9, 0.95, 1.0) * rim + vec3<f32>(tuning_fresnel * fresnel * 0.12);

  o.pos = vp_matrix() * w;
  o.col = clamp(lit, vec3<f32>(0.0), vec3<f32>(2.0));
  o.ib = 0.0; return o;
}

@fragment fn fs_main(@location(0) col: vec3<f32>, @location(1) ib: f32) -> @location(0) vec4<f32> {
  if (ib > 0.5) {
    let t = clamp(col.y, 0.0, 1.0);
    if (t <= 0.5) {
      let s = t * 2.0; let ss = s * s * (3.0 - 2.0 * s);
      return vec4<f32>(mix(uBg1.xyz, uBg2.xyz, ss), 1.0);
    }
    let s = (t - 0.5) * 2.0; let ss = s * s * (3.0 - 2.0 * s);
    return vec4<f32>(mix(uBg2.xyz, uBg3.xyz, ss), 1.0);
  }
  if (getf(18u) >= 0.5) { return vec4<f32>(1.0, 0.0, 0.0, 1.0); }
  return vec4<f32>(clamp(col, vec3<f32>(0.03), vec3<f32>(1.8)), 1.0);
}
