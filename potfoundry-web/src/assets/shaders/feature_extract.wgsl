
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
     case 0u: { return style_uniforms.chunk0.x; } // H
     case 1u: { return style_uniforms.chunk0.y; } // Rt
     case 2u: { return style_uniforms.chunk0.z; } // Rb
     case 3u: { return style_uniforms.chunk1.z; } // expn (Index 3 mapped to expn in FeatureExtractionComputer.ts? Wait, let's check packing)
     
     // CRITICAL FIX: Spin Params (Indices 4, 5, 6)
     // styles.wgsl expects: 4=Turns, 5=Phase, 6=Curve
     case 4u: { return style_uniforms.chunk2.x; } // spinTurns
     case 5u: { return style_uniforms.chunk2.y; } // spinPhase
     case 6u: { return style_uniforms.chunk2.z; } // spinCurveExp

     // Style ID
     case 7u: { return style_uniforms.chunk1.w; } // styleIndex (packed in chunk1.w in FeatureExtractionComputer)

     // Dimensions (continued)
     case 25u: { return style_uniforms.chunk0.w; } // tWall (Index 25 in styles.wgsl usually?)
     case 26u: { return style_uniforms.chunk1.x; } // tBottom

     // Chunk1: rDrain, expn...
     // Note: FeatureExtractionComputer packs: 
     // Chunk0: H, Rt, Rb, 0.0 (Wait, chunk0.w is 0.0 in FeatureExtractionComputer?)
     // Let's verify packing in FeatureExtractionComputer.ts first.
     
     // Adjusted based on Standard Packing:
     // Chunk0: H, Rt, Rb, tWall
     // Chunk1: tBottom, rDrain, expn, index
     
     // Redistributing to match styles.wgsl expectations:
     // If styles.wgsl uses getf(3) for expn, we must ensure chunk1.z is returned.
     // If styles.wgsl uses getf(25) for tWall, we return chunk0.w.

     case 13u: { return style_uniforms.chunk1.y; } // rDrain

     // Bell (Chunk 3)
     case 12u: { return style_uniforms.chunk3.x; } // BellAmp
     case 14u: { return style_uniforms.chunk3.x; } // BellAmp (Alias)
     case 15u: { return style_uniforms.chunk3.y; } // BellCenter
     case 72u: { return style_uniforms.chunk3.z; } // BellWidth
     case 73u: { return style_uniforms.chunk2.w; } // SeamAngle

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
    var K_max = 0.0;
    var dir = vec2<f32>(1.0, 0.0);

    // Compare magnitudes
    if (abs(l1) > abs(l2)) {
        K_max = l1;
    } else {
        K_max = l2;
    }
    
    // FILTER: Anisotropy check (Enforces "Line-like" features)
    // For a ridge/valley, one eigenvalue should be much larger than the other.
    // If they are similar, it's a dome/pit (isotropic) which leads to noisy "false peaks".
    let minCurv = min(abs(l1), abs(l2));
    let maxCurv = max(abs(l1), abs(l2));
    // If the feature is too isotropic (ratio > 0.6), reject it as a point-feature/noise
    if (maxCurv > 1e-4 && (minCurv / maxCurv) > 0.6) {
        return;
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
    
    // 3. Non-Maximum Suppression (NMS) & Sub-Pixel Refinement
    // We check if current pixel is indeed the "Peak" of the ridge.
    // We step ALONG the curvature gradient (v_norm).
    
    // Scale step by grid size (1 pixel step)
    let step_vec = v_norm * vec2<f32>(eps_u, eps_v);
    
    // Sample neighbors
    let theta_n = (u + step_vec.x) * 6.283185;
    let t_n     = v + step_vec.y;
    
    let theta_p = (u - step_vec.x) * 6.283185;
    let t_p     = v - step_vec.y;
    
    let r_n = eval_r_wrapped(theta_n, t_n);
    let r_p = eval_r_wrapped(theta_p, t_p);
    
    var is_feature = false;
    var delta = 0.0; // Sub-pixel offset (-0.5 to 0.5)
    
    if (K_max < -thresh) { 
         // Ridge (Convex Peak) -> Current C should be > neighbors
         if (c > r_n && c > r_p) {
             // Ridge Detected
             featureType = 1u; 
             strength = abs(K_max);
             is_feature = true;
         }
    } else if (K_max > thresh) { 
         // Valley Detected
         if (c < r_n && c < r_p) {
             featureType = 2u; 
             strength = abs(K_max);
             is_feature = true;
         }
    }
    
    // Refinement Shared Block: Golden Section Search (Derivative-Free)
    if (is_feature) {
         let phi = 0.61803398875;
         let inv_phi = 1.0 - phi;
         
         var a = -0.8;
         var b = 0.8;
         
         var c1 = a + inv_phi * (b - a);
         var c2 = b - inv_phi * (b - a);
         
         var u1 = u + c1 * step_vec.x;
         var v1 = v + c1 * step_vec.y;
         var val1 = eval_r_wrapped(u1 * 6.2831853, v1);
         
         var u2 = u + c2 * step_vec.x;
         var v2 = v + c2 * step_vec.y;
         var val2 = eval_r_wrapped(u2 * 6.2831853, v2);
         
         // 10 Iterations: 0.618^10 ~ 0.008. Initial 1.6 -> Final ~0.012 pixel width.
         for (var k = 0; k < 10; k++) {
             var swap = false;
             if (featureType == 1u) {
                 if (val1 < val2) { swap = true; }
             } else {
                 if (val1 > val2) { swap = true; } 
             }
             
             if (swap) {
                 a = c1;
                 c1 = c2;
                 val1 = val2;
                 
                 c2 = b - inv_phi * (b - a);
                 u2 = u + c2 * step_vec.x;
                 v2 = v + c2 * step_vec.y;
                 val2 = eval_r_wrapped(u2 * 6.2831853, v2);
             } else {
                 b = c2;
                 c2 = c1;
                 val2 = val1;
                 
                 c1 = a + inv_phi * (b - a);
                 u1 = u + c1 * step_vec.x;
                 v1 = v + c1 * step_vec.y;
                 val1 = eval_r_wrapped(u1 * 6.2831853, v1);
             }
         }
         
         delta = (a + b) * 0.5;

         // Output Logic (Must be inside is_feature!)
         let u_final = u + delta * step_vec.x;
         let v_final = v + delta * step_vec.y;
         
         // STABILITY CHECK: Did we actually improve?
         // If not, revert to the pixel center (delta = 0).
         // This pins the feature to the NMS-detected extrema if the sub-pixel search wanders off.
         let val_final = eval_r_wrapped(u_final * 6.2831853, v_final);
         
         var refined_is_better = false;
         if (featureType == 1u) { // Ridge (Max)
             if (val_final >= c) { refined_is_better = true; }
         } else { // Valley (Min)
             if (val_final <= c) { refined_is_better = true; }
         }
         
         var theta_final: f32;
         var t_final: f32;
         
         if (refined_is_better) {
             theta_final = u_final * 6.28318530718;
             t_final = v_final;
         } else {
             // Revert to center
             theta_final = theta;
             t_final = t;
         }

         let outIdx = atomicAdd(&counter, 1u);
         if (outIdx < arrayLength(&feature_points)) {
             feature_points[outIdx] = FeaturePoint(theta_final, t_final, featureType, strength);
         }
    }
}
