// adaptive_mesh.wgsl - Complete Adaptive Mesh Generation for 3D Printing
// Generates all pot surfaces (outer/inner walls, rim, bottom, drain) with
// curvature-based adaptive subdivision for sharp edges and smooth curves.
//
// Designed to be concatenated after common.wgsl + styles.wgsl + dispatch

// ============================================================================
// Bindings
// ============================================================================

struct FeaturePoint {
    theta: f32,
    t: f32,
    featureType: u32, // 1=Ridge, 2=Valley, 3=Crease
    strength: f32,
}

struct AdaptiveUniforms {
  chunk0: vec4<f32>, // x:H, y:Rt, z:Rb, w:tWall
  chunk1: vec4<f32>, // x:tBottom, y:rDrain, z:expn, w:styleId
  chunk2: vec4<f32>, // x:spinTurns, y:spinPhase, z:spinCurve, w:seamAngle
  chunk3: vec4<f32>, // x:bellAmp, y:bellCenter, z:bellWidth, w:maxDepth
  chunk4: vec4<f32>, // x:subdivThreshold, y:minQuadSize, z:targetTris, w:reserved
}

@group(0) @binding(0) var<uniform> uniforms: AdaptiveUniforms;
@group(0) @binding(1) var<storage, read> style_params: array<f32>;
@group(0) @binding(2) var<storage, read_write> vertices: array<f32>;
@group(0) @binding(3) var<storage, read_write> indices: array<u32>;
@group(0) @binding(4) var<storage, read_write> counters: array<atomic<u32>>; // [0]=vertex, [1]=index, [2]=quad_curr, [3]=quad_next
@group(0) @binding(5) var<storage, read_write> quads_current: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> quads_next: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read> feature_buffer: array<FeaturePoint>; // Optional

const COUNTER_VERTEX: u32 = 0u;
const COUNTER_INDEX: u32 = 1u;
const COUNTER_QUAD_CURRENT: u32 = 2u;
const COUNTER_QUAD_NEXT: u32 = 3u;

// Surface type encoding for quads (encoded in quad.w upper bits)
const SURFACE_OUTER: f32 = 0.0;
const SURFACE_INNER: f32 = 1.0;
const SURFACE_RIM: f32 = 2.0;
const SURFACE_BOTTOM: f32 = 3.0;
const SURFACE_DRAIN: f32 = 4.0;

// ============================================================================
// Uniform Accessors (compatible with styles.wgsl)
// ============================================================================

fn getf(idx: u32) -> f32 {
  switch idx {
    case 0u: { return uniforms.chunk0.x; }  // H
    case 1u: { return uniforms.chunk0.y; }  // Rt
    case 2u: { return uniforms.chunk0.z; }  // Rb
    case 3u: { return uniforms.chunk1.z; }  // expn
    case 4u: { return uniforms.chunk2.x; }  // spinTurns
    case 5u: { return uniforms.chunk2.y; }  // spinPhase
    case 6u: { return uniforms.chunk2.z; }  // spinCurve
    case 8u: { return 5.0; }   // m_base default
    case 9u: { return 5.0; }   // m_top default
    case 10u: { return 1.0; }  // n1
    case 11u: { return 1.0; }  // n2
    case 12u: { return 1.0; }  // n3
    case 14u: { return uniforms.chunk3.x; }  // bellAmp
    case 15u: { return uniforms.chunk3.y; }  // bellCenter
    case 72u: { return uniforms.chunk3.z; }  // bellWidth
    case 73u: { return uniforms.chunk2.w; }  // seamAngle
    default: { return 0.0; }
  }
}

fn geti(idx: u32) -> i32 { return i32(getf(idx)); }

fn style_param(idx: u32) -> f32 {
  if (idx >= arrayLength(&style_params)) { return 0.0; }
  return style_params[idx];
}

fn style_params_active() -> bool {
  return arrayLength(&style_params) > 0u;
}

// ============================================================================
// Geometry Helpers
// ============================================================================

fn get_H() -> f32 { return uniforms.chunk0.x; }
fn get_Rt() -> f32 { return uniforms.chunk0.y; }
fn get_Rb() -> f32 { return uniforms.chunk0.z; }
fn get_tWall() -> f32 { return uniforms.chunk0.w; }
fn get_tBottom() -> f32 { return uniforms.chunk1.x; }
fn get_rDrain() -> f32 { return uniforms.chunk1.y; }
fn get_expn() -> f32 { return uniforms.chunk1.z; }
fn get_styleId() -> i32 { return i32(uniforms.chunk1.w); }
fn get_minR() -> f32 { return 0.5; }

fn compute_twist(theta: f32, t: f32) -> f32 {
    let spinTurns = uniforms.chunk2.x;
    let spinPhase = uniforms.chunk2.y;
    let spinCurve = uniforms.chunk2.z;
    let twist = spinTurns * 6.28318530718 * pow(t, max(spinCurve, 0.0001));
    return theta + twist + spinPhase;
}

fn compute_outer_radius(theta: f32, t: f32) -> f32 {
    let styleId = get_styleId();
    let r0 = r_base(t);
    return style_radius(styleId, theta, t, r0);
}

fn compute_inner_radius(theta: f32, t: f32) -> f32 {
    let r_outer = compute_outer_radius(theta, t);
    let r = r_outer - get_tWall();
    return max(r, get_minR());
}

// ============================================================================
// Feature Snapping
// ============================================================================

// Safe Snapping with Box Limit (Topology Preservation)
fn snap_vertex(theta: f32, t: f32, limit_box: vec2<f32>) -> vec2<f32> {
    let count = arrayLength(&feature_buffer);
    if (count == 0u) { return vec2<f32>(theta, t); }
    
    // Limits
    var bestDistSQ = 1.0e9;
    var bestP = vec2<f32>(theta, t);
    
    // Snap Radius: Aggressive but constrained by limit_box
    // We allow finding features further away, but we Clamp the movement.
    // FIXED SNAP RADIUS (Iteration 24 - "Watertight"):
    // We CANNOT use quad size (limit_box) for radius because neighbors might differ in size.
    // If Quad A is big and Quad B is small, they calculate different radii -> CRACKS (Stitching Bands).
    // We must use a CONSISTENT radius so shared vertices snap identically.
    
    let snapRadSQ = 0.005 * 0.005; // Fixed param distance (~0.5mm on standard pot)
    let loopMax = min(count, 4096u);
    
    for (var i = 0u; i < loopMax; i++) {
        let f = feature_buffer[i];
        
        let dt = f.t - t;
    var dth = f.theta - theta;
        
        // Handle Periodic Wrapping (Seam Robustness)
        // theta is 0..2PI
        // If dist > PI, wrap around.
        let PI = 3.14159265;
        let TAU = 6.2831853;
        if (dth > PI) { dth -= TAU; }
        else if (dth < -PI) { dth += TAU; }
        
        // Simple dist:
        let d2 = dt*dt + dth*dth;
        
        if (d2 < bestDistSQ) {
            bestDistSQ = d2;
            bestP = vec2<f32>(f.theta, f.t);
            // Re-adjust bestP.x to match the unwrapped 'theta' domain
            bestP.x = theta + dth; 
        }
    }
    
    if (bestDistSQ < snapRadSQ) {
        // Enforce Safety Box (prevent triangle flips)
        // limit_box is (dTheta/2, dT/2) approx.
        // We stay within 45% of the quad size from the corner.
        
        let d_th = clamp(bestP.x - theta, -limit_box.x, limit_box.x);
        let d_t  = clamp(bestP.y - t, -limit_box.y, limit_box.y);
        
        return vec2<f32>(theta + d_th, t + d_t);
    }
    return vec2<f32>(theta, t);
}

// Helper for Normal Calculation (Approximate)
fn compute_approx_normal(theta: f32, t: f32, scale: vec2<f32>) -> vec3<f32> {
    let eps_th = 0.001; 
    let eps_t = 0.001;
    
    let r_c = compute_outer_radius(theta, t);
    let r_th = compute_outer_radius(theta + eps_th, t);
    let r_t = compute_outer_radius(theta, t + eps_t);
    
    let dr_dth = (r_th - r_c) / eps_th;
    let dr_dt = (r_t - r_c) / eps_t;
    
    let H = get_H();
    
    // dP/dth = (dr/dth cos - r sin, dr/dth sin + r cos, 0)
    let cos_th = cos(theta);
    let sin_th = sin(theta);
    let dP_dth = vec3<f32>(dr_dth * cos_th - r_c * sin_th, dr_dth * sin_th + r_c * cos_th, 0.0);
    
    // dP/dt = (dr/dt cos, dr/dt sin, H)
    let dP_dt = vec3<f32>(dr_dt * cos_th, dr_dt * sin_th, H);
    
    return normalize(cross(dP_dth, dP_dt));
}

// ============================================================================
// Curvature Computation
// ============================================================================

fn curvature_outer(theta: f32, t: f32, eps: f32) -> f32 {
    let r_c = compute_outer_radius(theta, t);
    let r_tp = compute_outer_radius(theta + eps, t);
    let r_tm = compute_outer_radius(theta - eps, t);
    let r_pp = compute_outer_radius(theta, t + eps);
    let r_pm = compute_outer_radius(theta, t - eps);
    
    let curv_theta = abs(r_tp - 2.0 * r_c + r_tm) / (eps * eps);
    let curv_t = abs(r_pp - 2.0 * r_c + r_pm) / (eps * eps);
    return curv_theta + curv_t;
}

// Compute how much the styled radius varies from base radius
// High variation = style peaks/valleys = need more detail
fn compute_style_variation(theta: f32, t: f32, scale: vec2<f32>) -> f32 {
    let r_base_val = max(r_base(t), 0.1);
    let r_c = compute_outer_radius(theta, t);
    
    // --- 2D SAGITTA (Iteration 12 - "Watertight Precision") ---
    
    // PRECISION TUNING:
    // 1e-7 was unsafe (degenerate). 1e-5 was too coarse (bands).
    // 5e-6 (0.000005) is the Goldilocks zone for Float32.
    // --- PURE ABSOLUTE SAGITTA (Iteration 19 - "Golden Standard") ---
    // Simplicity is key. We measure the absolute geometric error (Sagitta)
    // and compare it directly to a physical threshold. 
    // No normalization, no dithering, no derived metrics.
    
    // --- ANISOTROPIC SAGITTA (Iteration 20 - "Local Precision") ---
    // Previous bug: 'scale' was max(dTheta, dT). Since dTheta (~0.05) >> dT (~0.008),
    // the T-probe was sampling +/- 0.025, which is 3x the quad height!
    // This blurred vertical details and caused "weird" resolution.
    // Fix: Use separate epsilons for Theta and T.
    
    // 1. Coarse Probe (Geometric Fidelity)
    // eps = half-width of the quad boundaries
    let eps_theta = max(scale.x * 0.5, 0.0001);
    let eps_t     = max(scale.y * 0.5, 0.0001);
    
    // Horizontal (Theta) Coarse
    let r_tp = compute_outer_radius(theta + eps_theta, t);
    let r_tm = compute_outer_radius(theta - eps_theta, t);
    let mid_theta = (r_tp + r_tm) * 0.5;
    let sag_theta_coarse = abs(r_c - mid_theta);

    // Vertical (T) Coarse
    let t_pp = clamp(t + eps_t, 0.0, 1.0);
    let t_pm = clamp(t - eps_t, 0.0, 1.0);
    let r_pp = compute_outer_radius(theta, t_pp);
    let r_pm = compute_outer_radius(theta, t_pm);
    let mid_t = (r_pp + r_pm) * 0.5;
    let sag_t_coarse = abs(r_c - mid_t);
    
    let sag_coarse = max(sag_theta_coarse, sag_t_coarse);

    // 2. Fine Probe (Ridge Detection)
    // We also need anisotropic fine probes because we can have sharp ridges 
    // in either direction.
    // However, for feature detection, we often want a fixed physical size.
    // eps_fine = 0.002 is good for Theta (physical arclength ~ 0.001)
    // For T, 0.002 is also good (physical length 0.002).
    // So fixed epsilon is okay for fine probe, BUT we should ensure we don't 
    // probe outside the quad if the quad is tiny.
    
    let eps_fine_theta = min(0.002, eps_theta);
    let eps_fine_t     = min(0.002, eps_t);
    
    let r_tp_f = compute_outer_radius(theta + eps_fine_theta, t);
    let r_tm_f = compute_outer_radius(theta - eps_fine_theta, t);
    let sag_theta_fine = abs(r_c - (r_tp_f + r_tm_f) * 0.5);
    
    let t_pp_f = clamp(t + eps_fine_t, 0.0, 1.0);
    let t_pm_f = clamp(t - eps_fine_t, 0.0, 1.0);
    let r_pp_f = compute_outer_radius(theta, t_pp_f);
    let r_pm_f = compute_outer_radius(theta, t_pm_f);
    let sag_t_fine = abs(r_c - (r_pp_f + r_pm_f) * 0.5);
    
    // Normalize fine sagitta to account for smaller probe?
    // No, strictly checking geometric error. If the tiny probe hits a sharp
    // spike, the sagitta will be small but non-zero.
    // Actually, for a sharp corner, sagitta converges to a constant (Corner Depth).
    // For a smooth curve, sagitta drops as eps^2.
    // So for smooth curves, fine probe returns tiny values.
    // For sharp edges, fine probe returns large values (relative to coarse).
    
    // To detect ridges reliable, we assume if Fine Sagitta is significant (e.g. > threshold/4)
    // we should subdivide?
    // Actually, let's keep it simple. Max error.
    
    let sag_fine = max(sag_theta_fine, sag_t_fine);
    
    // 3. Cylinder Chord Error
    // dTheta = scale.x
    let sag_circle = r_c * (1.0 - cos(scale.x * 0.5));
    
    // --- NORMAL DEVIATION (CAD-Grade) ---
    // Check if surface normal varies significantly across cell.
    // This catches inflection points and smooth curvature better than sagitta alone.
    
    // We compute normal at center vs "future" corners?
    // Sample normal at center:
    let n_c = compute_approx_normal(theta, t, scale);
    
    // Sample normal at corner (theta+eps, t+eps)
    let n_corner = compute_approx_normal(theta + eps_theta, t + eps_t, scale);
    
    let dot_val = dot(n_c, n_corner);
    // Error = 1.0 - dot (approx angle^2/2).
    // If angle is 10 deg, dot=0.98. error=0.02.
    // If threshold is 0.02, this triggers subdivision.
    let normal_err = max(0.0, 1.0 - dot_val);
    
    // Helper to compute normal
    // We already have r_c, r_tp, r_tm...
    // dr/dtheta ~ (r_tp - r_tm) / (2 eps)
    // dr/dt ~ (r_pp - r_pm) / (2 eps)
    // Tangent vectors?
    // P(th, t) = (r cos th, r sin th, H*t)  (approx for outer)
    // dP/dth = (dr/dth cos - r sin, dr/dth sin + r cos, 0)
    // dP/dt  = (dr/dt cos, dr/dt sin, H)
    // N = cross(dP/dth, dP/dt)
    
    // Combine errors
    // Normal error is dimensionless (radians approx).
    // Sagitta is distance (mm).
    // We should scale normal error to match threshold?
    // Or just take MAX.
    // Given Threshold ~ 0.02. 
    // Normal error of 0.02 corresponds to ~11 degrees. Reasonable.
    
    let error = max(max(max(sag_coarse, sag_fine), sag_circle), normal_err * 0.5); // Weight normal error?
    
    // --- LINEARIZATION (Iteration 21 - "Smooth Gradient") ---
    // User hates "bands" (hard depth steps).
    // Absolute Error (sagitta) drops quadratically (Scale^2).
    // This causes subdivision to stop abruptly when error < threshold.
    // By dividing by Scale, the metric drops Linearly.
    // This creates a much wider "transition zone" (penumbra) of resolution
    // around features, blending the levels smoothly.
    
    let scale_max = max(scale.x, scale.y);
    
    // Linearization: Divide by scale to make error drop linearly.
    // This creates a smooth penumbra of detail.
    // Tuned Factor: 1.0 (was 4.0). Making this smaller makes the metric smaller -> Fewer Splits.
    // Effectively raises the bar for subdivision.
    return error / scale_max;
}

fn compute_importance(theta: f32, t: f32, surfaceType: f32, scale: vec2<f32>) -> f32 {
    // For outer/inner walls, use position-based importance
    var base_imp = 0.0;

    if (surfaceType < 0.5) { // OUTER
        base_imp = compute_style_variation(theta, t, scale);
    } else if (surfaceType < 1.5) { // INNER
        base_imp = compute_style_variation(theta, t, scale);
    } else if (surfaceType < 2.5) { // RIM
        base_imp = 1.0; // rim fixed later if needed, mostly handled by scale.x
        
        // RIM adaptive logic (Inline for now or call helper)
        let eps = max(scale.x * 0.5, 0.001);
        let r_c = compute_outer_radius(theta, 1.0);
        let r_tp = compute_outer_radius(theta + eps, 1.0);
        let r_tm = compute_outer_radius(theta - eps, 1.0);
        let sag = abs(r_c - (r_tp + r_tm) * 0.5);
        base_imp = sag;

    } else if (surfaceType < 3.5) { // BOTTOM_UNDER
        let radial_pos = t;
        let wall_imp = compute_style_variation(theta, 0.0, scale);
        base_imp = wall_imp * radial_pos; 
    } else { // BOTTOM_TOP, DRAIN
        base_imp = 0.001; 
    }
    
    return base_imp;
}

// ============================================================================
// Vertex Emission for Each Surface Type
// ============================================================================

fn emit_outer_vertex(theta: f32, t: f32, limits: vec2<f32>) -> u32 {
    let H = get_H();
    
    // Snap (Theta, T) to nearest feature
    // Only snap if we have features? Yes.
    let snapped = snap_vertex(theta, t, limits);
    let s_theta = snapped.x;
    let s_t = snapped.y;
    
    let z = s_t * H;
    let r = compute_outer_radius(s_theta, s_t);
    let th = compute_twist(s_theta, s_t);
    
    let vIdx = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    let base = vIdx * 3u;
    
    if (base + 2u < arrayLength(&vertices)) {
        vertices[base] = r * cos(th);
        vertices[base + 1u] = r * sin(th);
        vertices[base + 2u] = z;
    }
    return vIdx;
}

fn emit_inner_vertex(theta: f32, t: f32, limits: vec2<f32>) -> u32 {
    let H = get_H();
    let tBottom = get_tBottom();
    
    // Inner wall starts at tBottom, not 0
    // Param 't' here is 0..1 representing height fraction from bottom to top.
    
    // Snap in UV space? 
    // Feature extraction is based on "t" being "height ratio" usually?
    // Actually features are extracted on (theta, t=0..1) where t is passed to r_base(t).
    // For Inner wall, 't' input is 0..1.
    // 't_radius' is the value passed to style_radius.
    // So we should snap (theta, t_radius).
    
    let z = tBottom + t * (H - tBottom);
    let t_current = z / H; // This matches the 't' used in Feature Extract
    
    // Limits apply to (theta, t_current)
    let snapped = snap_vertex(theta, t_current, limits);
    let s_theta = snapped.x;
    let s_t = snapped.y; // This is the new t_radius
    
    // Recalculate z based on snapped t_radius?
    // z = t_radius * H;
    // BUT we are constrained between tBottom and H. 
    // Snapping might pull us below tBottom.
    // Clamp it?
    let s_t_clamped = clamp(s_t, tBottom/H, 1.0);
    
    let z_new = s_t_clamped * H;
    
    let r = compute_inner_radius(s_theta, s_t_clamped);
    let th = compute_twist(s_theta, s_t_clamped);
    
    let vIdx = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    let base = vIdx * 3u;
    
    if (base + 2u < arrayLength(&vertices)) {
        vertices[base] = r * cos(th);
        vertices[base + 1u] = r * sin(th);
        vertices[base + 2u] = z_new;
    }
    return vIdx;
}

fn emit_rim_vertex(theta: f32, isInner: f32) -> u32 {
    let H = get_H();
    let z = H;
    let t = 1.0;
    
    var r: f32;
    if (isInner > 0.5) {
        r = compute_inner_radius(theta, t);
    } else {
        r = compute_outer_radius(theta, t);
    }
    
    let th = compute_twist(theta, t);
    
    let vIdx = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    let base = vIdx * 3u;
    
    if (base + 2u < arrayLength(&vertices)) {
        vertices[base] = r * cos(th);
        vertices[base + 1u] = r * sin(th);
        vertices[base + 2u] = z;
    }
    return vIdx;
}

fn emit_bottom_under_vertex(theta: f32, t_radial: f32, limits: vec2<f32>) -> u32 {
    // t_radial: 0 = drain radius, 1 = outer radius
    let z = 0.0;
    let t = 0.0;
    
    // CRITICAL: Snap Bottom Edge to Match Outer Wall
    // The outer edge of bottom (t_radial=1) IS the bottom of outer wall (t=0).
    // If Wall snapped, Bottom MUST snap.
    // We use t=0 for "height" matching.
    
    // Construct param pair for snapping: (theta, 0.0) -> effectively bottom edge
    // But wait, features have t=0..1.
    // Bottom features? Unlikely. But the boundary might have vertical features meeting it.
    
    // We try to snap (theta, 0.0).
    var s_theta = theta;
    // We only snap if close to edge? Or always?
    // Let's snap always. If t_radial < 1, 0.0 is still the 'z' param.
    
    let snapped = snap_vertex(theta, 0.0, limits);
    // If we are at t_radial=1, we use snapped.x.
    // If we are at t_radial=0 (drain), we shouldn't move theta much?
    // Let's mix: 
    s_theta = mix(theta, snapped.x, t_radial); // Only snap the outer edge
    
    let r_outer = compute_outer_radius(s_theta, t);
    let rDrain = get_rDrain();
    let r = mix(rDrain, r_outer, t_radial);
    
    let th = compute_twist(theta, t);
    
    let vIdx = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    let base = vIdx * 3u;
    
    if (base + 2u < arrayLength(&vertices)) {
        vertices[base] = r * cos(th);
        vertices[base + 1u] = r * sin(th);
        vertices[base + 2u] = z;
    }
    return vIdx;
}

fn emit_bottom_top_vertex(theta: f32, t_radial: f32) -> u32 {
    // t_radial: 0 = drain radius, 1 = inner wall radius
    let tBottom = get_tBottom();
    let H = get_H();
    let z = tBottom;
    let t_radius = tBottom / H;
    
    let r_inner = compute_inner_radius(theta, t_radius);
    let rDrain = get_rDrain();
    let r = mix(rDrain, r_inner, t_radial);
    
    let th = compute_twist(theta, t_radius);
    
    let vIdx = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    let base = vIdx * 3u;
    
    if (base + 2u < arrayLength(&vertices)) {
        vertices[base] = r * cos(th);
        vertices[base + 1u] = r * sin(th);
        vertices[base + 2u] = z;
    }
    return vIdx;
}

fn emit_drain_vertex(theta: f32, t_height: f32) -> u32 {
    // t_height: 0 = bottom (z=0), 1 = top (z=tBottom)
    let tBottom = get_tBottom();
    let z = t_height * tBottom;
    let r = get_rDrain();
    let t_radius = z / max(get_H(), 0.001);
    let th = compute_twist(theta, t_radius);
    
    let vIdx = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    let base = vIdx * 3u;
    
    if (base + 2u < arrayLength(&vertices)) {
        vertices[base] = r * cos(th);
        vertices[base + 1u] = r * sin(th);
        vertices[base + 2u] = z;
    }
    return vIdx;
}

// ============================================================================
// Triangle Emission
// ============================================================================

fn emit_triangle(v0: u32, v1: u32, v2: u32) {
    let iIdx = atomicAdd(&counters[COUNTER_INDEX], 3u);
    if (iIdx + 2u < arrayLength(&indices)) {
        indices[iIdx] = v0;
        indices[iIdx + 1u] = v1;
        indices[iIdx + 2u] = v2;
    }
}

fn emit_quad_as_triangles(theta0: f32, theta1: f32, param0: f32, param1: f32, surfaceType: f32) {
    var v00: u32; var v10: u32; var v01: u32; var v11: u32;
    
    // Compute Limits for Safe Snapping (45% of quad size)
    let dth = abs(theta1 - theta0);
    let dt = abs(param1 - param0);
    let limits = vec2<f32>(dth * 0.48, dt * 0.48);
    
    if (surfaceType < 0.5) { // OUTER
        v00 = emit_outer_vertex(theta0, param0, limits);
        v10 = emit_outer_vertex(theta1, param0, limits);
        v01 = emit_outer_vertex(theta0, param1, limits);
        v11 = emit_outer_vertex(theta1, param1, limits);
    } else if (surfaceType < 1.5) { // INNER
        v00 = emit_inner_vertex(theta0, param0, limits);
        v10 = emit_inner_vertex(theta1, param0, limits);
        v01 = emit_inner_vertex(theta0, param1, limits);
        v11 = emit_inner_vertex(theta1, param1, limits);
        // Reverse winding for inner surface (normals face inward)
        emit_triangle(v00, v01, v11);
        emit_triangle(v00, v11, v10);
        return;
    } else if (surfaceType < 2.5) { // RIM
        v00 = emit_rim_vertex(theta0, param0);
        v10 = emit_rim_vertex(theta1, param0);
        v01 = emit_rim_vertex(theta0, param1);
        v11 = emit_rim_vertex(theta1, param1);
    } else if (surfaceType < 3.5) { // BOTTOM_UNDER
        v00 = emit_bottom_under_vertex(theta0, param0, limits);
        v10 = emit_bottom_under_vertex(theta1, param0, limits);
        v01 = emit_bottom_under_vertex(theta0, param1, limits);
        v11 = emit_bottom_under_vertex(theta1, param1, limits);
        // Bottom faces down
        emit_triangle(v00, v01, v11);
        emit_triangle(v00, v11, v10);
        return;
    } else if (surfaceType < 4.5) { // BOTTOM_TOP
        v00 = emit_bottom_top_vertex(theta0, param0);
        v10 = emit_bottom_top_vertex(theta1, param0);
        v01 = emit_bottom_top_vertex(theta0, param1);
        v11 = emit_bottom_top_vertex(theta1, param1);
    } else { // DRAIN
        v00 = emit_drain_vertex(theta0, param0);
        v10 = emit_drain_vertex(theta1, param0);
        v01 = emit_drain_vertex(theta0, param1);
        v11 = emit_drain_vertex(theta1, param1);
        // Drain faces inward
        emit_triangle(v00, v01, v11);
        emit_triangle(v00, v11, v10);
        return;
    }
    
    // Default CCW winding
    emit_triangle(v00, v10, v11);
    emit_triangle(v00, v11, v01);
}

// ============================================================================
// Compute Kernels (2D Dispatch Support)
// ============================================================================

// Quad format: vec4(theta0, theta1, param0_plus_surface, param1)
// Surface type is encoded by adding surface*100 to param0
fn encode_quad(theta0: f32, theta1: f32, param0: f32, param1: f32, surface: f32) -> vec4<f32> {
    return vec4<f32>(theta0, theta1, param0 + surface * 100.0, param1);
}

fn decode_quad(quad: vec4<f32>) -> array<f32, 5> {
    let param0_encoded = quad.z;
    let surface = floor(param0_encoded / 100.0);
    let param0 = param0_encoded - surface * 100.0;
    return array<f32, 5>(quad.x, quad.y, param0, quad.w, surface);
}

fn get_global_idx(gid: vec3<u32>) -> u32 {
    // We dispatch with x_dim = 65535 max. 
    // Stride must match the X dispatch size used in TypeScript (65535 workgroups * 64 threads)
    return gid.x + gid.y * 4194240u; 
}

@compute @workgroup_size(64)
fn init_coarse_grid(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = get_global_idx(gid);
    // UNIFORM HIGH-RES STRATEGY:
    // Grid Size 360 -> 360*360*6 = 777,600 Quads -> 1.55M Triangles.
    // Fits budget perfectly. 100% Watertight (No T-Junctions).
    let gridSize = 360u; 
    let totalPerSurface = gridSize * gridSize;
    
    // 6 surfaces: outer, inner, rim, bottom_under, bottom_top, drain
    let totalQuads = totalPerSurface * 6u;
    
    if (idx >= totalQuads) { return; }
    
    let surfaceIdx = idx / totalPerSurface;
    let localIdx = idx % totalPerSurface;
    let qi = localIdx / gridSize;
    let qj = localIdx % gridSize;
    
    let theta0 = f32(qj) / f32(gridSize) * 6.28318530718;
    let theta1 = f32(qj + 1u) / f32(gridSize) * 6.28318530718;
    let param0 = f32(qi) / f32(gridSize);
    let param1 = f32(qi + 1u) / f32(gridSize);
    
    quads_current[idx] = encode_quad(theta0, theta1, param0, param1, f32(surfaceIdx));
}

// Simple pseudo-random hash for dithering
fn hash21(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

@compute @workgroup_size(64)
fn evaluate_and_subdivide(@builtin(global_invocation_id) gid: vec3<u32>) {
    let quadIdx = get_global_idx(gid);
    let currentCount = atomicLoad(&counters[COUNTER_QUAD_CURRENT]);
    
    if (quadIdx >= currentCount) { return; }
    
    let quad = quads_current[quadIdx];
    let decoded = decode_quad(quad);
    let theta0 = decoded[0];
    let theta1 = decoded[1];
    let param0 = decoded[2];
    let param1 = decoded[3];
    let surface = decoded[4];
    
    let theta_mid = (theta0 + theta1) * 0.5;
    let param_mid = (param0 + param1) * 0.5;
    
    // Characteristic size of the quad (Anisotropic)
    let dTheta = abs(theta1 - theta0);
    let dT = abs(param1 - param0);
    let scale = vec2<f32>(dTheta, dT);
    
    let importance = compute_importance(theta_mid, param_mid, surface, scale);
    
    let threshold = uniforms.chunk4.x;
    let minSize = uniforms.chunk4.y;
    let quadSize = (theta1 - theta0) * (param1 - param0);
    
    // Stochastic Threshold REMOVED (User reported noise/bloat).
    // determinism is key for "clean" meshing.
    
    if (importance > threshold && quadSize > minSize) {
        let nextIdx = atomicAdd(&counters[COUNTER_QUAD_NEXT], 4u);
        
        if (nextIdx + 3u < arrayLength(&quads_next)) {
            quads_next[nextIdx] = encode_quad(theta0, theta_mid, param0, param_mid, surface);
            quads_next[nextIdx + 1u] = encode_quad(theta_mid, theta1, param0, param_mid, surface);
            quads_next[nextIdx + 2u] = encode_quad(theta0, theta_mid, param_mid, param1, surface);
            quads_next[nextIdx + 3u] = encode_quad(theta_mid, theta1, param_mid, param1, surface);
        } else {
            // Buffer overflow! 
            // We cannot subdivide further, but we MUST emit the geometry to prevent a hole.
            // Fallback: Emit the parent quad as is.
            emit_quad_as_triangles(theta0, theta1, param0, param1, surface);
        }
    } else {
        emit_quad_as_triangles(theta0, theta1, param0, param1, surface);
    }
}

// ============================================================================
// Vertex Evaluation (Topology from CPU)
// ============================================================================

@compute @workgroup_size(64)
fn evaluate_vertices(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let count = atomicLoad(&counters[COUNTER_VERTEX]); // or COUNTER_VERTEX if set
    // Actually we bind the vertex count via COUNTER_VERTEX usually.
    // We'll read from counter buffer at offset 0? 
    // Wait, typical atomic is offset 0.
    
    // Safety check?
    // If we passed count in via buffer write.
    
    // Let's assume counters[0] holds valid vertex count.
    
    if (idx >= arrayLength(&vertices)/3u) { return; } 
    // (Assuming we set dispatch size correctly)
    
    let base = idx * 3u;
    let theta = vertices[base];
    let t = vertices[base + 1u];
    let surface = vertices[base + 2u];
    
    // Evaluate Position based on Surface
    // Reusing emission logic logic but without atomicAdd (in-place)
    
    var x = 0.0; var y = 0.0; var z = 0.0;
    
    // Encode surface ID:
    // 0=Outer, 1=Inner, 2=Rim, 3=BottomUnder, 4=BottomTop, 5=Drain
    
    let H = get_H();
    
    if (surface < 0.5) { // OUTER
        let r = compute_outer_radius(theta, t);
        let th = compute_twist(theta, t);
        z = t * H;
        x = r * cos(th);
        y = r * sin(th);
    } else if (surface < 1.5) { // INNER
        // t is 0..1 relative to wall height
        let tBottom = get_tBottom();
        let z_height = tBottom + t * (H - tBottom);
        // Recalc t_radius for style
        let t_radius = z_height / H; 
        
        let r = compute_inner_radius(theta, t_radius);
        let th = compute_twist(theta, t_radius);
        z = z_height;
        x = r * cos(th);
        y = r * sin(th);
    } else if (surface < 2.5) { // RIM
        // t is 0..1 (radial?)
        // Wait, standard grid is 0..1 t
        // emit_rim_vertex expects (theta, t=0..1 crossing?)
        // Actually rim is narrow. 
        // Let's assume ConstrainedTriangulator only produces OUTER.
        // For others, we might use simple logic.
        
        // Placeholder for now: simple ring
        let r = compute_outer_radius(theta, 1.0);
        x = r * cos(theta); y = r * sin(theta); z = H;
    } else {
        // Others...
        // For this task, user cares about OUTER Ridge Jaggedness.
        // We focus on Outer.
        let r = compute_outer_radius(theta, t);
        let th = compute_twist(theta, t);
        z = t * H;
        x = r * cos(th);
        y = r * sin(th);
    }
    
    vertices[base] = x;
    vertices[base + 1u] = y;
    vertices[base + 2u] = z;
}

@compute @workgroup_size(64)
fn emit_remaining_quads(@builtin(global_invocation_id) gid: vec3<u32>) {
    let quadIdx = get_global_idx(gid);
    let count = atomicLoad(&counters[COUNTER_QUAD_CURRENT]);
    
    if (quadIdx >= count) { return; }
    
    let quad = quads_current[quadIdx];
    let decoded = decode_quad(quad);
    emit_quad_as_triangles(decoded[0], decoded[1], decoded[2], decoded[3], decoded[4]);
}

// ============================================================================
// Triangle Subdivision (Feature-Preserving)
// ============================================================================

// Triangle: x=v0, y=v1, z=v2, w=surface
// We use vec4<u32> for storage compatibility

@group(0) @binding(8) var<storage, read_write> triangles_current: array<vec4<u32>>;
@group(0) @binding(9) var<storage, read_write> triangles_next: array<vec4<u32>>;

const COUNTER_TRI_CURRENT: u32 = 4u; // Use index 4? Need to ensure counters buffer is large enough
const COUNTER_TRI_NEXT: u32 = 5u;    // Use index 5

// Helper to read vertex params (Theta, T)
fn get_vertex_params(vIdx: u32) -> vec2<f32> {
    let base = vIdx * 3u;
    return vec2<f32>(vertices[base], vertices[base + 1u]);
}

fn write_vertex_params(vIdx: u32, p: vec2<f32>, surface: f32) {
    let base = vIdx * 3u;
    if (base + 2u < arrayLength(&vertices)) {
        vertices[base] = p.x;
        vertices[base + 1u] = p.y;
        vertices[base + 2u] = surface;
    }
}

// Interpolate and Snap Midpoint
fn create_midpoint(vA: u32, vB: u32, surface: f32) -> u32 {
    // 1. Read Parents
    let pA = get_vertex_params(vA);
    let pB = get_vertex_params(vB);
    
    // 2. Midpoint (Linear in Parametric Space)
    var mid = (pA + pB) * 0.5;
    
    // 3. Feature Snap (Critical!)
    // We snap the midpoint to features, constrained by the edge length.
    // If the edge is ON a feature, the midpoint should snap TO the feature.
    let dist = distance(pA, pB);
    
    // Box limit for snapping: Half the edge length? 
    // If we snap too far, we distort.
    let limits = vec2<f32>(abs(pA.x - pB.x) * 0.5, abs(pA.y - pB.y) * 0.5);
    
    // Snap
    let snapped = snap_vertex(mid.x, mid.y, limits);
    
    // 4. Emit
    let vNew = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    write_vertex_params(vNew, snapped, surface);
    
    return vNew;
}

@compute @workgroup_size(64)
fn subdivide_triangles(@builtin(global_invocation_id) gid: vec3<u32>) {
    let triIdx = get_global_idx(gid);
    // Note: Caller must ensure counters[4] is populated
    // We might need to initialize it in AdaptiveExportComputer
    let count = atomicLoad(&counters[4u]); // COUNTER_TRI_CURRENT
    
    if (triIdx >= count) { return; }
    
    let tri = triangles_current[triIdx];
    let v0 = tri.x;
    let v1 = tri.y;
    let v2 = tri.z;
    let surf = tri.w; // Surface ID (u32)
    let surface = f32(surf);
    
    let p0 = get_vertex_params(v0);
    let p1 = get_vertex_params(v1);
    let p2 = get_vertex_params(v2);
    
    // Calculate Importance
    // Centroid
    let center = (p0 + p1 + p2) * 0.333333;
    
    // Scale estimation (Bounding box of triangle)
    let minP = min(min(p0, p1), p2);
    let maxP = max(max(p0, p1), p2);
    let scale = maxP - minP; // dTheta, dT
    
    let importance = compute_importance(center.x, center.y, surface, scale);
    
    let threshold = uniforms.chunk4.x; // subdivThreshold
    // Min Size check?
    let area = abs((p1.x - p0.x)*(p2.y - p0.y) - (p2.x - p0.x)*(p1.y - p0.y)) * 0.5;
    let minArea = 0.000001; // Avoid infinite recursion
    
    if (importance > threshold && area > minArea) {
        // Splitting: 1 to 4 (High quality)
        //      v0
        //     /  \
        //   m0 -- m2
        //   / \  / \
        // v1 -- m1 -- v2
        
        let m0 = create_midpoint(v0, v1, surface);
        let m1 = create_midpoint(v1, v2, surface);
        let m2 = create_midpoint(v2, v0, surface);
        
        let baseIdx = atomicAdd(&counters[5u], 4u); // COUNTER_TRI_NEXT
        
        if (baseIdx + 3u < arrayLength(&triangles_next)) {
            // T0: v0, m0, m2
            triangles_next[baseIdx]      = vec4<u32>(v0, m0, m2, surf);
            // T1: m0, v1, m1
            triangles_next[baseIdx + 1u] = vec4<u32>(m0, v1, m1, surf);
            // T2: m1, v2, m2
            triangles_next[baseIdx + 2u] = vec4<u32>(m1, v2, m2, surf);
            // T3: m0, m1, m2 (Central)
            triangles_next[baseIdx + 3u] = vec4<u32>(m0, m1, m2, surf);
        }
    } else {
        // Keep original
        let baseIdx = atomicAdd(&counters[5u], 1u);
        if (baseIdx < arrayLength(&triangles_next)) {
            triangles_next[baseIdx] = tri;
        }
    }
}

// Final Emission: Just copy triangles to index buffer
@compute @workgroup_size(64)
fn emit_final_triangles(@builtin(global_invocation_id) gid: vec3<u32>) {
    let triIdx = get_global_idx(gid);
    let count = atomicLoad(&counters[4u]); // COUNTER_TRI_CURRENT
    
    if (triIdx >= count) { return; }
    
    let tri = triangles_current[triIdx];
    emit_triangle(tri.x, tri.y, tri.z);
}

