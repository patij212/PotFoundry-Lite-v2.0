// error_estimation.wgsl — GPU per-triangle error estimation for adaptive refinement
//
// Each thread processes one outer-wall triangle and computes:
//   - Chord error (mm): distance from linear edge midpoint to true surface point
//   - Normal error (deg): angle between flat triangle normal and analytic surface normal
//   - Longest edge index and squared length
//
// ASSEMBLY: ShaderManager prepends the style environment (constants + common + styles
// + dispatch) which provides: TAU, PI, r_base, style_radius, style helpers, etc.
// This file then declares its own uniform struct, bindings, and compute entry point.

// ============================================================================
// Uniform Struct (matches AdaptiveUniforms layout from adaptive_mesh.wgsl)
// ============================================================================
// HAZARD: chunk4.z is dual-purpose — see adaptive_mesh.wgsl header comment.

struct ErrorEstUniforms {
  chunk0: vec4<f32>, // x:H, y:Rt, z:Rb, w:tWall
  chunk1: vec4<f32>, // x:tBottom, y:rDrain, z:expn, w:styleId
  chunk2: vec4<f32>, // x:spinTurns, y:spinPhase, z:spinCurve, w:reserved_seam
  chunk3: vec4<f32>, // x:bellAmp, y:bellCenter, z:bellWidth, w:maxDepth
  chunk4: vec4<f32>, // x:subdivThreshold, y:minQuadSize, z:targetTris|gridVertCount (DUAL-PURPOSE), w:W
}

// ============================================================================
// Bindings
// ============================================================================

@group(0) @binding(0) var<uniform> uniforms: ErrorEstUniforms;
@group(0) @binding(1) var<storage, read> style_params: array<f32>;

// Mesh data — read-only
@group(0) @binding(2) var<storage, read> ee_positions: array<f32>;  // packed [x,y,z,...] 3D positions
@group(0) @binding(3) var<storage, read> ee_uvs: array<f32>;        // packed [u,t,surfId,...] UV data
@group(0) @binding(4) var<storage, read> ee_indices: array<u32>;    // triangle index buffer

// Output — per-triangle error data
// Layout: 4 floats per triangle [posErrorMm, normalErrorDeg, longestEdgeLenSq, longestEdgeIdx]
@group(0) @binding(5) var<storage, read_write> ee_errors: array<f32>;

// Config — triangle count and FD epsilon
// Layout: [outerTriCount, fdEpsilon, 0, 0]
@group(0) @binding(6) var<storage, read> ee_config: array<f32>;

// ============================================================================
// Uniform Accessors (mirrors adaptive_mesh.wgsl)
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
    case 73u: { return uniforms.chunk2.w; }  // reserved_seam
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

// ============================================================================
// Error Estimation Helpers
// ============================================================================

fn ee_pos3(idx: u32) -> vec3<f32> {
    let base = idx * 3u;
    return vec3<f32>(ee_positions[base], ee_positions[base + 1u], ee_positions[base + 2u]);
}

fn ee_uv3(idx: u32) -> vec3<f32> {
    let base = idx * 3u;
    return vec3<f32>(ee_uvs[base], ee_uvs[base + 1u], ee_uvs[base + 2u]);
}

/// Evaluate outer wall surface point from UV coordinates.
fn ee_evaluate_surface(u_val: f32, t_val: f32) -> vec3<f32> {
    let u_wrapped = u_val - floor(u_val);
    let theta = u_wrapped * 6.28318530718;
    let r = compute_outer_radius(theta, t_val);
    let th = compute_twist(theta, t_val);
    let H = get_H();
    return vec3<f32>(r * cos(th), r * sin(th), t_val * H);
}

fn ee_cross(a: vec3<f32>, b: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

fn ee_safe_normalize(v: vec3<f32>) -> vec3<f32> {
    let len = length(v);
    if (len < 1e-10) { return vec3<f32>(0.0, 0.0, 1.0); }
    return v / len;
}

// ============================================================================
// Main Entry Point
// ============================================================================

@compute @workgroup_size(64)
fn estimate_triangle_errors(@builtin(global_invocation_id) gid: vec3<u32>) {
    let triIdx = gid.x;
    let outerTriCount = u32(ee_config[0]);

    if (triIdx >= outerTriCount) { return; }

    // Read triangle vertex indices
    let idxBase = triIdx * 3u;
    let i0 = ee_indices[idxBase];
    let i1 = ee_indices[idxBase + 1u];
    let i2 = ee_indices[idxBase + 2u];

    // Skip degenerate triangles
    if (i0 == i1 || i1 == i2 || i0 == i2) {
        let outBase = triIdx * 4u;
        ee_errors[outBase] = 0.0;
        ee_errors[outBase + 1u] = 0.0;
        ee_errors[outBase + 2u] = 0.0;
        ee_errors[outBase + 3u] = 0.0;
        return;
    }

    // 3D positions
    let p0 = ee_pos3(i0);
    let p1 = ee_pos3(i1);
    let p2 = ee_pos3(i2);

    // UV data
    let uv0 = ee_uv3(i0);
    let uv1 = ee_uv3(i1);
    let uv2 = ee_uv3(i2);

    // ── Edge lengths (Euclidean 3D) ─────────────────────────────────
    let e0 = p1 - p0;
    let e1 = p2 - p1;
    let e2 = p0 - p2;
    let e0sq = dot(e0, e0);
    let e1sq = dot(e1, e1);
    let e2sq = dot(e2, e2);

    var longestIdx = 0u;
    var longestSq = e0sq;
    if (e1sq > longestSq) { longestIdx = 1u; longestSq = e1sq; }
    if (e2sq > longestSq) { longestIdx = 2u; longestSq = e2sq; }

    // ── Chord error on longest edge ─────────────────────────────────
    // Linear 3D midpoint vs on-surface midpoint
    var ev0 = i0; var ev1 = i1;
    if (longestIdx == 1u) { ev0 = i1; ev1 = i2; }
    else if (longestIdx == 2u) { ev0 = i2; ev1 = i0; }

    let uvA = ee_uv3(ev0);
    let uvB = ee_uv3(ev1);
    let midU = (uvA.x + uvB.x) * 0.5;
    let midT = (uvA.y + uvB.y) * 0.5;

    // Only evaluate surface for outer wall (surfaceId == 0)
    var chordError = 0.0;
    let surfId = uv0.z;
    if (surfId < 0.5) {
        let surfacePoint = ee_evaluate_surface(midU, midT);
        let linearMidpoint = (ee_pos3(ev0) + ee_pos3(ev1)) * 0.5;
        chordError = length(surfacePoint - linearMidpoint);
    }

    // ── Normal error (flat vs analytic surface) ─────────────────────
    // Flat triangle normal
    let flatNormal = ee_safe_normalize(ee_cross(e0, e1));

    var normalErrorDeg = 0.0;
    if (surfId < 0.5) {
        // FD surface normal at triangle centroid
        let epsilon = ee_config[1]; // FD step size
        let cu = (uv0.x + uv1.x + uv2.x) / 3.0;
        let ct = (uv0.y + uv1.y + uv2.y) / 3.0;

        let pc = ee_evaluate_surface(cu, ct);
        let pu = ee_evaluate_surface(cu + epsilon, ct);
        let pt = ee_evaluate_surface(cu, ct + epsilon);

        let du = pu - pc;
        let dt_vec = pt - pc;
        let surfNormal = ee_safe_normalize(ee_cross(du, dt_vec));

        // Angle between flat and surface normal
        let cosAngle = clamp(dot(flatNormal, surfNormal), -1.0, 1.0);
        normalErrorDeg = acos(abs(cosAngle)) * 57.29577951308232; // rad → deg
    }

    // ── Write output ────────────────────────────────────────────────
    let outBase = triIdx * 4u;
    ee_errors[outBase] = chordError;
    ee_errors[outBase + 1u] = normalErrorDeg;
    ee_errors[outBase + 2u] = longestSq;
    ee_errors[outBase + 3u] = f32(longestIdx);
}
