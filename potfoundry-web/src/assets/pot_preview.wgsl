struct PreviewParamBlock {
  values: array<vec4<f32>, 19>, // 19 x 4 = 76 floats to match UNIFORM_FLOAT_COUNT
};

@group(0) @binding(0) var<uniform> PreviewParams : PreviewParamBlock;
@group(0) @binding(1) var<uniform> uC1 : vec4<f32>;
@group(0) @binding(2) var<uniform> uC2 : vec4<f32>;
@group(0) @binding(3) var<uniform> uC3 : vec4<f32>;
@group(0) @binding(5) var<uniform> uBg1 : vec4<f32>;
@group(0) @binding(6) var<uniform> uBg2 : vec4<f32>;
@group(0) @binding(7) var<uniform> uBg3 : vec4<f32>;

const TAU = 6.28318530718;
const BOTTOM_Z_OFFSET = 1e-3;
const STYLE_PARAM_CAPACITY : u32 = 48u;
const STYLE_SUPERFORMULA = 0;
const STYLE_FOURIER = 1;
const STYLE_SPIRAL = 2;
const STYLE_SUPERELLIPSE = 3;
const STYLE_HARMONIC = 4;
const CAMERA_EYE_OFFSET : u32 = 36u;
const CAMERA_MODE_OFFSET : u32 = 39u;
const VP_MATRIX_OFFSET : u32 = 40u;
const CAMERA_RIGHT_OFFSET : u32 = 56u;
const CAMERA_UP_OFFSET : u32 = 60u;
const CAMERA_FORWARD_OFFSET : u32 = 64u;
const GRID_FLAG_OFFSET : u32 = 68u;
const SPECULAR_GAIN_OFFSET : u32 = 69u;
const ROUGHNESS_OFFSET : u32 = 70u;
const SHOW_INNER_OFFSET : u32 = 71u;
const DRAIN_RADIUS_OFFSET : u32 = 13u;



struct StyleParamBlock {
  // Uniform buffer alignment: array<vec4<f32>, 12> fits significantly within limit
  values: array<vec4<f32>, 12>,
};



// OPTIMIZATION: Use uniform buffer instead of storage buffer for speed
@group(0) @binding(4) var<uniform> StyleParams : StyleParamBlock;

fn style_param(i: u32) -> f32 {
  if (i >= STYLE_PARAM_CAPACITY) {
    return 0.0;
  }
  let elem = i / 4u;
  let comp = i % 4u;
  if (elem >= 12u) {
    return 0.0;
  }
  let v = StyleParams.values[elem];
  if (comp == 0u) { return v.x; }
  else if (comp == 1u) { return v.y; }
  else if (comp == 2u) { return v.z; }
  return v.w;
}

fn style_params_active() -> bool {
  return style_param(STYLE_PARAM_CAPACITY - 1u) > 0.5;
}

fn getf(i: u32) -> f32 {
  let elem = i / 4u;
  let comp = i % 4u;
  // Support 76 floats = 19 vec4 elements (indices 0-75)
  if (elem >= 19u) {
    return 0.0;
  }
  let v = PreviewParams.values[elem];
  if (comp == 0u) { return v.x; }
  else if (comp == 1u) { return v.y; }
  else if (comp == 2u) { return v.z; }
  return v.w;
}

fn vp_matrix() -> mat4x4<f32> {
  let c0 = vec4<f32>(
    getf(VP_MATRIX_OFFSET + 0u),
    getf(VP_MATRIX_OFFSET + 1u),
    getf(VP_MATRIX_OFFSET + 2u),
    getf(VP_MATRIX_OFFSET + 3u)
  );
  let c1 = vec4<f32>(
    getf(VP_MATRIX_OFFSET + 4u),
    getf(VP_MATRIX_OFFSET + 5u),
    getf(VP_MATRIX_OFFSET + 6u),
    getf(VP_MATRIX_OFFSET + 7u)
  );
  let c2 = vec4<f32>(
    getf(VP_MATRIX_OFFSET + 8u),
    getf(VP_MATRIX_OFFSET + 9u),
    getf(VP_MATRIX_OFFSET + 10u),
    getf(VP_MATRIX_OFFSET + 11u)
  );
  let c3 = vec4<f32>(
    getf(VP_MATRIX_OFFSET + 12u),
    getf(VP_MATRIX_OFFSET + 13u),
    getf(VP_MATRIX_OFFSET + 14u),
    getf(VP_MATRIX_OFFSET + 15u)
  );
  return mat4x4<f32>(c0, c1, c2, c3);
}

// Rt/Rb arrive as radii in millimeters (UI already converts from OD -> radius).
fn r_base(t: f32) -> f32 {
  let Rt = getf(1u);
  let Rb = getf(2u);
  let expn = getf(3u);
  let a = pow(max(t, 0.0), max(expn, 1e-4));
  let m = Rb + (Rt - Rb) * a;
  
  // Bell/bulge deformation - applies to all styles
  let bell_amp = getf(14u);    // Amplitude (-0.5 to 0.5)
  let bell_center = getf(15u); // Center position (0.1 to 0.9)
  let bell_width = max(getf(72u), 0.1); // Width from uniform (0.1-1.0)
  
  // Gaussian bell curve centered at bell_center
  let bell_dist = t - bell_center;
  let bell_factor = bell_amp * exp(-(bell_dist * bell_dist) / (2.0 * bell_width * bell_width));
  
  // Apply bell as a multiplicative factor to the radius
  let m_with_bell = m * (1.0 + bell_factor);
  
  return max(m_with_bell, 0.5);
}

fn twist_theta(theta: f32, t: f32) -> f32 {
  let turns = getf(4u); // spinTurns
  let phase = getf(5u); // spinPhase
  let curve = max(getf(6u), 1e-4); // spinCurve (exponent for non-linear twist)
  return theta + TAU * turns * pow(t, curve) + phase;
}

fn superformula_value(theta: f32, m: f32, n1: f32, n2: f32, n3: f32, a: f32, b: f32) -> f32 {
  let c = pow(abs(cos(m * theta / 4.0) / max(a, 1e-4)), n2);
  let s = pow(abs(sin(m * theta / 4.0) / max(b, 1e-4)), n3);
  let denom = pow(c + s, 1.0 / max(n1, 1e-4));
  if (denom <= 1e-4) {
    return 0.0;
  }
  return clamp(1.0 / denom, 0.0, 4.0);
}

fn sf_radius(theta: f32, t: f32, r0: f32) -> f32 {
  let has_params = style_params_active();
  var m_base = getf(8u);
  var m_top = getf(9u);
  var m_curve = 1.2;
  var n1_base = getf(10u);
  var n1_top = n1_base;
  var n2_base = getf(11u);
  var n2_top = n2_base;
  var n3_base = getf(12u);
  var n3_top = n3_base;
  var a = 1.0;
  var b = 1.0;
  if (has_params) {
    m_base = style_param(0u);
    m_top = style_param(1u);
    m_curve = max(style_param(2u), 1e-4);
    n1_base = style_param(3u);
    n1_top = style_param(4u);
    n2_base = style_param(5u);
    n2_top = style_param(6u);
    n3_base = style_param(7u);
    n3_top = style_param(8u);
    a = max(style_param(9u), 1e-4);
    b = max(style_param(10u), 1e-4);
  }
  let m = mix(m_base, m_top, pow(t, m_curve));
  let n1 = mix(n1_base, n1_top, t);
  let n2 = mix(n2_base, n2_top, t);
  let n3 = mix(n3_base, n3_top, t);
  
  // Seam phase offset: shift theta by half a petal width so theta=0 falls 
  // on a smooth slope instead of a petal tip/valley.
  let seam_offset = (TAU / 2.0) / max(m, 1.0);
  let theta_adj = theta + seam_offset;
  
  // Calculate the styled radius value at this position
  let rf = superformula_value(theta_adj, m, n1, n2, n3, a, b);
  
  // Seam Amplitude Reduction: Reduce the VARIATION in rf near the seam
  // This lower the peaks while raising the valleys, making them meet smoothly
  // Key: blend towards a MIDPOINT (not zero) to avoid creating a dip
  // DEBUG: Hardcoded to verify logic vs parameter issue. Reverting to parameter.
  // Robustness: buffer might default to 0. Force 30 degrees (0.52 rad) if 0 to ensure seam is smoothed.
  // User can still set near-zero value (e.g. 0.001) if they really want sharp edge.
  let seam_spread_raw = getf(73u);
  let seam_spread = select(seam_spread_raw, 0.523, seam_spread_raw < 0.0001);
  if (seam_spread > 0.0001) {
    let dist_from_seam = min(theta, TAU - theta);
    
    if (dist_from_seam < seam_spread) {
      // Blend factor: 0 at seam center, 1 at edge of zone
      let x = dist_from_seam / seam_spread;
      let blend = smoothstep(0.0, 1.0, x);
      
      // rf_mid is the approximate midpoint value where peaks and valleys would meet
      // For superformula, rf typically ranges from ~0.3 to ~1.5, so ~0.7-0.8 is a good midpoint
      let rf_mid = 0.75;
      
      // Blend rf towards rf_mid: at seam center, rf = rf_mid (no variation)
      // At edge of zone, rf = original value (full variation)
      let rf_blended = mix(rf_mid, rf, blend);
      
      return r0 * (0.90 + 0.35 * rf_blended);
    }
  }
  
  return r0 * (0.90 + 0.35 * rf);
}

// Optimized: Superformula radius at theta = 0
// Reduces calculation: cos(0)=1, sin(0)=0.
// rf = 1.0 / pow(pow(1.0/a, n2), 1.0/n1) = a^(n2/n1) if a is positive.
fn sf_radius_zero(t: f32, r0: f32) -> f32 {
  let has_params = style_params_active();
  var n1 = getf(10u);
  var n2 = getf(11u);
  var a = 1.0;
  if (has_params) {
    // Interpolate n1, n2 based on t
    let n1_base = style_param(3u);
    let n1_top = style_param(4u);
    let n2_base = style_param(5u);
    let n2_top = style_param(6u);
    n1 = mix(n1_base, n1_top, t);
    n2 = mix(n2_base, n2_top, t);
    a = max(style_param(9u), 1e-4);
  } else {
    // Default interpolation if no params active
    let n1_top = getf(10u);
    let n2_top = getf(11u);
    n1 = mix(n1, n1_top, t);
    n2 = mix(n2, n2_top, t);
  }
  
  // rf = 1 / ( (1/a^n2)^(1/n1) ) = 1 / (1/a)^(n2/n1) = a^(n2/n1)
  // Ensure strict positivity for pow and clamp exponent to prevent overflow
  let exponent = clamp(n2 / max(n1, 1e-4), -100.0, 100.0);
  let rf = pow(max(a, 1e-4), exponent);
  return r0 * (0.90 + 0.35 * clamp(rf, 0.0, 4.0));
}

// Optimized: Superformula radius at theta = 2PI
// At 2PI, theta = 2PI. Argument phi = m * 2PI / 4 = m * PI / 2.
fn sf_radius_tau(t: f32, r0: f32) -> f32 {
  let has_params = style_params_active();
  var m_base = getf(8u);
  var m_top = getf(9u);
  var m_curve = 1.2;
  var n1_base = getf(10u);
  var n1_top = n1_base;
  var n2_base = getf(11u);
  var n2_top = n2_base;
  var n3_base = getf(12u);
  var n3_top = n3_base;
  var a = 1.0;
  var b = 1.0;
  if (has_params) {
    m_base = style_param(0u);
    m_top = style_param(1u);
    m_curve = max(style_param(2u), 1e-4);
    n1_base = style_param(3u);
    n1_top = style_param(4u);
    n2_base = style_param(5u);
    n2_top = style_param(6u);
    n3_base = style_param(7u);
    n3_top = style_param(8u);
    a = max(style_param(9u), 1e-4);
    b = max(style_param(10u), 1e-4);
  }
  let m = mix(m_base, m_top, pow(t, m_curve));
  let n1 = mix(n1_base, n1_top, t);
  let n2 = mix(n2_base, n2_top, t);
  let n3 = mix(n3_base, n3_top, t);
  
  // Calculate directly for m * PI / 2
  let phi = m * 1.57079632679;
  let c = pow(abs(cos(phi) / max(a, 1e-4)), n2);
  let s = pow(abs(sin(phi) / max(b, 1e-4)), n3);
  let denom = pow(c + s, 1.0 / max(n1, 1e-4));
  var rf = 0.0;
  if (denom > 1e-4) {
    rf = clamp(1.0 / denom, 0.0, 4.0);
  }
  return r0 * (0.90 + 0.35 * rf);
}

fn fourier_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let bc8 = style_param(0u);
  let bc8p = style_param(1u);
  let bs4 = style_param(2u);
  let bs4p = style_param(3u);
  let bc12 = style_param(4u);
  let bc12p = style_param(5u);
  let tc11 = style_param(6u);
  let tc11p = style_param(7u);
  let ts7 = style_param(8u);
  let ts7p = style_param(9u);
  let tc22 = style_param(10u);
  let tc22p = style_param(11u);
  let wob_amp = style_param(12u);
  let wob_freq = style_param(13u);
  let wob_zgain = style_param(14u);
  let strength = style_param(15u);
  let base = 1.0
    + bc8 * cos(8.0 * theta + bc8p)
    + bs4 * sin(4.0 * theta + bs4p)
    + bc12 * cos(12.0 * theta + bc12p);
  let top = 1.0
    + tc11 * cos(11.0 * theta + tc11p)
    + ts7 * sin(7.0 * theta + ts7p)
    + tc22 * cos(22.0 * theta + tc22p);
  var f = mix(base, top, clamp(t, 0.0, 1.0));
  f *= 1.0 + wob_amp * sin(wob_freq * theta + TAU * wob_zgain * t);
  return r0 * (1.0 + (f - 1.0) * strength);
}

fn spiral_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let k = style_param(0u);
  let turns = style_param(1u);
  let amp_min = style_param(2u);
  let amp_max = style_param(3u);
  let amp_curve = max(style_param(4u), 1e-4);
  let groove_amp = style_param(5u);
  let groove_mult = style_param(6u);
  let phase_mult = style_param(7u);
  let phase = TAU * turns * t;
  let amp = amp_min + (amp_max - amp_min) * pow(clamp(t, 0.0, 1.0), amp_curve);
  var f = 1.0 + amp * sin(k * theta + phase);
  f += groove_amp * sin(groove_mult * k * theta + phase_mult * phase);
  return r0 * f;
}

fn superellipse_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let m_base = style_param(0u);
  let m_top = style_param(1u);
  let m_curve = max(style_param(2u), 1e-4);
  let m_exp = m_base + (m_top - m_base) * pow(clamp(t, 0.0, 1.0), m_curve);
  let c4a = style_param(3u);
  let c4p = style_param(4u);
  let c8a = style_param(5u);
  let c8p = style_param(6u);
  let c = pow(abs(cos(theta)), m_exp);
  let s = pow(abs(sin(theta)), m_exp);
  let base = pow(c + s, -1.0 / max(m_exp, 1e-4));
  let rf = base * (1.0 + c4a * cos(4.0 * theta + c4p) + c8a * cos(8.0 * theta + c8p));
  return r0 * rf;
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
  // Normalize theta to [0, TAU) for perfect periodicity
  // This ensures theta=TAU produces identical result to theta=0
  // Eliminates seam discontinuity at the u=0/u=1 boundary
  let th = theta - floor(theta / TAU) * TAU;
  
  if (style_id == STYLE_FOURIER) {
    return fourier_radius(th, t, r0);
  }
  if (style_id == STYLE_SPIRAL) {
    return spiral_radius(th, t, r0);
  }
  if (style_id == STYLE_SUPERELLIPSE) {
    return superellipse_radius(th, t, r0);
  }
  if (style_id == STYLE_HARMONIC) {
    return harmonic_radius(th, t, r0);
  }
  return sf_radius(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
  // For most styles, f(0) is a simplified calculation
  if (style_id == STYLE_FOURIER) {
    // Fourier at 0: base = 1 + bc8 + bc12. top = 1 + tc11 + tc22. sin terms are 0.
    // We can just call the normal function with theta=0 if simplification isn't manual
    // But direct implementation avoids trig calls.
    return fourier_radius(0.0, t, r0); 
  }
  if (style_id == STYLE_SPIRAL) {
    // Spiral at 0: sin(phase). phase = TAU * turns * t.
    return spiral_radius(0.0, t, r0);
  }
  if (style_id == STYLE_SUPERELLIPSE) {
    // Superellipse at 0: cos(0)=1, sin(0)=0. c=1, s=0. base=1. rf = 1 + c4a + c8a.
    // Very cheap.
    return superellipse_radius(0.0, t, r0);
  }
  if (style_id == STYLE_HARMONIC) {
    return harmonic_radius(0.0, t, r0);
  }
  // Superformula: Use highly optimized version
  return sf_radius_zero(t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
  // For periodic functions (Fourier, Superellipse, Harmonic), f(2PI) == f(0).
  if (style_id == STYLE_FOURIER) {
    return fourier_radius(0.0, t, r0); // Periodic
  }
  if (style_id == STYLE_SUPERELLIPSE) {
    return superellipse_radius(0.0, t, r0); // Periodic assumption (period PI/2 usually)
  }
  if (style_id == STYLE_HARMONIC) {
    return harmonic_radius(0.0, t, r0); // Periodic
  }
  
  if (style_id == STYLE_SPIRAL) {
    // Spiral is NOT periodic if turns is not integer.
    // We must evaluate at theta = 2PI (TAU)
    // spiral_radius handles theta input, it calculates phase + k*theta.
    // If we pass 2PI, it calculates sin(k*2PI + phase).
    return spiral_radius(6.2831853, t, r0);
  }
  
  // Superformula: Use optimized version for 2PI
  return sf_radius_tau(t, r0);
}


fn surf(u: f32, v: f32) -> vec3<f32> {
  let H = getf(0u);
  let t = clamp(v, 0.0, 1.0);
  let z = t * H;
  let r0 = r_base(t);
  let style_id = i32(getf(7u));
  
  // Simple linear theta - no seam blending to avoid device lost
  let th0 = u * TAU;
  
  // Calculate styled radius
  let r = style_radius(style_id, th0, t, r0);
  
  // Apply twist for rotation
  let th = twist_theta(th0, t);
  
  // Rotate the point by the twisted angle 'th'
  return vec3<f32>(r * cos(th), r * sin(th), z);
}

fn outer_point(u: f32, z_mm: f32) -> vec3<f32> {
  let H = max(getf(0u), 1e-4);
  let ratio = clamp(z_mm / H, 0.0, 1.0);
  return surf(u, ratio);
}

fn inner_point(u: f32, z_mm: f32) -> vec3<f32> {
  let H = max(getf(0u), 1e-4);
  let z = clamp(z_mm, 0.0, H);
  let outer = outer_point(u, z);
  let xy = outer.xy;
  let len = length(xy);
  let wall = max(getf(25u), 0.4);
  let offset = max(len - wall, 0.5);
  var dir = vec2<f32>(0.0, 1.0);
  if (len > 1e-5) {
    dir = xy / len;
  }
  return vec3<f32>(dir * offset, z);
}

fn theta_dir(u: f32) -> vec2<f32> {
  let th = u * TAU;
  return vec2<f32>(cos(th), sin(th));
}

fn surface_point(seg: u32, u: f32, v: f32) -> vec3<f32> {
  let H = getf(0u);
  let bottom = clamp(getf(26u), 0.0, H);
  if (seg == 0u) {
    return surf(u, v);
  }
  if (seg == 1u) {
    let z = mix(bottom, H, clamp(v, 0.0, 1.0));
    return inner_point(u, z);
  }
  var t_twist = 0.0;
  if (seg == 1u) { t_twist = clamp(v, 0.0, 1.0); }
  if (seg == 2u) { t_twist = clamp(bottom / H, 0.0, 1.0); }
  
  // Calculate twisted direction for bottom/drain segments
  var dir = theta_dir(u);
  let inner_bottom = inner_point(u, bottom);
  if (seg == 2u) {
    let outer_bottom = outer_point(u, bottom);
    let r_outer = length(outer_bottom.xy);
    let r_inner = length(inner_bottom.xy);
    let drain_raw = max(getf(DRAIN_RADIUS_OFFSET), 0.25);
    let r_inner_cap = max(r_inner - 0.2, 0.25);
    let r_drain = clamp(drain_raw, 0.25, r_inner_cap);
    let rings = max(getf(28u), 2.0);
    let seam_t = 1.0 - (1.0 / max(rings, 1.0));
    let t = clamp(v, 0.0, 1.0);
    var r: f32;
    if (t <= seam_t || seam_t <= 1e-4) {
      var local = 0.0;
      if (seam_t > 1e-4) {
        local = clamp(t / seam_t, 0.0, 1.0);
      }
      r = mix(r_inner, r_outer, 1.0 - local);
    } else {
      let denom = max(1.0 - seam_t, 1e-4);
      let local = clamp((t - seam_t) / denom, 0.0, 1.0);
      r = mix(r_drain, r_inner, 1.0 - local);
    }
    // Apply twist to segment 2 (bottom floor) at z=bottom height
    let t_twist = clamp(bottom / max(H, 1e-4), 0.0, 1.0);
    let th_twist = twist_theta(u * TAU, t_twist);
    let dir_twist = vec2<f32>(cos(th_twist), sin(th_twist));
    return vec3<f32>(dir_twist * r, bottom + BOTTOM_Z_OFFSET);
  }
  if (seg == 3u) {
    let outer_base = outer_point(u, 0.0);
    let r_outer = length(outer_base.xy);
    // Calculate inner radius at z=0 (where underside actually is), not at z=bottom
    let inner_base = inner_point(u, 0.0);
    let r_inner = length(inner_base.xy);
    let drain_raw = max(getf(DRAIN_RADIUS_OFFSET), 0.25);
    let r_inner_cap = max(r_inner - 0.2, 0.25);
    let r_drain = clamp(drain_raw, 0.25, r_inner_cap);
    let rings = max(getf(28u), 2.0);
    let seam_t = 1.0 - (1.0 / max(rings, 1.0));
    let t = clamp(v, 0.0, 1.0);
    var r: f32;
    if (t <= seam_t || seam_t <= 1e-4) {
      var local = 0.0;
      if (seam_t > 1e-4) {
        local = clamp(t / seam_t, 0.0, 1.0);
      }
      r = mix(r_inner, r_outer, 1.0 - local);
    } else {
      let denom = max(1.0 - seam_t, 1e-4);
      let local = clamp((t - seam_t) / denom, 0.0, 1.0);
      r = mix(r_drain, r_inner, 1.0 - local);
    }
    // Apply twist to segment 3 (bottom underside) at z=0 (approx)
    // Actually underside is at z=-offset. effectively t=0.
    let t_twist = 0.0; 
    let th_twist = twist_theta(u * TAU, t_twist);
    let dir_twist = vec2<f32>(cos(th_twist), sin(th_twist));
    return vec3<f32>(dir_twist * r, -BOTTOM_Z_OFFSET);
  }
  // Segment 5: Drain hole cylinder wall (connects top and bottom drain holes)
  if (seg == 5u) {
    let H = getf(0u);
    let bottom = clamp(getf(26u), 0.0, H);
    let inner_base = inner_point(u, 0.0);
    let r_inner_base = length(inner_base.xy);
    let drain_raw = max(getf(DRAIN_RADIUS_OFFSET), 0.25);
    let r_inner_cap = max(r_inner_base - 0.2, 0.25);
    let r_drain = clamp(drain_raw, 0.25, r_inner_cap);
    // v goes from 0 (bottom at z=0) to 1 (top at z=bottom)
    let z = mix(0.0, bottom, clamp(v, 0.0, 1.0));
    // Apply twist to drain cylinder at current z
    let t_twist = clamp(z / max(H, 1e-4), 0.0, 1.0);
    let th_twist = twist_theta(u * TAU, t_twist);
    let dir_twist = vec2<f32>(cos(th_twist), sin(th_twist));
    return vec3<f32>(dir_twist * r_drain, z);
  }
  // Segment 4: Rim (top cap connecting outer to inner wall at z=H)
  if (seg == 4u) {
    let outer_top = outer_point(u, H);
    let inner_top = inner_point(u, H);
    let r_outer = length(outer_top.xy);
    let r_inner = length(inner_top.xy);
    let r = mix(r_inner, r_outer, clamp(v, 0.0, 1.0));
    
    // Apply twist at top (t=1.0)
    let t_twist = 1.0;
    let th_twist = twist_theta(u * TAU, t_twist);
    let dir_twist = vec2<f32>(cos(th_twist), sin(th_twist));
    
    return vec3<f32>(dir_twist * r, H);
  }
  return vec3<f32>(0.0, 0.0, 0.0);
}

fn wrap_unit(value: f32) -> f32 {
  let w = fract(value);
  if (w < 0.0) {
    return w + 1.0;
  }
  return w;
}

fn sample_u(seg: u32, base: f32, delta: f32) -> f32 {
  // Segments 0-5 are cylindrical (wrap around u), segment 6+ would need clamping
  if (seg <= 5u) {
    return wrap_unit(base + delta);
  }
  return clamp(base + delta, 0.0, 1.0);
}

fn surface_normal(seg: u32, u: f32, v: f32, du: f32, dv: f32) -> vec3<f32> {
  if (seg == 2u || seg == 4u) {
    return vec3<f32>(0.0, 0.0, 1.0);
  }
  if (seg == 3u) {
    return vec3<f32>(0.0, 0.0, -1.0);
  }
  // Segment 5 (drain cylinder): removed hardcoded normal to allow twist (falls through to finite diff)
  let p = surface_point(seg, u, v);
  let u_forward = sample_u(seg, u, du);
  let u_back = sample_u(seg, u, -du);
  var pu = surface_point(seg, u_forward, v) - surface_point(seg, u_back, v);
  if (length(pu) < 1e-6) {
    pu = surface_point(seg, sample_u(seg, u, du * 0.5), v) - p;
  }
  let v_forward = clamp(v + dv, 0.0, 1.0);
  let v_back = clamp(v - dv, 0.0, 1.0);
  var pv = surface_point(seg, u, v_forward) - surface_point(seg, u, v_back);
  if (length(pv) < 1e-6) {
    pv = surface_point(seg, u, clamp(v + dv * 0.5, 0.0, 1.0)) - p;
  }
  var nn = cross(pu, pv);
  let nl = length(nn);
  if (nl < 1e-6) {
    nn = vec3<f32>(0.0, 0.0, 1.0);
  }
  let normalized = normalize(nn);
  if (seg == 1u) {
    return -normalized;
  }
  return normalized;
}

struct CameraBasis {
  right: vec3<f32>,
  up: vec3<f32>,
  forward: vec3<f32>,
};

struct LightingTuning {
  ambient: f32,
  diffuse: f32,
  fresnel: f32,
  specular: f32,
  roughness: f32,
};

// Professional studio lighting rig with 6 lights surrounding the object
struct LightingRig {
  key: vec3<f32>,       // Main light - front top
  fill: vec3<f32>,      // Fill light - front left
  back: vec3<f32>,      // Back light - behind for rim
  rim_left: vec3<f32>,  // Left rim/kicker
  rim_right: vec3<f32>, // Right rim/kicker  
  bottom: vec3<f32>,    // Bottom bounce light
  top: vec3<f32>,       // Top soft light
};

fn safe_normalize(v: vec3<f32>) -> vec3<f32> {
  let len = length(v);
  if (len < 1e-6) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }
  return v / len;
}

fn world_to_camera(v_world: vec3<f32>, basis: CameraBasis) -> vec3<f32> {
  return vec3<f32>(
    dot(v_world, basis.right),
    dot(v_world, basis.up),
    dot(v_world, basis.forward)
  );
}

fn basis_is_valid(basis: CameraBasis) -> bool {
  return length(basis.right) >= 1e-4 && length(basis.up) >= 1e-4 && length(basis.forward) >= 1e-4;
}

fn orthonormalize_basis(raw_right: vec3<f32>, raw_up: vec3<f32>, raw_forward: vec3<f32>) -> CameraBasis {
  var forward = safe_normalize(raw_forward);
  if (length(forward) < 1e-4) {
    forward = vec3<f32>(0.0, 0.0, 1.0);
  }
  let worldUp = vec3<f32>(0.0, 0.0, 1.0);
  var right = safe_normalize(cross(worldUp, forward));
  if (length(right) < 1e-4) {
    // Pick a deterministic fallback axis that is most orthogonal to forward
    let s0 = abs(dot(vec3<f32>(1.0, 0.0, 0.0), forward));
    let s1 = abs(dot(vec3<f32>(0.0, 1.0, 0.0), forward));
    let s2 = abs(dot(vec3<f32>(0.0, 0.0, 1.0), forward));
    var best = vec3<f32>(1.0, 0.0, 0.0);
    if (s1 < s0 && s1 <= s2) {
      best = vec3<f32>(0.0, 1.0, 0.0);
    } else if (s2 < s0 && s2 < s1) {
      best = vec3<f32>(0.0, 0.0, 1.0);
    }
    right = safe_normalize(cross(best, forward));
  }
  if (length(right) < 1e-4) {
    right = vec3<f32>(1.0, 0.0, 0.0);
  }
  var up = safe_normalize(cross(forward, right));
  if (length(up) < 1e-4) {
    up = worldUp;
  }
  return CameraBasis(right, up, forward);
}

fn fallback_camera_basis() -> CameraBasis {
  let rotX = clamp(getf(19u), -1.5607, 1.5607);
  let rotY = getf(20u);
  let cosPitch = cos(rotX);
  let sinPitch = sin(rotX);
  let cosYaw = cos(rotY);
  let sinYaw = sin(rotY);
  // Euler→forward mapping: forward = [sinYaw*cosPitch, -cosYaw*cosPitch, -sinPitch]
  var forward = vec3<f32>(sinYaw * cosPitch, -cosYaw * cosPitch, -sinPitch);
  forward = safe_normalize(forward);
  if (length(forward) < 1e-4) {
    forward = vec3<f32>(0.0, 0.0, 1.0);
  }
  let worldUp = vec3<f32>(0.0, 0.0, 1.0);
  var right = safe_normalize(cross(worldUp, forward));
  if (length(right) < 1e-4) {
    right = vec3<f32>(1.0, 0.0, 0.0);
  }
  var up = safe_normalize(cross(forward, right));
  if (length(up) < 1e-4) {
    up = vec3<f32>(0.0, 0.0, 1.0);
  }
  return CameraBasis(right, up, forward);
}

fn derived_camera_basis() -> CameraBasis {
  let eye = vec3<f32>(
    getf(CAMERA_EYE_OFFSET + 0u),
    getf(CAMERA_EYE_OFFSET + 1u),
    getf(CAMERA_EYE_OFFSET + 2u)
  );
  let target_pos = vec3<f32>(getf(29u), getf(31u), 0.0);
  var forward = safe_normalize(target_pos - eye);
  if (length(forward) < 1e-4) {
    forward = vec3<f32>(0.0, 0.0, 1.0);
  }
  let worldUp = vec3<f32>(0.0, 0.0, 1.0);
  var right = safe_normalize(cross(worldUp, forward));
  if (length(right) < 1e-4) {
    var up_ref = vec3<f32>(0.0, 0.0, 1.0);
    if (abs(dot(up_ref, forward)) > 0.94) {
      up_ref = vec3<f32>(0.0, 1.0, 0.0);
    }
    right = safe_normalize(cross(up_ref, forward));
  }
  if (length(right) < 1e-4) {
    right = vec3<f32>(1.0, 0.0, 0.0);
  }
  var up = safe_normalize(cross(forward, right));
  if (length(up) < 1e-4) {
    up = vec3<f32>(0.0, 0.0, 1.0);
  }
  return CameraBasis(right, up, forward);
}

fn load_basis_vec(offset: u32) -> vec3<f32> {
  return vec3<f32>(
    getf(offset + 0u),
    getf(offset + 1u),
    getf(offset + 2u)
  );
}

fn camera_basis() -> CameraBasis {
  let raw_right = load_basis_vec(CAMERA_RIGHT_OFFSET);
  let raw_up = load_basis_vec(CAMERA_UP_OFFSET);
  let raw_forward = load_basis_vec(CAMERA_FORWARD_OFFSET);
  let has_uniform_basis =
    length(raw_right) >= 1e-4 &&
    length(raw_up) >= 1e-4 &&
    length(raw_forward) >= 1e-4;
  if (has_uniform_basis) {
    let rebuilt = orthonormalize_basis(raw_right, raw_up, raw_forward);
    if (basis_is_valid(rebuilt)) {
      return rebuilt;
    }
  }
  let derived = derived_camera_basis();
  if (basis_is_valid(derived)) {
    return derived;
  }
  return fallback_camera_basis();
}

fn lighting_tuning() -> LightingTuning {
  return LightingTuning(
    clamp(getf(22u), 0.0, 1.0),
    clamp(getf(23u), 0.0, 1.0),
    clamp(getf(24u), 0.0, 1.0),
    clamp(getf(SPECULAR_GAIN_OFFSET), 0.0, 1.0),
    clamp(getf(ROUGHNESS_OFFSET), 0.02, 1.0)
  );
}

fn phong_specular(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, exponent: f32) -> f32 {
  let H = safe_normalize(L + V);
  let NdotH = max(dot(N, H), 0.0);
  return pow(NdotH, exponent);
}

// GGX/Trowbridge-Reitz distribution for more realistic specular
fn ggx_distribution(NdotH: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH2 = NdotH * NdotH;
  let denom = NdotH2 * (a2 - 1.0) + 1.0;
  return a2 / (3.14159 * denom * denom + 0.0001);
}

// Fresnel-Schlick approximation
fn fresnel_schlick(cosTheta: f32, F0: f32) -> f32 {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

fn spec_power_from_roughness(roughness: f32) -> f32 {
  let clamped = clamp(roughness, 0.02, 1.0);
  let gloss = pow(1.0 - clamped, 3.0);
  return mix(18.0, 240.0, gloss);
}

// Professional studio lighting setup - surrounds the object for beautiful highlights
fn build_camera_rig() -> LightingRig {
  // Key light: front-top-right (main illumination)
  let key = normalize(vec3<f32>(0.3, -0.4, 0.85));
  // Fill light: front-left (softer, fills shadows)
  let fill = normalize(vec3<f32>(-0.6, -0.3, 0.6));
  // Back light: behind and above (rim lighting)
  let back = normalize(vec3<f32>(0.0, 0.9, 0.35));
  // Left rim/kicker: side accent
  let rim_left = normalize(vec3<f32>(-0.85, 0.2, 0.4));
  // Right rim/kicker: side accent
  let rim_right = normalize(vec3<f32>(0.85, 0.2, 0.4));
  // Bottom bounce: subtle upward fill
  let bottom = normalize(vec3<f32>(0.0, 0.1, -0.95));
  // Top soft light: overall ambient direction
  let top = normalize(vec3<f32>(0.0, 0.0, 1.0));
  
  return LightingRig(key, fill, back, rim_left, rim_right, bottom, top);
}

fn lambert(N: vec3<f32>, L: vec3<f32>) -> f32 {
  return max(dot(N, L), 0.0);
}

// Soft wrap lighting for smoother falloff
fn wrap_lambert(N: vec3<f32>, L: vec3<f32>, wrap: f32) -> f32 {
  let d = dot(N, L);
  return max((d + wrap) / (1.0 + wrap), 0.0);
}

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) col: vec3<f32>,
  @location(1) n_cam: vec3<f32>,
  @location(2) world_pos: vec3<f32>,
  @location(3) is_ground: f32,
  @location(4) is_background: f32,
};

fn gradient_color(height_ratio: f32) -> vec3<f32> {
  let t = clamp(height_ratio, 0.0, 1.0);
  if (t <= 0.5) {
    let local = smoothstep(0.0, 0.5, t);
    return mix(uC1.xyz, uC2.xyz, local);
  }
  let local = smoothstep(0.5, 1.0, t);
  return mix(uC2.xyz, uC3.xyz, local);
}

fn shade_color(base: vec3<f32>, n_world: vec3<f32>, view_dir: vec3<f32>) -> vec3<f32> {
  let N = safe_normalize(n_world);
  let V = safe_normalize(view_dir);
  let tuning = lighting_tuning();
  let cam = camera_basis();
  let rig = build_camera_rig();
  let N_cam = safe_normalize(world_to_camera(N, cam));
  let V_cam = safe_normalize(world_to_camera(V, cam));

  // Enhanced ambient with hemisphere lighting (sky/ground gradient)
  let sky_color = vec3<f32>(0.85, 0.90, 1.0);  // Soft blue sky
  let ground_color = vec3<f32>(0.4, 0.35, 0.3); // Warm ground bounce
  let hemi_blend = N_cam.z * 0.5 + 0.5; // Remap -1..1 to 0..1
  let hemisphere_ambient = mix(ground_color, sky_color, hemi_blend);
  let ambient_strength = 0.08 + tuning.ambient * 0.35;
  let ambient_term = hemisphere_ambient * ambient_strength;

  // Multi-light diffuse with wrap lighting for softer shadows
  var diffuse = vec3<f32>(0.0, 0.0, 0.0);
  
  // Key light - main directional, warm tint
  let key_intensity = wrap_lambert(N_cam, rig.key, 0.15);
  diffuse += vec3<f32>(1.0, 0.98, 0.95) * key_intensity * 0.55;
  
  // Fill light - soft counter to key, slightly cool
  let fill_intensity = wrap_lambert(N_cam, rig.fill, 0.25);
  diffuse += vec3<f32>(0.92, 0.95, 1.0) * fill_intensity * 0.35;
  
  // Back light - rim/backlight effect
  let back_intensity = wrap_lambert(N_cam, rig.back, 0.3);
  diffuse += vec3<f32>(1.0, 0.92, 0.85) * back_intensity * 0.22;
  
  // Rim/kicker lights - edge definition from sides
  let rim_left_intensity = lambert(N_cam, rig.rim_left);
  let rim_right_intensity = lambert(N_cam, rig.rim_right);
  diffuse += vec3<f32>(1.0, 1.0, 1.0) * rim_left_intensity * 0.28;
  diffuse += vec3<f32>(1.0, 1.0, 1.0) * rim_right_intensity * 0.28;
  
  // Top and bottom lights
  let top_intensity = lambert(N_cam, rig.top);
  let bottom_intensity = lambert(N_cam, rig.bottom);
  diffuse += vec3<f32>(0.95, 0.98, 1.0) * top_intensity * 0.18;
  diffuse += vec3<f32>(1.0, 0.95, 0.90) * bottom_intensity * 0.15;
  
  diffuse *= 0.4 + tuning.diffuse * 0.85;

  // Enhanced specular with GGX-style distribution
  let spec_power = spec_power_from_roughness(tuning.roughness);
  let spec_power_tight = spec_power * 1.5; // Tighter highlights for key
  
  var specular = 0.0;
  // Key light - primary specular highlight
  specular += phong_specular(N_cam, V_cam, rig.key, spec_power_tight) * 1.4;
  // Fill light - softer secondary highlight
  specular += phong_specular(N_cam, V_cam, rig.fill, spec_power * 0.7) * 0.65;
  // Rim/kicker lights - sharp edge highlights
  specular += phong_specular(N_cam, V_cam, rig.rim_left, spec_power * 1.3) * 1.1;
  specular += phong_specular(N_cam, V_cam, rig.rim_right, spec_power * 1.3) * 1.1;
  // Back light - subtle rim glint
  specular += phong_specular(N_cam, V_cam, rig.back, spec_power * 0.9) * 0.5;
  specular *= tuning.specular;

  // Enhanced Fresnel with Schlick approximation
  let NdotV = max(dot(N_cam, V_cam), 0.0);
  let fresnel_base = 0.04; // Dielectric F0
  let fresnel = fresnel_base + (1.0 - fresnel_base) * pow(1.0 - NdotV, 5.0);
  let fresnel_term = tuning.fresnel * fresnel * 0.8;

  // Multi-directional rim lighting for silhouette definition
  let rim_key = pow(max(1.0 - lambert(N_cam, rig.key), 0.0), 2.5);
  let rim_fill = pow(max(1.0 - lambert(N_cam, rig.fill), 0.0), 3.0);
  let rim_back_effect = pow(max(1.0 - dot(N_cam, V_cam), 0.0), 3.5);
  let rim_combined = (rim_key * 0.35 + rim_fill * 0.25 + rim_back_effect * 0.4);
  let rim_color = vec3<f32>(0.9, 0.95, 1.0) * rim_combined;

  // Subsurface scattering approximation for organic materials
  let sss_intensity = wrap_lambert(N_cam, -V_cam, 0.6) * 0.08;
  let sss_color = base * vec3<f32>(1.2, 1.0, 0.9) * sss_intensity;

  // Combine all lighting components
  let lit_diffuse = base * (ambient_term + diffuse);
  let spec_color = vec3<f32>(0.97, 0.98, 1.0) * specular * 0.5;
  let combined = lit_diffuse + spec_color + rim_color * 0.25 + sss_color + fresnel_term * 0.15;
  
  return clamp(combined, vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(2.0, 2.0, 2.0));
}

fn ground_plane(vid: u32) -> vec4<f32> {
  let corner = i32(vid) % 6;
  var u: f32;
  var v: f32;
  if (corner == 0) { u = -1.0; v = -1.0; }
  else if (corner == 1) { u = -1.0; v =  1.0; }
  else if (corner == 2) { u =  1.0; v = -1.0; }
  else if (corner == 3) { u =  1.0; v = -1.0; }
  else if (corner == 4) { u = -1.0; v =  1.0; }
  else { u =  1.0; v =  1.0; }
  let H = getf(0u);
  let baseRadius = max(getf(1u), getf(2u));
  let sceneRadius = getf(33u);
  let scale = max(max(baseRadius, sceneRadius), 1.0) * 2.4;
  let world = vec4<f32>(u * scale, v * scale, -0.5 * H, 1.0);
  return world;
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  // First 3 vertices: Fullscreen Quad for Background Gradient
  if (vid < 3u) {
    var out: VSOut;
    // Huge triangle covering the screen: (-1,-1), (3,-1), (-1,3)
    var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    out.pos = vec4<f32>(pos[vid], 0.99, 1.0); // Far depth
    out.col = vec3<f32>(0.0);
    out.n_cam = vec3<f32>(0.0);
    // Pass normalized Screen UV (0..1) in world_pos.xy
    out.world_pos = vec3<f32>((pos[vid].x + 1.0) * 0.5, (pos[vid].y + 1.0) * 0.5, 0.0);
    out.is_ground = 0.0;
    out.is_background = 1.0;
    return out;
  }

  // Next 6 vertices (3-8): Ground Plane
  if (vid < 9u) {
    var out: VSOut;
    let ground_world = ground_plane(vid - 3u);
    out.pos = vp_matrix() * ground_world;
    out.col = vec3<f32>(0.95, 0.95, 0.95);
    out.is_ground = 1.0;
    out.is_background = 0.0;
    out.n_cam = vec3<f32>(0.0, 0.0, 1.0);
    out.world_pos = ground_world.xyz;
    return out;
  }

  // Remaining vertices: Pot Mesh
  let local_vid = vid - 9u;

  let cells_x = max(i32(getf(16u)), 1);
  let cells_outer_y = max(i32(getf(17u)), 1);
  let inner_y = max(i32(getf(27u)), 1);
  let bottom_rings = max(i32(getf(28u)), 2);
  let rim_rings = max(i32(getf(30u)), 1);

  let cells_outer = cells_x * cells_outer_y;
  let cells_inner = cells_x * inner_y;
  let cells_bottom_top = cells_x * bottom_rings;
  let cells_bottom_under = cells_x * bottom_rings;
  let cells_rim = cells_x * rim_rings;
  let cells_drain = cells_x * bottom_rings; // Drain cylinder uses same ring count as bottom

  let verts_per_cell = 6;
  let cell = i32(local_vid) / verts_per_cell;
  let corner = i32(local_vid) % verts_per_cell;

  var segment: u32 = 0u;
  var local_cell = cell;
  var seg_cells_y = cells_outer_y;

  if (local_cell >= cells_outer) {
    local_cell -= cells_outer;
    segment = 1u;
    seg_cells_y = inner_y;
    if (local_cell >= cells_inner) {
      local_cell -= cells_inner;
      segment = 2u;
      seg_cells_y = bottom_rings;
      if (local_cell >= cells_bottom_top) {
        local_cell -= cells_bottom_top;
        segment = 3u;
        seg_cells_y = bottom_rings;
        if (local_cell >= cells_bottom_under) {
          local_cell -= cells_bottom_under;
          segment = 4u;
          seg_cells_y = rim_rings;
          if (local_cell >= cells_rim) {
            local_cell -= cells_rim;
            segment = 5u;
            seg_cells_y = bottom_rings; // Drain cylinder height rings
          }
        }
      }
    }
  }

  // Check if inner surface should be hidden
  let showInner = getf(SHOW_INNER_OFFSET) >= 0.5;
  if (segment == 1u && !showInner) {
    // Move inner surface vertices off-screen (degenerate triangle)
    var out: VSOut;
    out.pos = vec4<f32>(0.0, 0.0, -2.0, 1.0); // Behind near plane
    out.col = vec3<f32>(0.0, 0.0, 0.0);
    out.is_ground = 0.0;
    out.is_background = 0.0;
    out.n_cam = vec3<f32>(0.0, 0.0, 1.0);
    out.world_pos = vec3<f32>(0.0, 0.0, 0.0);
    return out;
  }

  let cx = local_cell % cells_x;
  let cy = local_cell / cells_x;
  let denom_x = f32(max(cells_x, 1));
  let denom_y = f32(max(seg_cells_y, 1));
  let u0 = f32(cx) / denom_x;
  let v0 = f32(cy) / denom_y;
  let u1 = f32(cx + 1) / denom_x;
  let v1 = f32(cy + 1) / denom_y;

  var u: f32;
  var v: f32;
  if (corner == 0) { u = u0; v = v0; }
  else if (corner == 1) { u = u0; v = v1; }
  else if (corner == 2) { u = u1; v = v0; }
  else if (corner == 3) { u = u1; v = v0; }
  else if (corner == 4) { u = u0; v = v1; }
  else { u = u1; v = v1; }

  let p = surface_point(segment, u, v);
  let H = getf(0u);
  let p_center = vec3<f32>(p.x, p.y, p.z - 0.5 * H);
  let world_centered = vec4<f32>(p_center, 1.0);

  let du = 1.0 / denom_x;
  let dv = 1.0 / denom_y;
  let n_local = surface_normal(segment, u, v, du, dv);

  let cameraEye = vec3<f32>(
    getf(CAMERA_EYE_OFFSET + 0u),
    getf(CAMERA_EYE_OFFSET + 1u),
    getf(CAMERA_EYE_OFFSET + 2u)
  );
  let view_dir = cameraEye - world_centered.xyz;
  let height_ratio = clamp(p.z / max(H, 1e-4), 0.0, 1.0);
  let base = gradient_color(height_ratio);
  let col = shade_color(base, n_local, view_dir);

  var out: VSOut;
  out.pos = vp_matrix() * world_centered;
  out.col = col;
  out.is_ground = 0.0;
  out.is_background = 0.0;
  out.n_cam = n_local;
  out.world_pos = world_centered.xyz;
  return out;
}

@fragment
fn fs_main(@location(0) col: vec3<f32>, @location(1) _n_cam: vec3<f32>, @location(2) world_pos: vec3<f32>, @location(3) is_ground: f32, @location(4) is_background: f32) -> @location(0) vec4<f32> {
  if (is_background > 0.5) {
    // Gradient Background
    // Mapping: world_pos.xy contains normalized screen UV (0..1)
    let uv = world_pos.xy;
    let angle = uBg1.w; // Angle in radians passed from CPU
    
    // Rotate UV around center (0.5, 0.5)
    let center = vec2<f32>(0.5, 0.5);
    let centered = uv - center;
    let s = sin(-angle); // Negative for intuitive CW rotation
    let c = cos(-angle);
    let rotated = vec2<f32>(
      centered.x * c - centered.y * s,
      centered.x * s + centered.y * c
    );
    
    let t = clamp(rotated.y + 0.5, 0.0, 1.0);
    
    // Multi-stop gradient: uC1 (bottom) -> uC2 (middle) -> uC3 (top)
    // We can assume uC2 is the midpoint.
    // mix(uC1, uC2, t*2) if t < 0.5
    // mix(uC2, uC3, (t-0.5)*2) if t >= 0.5
    
    var finalCol: vec3<f32>;
    if (t <= 0.5) {
      let local = smoothstep(0.0, 0.5, t); // Smooth transition
      finalCol = mix(uBg1.xyz, uBg2.xyz, local);
    } else {
      let local = smoothstep(0.5, 1.0, t);
      finalCol = mix(uBg2.xyz, uBg3.xyz, local);
    }
    
    
    // Optional dithering to prevent banding could go here
    return vec4<f32>(finalCol, 1.0);
  }
  if (getf(18u) >= 0.5) {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  }
  var safe = vec3<f32>(
    clamp(col.x, 0.03, 1.8),
    clamp(col.y, 0.03, 1.8),
    clamp(col.z, 0.03, 1.8)
  );
  let gridEnabled = getf(GRID_FLAG_OFFSET) >= 0.5;
  if (gridEnabled && is_ground >= 0.5) {
    let cameraEye = vec3<f32>(
      getf(CAMERA_EYE_OFFSET + 0u),
      getf(CAMERA_EYE_OFFSET + 1u),
      getf(CAMERA_EYE_OFFSET + 2u)
    );
    let cameraDistance = max(length(cameraEye), 1.0);
    var gridSize = 0.0;
    if (cameraDistance < 200.0) {
      gridSize = 10.0;
    } else if (cameraDistance < 400.0) {
      gridSize = 25.0;
    } else {
      gridSize = 50.0;
    }
    let zoomScale = clamp(cameraDistance / 160.0, 0.5, 3.5);
    let H = getf(0u);
    let groundZ = -0.5 * H;
    let zDiff = abs(world_pos.z - groundZ);
    if (zDiff < (max(H * 0.01, 0.5))) {
      let fx = fract(world_pos.x / gridSize);
      let fz = fract(world_pos.y / gridSize);
      let cellDistX = min(fx, 1.0 - fx);
      let cellDistY = min(fz, 1.0 - fz);
      let targetThicknessMm = 0.25 * zoomScale;
      let minorThreshold = clamp(targetThicknessMm, 0.12, 1.2);
      let majorThreshold = clamp(targetThicknessMm * 2.2, minorThreshold + 0.2, 3.0);
      let cellDistX_mm = cellDistX * gridSize;
      let cellDistY_mm = cellDistY * gridSize;
      let minorSignalX = clamp(1.0 - cellDistX_mm / minorThreshold, 0.0, 1.0);
      let minorSignalY = clamp(1.0 - cellDistY_mm / minorThreshold, 0.0, 1.0);
      let minorSignal = max(minorSignalX, minorSignalY);
      let majorStep : i32 = 5;
      var majorSignalX: f32 = 0.0;
      var majorSignalY: f32 = 0.0;
      let ratioX = world_pos.x / gridSize;
      let ratioY = world_pos.y / gridSize;
      let majorIndexX = i32(floor(ratioX + 0.5));
      let majorIndexY = i32(floor(ratioY + 0.5));
      if ((majorIndexX % majorStep) == 0) {
        majorSignalX = clamp(1.0 - cellDistX_mm / majorThreshold, 0.0, 1.0);
      }
      if ((majorIndexY % majorStep) == 0) {
        majorSignalY = clamp(1.0 - cellDistY_mm / majorThreshold, 0.0, 1.0);
      }
      let majorSignal = max(majorSignalX, majorSignalY);
      let axisThreshold = clamp(targetThicknessMm * 1.35, 0.12, 1.5);
      var axisSignal: f32 = 0.0;
      axisSignal = max(axisSignal, clamp(1.0 - abs(world_pos.x) / axisThreshold, 0.0, 1.0));
      axisSignal = max(axisSignal, clamp(1.0 - abs(world_pos.y) / axisThreshold, 0.0, 1.0));
      let lineColor = vec3<f32>(0.72, 0.80, 0.93);
      let majorColor = vec3<f32>(0.46, 0.56, 0.70);
      let axisColor = vec3<f32>(1.0, 0.65, 0.35);
      var highlightColor = lineColor;
      var highlightWeight = minorSignal * 0.8;
      let majorWeight = majorSignal * 1.1;
      if (majorWeight > highlightWeight) {
        highlightColor = majorColor;
        highlightWeight = majorWeight;
      }
      let axisWeight = axisSignal * 1.6;
      if (axisWeight > highlightWeight) {
        highlightColor = axisColor;
        highlightWeight = axisWeight;
      }
      let composite = clamp(highlightWeight, 0.0, 1.0);
      if (composite <= 1e-3) {
        discard;
      }
      let intensity = mix(0.15, 0.75, composite);
      let finalColor = highlightColor * intensity;
      return vec4<f32>(finalColor, 1.0);
    }
    discard;
  }
  if (is_ground >= 0.5) {
    discard;
  }
  // Non-ground fragments return the usual pot color.
  return vec4<f32>(safe, 1.0);
}

// ============================================================================
// Wireframe Shader Entry Points
// ============================================================================

struct WireVSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) col: vec3<f32>,
};

// Wireframe vertex shader - directly copies vs_main logic but for line-list
// The solid mesh topology is triangle-list with vertices organized as:
// - Vertices 0-5: ground plane (2 triangles)
// - Then cells with 6 vertices each (corners 0,1,2,3,4,5)
//   - Triangle 1: corners 0,1,2
//   - Triangle 2: corners 3,4,5
// For wireframe we want edges: 0-1, 1-2, 2-0, 3-4, 4-5, 5-3
// That's 6 edges * 2 verts = 12 line verts per 6 solid verts
// So wireframe_vid = solid_vid * 2
@vertex
fn vs_wireframe(@builtin(vertex_index) vid: u32) -> WireVSOut {
  // We added 3 vertices for the background FSQ to the main draw call.
  // The wireframe shader must ignore these and shift subsequent indices back.
  if (vid < 3u) {
    var out: WireVSOut;
    out.pos = vec4<f32>(0.0); // Degenerate
    out.col = vec3<f32>(0.0);
    return out;
  }
  let shifted_vid = vid - 3u;

  // Wireframe draws 2 verts per solid vert (line-list topology)
  // Each solid triangle (3 verts) becomes 6 line verts (3 edges)
  // Each cell has 2 triangles = 6 solid verts = 12 line verts
  
  // Map wireframe vid to triangle edge endpoints
  // For each solid triangle, we draw 3 edges: v0-v1, v1-v2, v2-v0
  // That's 6 line verts per triangle: [v0,v1, v1,v2, v2,v0]
  
  let solid_tri_vid = shifted_vid / 2u;  // Which solid vertex (as if triangle-list)
  let line_endpoint = shifted_vid % 2u;   // 0=start, 1=end of line segment
  
  // Within each triangle: vid%3 gives corner 0,1,2
  // Edge 0 (line verts 0,1): corner 0 -> corner 1
  // Edge 1 (line verts 2,3): corner 1 -> corner 2
  // Edge 2 (line verts 4,5): corner 2 -> corner 0
  let tri_corner = solid_tri_vid % 3u;  // 0, 1, or 2
  var solid_corner: u32;
  
  if (tri_corner == 0u) {
    // Edge from corner 0 to corner 1
    solid_corner = select(0u, 1u, line_endpoint == 1u);
  } else if (tri_corner == 1u) {
    // Edge from corner 1 to corner 2
    solid_corner = select(1u, 2u, line_endpoint == 1u);
  } else {
    // Edge from corner 2 to corner 0
    solid_corner = select(2u, 0u, line_endpoint == 1u);
  }
  
  // Now convert from tri-based corner (0,1,2) to cell-based corner (0-5)
  // Solid mesh uses: corner 0,1,2 for tri 0 and corner 3,4,5 for tri 1
  // But corners 0,1,2 and 3,4,5 map to same UV pattern in the cell
  let tri_in_cell = (solid_tri_vid / 3u) % 2u;  // Which triangle in cell (0 or 1)
  if (tri_in_cell == 1u) {
    solid_corner += 3u;  // Use corners 3,4,5 for second triangle
  }
  
  // Calculate solid mesh vertex index
  let cell_idx = solid_tri_vid / 6u;  // Each cell = 2 triangles = 6 verts
  let solid_vid = cell_idx * 6u + solid_corner;
  
  // Hide ground plane wireframe (first cell = vids 0-5)
  if (solid_vid < 6u) {
    var out: WireVSOut;
    out.pos = vec4<f32>(0.0, 0.0, -2.0, 1.0);
    out.col = vec3<f32>(0.0);
    return out;
  }
  
  let local_vid = solid_vid - 6u;

  let cells_x = max(i32(getf(16u)), 1);
  let cells_outer_y = max(i32(getf(17u)), 1);
  let inner_y = max(i32(getf(27u)), 1);
  let bottom_rings = max(i32(getf(28u)), 2);
  let rim_rings = max(i32(getf(30u)), 1);

  let cells_outer = cells_x * cells_outer_y;
  let cells_inner = cells_x * inner_y;
  let cells_bottom_top = cells_x * bottom_rings;
  let cells_bottom_under = cells_x * bottom_rings;

  let verts_per_cell = 6;
  let cell = i32(local_vid) / verts_per_cell;

  var segment: u32 = 0u;
  var local_cell = cell;
  var seg_cells_y = cells_outer_y;

  if (local_cell >= cells_outer) {
    local_cell -= cells_outer;
    segment = 1u;
    seg_cells_y = inner_y;
    if (local_cell >= cells_inner) {
      local_cell -= cells_inner;
      segment = 2u;
      seg_cells_y = bottom_rings;
      if (local_cell >= cells_bottom_top) {
        local_cell -= cells_bottom_top;
        segment = 3u;
        seg_cells_y = bottom_rings;
        if (local_cell >= cells_bottom_under) {
          local_cell -= cells_bottom_under;
          segment = 4u;
          seg_cells_y = rim_rings;
        }
      }
    }
  }

  // Check if inner surface should be hidden
  let showInner = getf(SHOW_INNER_OFFSET) >= 0.5;
  if (segment == 1u && !showInner) {
    var out: WireVSOut;
    out.pos = vec4<f32>(0.0, 0.0, -2.0, 1.0);
    out.col = vec3<f32>(0.0);
    return out;
  }

  let cx = local_cell % cells_x;
  let cy = local_cell / cells_x;
  let denom_x = f32(max(cells_x, 1));
  let denom_y = f32(max(seg_cells_y, 1));
  let u0 = f32(cx) / denom_x;
  let v0 = f32(cy) / denom_y;
  let u1 = f32(cx + 1) / denom_x;
  let v1 = f32(cy + 1) / denom_y;

  var u: f32;
  var v: f32;
  // Map solid_corner to UV coordinates (same mapping as vs_main)
  if (solid_corner == 0u) { u = u0; v = v0; }
  else if (solid_corner == 1u) { u = u0; v = v1; }
  else if (solid_corner == 2u) { u = u1; v = v0; }
  else if (solid_corner == 3u) { u = u1; v = v0; }
  else if (solid_corner == 4u) { u = u0; v = v1; }
  else { u = u1; v = v1; }

  let p = surface_point(segment, u, v);
  let H = getf(0u);
  let p_center = vec3<f32>(p.x, p.y, p.z - 0.5 * H);
  let world_centered = vec4<f32>(p_center, 1.0);

  var out: WireVSOut;
  let projected = vp_matrix() * world_centered;
  // Bias z toward camera to draw on top of solid surface
  out.pos = vec4<f32>(projected.xy, projected.z - 0.002 * projected.w, projected.w);
  // White wireframe for visibility
  out.col = vec3<f32>(1.0, 1.0, 1.0);
  return out;
}

@fragment
fn fs_wireframe(@location(0) col: vec3<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(col, 1.0);
}
