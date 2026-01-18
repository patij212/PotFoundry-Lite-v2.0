// Gothic Arches V2 - Fix EPS - HMR Trigger
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
const PI = 3.14159265359;
const PI_OVER_2 = 1.57079632679;
const BOTTOM_Z_OFFSET = 1e-3;
const STYLE_PARAM_CAPACITY : u32 = 48u;

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

// ============================================================================
// Gothic Arches (Architectural Rewrite)
// ============================================================================
// ============================================================================
// SDF Helper Functions
// ============================================================================



fn sat(x: f32) -> f32 { return min(1.0, max(0.0, x)); }

fn smoothstep2(e0: f32, e1: f32, x: f32) -> f32 {
  let t = sat((x - e0) / max(1e-6, e1 - e0));
  return t * t * (3.0 - 2.0 * t);
}

fn ridge(d: f32, w_in: f32, sharp: f32) -> f32 {
  let w = max(1e-6, w_in);
  return pow(max(0.0, 1.0 - abs(d) / w), sharp);
}

fn ridge_sin(phi: f32, w_in: f32, sharp: f32) -> f32 {
  let w = max(1e-6, w_in);
  return pow(max(0.0, 1.0 - abs(sin(phi)) / w), sharp);
}

// ============================================================================
// Gothic Arches (Architectural Rewrite - V2)
// ============================================================================
fn gothic_arches_radius(theta: f32, t_in: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let N      = max(1.0, floor(style_param(0u) + 0.5));
  let amp    = style_param(1u);

  let p      = max(0.25, style_param(2u));
  let diamond  = sat(style_param(3u));
  let xTracery = sat(style_param(4u));

  let z0     = sat(style_param(5u));
  let zh     = sat(style_param(6u)) * (1.0 - z0);

  let wZ     = max(1e-6, style_param(7u));
  let wX     = max(1e-6, style_param(8u));
  let sharp  = max(1.0, style_param(9u));

  let bands  = sat(style_param(10u));
  let bandW  = max(1e-6, style_param(11u));

  let t = sat(t_in);

  // seam-safe bay coordinate
  let a = theta * N;
  let xSigned = cos(0.5 * a);
  let xAbs = abs(xSigned);
  let x01  = sat(0.5 * (xSigned + 1.0));

  let archApex = z0 + zh;
  let topStart = z0 + 0.65 * (archApex - z0);
  let blendW   = max(0.015, 1.25 * bandW);

  let topMask = smoothstep2(topStart - blendW, topStart + blendW, t);
  let botMask = 1.0 - topMask;

  // LOWER TIER
  let archY = pow(max(0.0, 1.0 - pow(xAbs, p)), 1.0 / p);
  let archZ = z0 + (archApex - z0) * archY;

  let gateW = 2.0 * wZ;
  let gate = sat((t - z0) / gateW) * sat((archZ - t) / gateW);

  let ribArch = ridge(t - archZ, wZ, sharp);
  let colEdge = pow(max(0.0, 1.0 - (1.0 - xAbs) / wX), sharp);
  let mullion = pow(max(0.0, 1.0 - xAbs / (0.65 * wX)), sharp);

  let panel = gate * pow(max(0.0, 1.0 - xAbs / 0.95), 2.0);
  let recess: f32 = 0.25;

  let denom = max(1e-6, archZ - z0);
  let s = sat((t - z0) / denom);
  let wT = 0.55 * wX;
  let xDiag = gate * (ridge(s - x01, wT, sharp) + ridge(s - (1.0 - x01), wT, sharp));

  let lower =
    (ribArch + 0.70 * colEdge * gate + 0.30 * mullion * gate + xTracery * 0.55 * xDiag)
    - recess * panel;

  // UPPER TIER
  let v = sat((t - topStart) / max(1e-6, 1.0 - topStart));
  let rows = 0.9 + 1.6 * diamond;
  let wL = max(0.05, 2.0 * wZ);

  let phi1 = PI * (rows * v - x01);
  let phi2 = PI * (rows * v + x01);
  let lattice = ridge_sin(phi1, wL, sharp) + ridge_sin(phi2, wL, sharp);

  let cell = pow(abs(sin(phi1)) * abs(sin(phi2)), 2.0);
  let motif = 0.25 * diamond * cell * pow(abs(sin(TAU * x01)) * abs(sin(TAU * v)), 2.0);

  let bw = 1.8 * bandW;
  let bandBase = ridge(t - 0.0, bw, sharp);
  let bandMid  = ridge(t - topStart, bw, sharp);
  let bandRim  = ridge(t - 1.0, bw, sharp);

  let upper =
    diamond * (0.95 * lattice + 0.35 * motif) +
    bands * (0.85 * bandMid + 0.35 * bandRim);

  let pattern = botMask * lower + topMask * upper + bands * 0.25 * bandBase;
  return r0 + amp * pattern;
}

// ============================================================================
// Wave Interference - Moire patterns from wave superposition
// ============================================================================

// Helper function to compute wave interference pattern at arbitrary theta
fn wi_compute_pattern(th: f32, t_val: f32, feature_count: f32, moire_strength: f32, 
                       pattern_style: f32, helix_pitch: f32, pitch_mismatch: f32,
                       domain_warp: f32, warp_scale: f32, contour_density: f32, 
                       ridge_contrast: f32, phase: f32) -> f32 {
  
  // SEAM FIX: All theta-dependent frequencies MUST be integers for natural periodicity
  // This ensures sin(theta * N) wraps perfectly around TAU
  
  // Base frequency: round to integer (6-36 based on feature_count 0-1)
  let base_freq_raw = 6.0 + feature_count * 30.0;
  let base_freq = floor(base_freq_raw + 0.5); // Round to nearest integer
  
  // Secondary frequency: also round to integer, with slight offset for moire
  let sec_offset = floor(pitch_mismatch * 4.0 + 0.5) - 2.0; // -2 to +2 integer offset
  let secondary_freq = base_freq + sec_offset;
  
  // Domain warp frequency: must be integer
  let warp_freq = floor(4.0 + 8.0 * warp_scale + 0.5); // 4-12 integer
  let warp_mag = domain_warp * 0.3; // Reduced magnitude to minimize seam impact
  let warp = warp_mag * sin(th * warp_freq + t_val * 5.0);
  let warped_theta = th + warp;

  // Coordinate setup - helical coordinate system
  let spiral_v = t_val * (1.0 + helix_pitch * 4.0);
  
  // Phases - use phase for animation, not theta disruption
  let p1 = warped_theta * base_freq + spiral_v * TAU + phase * TAU;
  let p2 = warped_theta * secondary_freq + spiral_v * TAU * 1.1 + phase * TAU + 1.7;

  // Wave Layers
  let w1 = sin(p1);
  let w2 = sin(p2);

  // Interference
  let linear = 0.5 * (w1 + w2);
  let prod = w1 * w2;
  let raw_pattern = (1.0 - moire_strength) * linear + moire_strength * prod;

  // Pattern Style modulation - also use integer frequency
  let style_freq = 3.0; // Already integer
  let style_mod = pattern_style * cos(warped_theta * style_freq + t_val * 10.0);
  let styled_pattern = raw_pattern + style_mod * 0.2;

  // Ridge processing - detail frequency must be integer
  var n = 0.5 + 0.5 * styled_pattern;
  let detail_freq = floor(base_freq * 2.5 + 0.5); // Round to integer
  let detail = contour_density * 0.15 * sin(warped_theta * detail_freq + t_val * 20.0);
  n = n + detail;

  let contrast_exp = 0.5 + ridge_contrast * 3.0;
  return pow(clamp(n, 0.0, 1.0), contrast_exp);
}

fn wave_interference_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let feature_count = style_param(0u);
  let relief_depth = style_param(1u);
  let contour_density = style_param(2u);
  let moire_strength = style_param(3u);
  let pattern_style = style_param(4u);
  let helix_pitch = style_param(5u);
  let pitch_mismatch = style_param(6u);
  let domain_warp = style_param(7u);
  let warp_scale = style_param(8u);
  let ridge_contrast = style_param(9u);
  let edge_fade = style_param(10u);
  let phase = style_param(11u);

  // SEAM FIX: With all theta-dependent frequencies rounded to integers,
  // the pattern naturally wraps at theta=TAU without any blending needed.
  // sin(theta * N) = sin((theta + TAU) * N) when N is an integer.

  // Compute pattern at current theta - no blending required
  var final_ridge = wi_compute_pattern(theta, t, feature_count, moire_strength, 
                                        pattern_style, helix_pitch, pitch_mismatch,
                                        domain_warp, warp_scale, contour_density, 
                                        ridge_contrast, phase);

  // Edge Fading (top/bottom)
  if (edge_fade > 0.01) {
    let d_edge = min(t, 1.0 - t);
    let fade_zone = edge_fade * 0.3;
    var f = 1.0;
    if (d_edge < fade_zone) {
      f = d_edge / max(0.001, fade_zone);
    }
    final_ridge = final_ridge * f;
  }

  // Apply relief depth
  let displacement = (final_ridge - 0.4) * relief_depth;

  return max(0.1, r0 + displacement);
}

// ============================================================================
// Ripple Interference - Physics-based wave interference from multiple sources
// Creates true interference patterns like ripples in water from multiple stones
// ============================================================================
fn ripple_interference_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  
  // Parameters
  let source_count_raw = style_param(0u);        // 0: Number of wave sources (2-8)
  let wave_freq_raw = style_param(1u);           // 1: Wave frequency (4-24)
  let relief_depth = style_param(2u);            // 2: Relief depth in mm
  let phase = style_param(3u);                   // 3: Animation phase
  let source_height = style_param(4u);           // 4: Source height position (0-1)
  let decay = style_param(5u);                   // 5: Amplitude decay with distance
  let interference_mode = style_param(6u);       // 6: Interference type (0=add, 1=multiply)
  let rotation = style_param(7u);                // 7: Source rotation offset
  
  // Round to integers for seam-free periodicity
  let source_count = max(floor(source_count_raw + 0.5), 2.0);
  let wave_freq = floor(wave_freq_raw + 0.5);
  
  // Normalized coordinates on pot surface
  let u = theta / TAU; // 0..1 around the pot
  let v = t;           // 0..1 up the pot
  
  // Sum waves from all point sources
  var total_wave = 0.0;
  
  for (var i = 0u; i < 8u; i++) { // Max 8 sources
    if (f32(i) >= source_count) { break; }
    
    // Source position: distributed evenly around circumference
    let angle_fraction = (f32(i) / source_count) + rotation;
    let source_u = angle_fraction - floor(angle_fraction); // Wrap to 0..1
    let source_v = source_height;
    
    // Calculate distance from current point to source
    // Handle wrapping around the pot (cylindrical topology)
    var du = u - source_u;
    if (du > 0.5) { du = du - 1.0; }
    if (du < -0.5) { du = du + 1.0; }
    let dv = v - source_v;
    
    // Euclidean distance on unwrapped surface
    let dist = sqrt(du * du + dv * dv);
    
    // Amplitude decay with distance
    let amp_decay = 1.0 / max(1.0 + dist * decay * 5.0, 0.1);
    
    // Concentric wave from this source
    // Using integer frequency ensures periodicity
    let wave_phase = dist * wave_freq * TAU + phase * TAU;
    let wave = sin(wave_phase) * amp_decay;
    
    total_wave += wave;
  }
  
  // Normalize by source count
  total_wave = total_wave / source_count;
  
  // Optional: multiplicative interference mode for more dramatic patterns
  if (interference_mode > 0.5) {
    // Transform to 0..1 range, apply power, transform back
    let norm = 0.5 + 0.5 * total_wave;
    let powered = pow(norm, 2.0);
    total_wave = 2.0 * powered - 1.0;
  }
  
  // Apply relief depth
  let displacement = total_wave * relief_depth;
  
  return max(0.1, r0 + displacement);
}

// ============================================================================
// Crystalline - Faceted crystal surfaces
// ============================================================================
fn crystalline_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let facet_count = max(style_param(0u), 1.0);
  let facet_depth = style_param(1u);
  let sub_facets = max(style_param(2u), 1.0);
  let edge_sharpness = clamp(style_param(3u), 0.1, 10.0);  // Clamp to safe range
  let asymmetry = style_param(4u);
  let height_phase = style_param(5u);
  
  // Height-based phase shift
  let phase_shift = t * height_phase * TAU / facet_count;
  let adjusted_theta = theta + phase_shift;
  
  // Primary facet pattern (triangle wave)
  let facet_phase = (adjusted_theta * facet_count) % TAU;
  let triangle_wave = abs((facet_phase / TAU) * 2.0 - 1.0);
  // Clamp base to avoid pow(0, x) issues
  let facet_shape = pow(max(triangle_wave, 0.001), edge_sharpness);
  
  // Sub-facet detail
  let sub_phase = (adjusted_theta * facet_count * sub_facets) % TAU;
  let sub_shape = pow(max(abs(sin(sub_phase * 0.5)), 0.001), edge_sharpness * 0.5) * 0.3;
  
  // Asymmetry variation
  let asym_var = sin(theta * 17.0 + t * 23.0) * asymmetry;
  
  let modulation = 1.0 - facet_depth * facet_shape - facet_depth * 0.3 * sub_shape + asym_var;
  
  return r0 * clamp(modulation, 0.5, 2.0);
}

// ============================================================================
// Art Deco - 1920s geometric styling
// ============================================================================
fn art_deco_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let fan_count = max(style_param(0u), 1.0);
  let fan_spread = max(style_param(1u), 0.1);
  let step_count = max(style_param(2u), 1.0);
  let step_depth = style_param(3u);
  let chevron_amp = style_param(4u);
  let chevron_freq = style_param(5u);
  let blend = style_param(6u);
  
  // Sunburst fan pattern - clamp exponent to prevent overflow
  let fan_phase = (theta * fan_count) % TAU;
  let fan_exp = clamp(1.0 / fan_spread, 0.1, 10.0);
  let fan_ray = pow(max(abs(cos(fan_phase * 0.5)), 0.001), fan_exp);
  
  // Stepped tiers
  let step_phase = t * step_count;
  let step_local = step_phase - floor(step_phase);
  let step_edge = select(0.0, 1.0, step_local < 0.1 || step_local > 0.9);
  let step_factor = 1.0 - step_depth * step_edge;
  
  // Chevron pattern
  let chevron_phase = theta * chevron_freq + t * TAU * 2.0;
  let chevron = abs(sin(chevron_phase));
  
  // Blend patterns
  let fan_mod = 1.0 + 0.1 * (fan_ray - 0.5) * (1.0 - blend);
  let chevron_mod = chevron_amp * chevron * blend;
  
  return r0 * clamp(fan_mod * step_factor * (1.0 + chevron_mod), 0.5, 2.0);
}

// ============================================================================
// Dragon Scales - Overlapping scale patterns
// ============================================================================
fn dragon_scales_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let scale_rows = max(style_param(0u), 1.0);
  let scales_per_row = max(style_param(1u), 1.0);
  let scale_depth = style_param(2u);
  let overlap = clamp(style_param(3u), 0.0, 0.9);  // Clamp to avoid division issues
  let curvature = clamp(style_param(4u), 0.1, 5.0);  // Clamp to safe range
  let randomize = style_param(5u);
  let gradient = style_param(6u);
  
  // Current row position
  let row_phase = t * scale_rows;
  let row = floor(row_phase);
  let row_local = row_phase - row;
  
  // Stagger scales (brick pattern)
  let stagger_offset = select(0.0, 0.5 * TAU / scales_per_row, i32(row) % 2 == 1);
  let scale_theta = theta + stagger_offset;
  
  // Scale position
  let scale_phase = (scale_theta * scales_per_row) % TAU;
  let scale_local = scale_phase / TAU;
  
  // Curved scale shape
  let x_dist = abs(scale_local - 0.5) * 2.0;
  let y_dist = abs(row_local - overlap) / max(1.0 - overlap * 0.5, 0.1);
  let dist_from_center = sqrt(x_dist * x_dist + y_dist * y_dist);
  
  // Scale indent - ensure base is positive for pow
  let scale_shape = 1.0 - pow(max(1.0 - dist_from_center, 0.001), curvature);
  
  // Size gradient
  let size_mult = 1.0 + (t - 0.5) * (gradient - 1.0);
  
  // Random variation
  let rand_var = sin(theta * 13.0 + t * 19.0) * randomize;
  
  let modulation = 1.0 - scale_depth * scale_shape * size_mult + rand_var;
  
  return r0 * clamp(modulation, 0.5, 2.0);
}

// ============================================================================
// Bamboo Segments - Bamboo-inspired node patterns
// ============================================================================
fn bamboo_segments_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  let node_count = max(style_param(0u), 1.0);
  let node_width = max(style_param(1u), 0.02);  // Minimum to prevent exp overflow
  let prominence = style_param(2u);
  let striations = style_param(3u);
  let striation_depth = style_param(4u);
  let taper = style_param(5u);
  let asymmetry = style_param(6u);
  
  // Segment position
  let segment_phase = t * node_count;
  let segment = floor(segment_phase);
  let segment_local = segment_phase - segment;
  
  // Node ring: bulge at segment boundaries - clamp exp argument to prevent overflow
  let dist_from_node = min(segment_local, 1.0 - segment_local);
  let exp_arg = -clamp(dist_from_node * dist_from_node / (node_width * node_width * 2.0), 0.0, 50.0);
  let node_ring = exp(exp_arg);
  
  // Taper between nodes
  let taper_factor = 1.0 - taper * (1.0 - 4.0 * (segment_local - 0.5) * (segment_local - 0.5));
  
  // Vertical striations
  let striation_factor = striation_depth * sin(theta * striations);
  
  // Asymmetry variation
  let asym_var = sin(segment * 7.0 + theta * 3.0) * asymmetry * 0.5;
  
  // Combine with output clamp
  let modulation = taper_factor * (1.0 + prominence * node_ring) + striation_factor + asym_var;
  
  return r0 * clamp(modulation, 0.5, 2.0);
}

// ----------------------------------------------------------------------------
// Gyroid Manifold Style
// ----------------------------------------------------------------------------
fn style_gyroid_manifold(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) {
    return r0;
  }
  // 0: Scale
  // 1: Thickness
  // 2: Morph (0=Gyroid, 1=Schwarz P)
  // 3: Relief
  // 4: Twist (Unused, redundant with global twist)
  // 5: Z-Stretch
  // 6: Pulse Phase
  // 7: Edge Fade
  
  let scale = style_param(0u);
  let thickness = style_param(1u);
  let morph = style_param(2u);
  let relief = style_param(3u);
  let sharpness = style_param(4u); // Replaced hardcoded smooth edge
  let z_stretch = style_param(5u);
  let pulse = style_param(6u);
  let edge_fade = style_param(7u);
  let bias = style_param(8u); // Bias/Isovalue shift
  let curve = style_param(9u); // Relief profile power

  let scale_val = select(4.0, scale, scale > 0.0);
  let stretch_val = select(1.0, z_stretch, z_stretch > 0.0);
  let pulse_val = pulse;
  let fade_val = min(edge_fade, 0.49); // Clamp to prevent overlap
  let smooth_val = max(0.001, sharpness); // Avoid division by zero
  let curve_val = select(1.0, curve, curve > 0.0); // Safe curve value

  // Map to 3D TPMS domain
  // Use unwrapped cylinder mapping: x=phi*R, z=z*stretch
  let x = scale_val * cos(theta);
  let y = scale_val * sin(theta);
  let z_tpms = scale_val * t * stretch_val * 4.0 + pulse_val * TAU;
  
  let sx = sin(x); let cx = cos(x);
  let sy = sin(y); let cy = cos(y);
  let sz = sin(z_tpms); let cz = cos(z_tpms);

  // Gyroid approx: sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0
  let gyr = sx*cy + sy*cz + sz*cx;
  
  // Schwarz P approx: cos(x) + cos(y) + cos(z) = 0
  let sch = cx + cy + cz;
  
  // Blend
  var val = (1.0 - morph) * gyr + morph * sch;
  
  // Apply Bias (Isovalue shift)
  // This allows shifting the surface wall "in" or "out" relative to the centerline
  val = val + bias;
  
  // Create a signed distance field approximation
  // Inside wall: abs(val) < thickness
  // We want a smooth bump: 1.0 at center (val=0), 0.0 at wall (abs(val)=thickness)
  
  let d = abs(val);
  let th = thickness * 1.5;
  
  // Smooth relief: smoothstep from thickness down to 0
  // When d=0 (center), factor=1.0. When d=th, factor=0.0.
  // Using smoothstep gives nice continuous surface
  let shape_factor = 1.0 - smoothstep(0.0, th, d);
  
  // Edge Fading
  var fade_factor = 1.0;
  if (fade_val > 0.0) {
    // Smoothstep fade at bottom
    let b_fade = smoothstep(0.0, fade_val, t);
    // Smoothstep fade at top
    let t_fade = 1.0 - smoothstep(1.0 - fade_val, 1.0, t);
    fade_factor = b_fade * t_fade;
  }
  
  // Apply variable smoothing to the transition
  // Re-calculate shape_factor with control
  // Logic: d represents distance from "ideal center". Thickness is the wall boundary.
  // We want to fade from 1 (center) to 0 (outside) over a controllable range.
  // Let smooth be the transition width around 'th'.
  
  // This logic replaces the earlier shape_factor calculation
  // smoothstep(edge - w, edge, d) -> 0 to 1 transition
  // we want 1 inside, 0 outside.
  // smoothstep(th, th - smooth_val, d)
  
  let shape_raw = smoothstep(th, th - smooth_val * th, d);
  let final_shape = pow(shape_raw, curve_val);

  return r0 + relief * final_shape * fade_factor;
}

// ========================================================================
// VORONOI / CELLULAR NOISE
// ========================================================================

// 2D Hash for periodic noise
fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Periodic Cellular Noise (Worley/Voronoi)
// Returns vec3(F1, F2, CellID_Hash)
// uv: coordinates
// period: vec2(x_period, y_period)
// jitter: 0.0 (grid) to 1.0 (chaos)
fn periodic_cellular(uv: vec2<f32>, period: vec2<f32>, jitter: f32) -> vec3<f32> {
  let cell_id = floor(uv);
  let cell_uv = fract(uv);
  
  var f1 = 999.0;
  var f2 = 999.0;
  
  // Check 3x3 neighbor cells
  for (var y = -1.0; y <= 1.0; y = y + 1.0) {
    for (var x = -1.0; x <= 1.0; x = x + 1.0) {
      let neighbor = vec2<f32>(x, y);
      
      // Periodic wrapping for neighbor cell ID
      // If we are at cell 0 and check neighbor -1, we want cell (period-1)
      // The point position however is relative to current cell_uv
      
      let neighbor_id = cell_id + neighbor;
      
      // Wrap the ID for hashing to ensure periodicity
      // We use simple modulo logic: (id % period + period) % period
      let wrapped_id = vec2<f32>(
        (neighbor_id.x % period.x + period.x) % period.x,
        neighbor_id.y // Z is not periodic usually, but we can make it if needed. 
                      // For a pot, Y (Z-height) is not periodic, only X (theta).
                      // However, using infinite Z is fine. 
                      // Let's assume non-periodic Z for now, or just hash it normally.
                      // Actually, let's keep Z continuous (non-wrapping) for the pot height.
                      // But for the HASH, we just depend on the integer ID.
      );
      
      // If we want exact Wrapping around the cylinder:
      // X must wrap at period.x. Y does not need to wrap.
      // So wrapped_id.x is wrapped, wrapped_id.y is just neighbor_id.y
      
      let wrapped_hash_id = vec2<f32>(
         (neighbor_id.x % period.x + period.x) % period.x,
         neighbor_id.y
      );

      let point_hash = hash22(wrapped_hash_id);
      
      // Point position relative to current cell:
      // neighbor (offset) + jitter * hash - current_pixel_pos (cell_uv)
      // center = neighbor + jitter * sin(time + hash * 6.28) ... for animation
      // simple:
      let center = neighbor + point_hash * jitter;
      
      let diff = center - cell_uv;
      
      // Distance metric: Euclidean (Length)
      let dist = length(diff);
      
      if (dist < f1) {
        f2 = f1;
        f1 = dist;
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }
  
  return vec3<f32>(f1, f2, 0.0);
}

fn style_voronoi(theta: f32, t: f32, r0: f32) -> f32 {
  // Params:
  // 0: Scale
  // 1: Jitter
  // 2: Thickness
  // 3: Relief
  // 4: Morph (0=Bubbles, 1=Cells)
  // 5: Z-Stretch
  // 6: Pulse Phase
  // 7: Edge Fade
  
  let scale = style_param(0u);
  let jitter = style_param(1u);
  let thickness = style_param(2u);
  let relief = style_param(3u);
  let morph = style_param(4u);
  let z_stretch = style_param(5u);
  let pulse = style_param(6u);
  let edge_fade = style_param(7u);
  
  let scale_val = select(8.0, scale, scale > 0.0);
  let stretch_val = select(1.0, z_stretch, z_stretch > 0.0);
  
  // Map Cylinder to 2D Grid
  // u: [0, scale] wrapping
  // v: vertical
  
  let u = (theta / TAU) * scale_val;
  // Offset u by pulse to rotate
  let u_anim = u + pulse * scale_val; // Cycle through full scale
  
  let v = t * scale_val * stretch_val;
  
  let period = vec2<f32>(scale_val, 0.0); // Y is not periodic 0 means infinite/ignore in helper
  
  let noise = periodic_cellular(vec2<f32>(u_anim, v), period, jitter);
  let f1 = noise.x;
  let f2 = noise.y;
  
  // Voronoi Cells (Borders): F2 - F1
  // Bubbles (Centers): F1
  
  // Cell Pattern: simple borders are high
  // dist_to_border = (f2 - f1)
  // We want ridges at borders? Or indented borders?
  // User choice: usually Voronoi is a web. Web = High (Relief), Cells = Low.
  // So we want High where border is close (f2-f1 is small? No, f2-f1 is distance to border center approx?)
  // Actually, Voronoi Borders are where F1 ~= F2. So F2 - F1 ~= 0.
  // So val = F2 - F1. 0 at border, increments away.
  
  // 1. Voronoi Cells (Web):
  // We want 1.0 at border (val ~ 0), 0.0 at center.
  // let cell_sdf = f2 - f1;
  // let web = smoothstep(thickness, 0.0, cell_sdf);
  
  // 2. Bubbles (Worley):
  // We want 1.0 at center (f1=0), 0.0 at edge.
  // let bubble = 1.0 - f1;
  // or smoothstep(r, r-smooth, f1)
  
  let cell_sdf = f2 - f1;
  
  // Thickness defines the width of the web.
  // Normalize thickness somewhat?
  let th = thickness; // e.g. 0.1
  
  // Web: 1.0 when cell_sdf < th
  let web = 1.0 - smoothstep(0.0, th, cell_sdf);
  
  // Bubbles: 1.0 when f1 < th? No, usually just inverted F1
  // Let's make bubbles "solid" spheres?
  // Worley noise is typically simple F1.
  // let bubble = 1.0 - clamp(f1, 0.0, 1.0);
  // Let's match the Web look:
  // Web creates a lattice.
  // Bubbles creates... bubbles.
  
  // Morph:
  // 0.0 = Bubbles (Organic, different sizes)
  // 1.0 = Web (Connected lines)
  
  // Let's define Bubble as inverted F1, normalized
  let bubble = smoothstep(1.0, 0.0, f1); // 1 at center, 0 at unit distance
  
  // Blend
  // Since Web is 0 at center, Bubble is 1 at center.
  let pattern = mix(bubble, web, morph);
  
  // Edge Fading
  var fade_factor = 1.0;
  let fade_limit = min(edge_fade, 0.49);
  if (fade_limit > 0.0) {
    let b_fade = smoothstep(0.0, fade_limit, t);
    let t_fade = 1.0 - smoothstep(1.0 - fade_limit, 1.0, t);
    fade_factor = b_fade * t_fade;
  }
  
  return r0 + relief * pattern * fade_factor;
}

fn style_geometric_star(theta: f32, t: f32, r0: f32) -> f32 {
  // Params:
  // 0: Points
  // 1: Gap
  // 2: Detail
  // 3: Layers
  // 4: Interlace
  // 5: Relief
  // 6: Roundness
  // 7: Zoom
  // 8: Shift
  
  let N = max(4.0, style_param(0u));
  let gap = style_param(1u);
  let detail = style_param(2u);
  let layers = style_param(3u);
  let interlace = style_param(4u);
  let relief = style_param(5u);
  let smooth_rad = style_param(6u) * 0.2;
  let zoom = style_param(7u);
  let shift = style_param(8u);
  
  // Coordinates
  // Tile vertically
  let v_raw = t * layers * zoom;
  let row = floor(v_raw);
  let v = (fract(v_raw) - 0.5) * 2.0; // -1..1
  
  // Offset alternate rows like a brick pattern if desired?
  // Let's stick to radial symmetry but rotate alternate rows
  let row_offset = (row % 2.0) * (PI / N) * shift * 2.0;

  // Polar repetition
  // Ref: https://www.shadertoy.com/view/lsX3AH (Pattern 1)
  // Divide circle into N slices
  let angle = TAU / N;
  let th = theta + row_offset;
  
  // Sector ID
  let sector = floor(th / angle);
  
  // Local Angle in Sector [-angle/2, angle/2]
  let a = (fract(th / angle) - 0.5) * angle;

  // Radial Distance
  let r = 2.0 * t * zoom; // Approx scaling
  
  // Convert to Cartesian for SDF
  // We want to draw a star in each sector?
  // Easier: Fold space.
  
  // Simple Star Logic:
  // d = abs(x) * sin(alpha) + y * cos(alpha)
  // Star line defined by angle 'alpha'
  
  // Map (theta, t) to (x, y) plane for the pattern
  // Y = v (vertical position in tile)
  // X = a * something?
  // Standard polar rosette logic:
  
  // uv coordinate within the tile (-1..1, -1..1 approx)
  // Scale X to account for cylinder curvature approx
  let uv = vec2<f32>(a * (N/4.0), v); // Aspect ratio fix roughly
  
  // Kaleidoscopic Fold
  // Fold angle for star point
  let k = PI / N;
  var p = uv;
  
  // Fold X
  p.x = abs(p.x);
  
  // Rotate by Star Angle
  // detail param controls the internal angle
  let star_angle = (0.2 + 0.6 * detail) * PI_OVER_2;
  let n_star = vec2<f32>(sin(star_angle), cos(star_angle));
  
  // Distance to line
  let d_line = dot(p, n_star);
  
  // Create strapwork (two parallel lines)
  // d_strap = abs(d_line) - gap
  let d_strap = abs(d_line) - gap;
  
  // Shape: 1 inside strap, 0 outside
  let shape = 1.0 - smoothstep(0.0, 0.02 + smooth_rad, d_strap);
  
  // Interlacing (Weaving)
  // Determine Over/Under based on distance along the line?
  // dist_along = dot(p, vec2(n_star.y, -n_star.x))
  let dist_along = dot(p, vec2<f32>(n_star.y, -n_star.x));
  
  // Checkerboard based on distance along line
  let weave = cos(dist_along * 10.0 * zoom);
  
  // If weave > 0, this line segment is "Over", else "Under"
  // But we interact with *other* lines.
  // Full approach requires finding the *closest* line and its ID.
  // SImplified: modulated height.
  
  let h_base = shape;
  let h_mod = h_base * (1.0 + weave * interlace * 0.2);
  
  // Vertical blend
  // Fade at edges of tile to prevent hard seams
  let v_fade = 1.0 - pow(abs(v), 4.0);
  
  return r0 + h_mod * relief * v_fade;
}

// ============================================================================
// Hexagonal Hive
// ============================================================================

fn hex_dist(p: vec2<f32>) -> f32 {
  // Hexagon SDF (pointy topped)
  let p_abs = abs(p);
  // Dot product with normal (sqrt(3)/2, 0.5)
  // k: vec2(-0.8660254, 0.5), but we work in positive quadrant
  // max(abs(x), dot(p, {0.5, 0.866})) for flat topped?
  // Let's use simple IQ logic:
  // q = abs(p)
  // return max(q.x * 0.866025 + q.y * 0.5, q.y) - size??
  
  // Flat-topped hex radius 0.5
  // d = max(dot(abs(p), normalize(vec2(1, tan(30)))), p.x) - r
  // p.x is width, p.y is height.
  // Flat top: pointy sides.
  
  // Pointy-topped (standard for hex grids where rows are offset)
  // height 1.0. width sqrt(3)/2
  let s = vec2<f32>(1.0, 1.7320508);
  let p_k = abs(p);
  return max(dot(p_k, s * 0.5), p_k.x); 
  // Note: Using pointy-topped hex SDF, grid logic handles cell identification
}

fn style_hexagonal_hive(theta: f32, t: f32, r0: f32) -> f32 {
  // Params:
  // 0: Scale
  // 1: Gap
  // 2: Relief
  // 3: Detail
  // 4: Concave
  // 5: Noise
  
  let scale = style_param(0u);
  let gap = style_param(1u);
  let relief = style_param(2u);
  let detail = style_param(3u);
  let concave = style_param(4u);
  let noise = style_param(5u);
  
  // Coordinates
  // Wrap U around 0..TAU
  // Scale so that U matches aspect ratio of V
  
  // Hex grid aspect ratio: sqrt(3) or 1/sqrt(3) depending on orientation.
  // Let's assume point-top hexes.
  // Rows are horizontal.
  
  // Aspect ratio correction approximation
  let H = 20.0; // Default height fallback
  
  let u_raw = theta * (scale / TAU); // 0..scale
  let v_raw = t * scale * (H / (2.0 * PI * 20.0)); // Aspect correction approx
  
  // Better grid math by iq:
  // https://www.shadertoy.com/view/Xd2GR3
  
  let u = theta * scale;
  let v = t * scale * (H / 40.0); // Rough aspect
  
  // Axial Coordinates for Pointy Top
  // q = (x * sqrt(3)/3 - y / 3) / size
  // r = y * 2/3 / size
  
  // Simplified: Skewed grid
  // X = u, Y = v
  // Shift every other row
  let r = 1.7320508 / 1.0; // W/H ratio
  
  // Grid logic
  let uv = vec2<f32>(u, v * r);
  
  let s = vec2<f32>(1.0, 1.7320508);
  let h = s * 0.5;
  
  let a = floor(uv / s);
  let b = floor((uv - h) / s);
  
  let guv_a = uv - (a * s + h);
  let guv_b = uv - (b * s + h * 2.0); // Offset
  
  // Distances
  let len_a = dot(guv_a, guv_a);
  let len_b = dot(guv_b, guv_b);
  
  let grid_uv = request_grid_uv(guv_a, guv_b, len_a, len_b);
  let dist = sqrt(min(len_a, len_b));
  
  // Cell ID (random seed)
  let cell_id_vec = request_cell_id(a, b, len_a, len_b);
  // Hash for noise
  let cell_hash = fract(sin(dot(cell_id_vec, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  
  // Edge distance (hexagon inner radius is 0.5 in this space?)
  // Max radius for touching hexes is 0.5
  
  // Normalized distance 0 (center) to 1 (edge)
  let d_norm = dist / 0.5;
  
  // Gap
  let w = 1.0 - gap * 2.0;
  
  // Shape profile
  // Convex: Parabola inverted: 1 - x^2
  // Concave: x^2
  
  // Base height
  // Smoothstep for walls
  let wall = smoothstep(1.0, w, d_norm);
  
  var h_cell = 0.0;
  
  if (concave > 0.5) {
     // Concave (bowls)
     h_cell = pow(d_norm, 2.0) * wall;
     // Invert so walls are high? Or cells are dug out?
     // "Relief" usually adds material.
     // Let's say we dig out cells.
     // r0 + relief * (1.0 - h_cell)?
     h_cell = 1.0 - h_cell * (1.0 - detail * 0.5); 
  } else {
     // Convex (bubbles)
     h_cell = (1.0 - pow(d_norm, 2.0 * (1.0 + detail))) * wall;
  }
  
  // Noise variation
  let h_noise = (cell_hash - 0.5) * noise;
  
  return r0 + (h_cell + h_noise * wall) * relief;
}

// Helper for hex grid selection
fn request_grid_uv(ga: vec2<f32>, gb: vec2<f32>, la: f32, lb: f32) -> vec2<f32> {
    if (la < lb) { return ga; }
    return gb;
}

fn request_cell_id(a: vec2<f32>, b: vec2<f32>, la: f32, lb: f32) -> vec2<f32> {
    if (la < lb) { return a; }
    return b + vec2<f32>(0.5, 0.5); // Offset ID
}

// ============================================================================
// Celtic Knot - Multi-Strand Braid with Robust Over/Under Detection
// Uses crossing-index algorithm for proper alternation
// ============================================================================

// Helper: distance from point to a sine wave strand
fn celtic_dist(u: f32, v: f32, phase: f32, amp: f32, frq: f32) -> f32 {
  return abs(u - amp * sin(v * frq + phase));
}

// Helper: get X position of strand
fn celtic_x(v: f32, phase: f32, amp: f32, frq: f32) -> f32 {
  return amp * sin(v * frq + phase);
}

// Helper: count crossings up to this v position (integer count)
fn celtic_crossing_count(v: f32, phase1: f32, phase2: f32, frq: f32) -> f32 {
  // Crossings happen when sin(v*frq + phase1) = sin(v*frq + phase2)
  // This happens at regular intervals determined by phase difference
  // For 3-strand braid with 120° spacing, there are 3 crossings per period
  let period = TAU / frq;
  return floor(v / (period / 3.0));
}

fn style_celtic_knot(theta: f32, t: f32, r0: f32) -> f32 {
  // Params:
  // 0: Scale (number of braid columns)
  // 1: Width (strand thickness) 
  // 2: Relief (depth)
  // 3: Gap (crossing visibility)
  // 4: Roundness (strand profile)
  // 5: Twist (vertical frequency / tightness)
  // 6: Strands (number of braided strands, 2-8)
  
  let num_columns = max(1.0, floor(style_param(0u)));
  let strand_w = style_param(1u) * 0.15;
  let relief = style_param(2u);
  let gap_vis = style_param(3u);
  let roundness = style_param(4u);
  let tightness = max(0.5, style_param(5u) + 0.5);
  let num_strands_f = clamp(floor(style_param(6u) + 0.5), 2.0, 8.0);
  let num_strands = i32(num_strands_f);
  
  // Column tiling
  let theta_norm = theta / TAU;
  let column_id = floor(theta_norm * num_columns);
  let local_u = (fract(theta_norm * num_columns) - 0.5) * 2.0;
  
  // Vertical coordinate with tightness control
  let v = t * tightness * TAU * 3.0;
  
  // Braid parameters
  let amp = 0.4;
  let frq = 1.0;
  let phase_step = TAU / num_strands_f;
  let base_phase = column_id * PI * 0.333;
  
  // Calculate data for all strands
  // Z-Oscillation Strategy (V9):
  // Even Strands: N-1 is Odd. Cosine provides anti-symmetry (Z_A = -Z_B).
  // Odd Strands: N-1 is Even. Sine provides anti-symmetry (Z_A = -Z_B).
  // We switch function based on parity to guarantee weave topology.
  
  var distances: array<f32, 8>;
  var z_heights: array<f32, 8>;
  
  let weave_density = max(1.0, num_strands_f - 1.0);
  let is_odd_strands = (num_strands % 2 != 0);
  
  for (var i = 0; i < 8; i++) {
    if (i >= num_strands) { 
      distances[i] = 999.0;
      continue; 
    }
    let phase = base_phase + phase_step * f32(i);
    let arg = v * frq + phase;
    
    let x = amp * sin(arg);
    distances[i] = abs(local_u - x);
    
    // Parity-Switched Z-Oscillation
    let osc_arg = arg * weave_density;
    if (is_odd_strands) {
        z_heights[i] = sin(osc_arg);
    } else {
        z_heights[i] = cos(osc_arg);
    }
  }
  
  // Find the closest strand
  var min_d = 999.0;
  var closest_id = 0;
  
  for (var i = 0; i < 8; i++) {
    if (i >= num_strands) { break; }
    let d = distances[i];
    if (d < min_d) {
      min_d = d;
      closest_id = i;
    }
  }
  
  // Background if not on any strand
  if (min_d > strand_w) {
    return r0 - relief * 0.3;
  }
  
  // Occlusion Search (Standard Z-Buffer)
  // Check if any other strand covers this pixel AND has higher Z
  
  var render_id = closest_id;
  var best_z = z_heights[closest_id];
  var final_dist = min_d;
  
  for (var i = 0; i < 8; i++) {
    if (i >= num_strands) { break; }
    if (i == closest_id) { continue; }
    
    let d = distances[i];
    let z = z_heights[i];
    
    // Physical overlap check
    if (d < strand_w) {
      // Z-Order check
      if (z > best_z) {
        best_z = z;
        render_id = i;
        final_dist = d;
      }
    }
  }
  
  // Render
  let d_norm = final_dist / strand_w;
  let profile = mix(1.0 - d_norm, cos(d_norm * PI_OVER_2), roundness);
  
  // Normalize Z [-1, 1] -> [0, 1] for relief factor
  let z_norm = best_z * 0.5 + 0.5;
  
  // Smoothly blend relief
  let depth_factor = mix(0.3 + gap_vis * 0.2, 1.0, z_norm);
  
  return r0 + profile * relief * depth_factor;
}

fn style_basket_weave(theta: f32, t: f32, r0: f32) -> f32 {
  // Params:
  // 0: Strands
  // 1: Layers
  // 2: Depth
  // 3: Twist
  // 4: Ratio
  // 5: Profile
  // 6: Unders
  // 7: Noise
  // 8: Vertical Gradient
  // 9: Phase
  
  let strands = style_param(0u);
  let layers = style_param(1u);
  let depth = style_param(2u);
  let twist = style_param(3u);
  let ratio = style_param(4u); // Unused in basic weave but could affect spacing
  let profile = style_param(5u);
  let unders = style_param(6u);
  let noise = style_param(7u);
  let v_grad = style_param(8u);
  let phase = style_param(9u);

  // Apply vertical gradient to layer density
  let l_eff = layers * (1.0 + v_grad * (t - 0.5));
  
  // Coordinates
  let u = theta * strands / TAU; // 0..strands
  let v = t * l_eff;             // 0..layers
  
  // Twist
  let twist_offset = twist * t * strands;
  let u_twisted = u + twist_offset + phase;
  
  // Weave Logic
  // Checkerboard pattern determining which strand is on top
  // (floor(u) + floor(v)) % 2
  
  let u_cell = floor(u_twisted);
  let v_cell = floor(v);
  let checker = abs((u_cell + v_cell) % 2.0); // 0 or 1
  
  // Local coordinates within cell [0, 1]
  let u_local = fract(u_twisted) * 2.0 - 1.0; // -1..1
  let v_local = fract(v) * 2.0 - 1.0;         // -1..1
  
  // Sine profile (Round)
  let shape_u = cos(u_local * PI * 0.5); // 1 at center, 0 at edge
  let shape_v = cos(v_local * PI * 0.5);
  
  // Square profile (Flat)
  // smoothstep for anti-aliased edges
  let width = 0.9;
  let square_u = smoothstep(1.0, width, abs(u_local));
  let square_v = smoothstep(1.0, width, abs(v_local));
  
  // Blend profile
  let prof_u = mix(shape_u, square_u, profile);
  let prof_v = mix(shape_v, square_v, profile);
  
  // Determine height
  // If checker is 1, U-strand (vertical) is on top
  // If checker is 0, V-strand (horizontal) is on top
  
  var h = 0.0;
  
  if (checker > 0.5) {
     // Vertical strand on top
     h = prof_u;
     // Horizontal strand underneath (recessed)
     let h_under = prof_v * unders;
     h = max(h, h_under - 0.5); // Simple composition
  } else {
     // Horizontal strand on top
     h = prof_v;
     let h_under = prof_u * unders;
     h = max(h, h_under - 0.5);
  }
  
  // Simple Noise
  if (noise > 0.0) {
    let n = sin(u * 50.0) * sin(v * 50.0); // Cheap noise placeholder
    h += n * noise * 0.1;
  }
  
  return r0 + h * depth;
}

// ============================================================================
// Celtic Triquetra - Authentic Knotwork with Tile Atlas & Medallion
// ============================================================================

// --- 1. Utilities ---

fn wrap_dist_u(u: f32, u0: f32) -> f32 {
  return fract(u - u0 + 0.5) - 0.5;
}

fn sd_line_x(p: vec2<f32>, x: f32) -> f32 { return abs(p.x - x); }
fn sd_line_y(p: vec2<f32>, y: f32) -> f32 { return abs(p.y - y); }

fn sd_quarter_arc(p: vec2<f32>, c: vec2<f32>, r: f32, quad: vec2<f32>) -> f32 {
  // quad selects which half of the tile to keep:
  // (+1,+1) => p.x>=0.5 && p.y>=0.5  (top-right)
  // (-1,+1) => p.x<=0.5 && p.y>=0.5  (top-left)
  // (+1,-1) => p.x>=0.5 && p.y<=0.5  (bottom-right)
  // (-1,-1) => p.x<=0.5 && p.y<=0.5  (bottom-left)
  let inx = select(0.0, 1.0, (quad.x > 0.0 && p.x >= 0.5) || (quad.x < 0.0 && p.x <= 0.5));
  let iny = select(0.0, 1.0, (quad.y > 0.0 && p.y >= 0.5) || (quad.y < 0.0 && p.y <= 0.5));
  if (inx * iny < 0.5) { return 1e5; }
  return abs(length(p - c) - r);
}

fn ribbon_mask(d: f32, half_w: f32) -> f32 {
  let aa = 0.01; 
  return smoothstep(half_w + aa, half_w - aa, d);
}

// 2. Tile Evaluation

// --- New Helpers for Photo-matching ---

fn band_mask(t: f32, y0: f32, y1: f32, feather: f32) -> f32 {
  let a = smoothstep(y0, y0 + feather, t);
  let b = 1.0 - smoothstep(y1 - feather, y1, t);
  return a * b;
}

fn ribbon_height(d: f32, half_w: f32, roundness: f32) -> f32 {
  let x = clamp(d / max(half_w, 1e-5), 0.0, 1.0);
  let h_lin = 1.0 - x;
  let h_cos = cos(x * PI * 0.5);
  return mix(h_lin, h_cos, roundness);
}

fn edge_aa(half_w: f32) -> f32 { return max(0.006, half_w * 0.25); }

// --- Bezier Curve Helpers for Smooth Bends ---

fn bezier3(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, t: f32) -> vec2<f32> {
  let u = 1.0 - t;
  return (u*u*u)*p0 + (3.0*u*u*t)*p1 + (3.0*u*t*t)*p2 + (t*t*t)*p3;
}

fn sd_segment_sq(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  let d = pa - ba * h;
  return dot(d, d);
}

fn sd_bezier_poly(p: vec2<f32>, p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>) -> f32 {
  // polyline approximation, good enough for geometry displacement
  const N: i32 = 12;
  var prev = p0;
  var best = 1e9;
  for (var i = 1; i <= N; i++) {
    let t = f32(i) / f32(N);
    let cur = bezier3(p0, p1, p2, p3, t);
    best = min(best, sd_segment_sq(p, prev, cur));
    prev = cur;
  }
  return sqrt(best);
}

// --- 2. Tile Evaluation (Banded) ---


// Smooth maximum to eliminate creases at intersections
fn smax(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
}

fn braid_tile_id(ix: i32, iy: i32) -> u32 {
  let xodd = (ix & 1) != 0;
  let yodd = (iy & 1) != 0;

  if (!yodd) {
    // row 0: bend, cross, bend, cross...
    return select(0u, 2u, xodd);
  } else {
    // row 1: cross, bend, cross, bend...
    return select(2u, 1u, xodd);
  }
}

// Ribbon presence mask: 1 inside ribbon, 0 outside (soft edge)
fn ribbon_presence(d: f32, w: f32, aa: f32) -> f32 {
  return smoothstep(w + aa, w - aa, d);
}

fn crossing_height(
  p: vec2<f32>,
  half_w: f32,
  vertical_on_top: bool,
  gap: f32,
  roundness: f32,
  v_band: f32  // visual band coordinate 0-1 (0=bottom, 1=top of band)
) -> f32 {
  let dV = abs(p.x - 0.5); // distance to vertical centerline
  let dH = abs(p.y - 0.5); // distance to horizontal centerline

  var hV = ribbon_height(dV, half_w, roundness);
  var hH = ribbon_height(dH, half_w, roundness);

  // Detect VISUAL edge: near top or bottom of the actual band
  // Edge margin in band-normalized space (how close to 0 or 1 counts as edge)
  // Use a VERY LARGE margin because strands weave up/down - the edge loops
  // can extend deep into the band. Only the center 10% gets full gap.
  let edge_margin = 0.45;  // ~45% from each edge = only center 10% gets gaps
  let dist_to_edge = min(v_band, 1.0 - v_band);  // 0 at edges, 0.5 at center
  let edge_factor = 1.0 - smoothstep(0.0, edge_margin, dist_to_edge);
  // edge_factor = 1.0 at very edge, fades to 0.0 only at center

  let aa = edge_aa(half_w);

  // Presence of each strand (hard-ish ribbon footprint)
  let mV = ribbon_presence(dV, half_w, aa);
  let mH = ribbon_presence(dH, half_w, aa);

  // Core width of the TOP strand: keep this < half_w so cut stays
  // fully "under the overpass" and doesn't create visible breaks.
  let core_w = clamp(half_w * (0.55 + gap * 1.5), half_w * 0.45, half_w * 0.90);

  // How strongly to remove the under strand (0..1)
  // Reduce carving at edges for seamless flow
  let carve = clamp(gap * 35.0, 0.0, 1.0) * (1.0 - edge_factor);

  if (vertical_on_top) {
    // Under strand is horizontal: cut ONLY where horizontal exists AND we're in
    // the core of the vertical (over) strand.
    let coreTop = ribbon_presence(dV, core_w, aa);
    let cut = mH * coreTop;
    hH *= 1.0 - carve * cut;
  } else {
    // Under strand is vertical
    let coreTop = ribbon_presence(dH, core_w, aa);
    let cut = mV * coreTop;
    hV *= 1.0 - carve * cut;
  }

  return max(hV, hH);
}

fn eval_celtic_tile_height(tile_id: u32, t: vec2<f32>, ij: vec2<i32>, half_w: f32, gap: f32, roundness: f32, v_band: f32) -> f32 {
  let k = 0.38; // bend softness (0.30-0.45 is good)

  if (tile_id == 0u) {
    // Tile 0: top-right + bottom-left bends (Bezier)
    // TR: N -> E with tangent vertical at N and horizontal at E
    let dTR = sd_bezier_poly(
      t,
      vec2<f32>(0.5, 1.0),
      vec2<f32>(0.5, 1.0 - k),
      vec2<f32>(1.0 - k, 0.5),
      vec2<f32>(1.0, 0.5)
    );

    // BL: W -> S with tangent horizontal at W and vertical at S
    let dBL = sd_bezier_poly(
      t,
      vec2<f32>(0.0, 0.5),
      vec2<f32>(k, 0.5),
      vec2<f32>(0.5, k),
      vec2<f32>(0.5, 0.0)
    );

    return max(ribbon_height(dTR, half_w, roundness), ribbon_height(dBL, half_w, roundness));
  }

  if (tile_id == 1u) {
    // Tile 1: top-left + bottom-right bends (Bezier)
    // TL: N -> W
    let dTL = sd_bezier_poly(
      t,
      vec2<f32>(0.5, 1.0),
      vec2<f32>(0.5, 1.0 - k),
      vec2<f32>(k, 0.5),
      vec2<f32>(0.0, 0.5)
    );

    // BR: E -> S
    let dBR = sd_bezier_poly(
      t,
      vec2<f32>(1.0, 0.5),
      vec2<f32>(1.0 - k, 0.5),
      vec2<f32>(0.5, k),
      vec2<f32>(0.5, 0.0)
    );

    return max(ribbon_height(dTL, half_w, roundness), ribbon_height(dBR, half_w, roundness));
  }

  // Crossing tile (2u): use bitwise parity for correct alternation
  let verticalTop = ((ij.x + ij.y) & 1) == 0;
  
  return crossing_height(t, half_w, verticalTop, gap, roundness, v_band);
}

// ============================================================================
// Celtic Triquetra V2 - Continuous Strand Tracking System
// ============================================================================
// This system uses sinusoidal strands that can form both simple braids AND
// complex Celtic knot patterns. Strands are tracked continuously and the
// triquetra medallion is integrated into the strand flow.

// --- Continuous Strand Braid System ---
// Each strand follows: x(v) = amplitude * sin(v * frequency + phase)
// Over/under is determined by a Z-oscillation at higher frequency

fn celtic_strand_x(v: f32, strand_id: i32, num_strands: i32, base_phase: f32, amp: f32) -> f32 {
  // Each strand has a phase offset based on its ID
  let phase = base_phase + TAU * f32(strand_id) / f32(num_strands);
  return amp * sin(v + phase);
}

fn celtic_strand_z(v: f32, strand_id: i32, num_strands: i32, base_phase: f32) -> f32 {
  // Z oscillates at (num_strands-1) * frequency for proper weaving
  // This ensures correct over/under at each crossing point
  let weave_freq = f32(num_strands - 1);
  let phase = base_phase + TAU * f32(strand_id) / f32(num_strands);
  
  // Use different oscillation for even/odd strand counts to ensure alternation
  if (num_strands % 2 == 0) {
    return cos((v + phase) * weave_freq);
  } else {
    return sin((v + phase) * weave_freq);
  }
}

// Evaluate multiple strands and find the one rendering at this point
fn celtic_braid_continuous(
  local_u: f32,           // horizontal position in cell [-0.5, 0.5]
  v: f32,                 // vertical position (continuous)
  num_strands: i32,       // number of braided strands
  amp: f32,               // horizontal amplitude of sine waves
  half_w: f32,            // half-width of each strand ribbon
  gap: f32,               // gap visibility at crossings
  roundness: f32,         // strand profile roundness
  base_phase: f32         // phase offset for tiling
) -> f32 {
  
  // Find distance and Z for each strand
  var min_dist: f32 = 999.0;
  var closest_id: i32 = 0;
  var distances: array<f32, 8>;
  var z_heights: array<f32, 8>;
  
  for (var i = 0; i < 8; i++) {
    if (i >= num_strands) {
      distances[i] = 999.0;
      z_heights[i] = -999.0;
      continue;
    }
    
    let x = celtic_strand_x(v, i, num_strands, base_phase, amp);
    let d = abs(local_u - x);
    let z = celtic_strand_z(v, i, num_strands, base_phase);
    
    distances[i] = d;
    z_heights[i] = z;
    
    if (d < min_dist) {
      min_dist = d;
      closest_id = i;
    }
  }
  
  // If not on any strand, return background (negative height)
  if (min_dist > half_w * 1.2) {
    return -0.3;
  }
  
  // Find the strand with highest Z among those covering this point
  var render_id = closest_id;
  var best_z = z_heights[closest_id];
  var final_dist = min_dist;
  
  for (var i = 0; i < 8; i++) {
    if (i >= num_strands) { break; }
    if (distances[i] < half_w * 1.1 && z_heights[i] > best_z) {
      best_z = z_heights[i];
      render_id = i;
      final_dist = distances[i];
    }
  }
  
  // Calculate ribbon profile
  let d_norm = clamp(final_dist / half_w, 0.0, 1.0);
  let profile = mix(1.0 - d_norm, cos(d_norm * PI_OVER_2), roundness);
  
  // Apply Z-based depth variation for realistic overlap look
  let z_norm = best_z * 0.5 + 0.5; // Map [-1,1] to [0,1]
  let depth_factor = mix(1.0 - gap * 0.5, 1.0, z_norm);
  
  return profile * depth_factor;
}

// --- Trefoil Knot for Medallion (integrated with strand system) ---

fn trefoil_pos(t: f32) -> vec2<f32> {
  // Trefoil knot parametric curve - creates triquetra-like shape
  let x = sin(t) + 2.0 * sin(2.0 * t);
  let y = cos(t) - 2.0 * cos(2.0 * t);
  return vec2<f32>(x, y) * 0.22;
}

fn trefoil_z(t: f32) -> f32 {
  // Z oscillation for over/under weaving in trefoil
  return sin(3.0 * t);
}

fn sd_segment_sq_h(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let pa = p - a;
  let ba = b - a;
  let denom = max(dot(ba, ba), 1e-6);
  let h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  let d = pa - ba * h;
  return vec2<f32>(dot(d, d), h);
}

fn eval_triquetra_height(p: vec2<f32>, half_w: f32, gap: f32, roundness: f32) -> f32 {
  const SEG: i32 = 48;
  let dt = TAU / f32(SEG);

  // Track two closest strand segments for overlap handling
  var b1 = vec2<f32>(1e9, 0.0); // (distance^2, z)
  var b2 = vec2<f32>(1e9, 0.0);

  for (var i = 0; i < SEG; i++) {
    let t1 = f32(i) * dt;
    let t_next = t1 + dt;

    let a = trefoil_pos(t1);
    let b = trefoil_pos(t_next);

    let res = sd_segment_sq_h(p, a, b);
    let d2 = res.x;
    let h  = res.y;

    let tt = t1 + h * dt;
    let z  = trefoil_z(tt);

    if (d2 < b1.x) {
      b2 = b1;
      b1 = vec2<f32>(d2, z);
    } else if (d2 < b2.x) {
      b2 = vec2<f32>(d2, z);
    }
  }

  let d1 = sqrt(b1.x);
  let d2 = sqrt(b2.x);

  var h1 = ribbon_height(d1, half_w, roundness);
  var h2 = ribbon_height(d2, half_w, roundness);

  // Handle overlap region - carve under strand
  let aa = edge_aa(half_w);
  let m1 = smoothstep(half_w + aa, half_w - aa, d1);
  let m2 = smoothstep(half_w + aa, half_w - aa, d2);
  let overlap = m1 * m2;

  let carve = clamp(gap * 20.0, 0.0, 1.0);
  if (b1.y > b2.y) {
    h2 *= 1.0 - overlap * carve;
  } else {
    h1 *= 1.0 - overlap * carve;
  }

  return max(h1, h2);
}

// --- Main Celtic Triquetra Style Function ---

fn style_celtic_triquetra(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) { return r0; }

  // Parameters from UI
  let Nx = max(1.0, floor(style_param(0u) + 0.5));        // H-Repeat (columns)
  let Ny = i32(max(2.0, floor(style_param(1u) + 0.5)));   // V-Repeat (band rows) - higher = denser braid
  let half_w = style_param(2u);                            // Ribbon width
  let relief = style_param(3u);                            // Relief depth
  let med_r = style_param(4u);                             // Medallion radius
  let med_y = style_param(5u);                             // Medallion Y position
  let gap = style_param(6u);                               // Gap at crossings

  let roundness = 0.85;
  
  // UV coordinates
  let u = fract(theta / TAU);
  
  // Band layout - two braided bands with the medallion in between
  let feather = 0.02;
  
  // Upper band (main Celtic braid)
  let upper_y0 = 0.55;
  let upper_y1 = 0.88;
  let upper = band_mask(t, upper_y0, upper_y1, feather);
  
  // Lower band (secondary braid)
  let lower_y0 = 0.18;
  let lower_y1 = 0.48;
  let lower = band_mask(t, lower_y0, lower_y1, feather);
  
  var h = 0.0;
  
  // --- Upper Braid Band (Celtic interlace lattice) ---
  if (upper > 0.0) {
    let v_band = (t - upper_y0) / (upper_y1 - upper_y0);
    let p_axis = vec2<f32>(u * Nx, v_band * f32(Ny));
    
    // 45° lattice transform for Celtic interlace pattern
    let q = vec2<f32>(p_axis.x + p_axis.y, -p_axis.x + p_axis.y);
    
    let ix = i32(floor(q.x));
    let iy = i32(floor(q.y));
    let tt = fract(q);
    let id = braid_tile_id(ix, iy);
    var h_band = eval_celtic_tile_height(id, tt, vec2<i32>(ix, iy), half_w, gap, roundness, v_band);
    
    // --- EDGE CAPS: Horizontal strands at top and bottom to close the loops ---
    // These create the U-turns that connect adjacent diagonal strands
    let edge_cap_margin = 0.15;  // How close to edge before cap kicks in
    let cap_half_w = half_w * 1.1;  // Slightly wider to ensure connection
    
    // Bottom edge cap (v_band near 0)
    if (v_band < edge_cap_margin * 2.0) {
      // Distance to bottom edge in band-normalized space, scaled to ribbon coordinates
      let edge_v = v_band * f32(Ny);  // Scale to Ny units
      let d_bottom = abs(edge_v);  // Distance from bottom edge line
      let h_bottom_cap = ribbon_height(d_bottom, cap_half_w, roundness);
      // Use smax for smooth blend (no groove)
      h_band = smax(h_band, h_bottom_cap * smoothstep(edge_cap_margin * 2.0, edge_cap_margin * 0.5, v_band), 0.1);
    }
    
    // Top edge cap (v_band near 1)
    if (v_band > 1.0 - edge_cap_margin * 2.0) {
      let edge_v = (1.0 - v_band) * f32(Ny);  // Distance from top in Ny units
      let d_top = abs(edge_v);
      let h_top_cap = ribbon_height(d_top, cap_half_w, roundness);
      // Use smax for smooth blend
      h_band = smax(h_band, h_top_cap * smoothstep(1.0 - edge_cap_margin * 2.0, 1.0 - edge_cap_margin * 0.5, v_band), 0.1);
    }
    
    h = max(h, upper * h_band);
  }
  
  // --- Lower Braid Band (Celtic interlace lattice, phase shifted) ---
  if (lower > 0.0) {
    let v_band = (t - lower_y0) / (lower_y1 - lower_y0);
    let NyL = max(2, Ny - 2);  // slightly fewer rows in lower band
    let p_axis = vec2<f32>(u * Nx + 0.5, v_band * f32(NyL));
    
    // 45° lattice transform
    let q = vec2<f32>(p_axis.x + p_axis.y, -p_axis.x + p_axis.y);
    
    let ix = i32(floor(q.x));
    let iy = i32(floor(q.y));
    let tt = fract(q);
    let id = braid_tile_id(ix, iy);
    var h_band = eval_celtic_tile_height(id, tt, vec2<i32>(ix, iy), half_w, gap, roundness, v_band);
    
    // --- EDGE CAPS for lower band ---
    let edge_cap_margin = 0.15;
    let cap_half_w = half_w * 1.1;
    
    // Bottom edge cap
    if (v_band < edge_cap_margin * 2.0) {
      let edge_v = v_band * f32(NyL);
      let d_bottom = abs(edge_v);
      let h_bottom_cap = ribbon_height(d_bottom, cap_half_w, roundness);
      h_band = smax(h_band, h_bottom_cap * smoothstep(edge_cap_margin * 2.0, edge_cap_margin * 0.5, v_band), 0.1);
    }
    
    // Top edge cap
    if (v_band > 1.0 - edge_cap_margin * 2.0) {
      let edge_v = (1.0 - v_band) * f32(NyL);
      let d_top = abs(edge_v);
      let h_top_cap = ribbon_height(d_top, cap_half_w, roundness);
      h_band = smax(h_band, h_top_cap * smoothstep(1.0 - edge_cap_margin * 2.0, 1.0 - edge_cap_margin * 0.5, v_band), 0.1);
    }
    
    h = max(h, lower * h_band);
  }
  
  // --- Medallion (Triquetra) ---
  // Position medallion at center-front of pot
  let du = wrap_dist_u(u, 0.5);
  let dv = t - med_y;
  let p = vec2<f32>(du / med_r, dv / med_r);
  
  let inside = 1.0 - smoothstep(1.0, 1.1, length(p));
  if (inside > 0.0) {
    // Scale triquetra ribbon width to medallion space
    let half_w_med = (half_w * 0.55) / max(med_r, 1e-4);
    let hm = eval_triquetra_height(p, half_w_med, gap, roundness);
    h = max(h, inside * hm);
  }
  
  // --- Decorative rim lines ---
  let rim_top_w = 0.008;
  let rim_top = smoothstep(rim_top_w, 0.0, abs(t - 0.90)) * 0.6;
  let rim_mid = smoothstep(rim_top_w, 0.0, abs(t - 0.52)) * 0.4;
  let rim_bot = smoothstep(rim_top_w, 0.0, abs(t - 0.15)) * 0.4;
  h = max(h, rim_top);
  h = max(h, rim_mid);
  h = max(h, rim_bot);
  
  // --- Final Relief (RAISED, not carved) ---
  // This is the key fix: bands should be raised above the base
  let base = r0 - relief * 0.15;  // Slight base recess
  return base + h * relief;       // Raised relief
}

fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
  // Normalize theta to [0, TAU) for perfect periodicity
  // This ensures theta=TAU produces identical result to theta=0
  // Eliminates seam discontinuity at the u=0/u=1 boundary
  let th = theta - floor(theta / TAU) * TAU;
  
  // DYNAMIC_STYLE_DISPATCH
  // This line will be replaced by the renderer with a direct call to the specific
  // style function (e.g. "return gothic_arches_radius(th, t, r0);")
  // default fallback:
  
  if (style_id == STYLE_SPIRAL_RIDGES) {
    return spiral_radius(th, t, r0);
  }
  if (style_id == STYLE_SUPERELLIPSE_MORPH) {
    return superellipse_radius(th, t, r0);
  }
  if (style_id == STYLE_HARMONIC_RIPPLE) {
    return harmonic_radius(th, t, r0);
  }
  if (style_id == STYLE_GOTHIC_ARCHES) {
    return gothic_arches_radius(th, t, r0);
  }
  if (style_id == STYLE_WAVE_INTERFERENCE) {
    return wave_interference_radius(th, t, r0);
  }
  if (style_id == STYLE_CRYSTALLINE) {
    return crystalline_radius(th, t, r0);
  }
  if (style_id == STYLE_ART_DECO) {
    return art_deco_radius(th, t, r0);
  }
  if (style_id == STYLE_DRAGON_SCALES) {
    return dragon_scales_radius(th, t, r0);
  }
  if (style_id == STYLE_BAMBOO_SEGMENTS) {
    return bamboo_segments_radius(th, t, r0);
  }
  if (style_id == STYLE_RIPPLE_INTERFERENCE) {
    return ripple_interference_radius(th, t, r0);
  }
  if (style_id == STYLE_GYROID_MANIFOLD) {
    return style_gyroid_manifold(th, t, r0);
  }
  if (style_id == STYLE_VORONOI) {
    return style_voronoi(th, t, r0);
  }
  if (style_id == STYLE_BASKET_WEAVE) {
    return style_basket_weave(th, t, r0);
  }
  if (style_id == STYLE_GEOMETRIC_STAR) {
    return style_geometric_star(th, t, r0);
  }
  if (style_id == STYLE_HEXAGONAL_HIVE) {
    return style_hexagonal_hive(th, t, r0);
  }
  if (style_id == STYLE_CELTIC_KNOT) {
    return style_celtic_knot(th, t, r0);
  }
  // Default fallback (Superformula)
  if (style_id == 18) {
    return style_celtic_triquetra(th, t, r0);
  }
  return sf_radius(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
  // For most styles, f(0) is a simplified calculation
  if (style_id == STYLE_FOURIER_BLOOM) {
    // Fourier at 0: base = 1 + bc8 + bc12. top = 1 + tc11 + tc22. sin terms are 0.
    // We can just call the normal function with theta=0 if simplification isn't manual
    // But direct implementation avoids trig calls.
    return fourier_radius(0.0, t, r0); 
  }
  if (style_id == STYLE_SPIRAL_RIDGES) {
    // Spiral at 0: sin(phase). phase = TAU * turns * t.
    return spiral_radius(0.0, t, r0);
  }
  if (style_id == STYLE_SUPERELLIPSE_MORPH) {
    // Superellipse at 0: cos(0)=1, sin(0)=0. c=1, s=0. base=1. rf = 1 + c4a + c8a.
    // Very cheap.
    return superellipse_radius(0.0, t, r0);
  }
  if (style_id == STYLE_HARMONIC_RIPPLE) {
    return harmonic_radius(0.0, t, r0);
  }
  if (style_id == STYLE_VORONOI) {
    return style_voronoi(0.0, t, r0);
  }
  if (style_id == STYLE_BASKET_WEAVE) {
    return style_basket_weave(0.0, t, r0);
  }
  if (style_id == STYLE_GEOMETRIC_STAR) {
    return style_geometric_star(0.0, t, r0);
  }
  if (style_id == STYLE_HEXAGONAL_HIVE) {
    return style_hexagonal_hive(0.0, t, r0);
  }
  if (style_id == STYLE_CELTIC_KNOT) {
    return style_celtic_knot(0.0, t, r0);
  }
  // Superformula: Use highly optimized version
  if (style_id == 18) {
    return style_celtic_triquetra(0.0, t, r0);
  }
  return sf_radius_zero(t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
  // For periodic functions (Fourier, Superellipse, Harmonic), f(2PI) == f(0).
  if (style_id == STYLE_FOURIER_BLOOM) {
    return fourier_radius(0.0, t, r0); // Periodic
  }
  if (style_id == STYLE_SUPERELLIPSE_MORPH) {
    return superellipse_radius(0.0, t, r0); // Periodic assumption (period PI/2 usually)
  }
  if (style_id == STYLE_HARMONIC_RIPPLE) {
    return harmonic_radius(0.0, t, r0); // Periodic
  }
  
  if (style_id == STYLE_SPIRAL_RIDGES) {
    // Spiral is NOT periodic if turns is not integer.
    // We must evaluate at theta = 2PI (TAU)
    // spiral_radius handles theta input, it calculates phase + k*theta.
    // If we pass 2PI, it calculates sin(k*2PI + phase).
    return spiral_radius(6.2831853, t, r0);
  }
  
  if (style_id == STYLE_VORONOI) {
    return style_voronoi(6.2831853, t, r0);
  }
  if (style_id == STYLE_BASKET_WEAVE) {
    return style_basket_weave(6.2831853, t, r0);
  }
  if (style_id == STYLE_GEOMETRIC_STAR) {
    return style_geometric_star(6.2831853, t, r0);
  }
  if (style_id == STYLE_HEXAGONAL_HIVE) {
    return style_hexagonal_hive(6.2831853, t, r0);
  }
  if (style_id == STYLE_CELTIC_KNOT) {
    return style_celtic_knot(6.2831853, t, r0);
  }

  // Superformula: Use optimized version for 2PI
  if (style_id == 18) {
    return style_celtic_triquetra(6.2831853, t, r0);
  }
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
