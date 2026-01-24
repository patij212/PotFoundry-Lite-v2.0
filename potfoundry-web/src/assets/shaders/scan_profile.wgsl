// scan_profile.wgsl
// High-resolution profile scanner to detect shape features
// Used to build an adaptive Z-LUT for exported meshes.

// Reuse the same uniforms as Export/Preview for compatibility
struct ExportUniforms {
  chunk0: vec4<f32>, // x:H, y:Rt, z:Rb, w:tWall
  chunk1: vec4<f32>, // x:tBottom, y:rDrain, z:expn, w:nTheta
  chunk2: vec4<f32>, // x:nZ, y:styleId, z:spinTurns, w:spinPhase
  chunk3: vec4<f32>, // x:spinCurve, y:bellAmp, z:bellCenter, w:bellWidth
  chunk4: vec4<f32>, // x:seamAngle, y:startZ, z:endZ, w:tileFlags
}

@group(0) @binding(0) var<uniform> uniforms: ExportUniforms;
@group(0) @binding(1) var<storage, read> style_params: array<f32>;
// Output: "Importance" metric for each sample point
// Layout: [curvature_0, curvature_1, ... curvature_N]
@group(0) @binding(2) var<storage, read_write> metric_output: array<f32>;

// Include standard libs
// Note: In the actual build system, we concatenate these. 
// For this file, we assume `styles.wgsl` and `common.wgsl` helper (constants) logic is available.
// We need to define the "Bridge" functions that styles.wgsl expects if they aren't global.
// styles.wgsl expects: getf(u), style_param(u), properties of uniforms.





// ----- Interfaces for styles.wgsl -----
fn getf(u: u32) -> f32 {
  switch(u) {
    case 0u: { return uniforms.chunk0.x; } // H
    case 1u: { return uniforms.chunk0.y; } // Rt
    case 2u: { return uniforms.chunk0.z; } // Rb
    case 3u: { return uniforms.chunk1.z; } // expn
    case 13u: { return uniforms.chunk1.y; } // rDrain
    case 26u: { return uniforms.chunk1.x; } // tBottom
    case 25u: { return uniforms.chunk0.w; } // tWall
    case 4u: { return uniforms.chunk2.z; } // spinTurns
    case 5u: { return uniforms.chunk2.w; } // spinPhase
    case 6u: { return uniforms.chunk3.x; } // spinCurve
    case 7u: { return uniforms.chunk2.y; } // styleId
    case 14u: { return uniforms.chunk3.y; } // bellAmp
    case 15u: { return uniforms.chunk3.z; } // bellCenter
    case 72u: { return uniforms.chunk3.w; } // bellWidth
    case 73u: { return uniforms.chunk4.x; } // seamAngle
    default: { return 0.0; }
  }
}

fn style_param(idx: u32) -> f32 {
  if (idx >= arrayLength(&style_params)) { return 0.0; }
  return style_params[idx];
}

fn style_params_active() -> bool { return true; }

// ----- KERNEL -----

@compute @workgroup_size(64)
fn scan_metrics(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    let total_samples = arrayLength(&metric_output);
    
    if (idx >= total_samples) { return; }

    let t = f32(idx) / f32(total_samples - 1u); // 0.0 to 1.0 inclusive
    let styleId = i32(uniforms.chunk2.y);

    // Evaluate Radius at 4 distinct angles to capture non-symmetric features
    // 0, 90, 180, 270 degrees
    let angles = array<f32, 4>(0.0, 1.57079, 3.14159, 4.71238);
    var avg_curvature = 0.0;
    var max_step_change = 0.0;
    
    // Finite Difference Epsilon
    // We want to detect sharpness relative to the RESOLUTION of the scan.
    // But for curvature, we need a small localized epsilon.
    let eps = 0.001; // Increased to 10^-3 to reduce noise sensitivity


    for (var i = 0; i < 4; i++) {
        let theta = angles[i];
        
        let r0 = r_base(t);
        let r_mid = style_radius(styleId, theta, t, r0);
        
        // 1. Curvature (2nd Derivative)
        // f''(x) approx (f(x+h) - 2f(x) + f(x-h)) / h^2
        let r0_p = r_base(t + eps);
        let r0_m = r_base(t - eps);
        let r_p = style_radius(styleId, theta, t + eps, r0_p);
        let r_m = style_radius(styleId, theta, t - eps, r0_m);
        
        let d2 = abs(r_p - 2.0 * r_mid + r_m) / (eps * eps);
        
        // Accumulate curvature
        avg_curvature += d2;
        
        // 2. Step Detection (1st Derivative Magnitude / Discontinuity)
        // If the slope is massive, it's a step.
        let slope = abs(r_p - r_m) / (2.0 * eps);
        if (slope > 100.0) { // Very steep slope
             max_step_change = max(max_step_change, slope);
        }
    }
    
    avg_curvature = avg_curvature / 4.0;
    
    // Combine into a single importance score
    // We log-scale curvature to keep values manageable
    let score = log(1.0 + avg_curvature) + sqrt(max_step_change);
    
    metric_output[idx] = score;
}
