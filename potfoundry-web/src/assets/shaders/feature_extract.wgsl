
// feature_extract.wgsl
// Concatenated after: common.wgsl + styles.wgsl + dispatch code

// ============================================================================
// Bindings
// ============================================================================

struct ExtractUniforms {
  gridSizeX: u32,  // theta resolution (e.g. 2048)
  gridSizeY: u32,  // z resolution (e.g. 1024)
  threshold: f32, // Ridge detection threshold
  minFeatureLen: f32, // Minimum feature length to preserve
}

struct FeaturePoint {
    theta: f32,
    t: f32,
    featureType: u32, // 1=Ridge, 2=Valley, 3=Crease
    strength: f32,
}

@group(0) @binding(0) var<uniform> uniforms: ExtractUniforms;
@group(0) @binding(1) var<storage, read> style_params: array<f32>;
// Output: Dense feature map (texture or buffer). We use a buffer for sparse compaction later.
// For now, let's output a specialized tiny buffer that just marks "is_feature" per grid cell?
// Better: Output a list of "candidate points" via atomic counter.
@group(0) @binding(2) var<storage, read_write> feature_points: array<FeaturePoint>; 
@group(0) @binding(3) var<storage, read_write> counter: atomic<u32>;

// Helper to access style params (matches adaptive_mesh signatures)
fn style_param(idx: u32) -> f32 {
  if (idx >= arrayLength(&style_params)) { return 0.0; }
  return style_params[idx];
}
fn style_params_active() -> bool { return arrayLength(&style_params) > 0u; }
fn get_styleId() -> i32 { return 0; } // Placeholder, usually injected

// Redefine getf (simplified) - assumed common.wgsl is prepended but we need to link uniforms
// In reality, we might need to duplicate the ExtractUniforms struct? 
// No, we'll assume the host code binds the SAME buffer layout for 'chunk0..chunk4' if we reuse styles?
// WAIT: styles.wgsl relies on 'getf' which relies on specific uniform layout.
// We must mirror the layout from adaptive_mesh.wgsl OR inject 'getf'.
// For simplicity, we will define the "StyleUniforms" block here exactly as styles expects it.

struct StyleUniforms {
  chunk0: vec4<f32>,
  chunk1: vec4<f32>,
  chunk2: vec4<f32>,
  chunk3: vec4<f32>,
}
@group(0) @binding(4) var<uniform> style_uniforms: StyleUniforms;

fn getf(idx: u32) -> f32 {
  switch idx {
     case 0u: { return style_uniforms.chunk0.x; }
     case 1u: { return style_uniforms.chunk0.y; }
     case 2u: { return style_uniforms.chunk0.z; }
     case 3u: { return style_uniforms.chunk1.z; }
     case 4u: { return style_uniforms.chunk2.x; }
     case 5u: { return style_uniforms.chunk2.y; }
     case 6u: { return style_uniforms.chunk2.z; }
     case 8u: { return 5.0; }
     case 9u: { return 5.0; }
     case 10u: { return 1.0; }
     case 11u: { return 1.0; }
     case 12u: { return 1.0; }
     case 14u: { return style_uniforms.chunk3.x; }
     case 15u: { return style_uniforms.chunk3.y; }
     case 72u: { return style_uniforms.chunk3.z; }
     case 73u: { return style_uniforms.chunk2.w; }
     default: { return 0.0; }
   }
}

// ============================================================================
// Ridge Detection Logic
// ============================================================================

// Evaluate radius at (theta, t)
fn eval_r(theta: f32, t: f32) -> f32 {
    let r0 = r_base(t);
    // style_radius is injected by the host concatenation
    // We assume 'styleId' is effectively 0 or passed via uniform if needed
    // But our dispatch usually compiles a specific 'style_radius' function.
    let styleId = i32(style_uniforms.chunk1.w);
    return style_radius(styleId, theta, t, r0);
}
// Safe eval with wrapping
fn eval_r_wrapped(theta: f32, t: f32) -> f32 {
    let t_clamped = clamp(t, 0.0, 1.0);
    // Wrap theta
    let PI = 3.14159265;
    let TAU = 6.2831853;
    var th = theta % TAU;
    if (th < 0.0) { th += TAU; }
    
    return eval_r(th, t_clamped);
}

@compute @workgroup_size(64)
fn detect_features(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let width = uniforms.gridSizeX;
    let height = uniforms.gridSizeY;
    
    // We Map 1D index to 2D grid
    if (idx >= width * height) { return; }
    
    let ix = idx % width;
    let iy = idx / width;
    
    // Parametric Coords
    let du = 1.0 / f32(width);
    let dv = 1.0 / f32(height);
    let u = f32(ix) * du; // 0..1
    let v = f32(iy) * dv; // 0..1
    
    let theta = u * 6.28318530718;
    let t = v;
    
    let eps_u = du;
    let eps_v = dv;
    
    // Hessian & NMS Feature Extraction (CAD-Grade)
    // ------------------------------------------------------------------------
    // 1. Compute Hessian Matrix of R(theta, t)
    // H = [ f_uu  f_uv ]
    //     [ f_uv  f_vv ]
    
    // Stencil:
    // tl t tr
    //  l c  r
    // bl b br
    
    // We already computed c, l, r, b, top (5 taps).
    // f_uu ~ (l - 2c + r)
    // f_vv ~ (b - 2c + top)
    // We need f_uv.
    // f_uv ~ (tr + bl - tl - br) / 4   (central diff)
    
    // Gather corner samples (Using Wrapped Eval)
    let tl = eval_r_wrapped(theta - eps_u * 6.28, t + eps_v);
    let tr = eval_r_wrapped(theta + eps_u * 6.28, t + eps_v);
    let bl = eval_r_wrapped(theta - eps_u * 6.28, t - eps_v);
    let br = eval_r_wrapped(theta + eps_u * 6.28, t - eps_v);
    
    // Axis samples
    let c = eval_r(theta, t); // Centered, no warp needed usually? Actually inputs are u,v. Theta is 0..2PI.
    let l = eval_r_wrapped(theta - eps_u * 6.28, t);
    let r_samp = eval_r_wrapped(theta + eps_u * 6.28, t); // Rename r -> r_samp
    let b = eval_r_wrapped(theta, t - eps_v);
    let top = eval_r_wrapped(theta, t + eps_v);

    let f_uu_raw = r_samp - 2.0 * c + l;
    let f_vv_raw = top - 2.0 * c + b;
    let f_uv_raw = (tr + bl - tl - br) * 0.25;
    
    // Normalize to Curvature (d2 / step^2)
    // Step sizes in parameter space
    let d_theta = eps_u * 6.283185;
    let d_t = eps_v;
    
    // Avoid divide by zero (shouldn't happen with valid grid)
    let f_uu = f_uu_raw / (d_theta * d_theta);
    let f_vv = f_vv_raw / (d_t * d_t);
    let f_uv = f_uv_raw / (d_theta * d_t);
    
    // 2. Compute Eigenvalues/Eigenvectors
    // Det = f_uu * f_vv - f_uv * f_uv
    // Trace = f_uu + f_vv
    // L1,2 = (Trace +/- sqrt(Trace^2 - 4*Det)) / 2
    
    
    let trace = f_uu + f_vv;
    let det = f_uu * f_vv - f_uv * f_uv;
    
    // Fix NaN: Clamp discriminant
    let discriminant = max(0.0, trace * trace - 4.0 * det);
    
    // If disc < 0, roughly isotropic/flat?
    // if (discriminant < 0.0) { return; } // Removed check since max(0) handles it
    
    let root = sqrt(discriminant);
    let l1 = (trace + root) * 0.5; // Major eigenvalue
    let l2 = (trace - root) * 0.5; // Minor eigenvalue
    
    // Choose dominant curvature direction
    // If |l1| > |l2|, principal curvature is L1.
    // Eigenvector for L1?
    // M * v = L * v  => (H - L*I)v = 0
    // [ f_uu - L   f_uv    ] [ vx ] = 0
    // [ f_uv       f_vv - L] [ vy ] = 0
    // => (f_uu - L)vx + f_uv*vy = 0
    // => vy/vx = -(f_uu - L) / f_uv
    // OR vy/vx = -f_uv / (f_vv - L)
    
    var K_max = 0.0;
    var dir = vec2<f32>(1.0, 0.0);
    
    // Compare magnitudes
    if (abs(l1) > abs(l2)) {
        K_max = l1;
    } else {
        K_max = l2;
    }
    
    // Identification
    var featureType = 0u;
    var strength = 0.0;
    
    // Threshold Check (Curvature Magnitude)
    let thresh = uniforms.threshold;
    if (abs(K_max) < thresh) { return; }
    
    // Calculate Direction (Unnormalized)
    // Robust eigenvector calculation
    // Use the row with largest norm to avoid degenerate cases
    let row1 = vec2<f32>(f_uu - K_max, f_uv);
    let row2 = vec2<f32>(f_uv, f_vv - K_max);
    
    if (dot(row1, row1) > dot(row2, row2)) {
         dir = vec2<f32>(-row1.y, row1.x); // Perpendicular to row? No, v is in null space of (A - LI). 
         // Wait. (A - LI)v = 0. So v is perpendicular to rows of (A-LI).
         // So if row1 is (a, b), then v is (-b, a).
    } else {
         dir = vec2<f32>(-row2.y, row2.x);
    }
    
    // Normalize direction (in UV space approx)
    let dir_len = length(dir);
    if (dir_len < 1e-6) { return; }
    
    // Principal Direction in UV space
    let v_norm = dir / dir_len;
    
    // 3. Non-Maximum Suppression (NMS)
    // We check if current pixel is indeed the "Peak" of the ridge.
    // We step ALONG the curvature gradient?
    // NO. The Eigenvector 'v' is the direction of PRINCIPAL CURVATURE.
    // i.e. the surface bends MOST along 'v'.
    // So to find the Ridge Peak, we must walk along 'v'.
    // Check R(p + v) and R(p - v).
    // If K_max < 0 (Concave, Hill), we expect R(p) > R(neighbors).
    // If K_max > 0 (Convex, Valley), we expect R(p) < R(neighbors).
    
    // Scale step by grid size (1 pixel step)
    // We used normalized U,V for coords.
    // We need step in U and V.
    // v_norm is just a direction vector.
    // Scale it to pixel size?
    // We want to check exact neighbor pixels? No, subpixel sample is better.
    let step_vec = v_norm * vec2<f32>(eps_u, eps_v);
    
    // Sample neighbors
    // Note: theta involves 2PI scaling. eps_u is 1/W.
    // eval_r takes (theta, t).
    // step_vec.x is delta_u.
    let theta_n = (u + step_vec.x) * 6.283185;
    let t_n     = v + step_vec.y;
    
    let theta_p = (u - step_vec.x) * 6.283185; // Opposite direction
    let t_p     = v - step_vec.y;
    
    let r_n = eval_r_wrapped(theta_n, t_n);
    let r_p = eval_r_wrapped(theta_p, t_p);
    
    var is_feature = false;
    
    if (K_max < -thresh) { // Ridge (Convex Hull? No, Convex usually means + curvature? Convention varies)
         // Our H = -d2.
         // If d2u < -thresh (Code above said Ridge).
         // d2u = (r-2c+l). If Peak (c > l,r), d2u is Negative.
         // So Negative Curvature = Ridge.
         
         // NMS: Peak Condition
         // Use strict inequality to avoid flat plateaus?
         if (c > r_n && c > r_p) {
             featureType = 1u; // Ridge
             strength = abs(K_max);
             is_feature = true;
         }
    } else if (K_max > thresh) { // Valley
         // NMS: Pit Condition
         if (c < r_n && c < r_p) {
             featureType = 2u; // Valley
             strength = abs(K_max);
             is_feature = true;
         }
    }
    
    if (is_feature) {
        let outIdx = atomicAdd(&counter, 1u);
        if (outIdx < arrayLength(&feature_points)) {
            feature_points[outIdx] = FeaturePoint(theta, t, featureType, strength);
        }
    }
}
