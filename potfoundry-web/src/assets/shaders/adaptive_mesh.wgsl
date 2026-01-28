// adaptive_mesh.wgsl - Complete Adaptive Mesh Generation for 3D Printing
// Generates all pot surfaces (outer/inner walls, rim, bottom, drain) with
// curvature-based adaptive subdivision for sharp edges and smooth curves.

// ============================================================================
// Bindings
// ============================================================================



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
@group(0) @binding(4) var<storage, read_write> counters: array<atomic<u32>>; 
// [0]=vertex, [1]=index, [2]=tri_curr, [3]=tri_next, [4]=status, [5]=padding

// REPLACED: Point-based feature buffer with Segment-based Binned Buffers
@group(0) @binding(5) var<storage, read> feature_segments: array<f32>; // Flattened segments: x1, y1, x2, y2
@group(0) @binding(8) var<storage, read> grid_offsets: array<u32>;     // Grid bins (64 bins + 1 sentinel)

// Triangle: x=v0, y=v1, z=v2, w=surfaceID
@group(0) @binding(6) var<storage, read> triangles_current: array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> triangles_next: array<vec4<u32>>;

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

fn snap_vertex(theta: f32, t: f32, limit_box: vec2<f32>) -> vec2<f32> {
    // Only snap if we have segments
    if (arrayLength(&feature_segments) == 0u) { return vec2<f32>(theta, t); }
    
    // Convert Theta/T to UV space (0..1)
    let TAU = 6.28318530718;
    // Normalize theta to 0..1
    var u = (theta % TAU);
    if (u < 0.0) { u += TAU; }
    u = u / TAU;
    let v = t; // t is already 0..1
    
    let uv_p = vec2<f32>(u, v);
    
    // Bin Lookup
    let bin_idx = u32(floor(u * f32(GRID_BINS))) % GRID_BINS;
    
    var best_dist_sq = 100.0; // Large init
    var best_uv = uv_p;
    
    // Search Current + Neighbor Bins (Wrap)
    for (var i = -1; i <= 1; i++) {
        // Handle negative wrap properly in WGSL
        let b_raw = i32(bin_idx) + i;
        var b = u32((b_raw + i32(GRID_BINS)) % i32(GRID_BINS));
        
        // Access Grid
        // grid_offsets has size 65 (64 bins + 1 end)
        if (b >= GRID_BINS) { continue; } // Safety
        
        let start = grid_offsets[b];
        let end = grid_offsets[b+1u];
        
        for (var k = start; k < end; k++) {
            let seg = get_segment(k);
            let p_seg = closest_point_segment(uv_p, seg);
            
            // Distance Check
            let diff = uv_p - p_seg;
            // X-wrap distance fix? 
            // Our segments are in 0..1. The point is 0..1.
            // If we are close to edge, the segment might be "0.99 -> 0.01".
            // The segment itself doesn't wrap (we split it).
            // But distance calculation across 0/1 boundary?
            // If bin check handles neighbors, and segments are duplicated in bins...
            // We just need standard Euclidean distance to the *segment instance*.
            
            let d2 = dot(diff, diff);
            
            if (d2 < best_dist_sq) {
                best_dist_sq = d2;
                best_uv = p_seg;
            }
        }
    }
    
    // Threshold in UV space
    // 0.05 * 0.05 is HUGE in UV (whole object is 1.0).
    // Corresponds to ~5% of circumference or height.
    // Let's use smaller threshold. 0.01 (~3.6 degrees / 1mm on 100mm pot)
    let snap_thresh_uv = 0.005 * 0.005; 
    
    if (best_dist_sq < snap_thresh_uv) {
        // Convert back to Theta/T
        // u -> theta
        // We need to be careful about wrapping if best_u crossed boundary.
        // best_uv is in 0..1
        // theta is unbounded (-inf..inf). We want to stay *near* input theta.
        
        // Reconstruct Theta:
        // theta_base = floor(theta / TAU) * TAU;
        // theta_new = theta_base + best_uv.x * TAU;
        
        // But if we wrapped, best_uv.x might be far from u.
        // e.g. u=0.99, best=0.01.
        // diff = -0.98. But actual diff is +0.02.
        
        var diff_u = best_uv.x - u;
        if (diff_u > 0.5) { diff_u -= 1.0; }
        else if (diff_u < -0.5) { diff_u += 1.0; }
        
        let snapped_theta = theta + diff_u * TAU;
        let snapped_t = best_uv.y; // t doesn't wrap
        
        let d_th_clamped = clamp(snapped_theta - theta, -limit_box.x, limit_box.x);
        let d_t_clamped = clamp(snapped_t - t, -limit_box.y, limit_box.y);
        
        return vec2<f32>(theta + d_th_clamped, t + d_t_clamped);
    }

    return vec2<f32>(theta, t);
}

// ============================================================================
// Evaluation
// ============================================================================

fn compute_importance(theta: f32, t: f32, surfaceType: f32, scale: vec2<f32>) -> f32 {
    var base_imp = 0.0;
    
    // Only adaptive on walls for now
    if (surfaceType < 2.5) { 
         // Sagitta
         let r_c = compute_outer_radius(theta, t);
         let eps_theta = max(scale.x * 0.5, 0.0001);
         let eps_t     = max(scale.y * 0.5, 0.0001);

         let r_tp = compute_outer_radius(theta + eps_theta, t);
         let r_tm = compute_outer_radius(theta - eps_theta, t);
         let mid_theta = (r_tp + r_tm) * 0.5;
         let sag_theta = abs(r_c - mid_theta);

         let t_pp = clamp(t + eps_t, 0.0, 1.0);
         let t_pm = clamp(t - eps_t, 0.0, 1.0);
         let r_pp = compute_outer_radius(theta, t_pp);
         let r_pm = compute_outer_radius(theta, t_pm);
         let mid_t = (r_pp + r_pm) * 0.5;
         let sag_t = abs(r_c - mid_t);
         
         let sag = max(sag_theta, sag_t);

         // Feature Bonus (Spatial Grid) - ONLY for Outer Wall (Surface 0)
         var feature_bonus = 0.0;
         if (surfaceType < 0.5 && arrayLength(&feature_segments) > 0u) {
            let TAU = 6.2831853;
            var u = (theta % TAU);
            if (u < 0.0) { u += TAU; }
            u = u / TAU;
            let uv_p = vec2<f32>(u, t);
            let bin_idx = u32(floor(u * f32(GRID_BINS))) % GRID_BINS;
            
            // Check Bins
            for (var i = -1; i <= 1; i++) {
                let b_raw = i32(bin_idx) + i;
                let b = u32((b_raw + i32(GRID_BINS)) % i32(GRID_BINS));
                let start = grid_offsets[b];
                let end = grid_offsets[b+1u];
                
                for (var k = start; k < end; k++) {
                    let seg = get_segment(k);
                    let p_seg = closest_point_segment(uv_p, seg);
                    let diff = uv_p - p_seg;
                    if (dot(diff, diff) < 0.005 * 0.005) { // Close to feature
                         feature_bonus = 0.5;
                         break;
                    }
                }
                if (feature_bonus > 0.0) { break; }
            }
         }

         let damp = max(max(scale.x, scale.y), 0.001);
         base_imp = (sag + feature_bonus) / damp;
    } 
    
    return base_imp;
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
    
    // CRITICAL FIX: Handle theta wrap-around at 0/2π boundary
    // If theta values span the seam, adjust before averaging
    let TAU = 6.28318530718;
    var thetaA = pA.x;
    var thetaB = pB.x;
    
    // If difference is > π, one of them crossed the seam
    let diff = thetaB - thetaA;
    if (diff > 3.14159) {
        // B is near 0, A is near 2π -> wrap B up
        thetaB += TAU;
    } else if (diff < -3.14159) {
        // A is near 0, B is near 2π -> wrap A up
        thetaA += TAU;
    }
    
    var mid = vec2<f32>((thetaA + thetaB) * 0.5, (pA.y + pB.y) * 0.5);
    
    // Normalize theta back to 0..TAU range
    mid.x = mid.x - floor(mid.x / TAU) * TAU;
    
    let limits = vec2<f32>(abs(pA.x - pB.x) * 0.5, abs(pA.y - pB.y) * 0.5);
    
    // CRITICAL FIX: Only snap vertices for Surface 0 (Outer Wall).
    // Other surfaces (Inner, Rim, etc.) use 't' differently (e.g. for radial interpolation)
    // and should NOT snap to outer wall feature segments.
    var snapped = mid;
    if (surface < 0.5) {
        snapped = snap_vertex(mid.x, mid.y, limits);
    }
    
    let vNew = atomicAdd(&counters[COUNTER_VERTEX], 1u);
    
    // SAFETY: Check Vertex Buffer Capacity
    if (vNew * 3u + 2u >= arrayLength(&vertices)) {
        atomicStore(&counters[COUNTER_STATUS], STATUS_VERTEX_OVERFLOW);
        return vA; // Fail gracefully by returning parent
    }
    
    write_vertex_params(vNew, snapped, surface);
    return vNew;
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
    
    let p0 = get_vertex_params(v0);
    let p1 = get_vertex_params(v1);
    let p2 = get_vertex_params(v2);
    
    let center = (p0 + p1 + p2) * 0.333333;
    let minP = min(min(p0, p1), p2);
    let maxP = max(max(p0, p1), p2);
    let scale = maxP - minP;
    
    let importance = compute_importance(center.x, center.y, surface, scale);
    
    let threshold = uniforms.chunk4.x;
    let targetTriangles = u32(uniforms.chunk4.z);
    
    let area = abs((p1.x - p0.x)*(p2.y - p0.y) - (p2.x - p0.x)*(p1.y - p0.y)) * 0.5;
    let minArea = 0.000000001; 

    // Budget Check: Check if we have space in Next Buffer
    // This is approximate as atomicAdd is resolving simultaneously
    
    if (importance > threshold && area > minArea) {
        // Prepare to split
        let baseIdx = atomicAdd(&counters[COUNTER_TRI_NEXT], 4u);
        
        if (baseIdx + 3u < arrayLength(&triangles_next)) {
            let m0 = create_midpoint(v0, v1, surface);
            let m1 = create_midpoint(v1, v2, surface);
            let m2 = create_midpoint(v2, v0, surface);
            
            // T0: v0, m0, m2
            triangles_next[baseIdx]      = vec4<u32>(v0, m0, m2, surf);
            // T1: m0, v1, m1
            triangles_next[baseIdx + 1u] = vec4<u32>(m0, v1, m1, surf);
            // T2: m1, v2, m2
            triangles_next[baseIdx + 2u] = vec4<u32>(m1, v2, m2, surf);
            // T3: m0, m1, m2 (Central)
            triangles_next[baseIdx + 3u] = vec4<u32>(m0, m1, m2, surf);
        } else {
             atomicStore(&counters[COUNTER_STATUS], STATUS_TRIANGLE_OVERFLOW);
             // Best effort fallback: try to just copy original?
             // If we reserved 4 slots but overflowed, we can't clean up easily.
             // Just mark overflow and hope validation catches it.
        }
    } else {
        // Keep original
        let baseIdx = atomicAdd(&counters[COUNTER_TRI_NEXT], 1u);
        if (baseIdx < arrayLength(&triangles_next)) {
            triangles_next[baseIdx] = tri;
        } else {
            atomicStore(&counters[COUNTER_STATUS], STATUS_TRIANGLE_OVERFLOW);
        }
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
    let theta = vertices[base];
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
        // Twist? Use average or bottom twist
        let th = compute_twist(theta, 0.0); 
        
        z = t * get_tBottom();
        x = r * cos(th);
        y = r * sin(th);

    } else {
        // Just fail safe
        x = 0.0; y = 0.0; z = 0.0;
    }
    
    vertices[base] = x;
    vertices[base + 1u] = y;
    vertices[base + 2u] = z;
}
