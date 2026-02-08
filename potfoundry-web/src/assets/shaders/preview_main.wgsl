
// ============================================================================
// Camera & Lighting Logic
// ============================================================================

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

struct LightingRig {
  key: vec3<f32>,       // Main light - front top
  fill: vec3<f32>,      // Fill light - front left
  back: vec3<f32>,      // Back light - behind for rim
  rim_left: vec3<f32>,  // Left rim/kicker
  rim_right: vec3<f32>, // Right rim/kicker  
  bottom: vec3<f32>,    // Bottom bounce light
  top: vec3<f32>,       // Top soft light
};

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
  // FIX: +Y for top, -Z for front (Camera looks down +Z, so -Z points back to camera)
  let key = normalize(vec3<f32>(0.3, 0.5, -0.85));
  
  // Fill light: front-left (softer, fills shadows)
  let fill = normalize(vec3<f32>(-0.6, 0.3, -0.6));
  
  // Back light: behind and above (rim lighting)
  // FIX: +Z for back (behind object relative to camera)
  let back = normalize(vec3<f32>(0.0, 0.9, 0.35));
  
  // Left rim/kicker: side accent
  let rim_left = normalize(vec3<f32>(-0.85, 0.2, 0.4));
  // Right rim/kicker: side accent
  let rim_right = normalize(vec3<f32>(0.85, 0.2, 0.4));
  // Bottom bounce: subtle upward fill
  let bottom = normalize(vec3<f32>(0.0, 0.1, -0.95)); // Keep bottom mostly front?
  // Top soft light: overall ambient direction
  let top = normalize(vec3<f32>(0.0, 0.0, 1.0)); // Top is aligned with Up/Forward? Z is Forward. -Y is Down.
                                                 // Wait, Camera Basis: Up is +Y.
                                                 // So Top light should be +Y.
                                                 // Vector (0,0,1) is Forward.
                                                 // Let's make Top explicitly +Y.
  let top_real = normalize(vec3<f32>(0.0, 1.0, 0.0));
  
  return LightingRig(key, fill, back, rim_left, rim_right, bottom, top_real);
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
    
    var finalCol: vec3<f32>;
    if (t <= 0.5) {
      let local = smoothstep(0.0, 0.5, t); // Smooth transition
      finalCol = mix(uBg1.xyz, uBg2.xyz, local);
    } else {
      let local = smoothstep(0.5, 1.0, t);
      finalCol = mix(uBg2.xyz, uBg3.xyz, local);
    }
    
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
  return vec4<f32>(safe, 1.0);
}

// ============================================================================
// Wireframe Shader Entry Points
// ============================================================================

struct WireVSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) col: vec3<f32>,
};

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
  
  let solid_tri_vid = shifted_vid / 2u;  // Which solid vertex (as if triangle-list)
  let line_endpoint = shifted_vid % 2u;   // 0=start, 1=end of line segment
  
  let tri_corner = solid_tri_vid % 3u;  // 0, 1, or 2
  var solid_corner: u32;
  
  if (tri_corner == 0u) {
    solid_corner = select(0u, 1u, line_endpoint == 1u);
  } else if (tri_corner == 1u) {
    solid_corner = select(1u, 2u, line_endpoint == 1u);
  } else {
    solid_corner = select(2u, 0u, line_endpoint == 1u);
  }
  
  let tri_in_cell = (solid_tri_vid / 3u) % 2u;  // Which triangle in cell (0 or 1)
  if (tri_in_cell == 1u) {
    solid_corner += 3u;  // Use corners 3,4,5 for second triangle
  }
  
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
  out.pos = vec4<f32>(projected.xy, projected.z - 0.002 * projected.w, projected.w);
  out.col = vec3<f32>(1.0, 1.0, 1.0);
  return out;
}

@fragment
fn fs_wireframe(@location(0) col: vec3<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(col, 1.0);
}
