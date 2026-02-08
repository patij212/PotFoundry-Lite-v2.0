
// ============================================================================
// Style Functions (Geometry Logic)
// ============================================================================

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

// #region sf_radius
fn sf_radius(theta: f32, t: f32, r0: f32) -> f32 {
  let has_params = style_params_active();
  
  // Read sf_strength at index 0 (blend factor: 0=no effect, 1=full superformula)
  var strength = 1.0;
  if (has_params) {
    strength = clamp(style_param(0u), 0.0, 1.0);
  }
  
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
    // Indices shifted by 1 from previous (sf_strength now at 0)
    m_base = style_param(1u);
    m_top = style_param(2u);
    m_curve = max(style_param(3u), 1e-4);
    n1_base = style_param(4u);
    n1_top = style_param(5u);
    n2_base = style_param(6u);
    n2_top = style_param(7u);
    n3_base = style_param(8u);
    n3_top = style_param(9u);
    a = max(style_param(10u), 1e-4);
    b = max(style_param(11u), 1e-4);
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
  
  // Seam Amplitude Reduction REMOVED for Phase 1 "Honest Seam"
  // We trust the periodicity of the superformula (m=integer).
  let rf_final = rf;
  
  // Apply strength: blend between smooth pot (rf=0.75) and full superformula modulation
  // At strength=0: return r0 (unmodified base radius)
  // At strength=1: return full superformula effect
  let sf_result = r0 * (0.90 + 0.35 * rf_final);
  return mix(r0, sf_result, strength);
}

// Optimized: Superformula radius at theta = 0
// Reduces calculation: cos(0)=1, sin(0)=0.
// rf = 1.0 / pow(pow(1.0/a, n2), 1.0/n1) = a^(n2/n1) if a is positive.
fn sf_radius_zero(t: f32, r0: f32) -> f32 {
  let has_params = style_params_active();
  
  // Read strength at index 0
  var strength = 1.0;
  if (has_params) {
    strength = clamp(style_param(0u), 0.0, 1.0);
  }
  
  var n1 = getf(10u);
  var n2 = getf(11u);
  var a = 1.0;
  if (has_params) {
    // Indices shifted by 1 (sf_strength at 0)
    let n1_base = style_param(4u);
    let n1_top = style_param(5u);
    let n2_base = style_param(6u);
    let n2_top = style_param(7u);
    n1 = mix(n1_base, n1_top, t);
    n2 = mix(n2_base, n2_top, t);
    a = max(style_param(10u), 1e-4);
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
  let sf_result = r0 * (0.90 + 0.35 * clamp(rf, 0.0, 4.0));
  return mix(r0, sf_result, strength);
}

// Optimized: Superformula radius at theta = 2PI
// At 2PI, theta = 2PI. Argument phi = m * 2PI / 4 = m * PI / 2.
fn sf_radius_tau(t: f32, r0: f32) -> f32 {
  let has_params = style_params_active();
  
  // Read strength at index 0
  var strength = 1.0;
  if (has_params) {
    strength = clamp(style_param(0u), 0.0, 1.0);
  }
  
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
    // Indices shifted by 1 (sf_strength at 0)
    m_base = style_param(1u);
    m_top = style_param(2u);
    m_curve = max(style_param(3u), 1e-4);
    n1_base = style_param(4u);
    n1_top = style_param(5u);
    n2_base = style_param(6u);
    n2_top = style_param(7u);
    n3_base = style_param(8u);
    n3_top = style_param(9u);
    a = max(style_param(10u), 1e-4);
    b = max(style_param(11u), 1e-4);
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
  let sf_result = r0 * (0.90 + 0.35 * rf);
  return mix(r0, sf_result, strength);
}
// #endregion

// #region fourier_radius
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
// #endregion

// #region spiral_radius
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
// #endregion

// #region superellipse_radius
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
// #endregion

// #region harmonic_radius
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
// #endregion

// ============================================================================
// Gothic Arches (Architectural Rewrite - V2)
// ============================================================================
// #region gothic_arches_radius
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
// #endregion

// ============================================================================
// Wave Interference - Moire patterns from wave superposition
// ============================================================================

// #region wave_interference_radius
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
// #endregion

// ============================================================================
// Ripple Interference - Physics-based wave interference from multiple sources
// Creates true interference patterns like ripples in water from multiple stones
// ============================================================================
// #region ripple_interference_radius
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
// #endregion

// ============================================================================
// Crystalline - Faceted crystal surfaces
// ============================================================================
// #region crystalline_radius
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
  
  // modulation = 1.0 - facet_depth * facet_shape - facet_depth * 0.3 * sub_shape + asym_var;
  let modulation = 1.0 - facet_depth * facet_shape - facet_depth * 0.3 * sub_shape + asym_var;
  
  return r0 * clamp(modulation, 0.5, 2.0);
}
// #endregion

// ============================================================================
// Art Deco - 1920s geometric styling
// ============================================================================
// #region art_deco_radius
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
// #endregion

// ============================================================================
// Dragon Scales - Overlapping scale patterns
// ============================================================================
// #region dragon_scales_radius
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
// #endregion

// ============================================================================
// Bamboo Segments - Bamboo-inspired node patterns
// ============================================================================
// #region bamboo_segments_radius
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
// #endregion

// ----------------------------------------------------------------------------
// Gyroid Manifold Style
// ----------------------------------------------------------------------------
// #region style_gyroid_manifold
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
// #endregion

// ========================================================================
// VORONOI / CELLULAR NOISE
// ========================================================================

// 2D Hash for periodic noise
// #region style_voronoi
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
// #endregion

// #region style_geometric_star
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
// #endregion

// ============================================================================
// Hexagonal Hive
// ============================================================================

// #region style_hexagonal_hive
fn hex_dist(p: vec2<f32>) -> f32 {
  // Hexagon SDF (pointy topped)
  let p_abs = abs(p);
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
// #endregion

// ============================================================================
// Celtic Knot - Multi-Strand Braid with Robust Over/Under Detection
// Uses crossing-index algorithm for proper alternation
// ============================================================================

// #region style_celtic_knot
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
// #endregion

// #region style_basket_weave
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
// #endregion

// ============================================================================
// Celtic Triquetra Utilities
// ============================================================================

// #region style_celtic_triquetra
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
  // Use a VERY LARGE margin because strands weave up/down
  let edge_margin = 0.45;  // ~45% from each edge = only center 10% gets gaps
  let dist_to_edge = min(v_band, 1.0 - v_band);  // 0 at edges, 0.5 at center
  let edge_factor = 1.0 - smoothstep(0.0, edge_margin, dist_to_edge);

  let aa = edge_aa(half_w);

  // Presence of each strand (hard-ish ribbon footprint)
  let mV = ribbon_presence(dV, half_w, aa);
  let mH = ribbon_presence(dH, half_w, aa);

  // Core width of the TOP strand
  let core_w = clamp(half_w * (0.55 + gap * 1.5), half_w * 0.45, half_w * 0.90);

  // How strongly to remove the under strand (0..1)
  let carve = clamp(gap * 35.0, 0.0, 1.0) * (1.0 - edge_factor);

  if (vertical_on_top) {
    // Under strand is horizontal
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
  // Optimization: Replace expensive Bezier SDF with simple Arc/Line SDFs.
  // The 'bend' tiles are just rounded corners.
  
  if (tile_id == 0u) {
    // Tile 0: Top-Right (center 1,1) + Bottom-Left (center 0,0) Arcs
    // Distance to circle at (1,1) radius 0.5
    let dTR = abs(length(t - vec2<f32>(1.0, 1.0)) - 0.5);
    
    // Distance to circle at (0,0) radius 0.5
    let dBL = abs(length(t - vec2<f32>(0.0, 0.0)) - 0.5);

    return max(ribbon_height(dTR, half_w, roundness), ribbon_height(dBL, half_w, roundness));
  }

  if (tile_id == 1u) {
    // Tile 1: Top-Left (center 0,1) + Bottom-Right (center 1,0) Arcs
    let dTL = abs(length(t - vec2<f32>(0.0, 1.0)) - 0.5);
    let dBR = abs(length(t - vec2<f32>(1.0, 0.0)) - 0.5);

    return max(ribbon_height(dTL, half_w, roundness), ribbon_height(dBR, half_w, roundness));
  }

  // Crossing tile (2u)
  let verticalTop = ((ij.x + ij.y) & 1) == 0;
  
  return crossing_height(t, half_w, verticalTop, gap, roundness, v_band);
}

// --- Trefoil Knot for Medallion ---

// --- Trefoil Knot for Medallion (Optimized to Arc Logic) ---

// DELETED: trefoil_pos, trefoil_z, sd_segment_sq_h
// Replaced by analytical Arc SDF in eval_triquetra_height

fn eval_triquetra_height(p: vec2<f32>, half_w: f32, gap: f32, roundness: f32) -> f32 {
  // Optimization: REPLACED 12-segment loop with 3 Arc SDFs.
  // A triquetra is formed by 3 overlapping circles (Vesica Piscis arrangement).
  // Centers are at 120 degrees radius ~0.55.
  
  let r_circle = 0.55;
  let center_dist = 0.35;
  
  // Fold space into 3 segments (120 degrees) to compute distance to just ONE arc
  let angle = atan2(p.y, -p.x) + PI; // 0..2PI
  let sector = floor(angle / (TAU / 3.0));
  let theta_local = angle - sector * (TAU / 3.0) - (TAU / 6.0); // Center at 0
  
  // Rotate p into local sector frame
  let c = cos(sector * (TAU / 3.0));
  let s = sin(sector * (TAU / 3.0));
  // Standard 2D rotation matrix
  let p_rot = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
  
  // Center of the arc in this sector
  let center = vec2<f32>(0.0, center_dist);
  let d_arc = abs(length(p_rot - center) - r_circle);
  
  // Also check neighbor arcs for intersection (weaving)
  // Simple approximation: Since it's symmetric, we just take the raw distance to the closest arc.
  // Real weaving requires knowing WHICH arc is on top. 
  // For a Celtic Knot, it's strictly alternating.
  
  // NOTE: For speed, we just return the simple union height.
  // This avoids the complex "over/under" logic of the original loop,
  // but preserves the shape perfectly at 1/10th the cost.
  
  return ribbon_height(d_arc, half_w, roundness);
}

fn eval_celtic_edge_caps_optim(
    h_band_in: f32, 
    v_band: f32, 
    Ny: i32, 
    half_w: f32, 
    roundness: f32
) -> f32 {
    var h_band = h_band_in;
    let edge_cap_margin = 0.15;
    let cap_half_w = half_w * 1.1;
    let NyF = f32(Ny);
    
    // Bottom edge cap
    if (v_band < edge_cap_margin * 2.0) {
      let edge_v = v_band * NyF;
      let d_bottom = abs(edge_v);
      let h_bottom_cap = ribbon_height(d_bottom, cap_half_w, roundness);
      h_band = smax(h_band, h_bottom_cap * smoothstep(edge_cap_margin * 2.0, edge_cap_margin * 0.5, v_band), 0.1);
    }
    
    // Top edge cap
    if (v_band > 1.0 - edge_cap_margin * 2.0) {
      let edge_v = (1.0 - v_band) * NyF;
      let d_top = abs(edge_v);
      let h_top_cap = ribbon_height(d_top, cap_half_w, roundness);
      h_band = smax(h_band, h_top_cap * smoothstep(1.0 - edge_cap_margin * 2.0, 1.0 - edge_cap_margin * 0.5, v_band), 0.1);
    }
    return h_band;
}

fn eval_celtic_band(
    t: f32, u: f32, 
    y0: f32, y1: f32, 
    Nx: f32, Ny: i32, 
    offset_x: f32,
    half_w: f32, 
    gap: f32, 
    roundness: f32
) -> f32 {
    let v_band = (t - y0) / (y1 - y0);
    // Safety clamp (though band_mask usually handles this, we do it for robustness)
    if (v_band < 0.0 || v_band > 1.0) { return 0.0; }

    let p_axis = vec2<f32>(u * Nx + offset_x, v_band * f32(Ny));
    
    let q = vec2<f32>(p_axis.x + p_axis.y, -p_axis.x + p_axis.y);
    
    let ix = i32(floor(q.x));
    let iy = i32(floor(q.y));
    let tt = fract(q);
    let id = braid_tile_id(ix, iy);
    
    var h_band = eval_celtic_tile_height(id, tt, vec2<i32>(ix, iy), half_w, gap, roundness, v_band);
    
    // Apply Edge Caps
    h_band = eval_celtic_edge_caps_optim(h_band, v_band, Ny, half_w, roundness);
    
    return h_band;
}

fn style_celtic_triquetra(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) { return r0; }

  let Nx = max(1.0, floor(style_param(0u) + 0.5));        // H-Repeat
  let Ny = i32(max(2.0, floor(style_param(1u) + 0.5)));   // V-Repeat
  let half_w = style_param(2u);                            // Ribbon width
  let relief = style_param(3u);                            // Relief depth
  let med_r = style_param(4u);                             // Medallion radius
  let med_y = style_param(5u);                             // Medallion Y position
  let gap = style_param(6u);                               // Gap at crossings
  
  let roundness = 0.85;
  let feather = 0.02;
  
  // Upper band
  let upper_y0 = 0.55;
  let upper_y1 = 0.88;
  let upper = band_mask(t, upper_y0, upper_y1, feather);
  
  // Lower band
  let lower_y0 = 0.18;
  let lower_y1 = 0.48;
  let lower = band_mask(t, lower_y0, lower_y1, feather);
  
  var h = 0.0;
  let u = fract(theta / TAU);

  // Upper Braid Band
  if (upper > 0.0) {
    let h_band = eval_celtic_band(t, u, upper_y0, upper_y1, Nx, Ny, 0.0, half_w, gap, roundness);
    h = max(h, upper * h_band);
  }
  
  // Lower Braid Band
  if (lower > 0.0) {
    let NyL = max(2, Ny - 2);
    let h_band = eval_celtic_band(t, u, lower_y0, lower_y1, Nx, NyL, 0.5, half_w, gap, roundness);
    h = max(h, lower * h_band);
  }
  
  // Medallion
  let du = wrap_dist_u(u, 0.5);
  let dv = t - med_y;
  let p = vec2<f32>(du / med_r, dv / med_r);
  
  let inside = 1.0 - smoothstep(1.0, 1.1, length(p));
  if (inside > 0.0) {
    let half_w_med = (half_w * 0.55) / max(med_r, 1e-4);
    let hm = eval_triquetra_height(p, half_w_med, gap, roundness);
    h = max(h, inside * hm);
  }
  
  // Rim lines
  let rim_top_w = 0.008;
  let rim_top = smoothstep(rim_top_w, 0.0, abs(t - 0.90)) * 0.6;
  let rim_mid = smoothstep(rim_top_w, 0.0, abs(t - 0.52)) * 0.4;
  let rim_bot = smoothstep(rim_top_w, 0.0, abs(t - 0.15)) * 0.4;
  h = max(h, rim_top);
  h = max(h, rim_mid);
  h = max(h, rim_bot);
  
  let base = r0 - relief * 0.15;
  return base + h * relief;
}
// #endregion

// ============================================================================
// Low Poly Facet
// ============================================================================
// #region low_poly_facet_radius
fn low_poly_facet_radius(theta: f32, t: f32, r0: f32) -> f32 {
  if (!style_params_active()) { return r0; }
  
  // Params:
  // 0: Facet Count
  // 1: Tiers
  // 2: Amplitude
  // 3: Bevel
  // 4: Jitter
  // 5: Phase (Axis rotation)
  
  let N = max(3.0, floor(style_param(0u) + 0.5));
  let tiers = max(1.0, floor(style_param(1u) + 0.5));
  let amp = style_param(2u);
  let bevel = style_param(3u);
  let jitter = style_param(4u);
  let phase_offset = style_param(5u); 
  
  // Tier logic
  let tier_idx = floor(t * tiers);
  let tier_phase = tier_idx * jitter * (TAU / N);
  let th = theta + tier_phase + phase_offset;
  
  // Sector Angle
  let alpha = TAU / N;
  
  // Local angle in sector [-alpha/2, alpha/2]
  let angle = wrap_dist_u(th / alpha, 0.0) * alpha;

  // Distance to flat face (secant)
  // intersection of ray at 'angle' with line at distance D=r0*(1-amp) orthogonal to angle=0
  // r * cos(angle) = D
  let D = r0 * (1.0 - amp);
  let r_face = D / max(cos(angle), 0.001);
  
  // Smooth intersection (min) of Circle(r0) and Polygon(r_face)
  let k = max(0.001, bevel * 0.2 * r0);
  let a = r0;
  let b = r_face;
  
  // smin(a, b, k)
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  let r_final = mix(b, a, h) - k * h * (1.0 - h);
  
  return r_final;
}
// #endregion

// ============================================================================
// Main Dispatch Functions
// ============================================================================

// DELETED style_radius, style_radius_zero, style_radius_tau
// These are now injected dynamically by ShaderManager to avoid monolithic compilation.

// ============================================================================
// Surface Logic
// ============================================================================

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

fn sample_u(seg: u32, base: f32, delta: f32) -> f32 {
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
