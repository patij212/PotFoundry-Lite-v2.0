// adaptive_mesh.wgsl - Complete Adaptive Mesh Generation for 3D Printing
// Generates all pot surfaces (outer/inner walls, rim, bottom, drain) with
// curvature-based adaptive subdivision for sharp edges and smooth curves.

// ============================================================================
// Bindings
// ============================================================================



struct AdaptiveUniforms {
  chunk0: vec4<f32>, // x:H, y:Rt, z:Rb, w:tWall
  chunk1: vec4<f32>, // x:tBottom, y:rDrain, z:expn, w:styleId
  chunk2: vec4<f32>, // x:spinTurns, y:spinPhase, z:spinCurve, w:reserved_seam
  chunk3: vec4<f32>, // x:bellAmp, y:bellCenter, z:bellWidth, w:maxDepth
  chunk4: vec4<f32>, // x:subdivThreshold, y:minQuadSize, z:targetTris, w:reserved
}

@group(0) @binding(0) var<uniform> uniforms: AdaptiveUniforms;
@group(0) @binding(1) var<storage, read> style_params: array<f32>;
@group(0) @binding(2) var<storage, read_write> vertices: array<f32>;
@group(0) @binding(3) var<storage, read_write> indices: array<u32>;
@group(0) @binding(4) var<storage, read_write> counters: array<atomic<u32>>; 
// [0]=vertex, [1]=index, [2]=tri_curr, [3]=tri_next, [4]=status, [5]=padding

// REPLACED: Point-based feature buffer with Segment-based Binned Buffers
@group(0) @binding(5) var<storage, read> feature_segments: array<f32>; // Flattened segments: x1, y1, x2, y2
@group(0) @binding(8) var<storage, read> grid_offsets: array<u32>;     // Grid bins (64 bins + 1 sentinel)

// Triangle: x=v0, y=v1, z=v2, w=surfaceID
@group(0) @binding(6) var<storage, read> triangles_current: array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> triangles_next: array<vec4<u32>>;

// Relaxation Buffers
@group(0) @binding(9) var<storage, read_write> metric_field: array<f32>; // 3 floats per vertex (m11, m12, m22)
@group(0) @binding(10) var<storage, read_write> vertices_out: array<f32>; // Ping-Pong buffer

fn get_metric_tensor(idx: u32) -> vec3<f32> {
    let base = idx * 3u;
    return vec3<f32>(metric_field[base], metric_field[base+1u], metric_field[base+2u]);
}

fn set_metric_tensor(idx: u32, m: vec3<f32>) {
    let base = idx * 3u;
    if (base + 2u < arrayLength(&metric_field)) {
        metric_field[base] = m.x;
        metric_field[base+1u] = m.y;
        metric_field[base+2u] = m.z;
    }
}

const COUNTER_VERTEX: u32 = 0u;
const COUNTER_INDEX: u32 = 1u;
const COUNTER_TRI_CURRENT: u32 = 2u;
const COUNTER_TRI_NEXT: u32 = 3u;
const COUNTER_STATUS: u32 = 4u;

const STATUS_OK: u32 = 0u;
const STATUS_VERTEX_OVERFLOW: u32 = 1u;
const STATUS_TRIANGLE_OVERFLOW: u32 = 2u;
const GRID_BINS: u32 = 64u;

// ============================================================================
// Uniform Accessors
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
    case 73u: { return uniforms.chunk2.w; }  // reserved_seam (formerly seamAngle)
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

fn get_H() -> f32 { return uniforms.chunk0.x; }
fn get_Rt() -> f32 { return uniforms.chunk0.y; }
fn get_Rb() -> f32 { return uniforms.chunk0.z; }
fn get_tWall() -> f32 { return uniforms.chunk0.w; }
fn get_tBottom() -> f32 { return uniforms.chunk1.x; }
fn get_rDrain() -> f32 { return uniforms.chunk1.y; }
fn get_expn() -> f32 { return uniforms.chunk1.z; }
fn get_styleId() -> i32 { return i32(uniforms.chunk1.w); }
fn get_minR() -> f32 { return 0.5; }

// ============================================================================
// Geometry Helpers
// ============================================================================

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

fn compute_approx_normal(theta: f32, t: f32, scale: vec2<f32>) -> vec3<f32> {
    let eps_th = 0.001; 
    let eps_t = 0.001;
    let r_c = compute_outer_radius(theta, t);
    let r_th = compute_outer_radius(theta + eps_th, t);
    let r_t = compute_outer_radius(theta, t + eps_t);
    let dr_dth = (r_th - r_c) / eps_th;
    let dr_dt = (r_t - r_c) / eps_t;
    let H = get_H();
    let cos_th = cos(theta);
    let sin_th = sin(theta);
    let dP_dth = vec3<f32>(dr_dth * cos_th - r_c * sin_th, dr_dth * sin_th + r_c * cos_th, 0.0);
    let dP_dt = vec3<f32>(dr_dt * cos_th, dr_dt * sin_th, H);
    return normalize(cross(dP_dth, dP_dt));
}

// ============================================================================
// Physical Metric Tensor
// ============================================================================

struct Metric {
    h_theta: f32, // Physical distance for 1 radian in theta direction (r)
    h_t: f32,     // Physical distance for 1 unit in t (height) direction
}

fn get_metric(theta: f32, t: f32) -> Metric {
    let r = compute_outer_radius(theta, t);
    let H = get_H();
    
    // dr/dt contribution to arch length:
    // ds^2 = (r dtheta)^2 + (dr/dt dt)^2 + (H dt)^2? No.
    // ds^2 = (r dtheta)^2 + (dz)^2 + (dr)^2
    // For theta direction: ds = r * dtheta (approx)
    // For t direction: ds = sqrt(H^2 + (dr/dt)^2) * dt
    
    let eps_t = 0.001;
    let r1 = compute_outer_radius(theta, t);
    let r2 = compute_outer_radius(theta, t + eps_t);
    let dr_dt = (r2 - r1) / eps_t;
    
    let h_theta = r;
    let h_t = sqrt(H * H + dr_dt * dr_dt);
    
    return Metric(max(0.1, h_theta), max(0.1, h_t));
}
// Segment Snapping (Spatial Grid)
// ============================================================================

struct Segment {
    p1: vec2<f32>,
    p2: vec2<f32>,
}

fn get_segment(idx: u32) -> Segment {
    let base = idx * 4u;
    return Segment(
        vec2<f32>(feature_segments[base], feature_segments[base+1u]),
        vec2<f32>(feature_segments[base+2u], feature_segments[base+3u])
    );
}

fn closest_point_segment(p: vec2<f32>, s: Segment) -> vec2<f32> {
    let ba = s.p2 - s.p1;
    let pa = p - s.p1;
    let dot_ba = dot(ba, ba);
    if (dot_ba < 0.000001) { return s.p1; } // Degenerate segment
    
    let h = clamp(dot(pa, ba) / dot_ba, 0.0, 1.0);
    return s.p1 + ba * h;
}

fn snap_vertex_uv(u_in: f32, v_in: f32, limit_box: vec2<f32>, threshold_sq: f32) -> vec2<f32> {
    // NaN guard: If inputs are invalid, return unchanged
    if (u_in != u_in || v_in != v_in) { return vec2<f32>(u_in, v_in); } // NaN check
    
    // Only snap if we have segments
    let seg_len = arrayLength(&feature_segments);
    if (seg_len == 0u) { return vec2<f32>(u_in, v_in); }
    let max_seg_idx = seg_len / 4u;
    
    // Binning logic works on normalized u (0..1)
    var u = u_in - floor(u_in);
    let v = v_in;
    let uv_p = vec2<f32>(u, v);
    
    // Bin Lookup - ensure valid range
    let bin_idx = u32(clamp(floor(u * f32(GRID_BINS)), 0.0, f32(GRID_BINS - 1u)));
    
    var best_dist_sq = 100.0;
    var best_uv = uv_p;
    
    // Search Current + Neighbor Bins (Wrap)
    for (var i = -1; i <= 1; i++) {
        let b_raw = i32(bin_idx) + i;
        var b = u32((b_raw + i32(GRID_BINS)) % i32(GRID_BINS));
        
        // Handle Seam Wrapping: Shift segment into local space
        // If we wrapped right (b_raw >= bins), segments in bin 0 are effectively at u+1.0
        // If we wrapped left (b_raw < 0), segments in bin 63 are effectively at u-1.0
        var offset_x = 0.0;
        if (b_raw < 0) { offset_x = -1.0; }
        else if (b_raw >= i32(GRID_BINS)) { offset_x = 1.0; }
        let offset = vec2<f32>(offset_x, 0.0);
        
        if (b >= GRID_BINS) { continue; } 
        
        let start = grid_offsets[b];
        let end = grid_offsets[b+1u];
        
        for (var k = start; k < end; k++) {
            // CRITICAL: Bounds check segment index to prevent garbage reads
            if (k >= max_seg_idx) { break; }
            
            let seg = get_segment(k);
            
            // NaN guard: Skip if segment contains NaN
            if (seg.p1.x != seg.p1.x || seg.p2.x != seg.p2.x) { continue; }
            
            let seg_shifted = Segment(seg.p1 + offset, seg.p2 + offset);
            let p_seg = closest_point_segment(uv_p, seg_shifted);
            
            // Euclidean check works correctly in shifted space
            let diff = uv_p - p_seg;
            let d2 = dot(diff, diff);
            
            if (d2 < best_dist_sq) {
                best_dist_sq = d2;
                best_uv = p_seg;
            }
        }
    }
    
    if (best_dist_sq < threshold_sq) {
        // Reconstruction
        // best_uv is in shifted space, so (best_uv.x - u) gives the correct signed delta
        let diff_u = best_uv.x - u;
        let diff_v = best_uv.y - v;
        
        // Limit clamping to prevents wild jumps
        let d_u_clamped = clamp(diff_u, -limit_box.x, limit_box.x);
        let d_v_clamped = clamp(diff_v, -limit_box.y, limit_box.y);
        
        let final_u = u_in + d_u_clamped;
        // Safety Normalize: Force 0..1 range
        let val = final_u - floor(final_u);
        return vec2<f32>(val, v_in + d_v_clamped);
    }

    return vec2<f32>(u_in, v_in);
}

// ... in create_midpoint ...
// let snap_thresh_uv = 0.001 * 0.001;
// let snapped = snap_vertex(mid.x, mid.y, limits, snap_thresh_uv);

// ... in snap_initial_vertices ...
// let limits = vec2<f32>(0.05, 0.05);
// let snapped = snap_vertex(theta, t, limits, 0.01); // 0.1^2 loose threshold

// ============================================================================
// Feature Proximity (Spatial Bin Lookup)
// ============================================================================

fn compute_feature_distance_sq(u: f32, t: f32) -> f32 {
    let seg_len = arrayLength(&feature_segments);
    if (seg_len == 0u) { return 100.0; }
    let max_seg_idx = seg_len / 4u;

    // Normalize u to [0,1)
    var u_norm = u - floor(u);
    let uv_p = vec2<f32>(u_norm, t);

    let bin_idx = u32(clamp(floor(u_norm * f32(GRID_BINS)), 0.0, f32(GRID_BINS - 1u)));

    var best_dist_sq = 100.0;

    // Search current + neighbor bins (with seam wrapping)
    for (var i = -1; i <= 1; i++) {
        let b_raw = i32(bin_idx) + i;
        var b = u32((b_raw + i32(GRID_BINS)) % i32(GRID_BINS));

        var offset_x = 0.0;
        if (b_raw < 0) { offset_x = -1.0; }
        else if (b_raw >= i32(GRID_BINS)) { offset_x = 1.0; }

        if (b >= GRID_BINS) { continue; }

        let start = grid_offsets[b];
        let end = grid_offsets[b + 1u];

        for (var k = start; k < end; k++) {
            if (k >= max_seg_idx) { break; }
            let seg = get_segment(k);
            if (seg.p1.x != seg.p1.x || seg.p2.x != seg.p2.x) { continue; }

            let seg_shifted = Segment(
                seg.p1 + vec2<f32>(offset_x, 0.0),
                seg.p2 + vec2<f32>(offset_x, 0.0)
            );
            let p_seg = closest_point_segment(uv_p, seg_shifted);
            let diff = uv_p - p_seg;
            let d2 = dot(diff, diff);

            if (d2 < best_dist_sq) {
                best_dist_sq = d2;
            }
        }
    }

    return best_dist_sq;
}

// ============================================================================
// Evaluation
// ============================================================================

fn compute_importance(u: f32, t: f32, surfaceType: f32, scale: vec2<f32>) -> vec2<f32> {
    // Non-wall surfaces get no adaptive subdivision
    // User Request: "Inner wall should not be densified."
    // Restricting to Surface 0 (Outer Wall) ONLY.
    // Surface 0 = Outer, 1 = Inner, 2 = Rim, 3/4 = Bottom, 5 = Drain.
    if (surfaceType > 0.5) { return vec2<f32>(0.0); }
    
    let TAU = 6.28318530718;
    // CONVERSION: Input is normalized UV (u), logic usually expects Radians (theta)
    let theta = u * TAU;
    
    let r_c = compute_outer_radius(theta, t);
    
    // ==========================================================
    // 1. COARSE SAGITTA (geometric fidelity at triangle scale)
    // ==========================================================
    // scale.x is in u units (0..1). eps must be converted for radius calculation.
    let eps_u     = max(scale.x * 0.5, 0.0001);
    let eps_theta = eps_u * TAU;
    let eps_t     = max(scale.y * 0.5, 0.0001);
    
    // Theta direction
    let r_tp_coarse = compute_outer_radius(theta + eps_theta, t);
    let r_tm_coarse = compute_outer_radius(theta - eps_theta, t);
    let mid_theta_coarse = (r_tp_coarse + r_tm_coarse) * 0.5;
    let sag_theta_coarse = abs(r_c - mid_theta_coarse);
    
    // T direction
    let t_pp = clamp(t + eps_t, 0.0, 1.0);
    let t_pm = clamp(t - eps_t, 0.0, 1.0);
    let r_pp_coarse = compute_outer_radius(theta, t_pp);
    let r_pm_coarse = compute_outer_radius(theta, t_pm);
    let mid_t_coarse = (r_pp_coarse + r_pm_coarse) * 0.5;
    let sag_t_coarse = abs(r_c - mid_t_coarse);
    
    let sag_coarse = max(sag_theta_coarse, sag_t_coarse);
    
    // ==========================================================
    // 2. FINE SAGITTA (ridge/feature detection at fixed scale)
    // ==========================================================
    // 0.002 in u (0.2%) is reasonable min scale
    let eps_fine_u = min(0.002, eps_u);
    let eps_fine_theta = eps_fine_u * TAU;
    
    let r_tp_fine = compute_outer_radius(theta + eps_fine_theta, t);
    let r_tm_fine = compute_outer_radius(theta - eps_fine_theta, t);
    let mid_theta_fine = (r_tp_fine + r_tm_fine) * 0.5;
    let sag_fine = abs(r_c - mid_theta_fine);
    
    // ==========================================================
    // 3. CYLINDER CHORD ERROR (per design spec line 574)
    //    Geometric error from approximating a circle with a chord
    //    This is CONSTANT for a cylinder, explaining uniform subdivision
    //    when only this metric is used. But it provides a baseline.
    // ==========================================================
    let half_angle = scale.x * TAU * 0.5; // Convert u-scale to radians
    let sag_circle = r_c * (1.0 - cos(half_angle));
    
    // ==========================================================
    // 4. NORMAL DEVIATION (per design spec lines 577-579)
    //    CAD-grade check: how much does normal change across triangle?
    //    High deviation = feature edge = needs subdivision
    // ==========================================================
    // compute_approx_normal takes theta (radians) and uses internal eps (radians). 
    // scale arg is unused for eps.
    // ==========================================================
    // 4. NORMAL DEVIATION (Directional)
    // ==========================================================
    let n_c = compute_approx_normal(theta, t, scale);
    
    // Check U-direction normal change
    let n_u = compute_approx_normal(theta + eps_theta, t, scale);
    let normal_err_u = max(0.0, 1.0 - dot(n_c, n_u));

    // Check V-direction normal change
    let n_v = compute_approx_normal(theta, t + eps_t, scale);
    let normal_err_v = max(0.0, 1.0 - dot(n_c, n_v));
    
    // ==========================================================
    // 5. COMBINE (Anisotropic & Physically Normalized)
    // ==========================================================
    let metric = get_metric(theta, t);
    
    // Scale error by Chord Error and Sagitta
    // We also include Chord Error (sag_circle) to ensure smooth cylinders
    var err_u = max(max(sag_theta_coarse, sag_circle), normal_err_u * 0.5);
    var err_v = max(sag_t_coarse, normal_err_v * 0.5);
    
    // ==========================================================
    // 6. FEATURE PROXIMITY BOOST
    //    Force isotropic subdivision near feature segments.
    //    Without this, edges running ALONG ridges have low sagitta
    //    and never subdivide, creating elongated shard triangles.
    // ==========================================================
    let feat_dist_sq = compute_feature_distance_sq(u, t);
    let feat_influence = 0.05; // ~5% UV radius of influence (~18° around pot) - covers all 3 buffer rings
    let feat_influence_sq = feat_influence * feat_influence;
    if (feat_dist_sq < feat_influence_sq) {
        let proximity = 1.0 - sqrt(feat_dist_sq) / feat_influence;
        // Cubic falloff: very strong near the feature, gentle fade
        let bonus = proximity * proximity * proximity * 2.0;
        err_u = max(err_u, bonus);
        err_v = max(err_v, bonus);
    }
    
    // Convert parametric scale to physical scale [mm]
    let scale_u_phys = scale.x * metric.h_theta * TAU; 
    let scale_v_phys = scale.y * metric.h_t;
    
    // Density is "Error per unit physical length"
    let density_u = err_u / max(scale_u_phys, 0.001);
    let density_v = err_v / max(scale_v_phys, 0.001);
    
    return vec2<f32>(density_u, density_v);
}

// ============================================================================
// Triangle Subdivision
// ============================================================================

fn get_global_idx(gid: vec3<u32>) -> u32 {
    return gid.x + gid.y * 4194240u; 
}

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

fn create_midpoint(vA: u32, vB: u32, surface: f32) -> u32 {
    let pA = get_vertex_params(vA);
    let pB = get_vertex_params(vB);
    
    // NaN guard: If input params are invalid, return first vertex unchanged
    if (pA.x != pA.x || pB.x != pB.x || pA.y != pA.y || pB.y != pB.y) {
        return vA; // Fallback to original vertex
    }
    
    // CRITICAL FIX: Handle wrap-around in normalized UV coordinates (0..1)
    var uA = pA.x;
    var uB = pB.x;
    
    // If difference is > 0.5, one of them crossed the seam
    let diff = uB - uA;
    if (diff > 0.5) {
        uB += 1.0;
    } else if (diff < -0.5) {
        uA += 1.0;
    }
    
    var mid = vec2<f32>((uA + uB) * 0.5, (pA.y + pB.y) * 0.5);
    
    // Normalize u back to 0..1 range
    mid.x = mid.x - floor(mid.x);
    
    // SNAP DISABLED (v3.8): The CDT already places vertices exactly on features
    // via constraint edges. Snapping midpoints to features during subdivision
    // is counterproductive: the snap radius (0.0005) is LARGER than the buffer
    // offset (0.00025), causing feature-to-buffer midpoints to collapse onto
    // the feature edge. This creates massive degenerate triangles (875K+).
    // With feature-proximity-driven subdivision, the geometric midpoint
    // produces correct, well-shaped triangles near features.
    var snapped = mid;
    
    let vNew = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    
    if (vNew * 3u + 2u >= arrayLength(&vertices)) {
        atomicStore(&counters[COUNTER_STATUS], STATUS_VERTEX_OVERFLOW);
        return vA; 
    }
    
    write_vertex_params(vNew, snapped, surface);
    return vNew;
}

// ============================================================================
// Edge-Based Subdivision Logic (T-Junction Free)
// ============================================================================

fn check_edge_split(vA: u32, vB: u32, surface: f32) -> bool {
    let pA = get_vertex_params(vA);
    let pB = get_vertex_params(vB);
    
    // Edge properties
    let mid = (pA + pB) * 0.5;
    
    // Scale for importance: Use edge length
    // This ensures neighbor agreement (Scale depends only on the edge)
    let d = abs(pA - pB);
    let scale = vec2<f32>(max(d.x, 0.0001), max(d.y, 0.0001));
    
    // CONSERVATIVE SPLITTING: Quantize midpoint to force neighbor agreement
    // Snap to ~0.0001 grid (10000.0)
    let qMid = vec2<f32>(floor(mid.x * 10000.0 + 0.5) / 10000.0, floor(mid.y * 10000.0 + 0.5) / 10000.0);
    
    // Check importance at QUANTIZED midpoint
    let imp = compute_importance(qMid.x, qMid.y, surface, scale);
    
    // Metric: Max of U and V importance
    let val = max(imp.x, imp.y);
    let threshold = uniforms.chunk4.x;
    
    // Stop splitting if edge is too small (Micro-feature prevention)
    // FEATURE-AWARE: Allow finer subdivision near features (lower guard)
    let max_len = max(scale.x, scale.y);
    let feat_d_sq = compute_feature_distance_sq(qMid.x, qMid.y);
    let min_edge = select(0.0005, 0.0001, feat_d_sq < 0.006 * 0.006); // 5x finer within buffer rings (max ring = 0.005)
    if (max_len < min_edge) { return false; }
    
    // SAFETY BIAS: Multiply value by 1.05
    // Maximizing agreement: if A sees 0.03001 and B sees 0.02999 (threshold 0.03) -> Crack.
    // We can't know what neighbor sees.
    // Best bet: Snap the metric/importance calculation to lower precision to force agreement.
    // OR: Quantize the midpoint 'mid' before computing importance.
    // 'mid' is already quantized by float representation, but differences in pA+pB calculation matter.
    // Let's try a simple bias: 
    // val > threshold.
    // We add a tiny bias 0.0001 to push borderline cases UP? No, that just shifts the threshold.
    //
    // ROBUST FIX: Use quantized midpoint for importance sample.
    // let qMid = vec2<f32>(floor(mid.x * 10000.0)/10000.0, floor(mid.y * 10000.0)/10000.0);
    // AND Bias the importance result slightly to avoid 1.0 exact checks?
    // 
    // Actually, simple "Safety Bias" requested by user.
    // "Add a safety bias ... to prevent T-junctions near the threshold."
    // This usually implies favoring split:
    // val * 1.05 > threshold
    return (val * 1.05) > threshold;
}

@compute @workgroup_size(64)
fn subdivide_triangles(@builtin(global_invocation_id) gid: vec3<u32>) {
    let triIdx = get_global_idx(gid);
    let count = atomicLoad(&counters[COUNTER_TRI_CURRENT]);
    
    if (triIdx >= count) { return; }
    
    let tri = triangles_current[triIdx];
    let v0 = tri.x;
    let v1 = tri.y;
    let v2 = tri.z;
    let surf = tri.w;
    let surface = f32(surf);

    // 1. Evaluate Edges Independently
    // E0: v0 -> v1
    // E1: v1 -> v2
    // E2: v2 -> v0
    let split0 = check_edge_split(v0, v1, surface);
    let split1 = check_edge_split(v1, v2, surface);
    let split2 = check_edge_split(v2, v0, surface);
    
    // 2. Formulate Case Mask
    // Bit 0: Edge 0 (v0-v1)
    // Bit 1: Edge 1 (v1-v2)
    // Bit 2: Edge 2 (v2-v0)
    var mask = 0u;
    if (split0) { mask = mask | 1u; }
    if (split1) { mask = mask | 2u; }
    if (split2) { mask = mask | 4u; }
    
    // Reserve space based on case
    // Case 0: 1 tri (Reuse slot? No, strict append to Next)
    // Case 1,2,4: 2 tris
    // Case 3,5,6: 3 tris
    // Case 7: 4 tris
    
    var count_needed = 1u;
    if (mask == 0u) { count_needed = 1u; }
    else if (mask == 1u || mask == 2u || mask == 4u) { count_needed = 2u; }
    else if (mask == 3u || mask == 5u || mask == 6u) { count_needed = 3u; }
    else { count_needed = 4u; } // mask == 7
    
    let baseIdx = atomicAdd(&counters[COUNTER_TRI_NEXT], count_needed);
    
    if (baseIdx + count_needed > arrayLength(&triangles_next)) {
        atomicStore(&counters[COUNTER_STATUS], STATUS_TRIANGLE_OVERFLOW);
        return;
    }
    
    // 3. Generate Geometry
    // Helper to create midpoints only if needed (Atomic cost)
    // We already evaluated check_edge_split, so we know we need them.
    // Ideally we cache them? No, create_midpoint creates a vertex.
    // If neighbor creates same midpoint, we rely on WeldMesh to merge later.
    // (GPU Topological Merge is Hard).
    // The T-Junction fix is ensuring the VERTEX EXISTS on the edge.
    
    var m0 = 0u; var m1 = 0u; var m2 = 0u;
    if (split0) { m0 = create_midpoint(v0, v1, surface); }
    if (split1) { m1 = create_midpoint(v1, v2, surface); }
    if (split2) { m2 = create_midpoint(v2, v0, surface); }
    
    // 4. Emit Triangles
    if (mask == 0u) {
        // --- 1 Triangle (Keep) ---
        triangles_next[baseIdx] = tri;
    }
    else if (mask == 1u) { // Split E0
        // v0-m0-v2, m0-v1-v2
        triangles_next[baseIdx]    = vec4<u32>(v0, m0, v2, surf);
        triangles_next[baseIdx+1u] = vec4<u32>(m0, v1, v2, surf);
    }
    else if (mask == 2u) { // Split E1
        // v1-m1-v0, m1-v2-v0
        triangles_next[baseIdx]    = vec4<u32>(v1, m1, v0, surf);
        triangles_next[baseIdx+1u] = vec4<u32>(m1, v2, v0, surf);            
    }
    else if (mask == 4u) { // Split E2
        // v2-m2-v1, m2-v0-v1
        triangles_next[baseIdx]    = vec4<u32>(v2, m2, v1, surf);
        triangles_next[baseIdx+1u] = vec4<u32>(m2, v0, v1, surf);
    }
    else if (mask == 3u) { // Split E0 & E1 (v0-v1, v1-v2)
        // Quad (v0, m0, m1, v2) + Tri (m0, v1, m1)? No.
        // Fan from common vertex v1?
        // Tris: v0-m0-v2 ?? No.
        // Neighbors of split edges (mask 3):
        // E0 splits (m0), E1 splits (m1). E2 (v2-v0) intact.
        // Connect m0-m1.
        // T1: m0, v1, m1 (Corner tip)
        // T2: v0, m0, m1 ?? No, Quad: v0, m0, m1, v2.
        // Split Quad (v0, m0, v2) ? No m0 is on v0-v1.
        // Ear clipping:
        // T1: m0, v1, m1
        // T2: v0, m0, v2
        // T3: m0, m1, v2
        triangles_next[baseIdx]    = vec4<u32>(m0, v1, m1, surf);
        triangles_next[baseIdx+1u] = vec4<u32>(v0, m0, v2, surf);
        triangles_next[baseIdx+2u] = vec4<u32>(m0, m1, v2, surf);
    }
    else if (mask == 6u) { // Split E1 & E2 (v1-v2, v2-v0)
        // Common vertex v2.
        // T1: m1, v2, m2 (Tip)
        // T2: v1, m1, v0
        // T3: m1, m2, v0
        triangles_next[baseIdx]    = vec4<u32>(m1, v2, m2, surf);
        triangles_next[baseIdx+1u] = vec4<u32>(v1, m1, v0, surf);
        triangles_next[baseIdx+2u] = vec4<u32>(m1, m2, v0, surf);
    }
    else if (mask == 5u) { // Split E0 & E2 (v0-v1, v2-v0)
        // Common vertex v0.
        // T1: m2, v0, m0 (Tip)
        // T2: v2, m2, v1
        // T3: m2, m0, v1
        triangles_next[baseIdx]    = vec4<u32>(m2, v0, m0, surf);
        triangles_next[baseIdx+1u] = vec4<u32>(v2, m2, v1, surf);
        triangles_next[baseIdx+2u] = vec4<u32>(m2, m0, v1, surf);
    }
    else { // Mask 7 (All Split)
        // Standard 1-to-4
        // T0: v0, m0, m2
        // T1: m0, v1, m1
        // T2: m1, v2, m2
        // T3: m0, m1, m2
        triangles_next[baseIdx]    = vec4<u32>(v0, m0, m2, surf);
        triangles_next[baseIdx+1u] = vec4<u32>(m0, v1, m1, surf);
        triangles_next[baseIdx+2u] = vec4<u32>(m1, v2, m2, surf);
        triangles_next[baseIdx+3u] = vec4<u32>(m0, m1, m2, surf);
    }
}

// ============================================================================
// Emit Final Geometry
// ============================================================================

fn emit_triangle_indices(v0: u32, v1: u32, v2: u32) {
    let iIdx = atomicAdd(&counters[COUNTER_INDEX], 3u);
    if (iIdx + 2u < arrayLength(&indices)) {
        indices[iIdx] = v0;
        indices[iIdx + 1u] = v1;
        indices[iIdx + 2u] = v2;
    }
}

@compute @workgroup_size(64)
fn emit_final_triangles(@builtin(global_invocation_id) gid: vec3<u32>) {
    // Reads from 'current' (which is actually the final buffer bound to slot 6)
    let triIdx = get_global_idx(gid);
    let count = atomicLoad(&counters[COUNTER_TRI_CURRENT]); 
    
    if (triIdx >= count) { return; }
    
    let tri = triangles_current[triIdx];
    
    // Safety: Filter Degenerate Triangles (indices 0,0,0) using a tolerance? 
    // Actually, just check indices.
    // Uninitialized buffer slots are 0,0,0,0.
    // Some valid triangles might use vertex 0.
    // But a triangle using 0,0,0 is degenerate.
    if (tri.x == tri.y && tri.x == tri.z) { return; }
    
    emit_triangle_indices(tri.x, tri.y, tri.z);
}

// ============================================================================
// Vertex Realization (XYZ evaluation)
// ============================================================================

@compute @workgroup_size(64)
fn evaluate_vertices(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = get_global_idx(gid);
    // Standard vertices buffer (binding 2)
    // NOTE: Vertex count is stored in counters[COUNTER_VERTEX] (0)
    // We can't access it easily without atomic? Or assume it's correct implicitly.
    // Just bounds check against array length.
    
    if (idx * 3u >= arrayLength(&vertices)) { return; }
    
    let base = idx * 3u;
    let u = vertices[base];
    let theta = u * 6.28318530718;
    let t = vertices[base + 1u];
    let surface = vertices[base + 2u];
    
    var x = 0.0; var y = 0.0; var z = 0.0;
    
    let H = get_H();
    
    if (surface < 0.5) { // OUTER (0)
        let r = compute_outer_radius(theta, t);
        let th = compute_twist(theta, t);
        z = t * H;
        x = r * cos(th);
        y = r * sin(th);
    } else if (surface < 1.5) { // INNER (1)
        let tBottom = get_tBottom();
        let z_height = tBottom + t * (H - tBottom);
        let t_radius = z_height / H; 
        
        let r = compute_inner_radius(theta, t_radius);
        let th = compute_twist(theta, t_radius);
        // Correct Z for inner:
        z = z_height; 
        x = r * cos(th);
        y = r * sin(th);

    } else if (surface < 2.5) { // RIM (2)
        // Interpolate between Inner Top and Outer Top
        // t=0 -> Inner Edge, t=1 -> Outer Edge
        
        let t_top = 1.0;
        let r_inner = compute_inner_radius(theta, t_top);
        let r_outer = compute_outer_radius(theta, t_top);
        
        let r = r_inner + (r_outer - r_inner) * t;
        let th = compute_twist(theta, t_top);
        
        z = H;
        x = r * cos(th);
        y = r * sin(th);

    } else if (surface < 3.5) { // BOTTOM UNDER (3)
        // t=0 -> Outer Edge (r=rOuterAtBottom), t=1 -> Drain (r=rDrain)
        let t_bot = 0.0;
        let r_outer = compute_outer_radius(theta, t_bot);
        let r_drain = get_rDrain();
        
        let r = r_outer + (r_drain - r_outer) * t;
        let th = compute_twist(theta, t_bot);
        
        z = 0.0; // Flat bottom base
        x = r * cos(th);
        y = r * sin(th);

    } else if (surface < 4.5) { // BOTTOM TOP (4)
        // t=0 -> Inner Edge (r=rInnerAtTop usually? No, Bottom Top connects to Inner Wall Bottom)
        // Inner Wall Bottom is at z=tBottom.
        // t=0 -> Inner Wall Connection, t=1 -> Drain
        
        let H = get_H();
        let tBottom = get_tBottom();
        let t_radius_bot = tBottom / H;
        
        let r_inner = compute_inner_radius(theta, t_radius_bot);
        let r_drain = get_rDrain();
        
        let r = r_inner + (r_drain - r_inner) * t;
        let th = compute_twist(theta, t_radius_bot);
        
        z = tBottom;
        x = r * cos(th);
        y = r * sin(th);
        
    } else if (surface < 5.5) { // DRAIN (5)
        // Cylinder at r=rDrain
        // t=0 -> Bottom Under (z=0), t=1 -> Bottom Top (z=tBottom)
        let r = get_rDrain();
        // Twist must interpolate from z=0 to z=tBottom to match connecting surfaces!
        let H = get_H();
        let tBottom = get_tBottom();
        let t_ratio = t * (tBottom / H);
        let th = compute_twist(theta, t_ratio); 
        
        z = t * get_tBottom();
        x = r * cos(th);
        y = r * sin(th);

    } else {
        // Just fail safe
        x = 0.0; y = 0.0; z = 0.0;
    }
    
    // NaN Guard: If any coordinate is NaN, output a tiny valid vertex
    // This prevents spikes and allows mesh post-processing to filter it
    if (x != x || y != y || z != z) {
        x = 0.001; y = 0.001; z = 0.001;
    }
    
    vertices[base] = x;
    vertices[base + 1u] = y;
    vertices[base + 2u] = z;
}

// ============================================================================
// Pre-Snap Pass: Snap Initial Base Mesh Vertices to Feature Lines
// This runs BEFORE subdivision to ensure all vertices (not just midpoints)
// are aligned to feature curves.
// ============================================================================

@compute @workgroup_size(64)
fn snap_initial_vertices(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = get_global_idx(gid);
    
    // Each vertex is 3 floats: theta, t, surface
    if (idx * 3u + 2u >= arrayLength(&vertices)) { return; }

    let base = idx * 3u;
    let u = vertices[base];
    let t = vertices[base + 1u];
    let surface = vertices[base + 2u];

    // Only snap outer wall vertices (surface == 0)
    // Inner wall, rim, bottom, drain vertices should not be snapped to outer wall features
    if (surface > 0.5) { return; }

    // CRITICAL FIX: Do NOT snap top/bottom boundary vertices!
    // They must align perfectly with Rim/Bottom surfaces (which are not snapped).
    // Snapping them creates gaps/holes in the mesh.
    if (t < 0.001 || t > 0.999) { return; }

    // Use conservative limits for initial snap - don't destroy curvature
    // Allow up to 0.5% movement (was 5% which flattened features)
    let limits = vec2<f32>(0.005, 0.005); 
    // Threshold ~ 0.01 (1%) in UV distance squared => 0.0001
    let snapped = snap_vertex_uv(u, t, limits, 0.0001);

    // Write back the snapped coordinates
    vertices[base] = snapped.x;
    vertices[base + 1u] = snapped.y;
    // surface remains unchanged
}

// ============================================================================
// GPU Feature-Ridge Snap (v5.4)
//
// For each outer-wall vertex, find the nearest feature ridge or valley
// using 2D Hessian-based extremum detection.
//
// v5.4 changes (from v5.1):
//   - 2D snap: follows features in BOTH theta and t directions
//   - Uses Hessian eigendecomposition to find the ridge direction
//   - Steps perpendicular to the ridge to find the exact extremum
//   - Falls back to theta-only snap for purely circumferential features
//   - Uses Golden Section Search for final sub-grid refinement
// ============================================================================

@compute @workgroup_size(64)
fn snap_to_feature_ridges(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = get_global_idx(gid);
    if (idx * 3u + 2u >= arrayLength(&vertices)) { return; }

    let base = idx * 3u;
    let u = vertices[base];
    let t = vertices[base + 1u];
    let surface = vertices[base + 2u];

    // Only snap outer wall vertices (surface == 0)
    if (surface > 0.5) { return; }

    // Don't snap boundary rows — must align with rim/bottom surfaces
    if (t < 0.003 || t > 0.997) { return; }

    let TAU_VAL = 6.28318530718;
    let theta = u * TAU_VAL;

    // Finite difference steps — small enough for sharp features
    let h_th = 0.001;  // ~0.06 degrees — finer than v5.4 for better Hessian accuracy
    let h_t = 0.001;   // ~0.1% height

    // --- Compute Hessian of r(theta, t) at current position ---
    let r_c = compute_outer_radius(theta, t);
    let r_th_p = compute_outer_radius(theta + h_th, t);
    let r_th_m = compute_outer_radius(theta - h_th, t);
    let r_t_p = compute_outer_radius(theta, t + h_t);
    let r_t_m = compute_outer_radius(theta, t - h_t);

    // Gradient
    let dr_dth = (r_th_p - r_th_m) / (2.0 * h_th);
    let dr_dt = (r_t_p - r_t_m) / (2.0 * h_t);
    let grad_mag = sqrt(dr_dth * dr_dth + dr_dt * dr_dt);

    // Second derivatives (Hessian)
    let r_aa = (r_th_p - 2.0 * r_c + r_th_m) / (h_th * h_th);
    let r_bb = (r_t_p - 2.0 * r_c + r_t_m) / (h_t * h_t);
    
    // Mixed partial — 4-corner central difference
    let r_pp = compute_outer_radius(theta + h_th, t + h_t);
    let r_pm = compute_outer_radius(theta + h_th, t - h_t);
    let r_mp = compute_outer_radius(theta - h_th, t + h_t);
    let r_mm = compute_outer_radius(theta - h_th, t - h_t);
    let r_ab = (r_pp - r_mp - r_pm + r_mm) / (4.0 * h_th * h_t);

    // Quick reject: if Hessian is too flat, no feature here
    let hess_mag = max(abs(r_aa), max(abs(r_bb), abs(r_ab)));
    if (hess_mag < 0.002) { return; } // v7.1: Reverted — 0.0005 caught numerical noise

    // --- Eigendecomposition of Hessian ---
    // H = [r_aa, r_ab; r_ab, r_bb]
    let tr = r_aa + r_bb;
    let det = r_aa * r_bb - r_ab * r_ab;
    let disc = sqrt(max(0.0, tr * tr - 4.0 * det));
    let l1 = (tr + disc) * 0.5; // Larger eigenvalue (in magnitude)
    let l2 = (tr - disc) * 0.5;

    // The ridge/valley direction is the eigenvector of the SMALLER eigenvalue
    // (the direction ALONG the ridge). The normal to the ridge is the
    // eigenvector of the LARGER eigenvalue (crosses the ridge).
    var lambda_cross = l1;
    var lambda_along = l2;
    if (abs(l2) > abs(l1)) {
        lambda_cross = l2;
        lambda_along = l1;
    }

    // Anisotropy check: for a true ridge, |lambda_cross| >> |lambda_along|
    if (abs(lambda_cross) < 0.01) { return; } // v7.1: Reverted — 0.002 caused flat-area snapping
    let anisotropy = abs(lambda_along) / abs(lambda_cross);
    if (anisotropy > 0.7) { return; } // v7.1: Reverted — 0.85 allowed noise-level features to snap

    // Eigenvector for lambda_cross (direction ACROSS the ridge)
    var cross_dir = vec2<f32>(r_ab, lambda_cross - r_aa);
    let cross_len = length(cross_dir);
    if (cross_len < 0.0001) { cross_dir = vec2<f32>(1.0, 0.0); }
    else { cross_dir = cross_dir / cross_len; }

    // Project gradient onto cross direction — how far to the extremum
    let grad_cross = dr_dth * cross_dir.x + dr_dt * cross_dir.y;
    let score = abs(grad_cross) / (abs(lambda_cross) * max(h_th, h_t));
    if (score > 10.0) { return; } // v7.1: Reverted — 15.0 pulled distant vertices across neighbors

    // --- Golden Section Search along cross direction for exact extremum ---
    let phi = 0.61803398875;
    let inv_phi = 1.0 - phi;
    let is_ridge = lambda_cross < 0.0; // Negative curvature = concave down = ridge

    // Search window: ±10 grid steps in cross direction (wider than v5.4's ±6)
    var a_param = -10.0;
    var b_param = 10.0;

    var c1_param = a_param + inv_phi * (b_param - a_param);
    var c2_param = b_param - inv_phi * (b_param - a_param);

    var th1 = theta + c1_param * h_th * cross_dir.x;
    var t1 = t + c1_param * h_t * cross_dir.y;
    var val1 = compute_outer_radius(th1, clamp(t1, 0.0, 1.0));

    var th2 = theta + c2_param * h_th * cross_dir.x;
    var t2 = t + c2_param * h_t * cross_dir.y;
    var val2 = compute_outer_radius(th2, clamp(t2, 0.0, 1.0));

    // 16 iterations: 0.618^16 ≈ 0.0015 of initial window for sub-grid precision
    for (var iter = 0; iter < 16; iter++) {
        var swap = false;
        if (is_ridge) {
            // Looking for maximum
            if (val1 < val2) { swap = true; }
        } else {
            // Looking for minimum (valley)
            if (val1 > val2) { swap = true; }
        }

        if (swap) {
            a_param = c1_param;
            c1_param = c2_param;
            val1 = val2;

            c2_param = b_param - inv_phi * (b_param - a_param);
            th2 = theta + c2_param * h_th * cross_dir.x;
            t2 = t + c2_param * h_t * cross_dir.y;
            val2 = compute_outer_radius(th2, clamp(t2, 0.0, 1.0));
        } else {
            b_param = c2_param;
            c2_param = c1_param;
            val2 = val1;

            c1_param = a_param + inv_phi * (b_param - a_param);
            th1 = theta + c1_param * h_th * cross_dir.x;
            t1 = t + c1_param * h_t * cross_dir.y;
            val1 = compute_outer_radius(th1, clamp(t1, 0.0, 1.0));
        }
    }

    // Final position
    let final_param = (a_param + b_param) * 0.5;
    let new_theta = theta + final_param * h_th * cross_dir.x;
    let new_t = t + final_param * h_t * cross_dir.y;

    // Validate: the new position must be a stronger extremum than original
    let r_new = compute_outer_radius(new_theta, clamp(new_t, 0.0, 1.0));
    var improved = false;
    if (is_ridge) {
        improved = r_new > r_c - 0.001; // Ridge: r should be higher (or at least same)
    } else {
        improved = r_new < r_c + 0.001; // Valley: r should be lower (or at least same)
    }
    if (!improved) { return; }

    // --- Snap limit: allow snapping up to 1.5× grid spacing ---
    // Widened from 0.5× to 1.5× so more vertices can reach nearby features.
    // With CDF adaptation already concentrating grid lines near features,
    // a wider snap radius is safe and ensures dense feature coverage.
    let W = f32(uniforms.chunk4.w);
    let safe_W = select(2000.0, W, W > 0.0);
    let col_spacing_1_5 = (TAU_VAL / safe_W) * 1.5;

    let total_theta_shift = abs(new_theta - theta);
    let total_t_shift = abs(new_t - t);
    if (total_theta_shift > col_spacing_1_5) { return; }
    if (total_t_shift > col_spacing_1_5) { return; }

    // Clamp t to valid range
    let clamped_t = clamp(new_t, 0.003, 0.997);

    // Write back adjusted UV position
    var u_new = new_theta / TAU_VAL;
    u_new = (u_new % 1.0 + 1.0) % 1.0; // Normalize to [0, 1)
    vertices[base] = u_new;
    vertices[base + 1u] = clamped_t;
}


// ============================================================================
// v5.3 Anisotropic Relaxation (Metric Optimization)
// ============================================================================

// ... (Bindings moved to top)

// Compute Metric Tensor Field based on Curvature
@compute @workgroup_size(64)
fn compute_metric_field(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = get_global_idx(gid);
    if (idx * 3u >= arrayLength(&vertices)) { return; }

    let base = idx * 3u;
    let u = vertices[base];
    let t = vertices[base + 1u];
    let surface = vertices[base + 2u];

    // Only relax outer wall (Surface 0)
    if (surface > 0.5) {
        // Identity metric for others (isotropic, unit density)
        set_metric_tensor(idx, vec3<f32>(1.0, 0.0, 1.0));
        return;
    }

    let theta = u * 6.28318530718;
    
    // Compute Hessian of r(theta, t) for anisotropic metric
    // v6.0: Finer eps for sharper feature detection in metric tensor.
    // Previous 0.01 (~3.6°) was too coarse — missed narrow ridges entirely.
    let eps_th = 0.003; // ~0.17° — resolves features down to ~0.6° width
    let eps_t = 0.003;  // ~0.3mm on a 100mm pot

    let r_c = compute_outer_radius(theta, t);
    let r_th_p = compute_outer_radius(theta + eps_th, t);
    let r_th_m = compute_outer_radius(theta - eps_th, t);
    let r_t_p = compute_outer_radius(theta, t + eps_t);
    let r_t_m = compute_outer_radius(theta, t - eps_t);
    
    // All 4 corners for proper central-difference mixed partial
    let r_pp = compute_outer_radius(theta + eps_th, t + eps_t);
    let r_pm = compute_outer_radius(theta + eps_th, t - eps_t);
    let r_mp = compute_outer_radius(theta - eps_th, t + eps_t);
    let r_mm = compute_outer_radius(theta - eps_th, t - eps_t);

    // Second derivatives
    let r_aa = (r_th_p - 2.0 * r_c + r_th_m) / (eps_th * eps_th);
    let r_bb = (r_t_p - 2.0 * r_c + r_t_m) / (eps_t * eps_t);
    // Mixed partial: d²r/(dθ dt) — proper 4-corner central difference
    let r_ab = (r_pp - r_mp - r_pm + r_mm) / (4.0 * eps_th * eps_t);

    // Hessian Matrix H = [r_aa, r_ab; r_ab, r_bb]
    // Eigen decomposition to find principal directions
    // det(H - lambda I) = 0 => (r_aa-l)(r_bb-l) - r_ab^2 = 0
    // l^2 - (r_aa+r_bb)l + (r_aa*r_bb - r_ab^2) = 0
    
    let tr = r_aa + r_bb;
    let det = r_aa * r_bb - r_ab * r_ab;
    let disc = sqrt(max(0.0, tr * tr - 4.0 * det));
    let l1 = (tr + disc) * 0.5;
    let l2 = (tr - disc) * 0.5;
    
    // Eigenvectors
    // If r_ab is small, e1 ~ (1,0) or (0,1).
    // Vector v1 such that (H - l1 I) v1 = 0
    // [r_aa-l1, r_ab] [x] = 0
    // [r_ab, r_bb-l1] [y]
    // x = -r_ab, y = r_aa - l1
    
    var e1 = vec2<f32>(r_ab, l1 - r_aa);
    let len1 = length(e1);
    if (len1 > 0.0001) { e1 = normalize(e1); } else { e1 = vec2<f32>(1.0, 0.0); }
    
    let e2 = vec2<f32>(-e1.y, e1.x); // Orthogonal
    
    // Construct Metric
    // We want high penalty along direction of HIGH curvature (l1)
    // Beta = 1 + weight * curvature^2
    let w = 200.0; // Anisotropy weight — higher = stronger vertex concentration at features (v6.0)
    let val1 = 1.0 + w * l1 * l1;
    let val2 = 1.0 + w * l2 * l2;
    
    // Clamping to avoid extreme stiffness
    let s1 = clamp(val1, 1.0, 250.0); // Raised from 150 for stronger anisotropy
    let s2 = clamp(val2, 1.0, 250.0);
    
    // ASPECT RATIO CORRECTION (Physical Stability)
    // The UV map is square [0,1], but the physical surface is cylindrical.
    // Circumference ~ 2*PI*R, Height ~ H.
    // Ratio rho = (2*PI*R) / H.
    // If rho > 1 (wide pot), a small du corresponds to a large physical distance.
    // We must penalize du more to equilibrate physically.
    // Scale local metric by rho^2 for u-component.
    
    let H_phys = get_H();
    let R_avg = compute_outer_radius(theta, 0.5); // Sample mid-height radius
    let circ = 6.28318530718 * R_avg;
    let rho_raw = circ / max(H_phys, 0.001);
    // CRITICAL FIX: Clamp rho to prevent explosion on flat pots (Precision Flow)
    let rho = min(rho_raw, 10.0); 
    let rho_sq = rho * rho;
    
    // M = s1 * e1 * e1^T + s2 * e2 * e2^T
    // m11 = s1 e1.x^2 + s2 e2.x^2
    // m12 = s1 e1.x e1.y + s2 e2.x e2.y
    // m22 = s1 e1.y^2 + s2 e2.y^2
    
    let m11 = (s1 * e1.x * e1.x + s2 * e2.x * e2.x) * rho_sq;
    let m12 = (s1 * e1.x * e1.y + s2 * e2.x * e2.y) * rho;
    let m22 = s1 * e1.y * e1.y + s2 * e2.y * e2.y;
    
    set_metric_tensor(idx, vec3<f32>(m11, m12, m22));
}

// Relax Vertices (Ping-Pong)
@compute @workgroup_size(64)
fn relax_vertices(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = get_global_idx(gid);
    if (idx * 3u >= arrayLength(&vertices)) { return; }

    let base = idx * 3u;
    let u_c = vertices[base];
    let t_c = vertices[base + 1u];
    let surface = vertices[base + 2u];
    
    // Only relax outer wall
    if (surface > 0.5) {
        vertices_out[base] = u_c;
        vertices_out[base+1u] = t_c;
        vertices_out[base+2u] = surface;
        return;
    }
    
    // Get Metric at center
    let M_c = get_metric_tensor(idx); // (m11, m12, m22)
    
    // Neighbors (Grid Topology)
    // Assuming we know grid dimensions. Need to pass them in Uniforms!
    // Uniforms chunk4.z is targetTris.
    // We need 'stride' (Row Width). 
    // Hack: We can infer stride if we assume the grid is dense and filling the buffer.
    // But we don't know it easily here.
    // SOLUTION: Use 'grid_params' uniform or similar.
    // Currently, ParametricExportComputer computes grid dims on CPU.
    // We MUST pass W (width) to the shader.
    // Let's assume uniform 'chunk4.w' is W. (Currently 'reserved').
    
    let W = u32(uniforms.chunk4.w);
    if (W == 0u) { return; } // Safety
    
    // Calculate grid coordinates
    let row = idx / W;
    let col = idx % W;
    
    // 4-Neighbors
    // Handle wrapping for U (cols)
    let col_L = (col + W - 1u) % W;
    let col_R = (col + 1u) % W;
    
    let idx_L = row * W + col_L;
    let idx_R = row * W + col_R;
    // Handle Clamping for T (rows) - assume large enough buffer
    let idx_U = (row + 1u) * W + col; // Up (t+)
    let idx_D = (row - 1u) * W + col; // Down (t-)
    
    // Check bounds for T
    var p_L = vec2<f32>(vertices[idx_L * 3u], vertices[idx_L * 3u + 1u]);
    var p_R = vec2<f32>(vertices[idx_R * 3u], vertices[idx_R * 3u + 1u]);
    var p_U = vec2<f32>(t_c, t_c); // Default to current if boundary
    var p_D = vec2<f32>(t_c, t_c);
    
    // Fix wrapping coords for L/R
    // If we wrapped, p_L.x might be 0.99 while we are 0.01.
    // We need delta.
    // Delta x should be smallest distance on circle.
    // But here we are relaxing RELATIVE positions.
    // Easier: compute deltas.
    
    var d_L = p_L - vec2<f32>(u_c, t_c);
    var d_R = p_R - vec2<f32>(u_c, t_c);
    
    if (d_L.x > 0.5) { d_L.x -= 1.0; } else if (d_L.x < -0.5) { d_L.x += 1.0; }
    if (d_R.x > 0.5) { d_R.x -= 1.0; } else if (d_R.x < -0.5) { d_R.x += 1.0; }
    
    // T-neighbors check
    // We need array length check or row check
    let max_row = (arrayLength(&vertices) / 3u) / W;
    var valid_U = false;
    var valid_D = false;
    
    var d_U = vec2<f32>(0.0, 0.0);
    var d_D = vec2<f32>(0.0, 0.0);

    if (row + 1u < max_row) {
       let s_U = vertices[idx_U * 3u + 2u];
       if (s_U == surface) {
           p_U = vec2<f32>(vertices[idx_U * 3u], vertices[idx_U * 3u + 1u]);
           d_U = p_U - vec2<f32>(u_c, t_c);
           if (d_U.x > 0.5) { d_U.x -= 1.0; } else if (d_U.x < -0.5) { d_U.x += 1.0; }
           valid_U = true;
       }
    }
    
    if (row > 0u) {
       let s_D = vertices[idx_D * 3u + 2u];
       if (s_D == surface) {
           p_D = vec2<f32>(vertices[idx_D * 3u], vertices[idx_D * 3u + 1u]);
           d_D = p_D - vec2<f32>(u_c, t_c);
           if (d_D.x > 0.5) { d_D.x -= 1.0; } else if (d_D.x < -0.5) { d_D.x += 1.0; }
           valid_D = true;
       }
    }
    
    // Laplacian Force: Variable Coefficient (Div(M Grad u))
    // We want to minimize \int (Grad u)^T M (Grad u)
    // Force = Sum_neighbors [ 0.5 * (M_i + M_j) * (p_j - p_i) ]
    
    // M_c is already declared in outer scope

    
    var force = vec2<f32>(0.0, 0.0);
    
    // Left Neighbor
    let M_L = get_metric_tensor(idx_L);
    let M_edge_L = (M_c + M_L) * 0.5;
    let v_L = d_L; // p_L - p_c
    force += vec2<f32>(
        M_edge_L.x * v_L.x + M_edge_L.y * v_L.y,
        M_edge_L.y * v_L.x + M_edge_L.z * v_L.y
    );
    
    // Right Neighbor
    let M_R = get_metric_tensor(idx_R);
    let M_edge_R = (M_c + M_R) * 0.5;
    let v_R = d_R; // p_R - p_c
    force += vec2<f32>(
        M_edge_R.x * v_R.x + M_edge_R.y * v_R.y,
        M_edge_R.y * v_R.x + M_edge_R.z * v_R.y
    );
    
    // Up Neighbor
    if (valid_U) {
        let M_U = get_metric_tensor(idx_U);
        let M_edge_U = (M_c + M_U) * 0.5;
        let v_U = d_U;
        force += vec2<f32>(
            M_edge_U.x * v_U.x + M_edge_U.y * v_U.y,
            M_edge_U.y * v_U.x + M_edge_U.z * v_U.y
        );
    }
    
    // Down Neighbor
    if (valid_D) {
        let M_D = get_metric_tensor(idx_D);
        let M_edge_D = (M_c + M_D) * 0.5;
        let v_D = d_D;
        force += vec2<f32>(
            M_edge_D.x * v_D.x + M_edge_D.y * v_D.y,
            M_edge_D.y * v_D.x + M_edge_D.z * v_D.y
        );
    }
    
    // Update step — v7.1: Moderate increase (1.5x) for better convergence
    let dt = 0.00015; // 1.5x original — safe convergence without crossing (2000 iters)
    let move_vec = force * dt;
    
    // Limit movement (CFL) — max 0.15% of UV domain per step
    let move_len = length(move_vec);
    let max_move = 0.0015; // v7.1: 1.5x original — prevents vertex crossover
    let limited_move = move_vec * min(1.0, max_move / (move_len + 0.00001));
    
    // v7.2: Crossover guard — prevent vertex from passing its grid neighbors
    // Compute max allowed displacement as fraction of neighbor distance
    let max_frac = 0.25; // Never move more than 25% toward a neighbor
    var clamp_x = limited_move.x;
    var clamp_y = limited_move.y;
    
    // Limit U movement: don't cross left or right neighbor
    if (clamp_x > 0.0 && length(d_R) > 0.0001) {
        clamp_x = min(clamp_x, abs(d_R.x) * max_frac);
    } else if (clamp_x < 0.0 && length(d_L) > 0.0001) {
        clamp_x = max(clamp_x, -abs(d_L.x) * max_frac);
    }
    
    // Limit T movement: don't cross up or down neighbor  
    if (clamp_y > 0.0 && valid_U && length(d_U) > 0.0001) {
        clamp_y = min(clamp_y, abs(d_U.y) * max_frac);
    } else if (clamp_y < 0.0 && valid_D && length(d_D) > 0.0001) {
        clamp_y = max(clamp_y, -abs(d_D.y) * max_frac);
    }
    
    var new_u = u_c + clamp_x;
    var new_t = t_c + clamp_y;
    
    // Clamp/Wrap
    new_u = new_u - floor(new_u); // Wrap U
    new_t = clamp(new_t, 0.0, 1.0); // Clamp T
    
    // Write Output
    vertices_out[base] = new_u;
    vertices_out[base+1u] = new_t;
    vertices_out[base+2u] = surface;
}

