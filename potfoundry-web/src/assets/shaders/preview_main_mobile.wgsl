
// ============================================================================
// Mobile Preview Main Shader
// Simplified version of preview_main.wgsl for mobile GPU compatibility.
// Drops: wireframe, ground grid, PBR/multi-light shading, subsurface scattering.
// Keeps: pot geometry generation, background gradient, 2-light Lambert shading.
// ============================================================================

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) col: vec3<f32>,
  @location(1) n_cam: vec3<f32>,
  @location(2) world_pos: vec3<f32>,
  @location(3) is_ground: f32,
  @location(4) is_background: f32,
};

// --- Camera Basis ---

fn mobile_camera_basis() -> vec3<f32> {
  // Returns forward direction for lighting (simplified, no multi-path fallback)
  let eye = vec3<f32>(
    getf(CAMERA_EYE_OFFSET + 0u),
    getf(CAMERA_EYE_OFFSET + 1u),
    getf(CAMERA_EYE_OFFSET + 2u)
  );
  let target_pos = vec3<f32>(getf(29u), getf(31u), 0.0);
  let forward = safe_normalize(target_pos - eye);
  if (length(forward) < 1e-4) {
    return vec3<f32>(0.0, 0.0, 1.0);
  }
  return forward;
}

// --- Simplified Lighting ---

fn gradient_color(height_ratio: f32) -> vec3<f32> {
  let t = clamp(height_ratio, 0.0, 1.0);
  if (t <= 0.5) {
    let local = smoothstep(0.0, 0.5, t);
    return mix(uC1.xyz, uC2.xyz, local);
  }
  let local = smoothstep(0.5, 1.0, t);
  return mix(uC2.xyz, uC3.xyz, local);
}

fn mobile_shade(base: vec3<f32>, n_world: vec3<f32>, view_dir: vec3<f32>) -> vec3<f32> {
  let N = safe_normalize(n_world);
  let V = safe_normalize(view_dir);
  let ambient = clamp(getf(22u), 0.0, 1.0);
  let diffuse_strength = clamp(getf(23u), 0.0, 1.0);

  // Two-light Lambert: key (front-top-right) + fill (front-left)
  let key = normalize(vec3<f32>(0.3, 0.5, -0.85));
  let fill = normalize(vec3<f32>(-0.6, 0.3, -0.6));
  let key_d = max(dot(N, key), 0.0) * 0.6;
  let fill_d = max(dot(N, fill), 0.0) * 0.35;

  // Simple specular (single Blinn-Phong highlight on key light)
  let H = safe_normalize(key + V);
  let spec = pow(max(dot(N, H), 0.0), 32.0) * 0.25;

  let ambient_term = 0.12 + ambient * 0.25;
  let diffuse_term = (key_d + fill_d) * (0.5 + diffuse_strength * 0.7);
  let lit = base * (ambient_term + diffuse_term) + vec3<f32>(spec, spec, spec);
  return clamp(lit, vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(2.0, 2.0, 2.0));
}

// --- Ground Plane ---

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

// --- Vertex Shader ---

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  // First 3 vertices: Fullscreen Quad for Background Gradient
  if (vid < 3u) {
    var out: VSOut;
    var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    out.pos = vec4<f32>(pos[vid], 0.99, 1.0);
    out.col = vec3<f32>(0.0);
    out.n_cam = vec3<f32>(0.0);
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
  let cells_drain = cells_x * bottom_rings;

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
            seg_cells_y = bottom_rings;
          }
        }
      }
    }
  }

  // Check if inner surface should be hidden
  let showInner = getf(SHOW_INNER_OFFSET) >= 0.5;
  if (segment == 1u && !showInner) {
    var out: VSOut;
    out.pos = vec4<f32>(0.0, 0.0, -2.0, 1.0);
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
  let col = mobile_shade(base, n_local, view_dir);

  var out: VSOut;
  out.pos = vp_matrix() * world_centered;
  out.col = col;
  out.is_ground = 0.0;
  out.is_background = 0.0;
  out.n_cam = n_local;
  out.world_pos = world_centered.xyz;
  return out;
}

// --- Fragment Shader ---

@fragment
fn fs_main(@location(0) col: vec3<f32>, @location(1) _n_cam: vec3<f32>, @location(2) world_pos: vec3<f32>, @location(3) is_ground: f32, @location(4) is_background: f32) -> @location(0) vec4<f32> {
  if (is_background > 0.5) {
    let uv = world_pos.xy;
    let angle = uBg1.w;
    let center = vec2<f32>(0.5, 0.5);
    let centered = uv - center;
    let s = sin(-angle);
    let c = cos(-angle);
    let rotated = vec2<f32>(
      centered.x * c - centered.y * s,
      centered.x * s + centered.y * c
    );
    let t = clamp(rotated.y + 0.5, 0.0, 1.0);
    var finalCol: vec3<f32>;
    if (t <= 0.5) {
      let local = smoothstep(0.0, 0.5, t);
      finalCol = mix(uBg1.xyz, uBg2.xyz, local);
    } else {
      let local = smoothstep(0.5, 1.0, t);
      finalCol = mix(uBg2.xyz, uBg3.xyz, local);
    }
    return vec4<f32>(finalCol, 1.0);
  }
  // Debug mode
  if (getf(18u) >= 0.5) {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  }
  // Ground plane: simple solid color, no grid overlay
  if (is_ground >= 0.5) {
    discard;
  }
  let safe = vec3<f32>(
    clamp(col.x, 0.03, 1.8),
    clamp(col.y, 0.03, 1.8),
    clamp(col.z, 0.03, 1.8)
  );
  return vec4<f32>(safe, 1.0);
}
