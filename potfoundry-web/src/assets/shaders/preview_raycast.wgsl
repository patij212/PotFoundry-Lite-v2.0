// ============================================================================
// Exact Ray-Cast Preview
// Renders the true mathematical pot solid per pixel: bounded march + bisection
// against an implicit inside/outside field built from the exact style_radius().
// Fullscreen pass — no pot mesh. Composed after the style environment and
// preview_lighting.wgsl by ShaderManager.getRaycastWGSL().
// Spec: docs/superpowers/specs/2026-07-08-raycast-preview-design.md
// ============================================================================

struct RaycastUniforms {
  inv_vp: mat4x4<f32>,     // inverse of vp_matrix(), column-major
  jitter: vec2<f32>,       // sub-pixel jitter in pixels, [-0.5, 0.5]
  march_phase: f32,        // [0,1) march phase offset, jittered per sample
  sample_index: f32,       // accumulation sample counter (0 = first)
  r_max: f32,              // conservative max style radius (GPU-computed, raw)
  step_cap: f32,           // max march steps this frame
  feature_floor: f32,      // step-size floor in mm
  debug_mode: f32,         // 0 = shaded, 1 = hit-data readback
  canvas_size: vec2<f32>,  // physical pixels of the accumulation target
  _pad: vec2<f32>,
};
@group(0) @binding(8) var<uniform> RC : RaycastUniforms;

const RC_BISECT_ITERS : u32 = 12u;
const RC_BOUND_MARGIN : f32 = 1.10; // safety on the 128x128-sampled r_max
const RC_BOUND_PAD_MM : f32 = 1.0;
const RC_NORMAL_EPS : f32 = 0.002;  // mm — numerical-precision-scale differencing

// ---------------------------------------------------------------------------
// Implicit solid. Continuous scalar, negative inside the pot. This is the
// same solid the six mesh segments approximate (surface_point in styles.wgsl)
// but exact: outer styled wall, inner cavity, floor slab, drain hole.
// Uses the true model z in [0, H]; the mesh's BOTTOM_Z_OFFSET anti-z-fighting
// nudges are intentionally NOT replicated.
// p is in centered world space (mesh path subtracts 0.5*H from z).
// ---------------------------------------------------------------------------
fn pot_field(p: vec3<f32>) -> f32 {
  let H = max(getf(0u), 1e-4);
  let z = p.z + 0.5 * H;
  let t = clamp(z / H, 0.0, 1.0);
  let rho = length(p.xy);

  // Invert the twist analytically: twist is a pure per-height rotation.
  let turns = getf(4u);
  let phase = getf(5u);
  let curve = max(getf(6u), 1e-4);
  let delta = TAU * turns * pow(t, curve) + phase;
  let phi = atan2(p.y, p.x);
  let th = phi - delta; // style_radius wraps internally

  let style_id = i32(getf(7u));
  let r0 = r_base(t);
  let r_out = style_radius(style_id, th, t, r0);

  // Solid of revolution bounded by the styled outer surface and top/bottom planes.
  var f = max(rho - r_out, max(z - H, -z));

  let show_inner = getf(SHOW_INNER_OFFSET) >= 0.5;
  if (!show_inner) {
    return f;
  }

  let bottom = clamp(getf(26u), 0.0, H);
  let wall = max(getf(25u), 0.4);
  let r_in = max(r_out - wall, 0.5); // mirrors inner_point() in styles.wgsl

  // Cavity { rho < r_in AND z > bottom } — CSG subtract.
  let cavity = max(rho - r_in, bottom - z);
  f = max(f, -cavity);

  // Drain { rho < r_drain AND z < bottom } — CSG subtract.
  // Clamps mirror surface_point segments 2/3/5: drain_raw >= 0.25,
  // cap = inner radius at z=0 minus 0.2.
  let r0_base = r_base(0.0);
  let r_out0 = style_radius(style_id, phi - phase, 0.0, r0_base); // delta(0) = phase
  let r_in0 = max(r_out0 - wall, 0.5);
  let drain_raw = max(getf(DRAIN_RADIUS_OFFSET), 0.25);
  let r_drain = clamp(drain_raw, 0.25, max(r_in0 - 0.2, 0.25));
  let drain = max(rho - r_drain, z - bottom);
  f = max(f, -drain);

  return f;
}

fn pot_normal(p: vec3<f32>) -> vec3<f32> {
  let e = RC_NORMAL_EPS;
  let dx = pot_field(vec3<f32>(p.x + e, p.y, p.z)) - pot_field(vec3<f32>(p.x - e, p.y, p.z));
  let dy = pot_field(vec3<f32>(p.x, p.y + e, p.z)) - pot_field(vec3<f32>(p.x, p.y - e, p.z));
  let dz = pot_field(vec3<f32>(p.x, p.y, p.z + e)) - pot_field(vec3<f32>(p.x, p.y, p.z - e));
  return safe_normalize(vec3<f32>(dx, dy, dz));
}

// ---------------------------------------------------------------------------
// Ray / bounding-volume clip: slab z in [-H/2, H/2] ∩ cylinder rho <= r_bound.
// ---------------------------------------------------------------------------
struct RaySegment {
  hit: bool,
  t0: f32,
  t1: f32,
};

fn clip_to_bound(ro: vec3<f32>, rd: vec3<f32>) -> RaySegment {
  let H = max(getf(0u), 1e-4);
  let r_bound = RC.r_max * RC_BOUND_MARGIN + RC_BOUND_PAD_MM;
  let z_lo = -0.5 * H;
  let z_hi = 0.5 * H;

  var t0 = 0.0;
  var t1 = 1e9;

  if (abs(rd.z) < 1e-9) {
    if (ro.z < z_lo || ro.z > z_hi) {
      return RaySegment(false, 0.0, 0.0);
    }
  } else {
    let ta = (z_lo - ro.z) / rd.z;
    let tb = (z_hi - ro.z) / rd.z;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  }

  let a = dot(rd.xy, rd.xy);
  let b = 2.0 * dot(ro.xy, rd.xy);
  let c = dot(ro.xy, ro.xy) - r_bound * r_bound;
  if (a < 1e-12) {
    if (c > 0.0) {
      return RaySegment(false, 0.0, 0.0);
    }
  } else {
    let disc = b * b - 4.0 * a * c;
    if (disc < 0.0) {
      return RaySegment(false, 0.0, 0.0);
    }
    let sq = sqrt(disc);
    t0 = max(t0, (-b - sq) / (2.0 * a));
    t1 = min(t1, (-b + sq) / (2.0 * a));
  }

  if (t1 <= t0) {
    return RaySegment(false, 0.0, 0.0);
  }
  return RaySegment(true, t0, t1);
}

// ---------------------------------------------------------------------------
// Bounded march + bisection. Step ~ min(pixel footprint, feature floor),
// hard-capped at RC.step_cap; sign change refined by 12 bisection iterations
// (hit precision far below 0.001 mm — beyond f32 resolution).
// ---------------------------------------------------------------------------
struct RayHit {
  hit: bool,
  t: f32,
};

fn march_pot(ro: vec3<f32>, rd: vec3<f32>, footprint: f32) -> RayHit {
  let seg = clip_to_bound(ro, rd);
  if (!seg.hit) {
    return RayHit(false, 0.0);
  }

  let len = seg.t1 - seg.t0;
  let want = min(max(footprint, 1e-4), RC.feature_floor);
  let steps = clamp(ceil(len / want), 8.0, max(RC.step_cap, 8.0));
  let dt = len / steps;

  var t_prev = seg.t0 + RC.march_phase * dt;
  if (pot_field(ro + rd * t_prev) < 0.0) {
    return RayHit(true, t_prev); // camera starts inside the solid
  }

  for (var i = 1.0; i <= steps; i += 1.0) {
    let tc = min(seg.t0 + RC.march_phase * dt + i * dt, seg.t1);
    if (pot_field(ro + rd * tc) < 0.0) {
      var lo = t_prev;
      var hi = tc;
      for (var k = 0u; k < RC_BISECT_ITERS; k += 1u) {
        let mid = 0.5 * (lo + hi);
        if (pot_field(ro + rd * mid) < 0.0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return RayHit(true, 0.5 * (lo + hi));
    }
    t_prev = tc;
    if (tc >= seg.t1) {
      break;
    }
  }
  return RayHit(false, 0.0);
}

// ---------------------------------------------------------------------------
// Ground plane (z = -H/2) with analytically anti-aliased grid lines.
// Port of the mesh path's fs_main grid block; coverage is computed from
// distance-to-line vs the pixel footprint instead of hard ramps.
// Returns rgba with a = coverage (0 => let the background through).
// ---------------------------------------------------------------------------
fn grid_line_coverage(dist_mm: f32, half_width_mm: f32, fp_mm: f32) -> f32 {
  let aa = max(fp_mm, 1e-4);
  return clamp((half_width_mm + 0.5 * aa - dist_mm) / aa, 0.0, 1.0);
}

fn ground_grid_color(gp: vec3<f32>, fp_mm: f32) -> vec4<f32> {
  if (getf(GRID_FLAG_OFFSET) < 0.5) {
    return vec4<f32>(0.0);
  }
  let eye = vec3<f32>(
    getf(CAMERA_EYE_OFFSET + 0u),
    getf(CAMERA_EYE_OFFSET + 1u),
    getf(CAMERA_EYE_OFFSET + 2u)
  );
  let camera_distance = max(length(eye), 1.0);
  var grid_size = 50.0;
  if (camera_distance < 200.0) {
    grid_size = 10.0;
  } else if (camera_distance < 400.0) {
    grid_size = 25.0;
  }
  let zoom_scale = clamp(camera_distance / 160.0, 0.5, 3.5);
  let target_mm = 0.25 * zoom_scale;
  let minor_half = clamp(target_mm, 0.12, 1.2) * 0.5;
  let major_half = clamp(target_mm * 2.2, minor_half * 2.0 + 0.2, 3.0) * 0.5;
  let axis_half = clamp(target_mm * 1.35, 0.12, 1.5) * 0.5;

  let fx = fract(gp.x / grid_size);
  let fy = fract(gp.y / grid_size);
  let dist_x = min(fx, 1.0 - fx) * grid_size;
  let dist_y = min(fy, 1.0 - fy) * grid_size;

  let minor_cov = max(
    grid_line_coverage(dist_x, minor_half, fp_mm),
    grid_line_coverage(dist_y, minor_half, fp_mm)
  );

  let major_step = 5;
  var major_cov = 0.0;
  let major_ix = i32(floor(gp.x / grid_size + 0.5));
  let major_iy = i32(floor(gp.y / grid_size + 0.5));
  if ((major_ix % major_step) == 0) {
    major_cov = max(major_cov, grid_line_coverage(dist_x, major_half, fp_mm));
  }
  if ((major_iy % major_step) == 0) {
    major_cov = max(major_cov, grid_line_coverage(dist_y, major_half, fp_mm));
  }

  var axis_cov = 0.0;
  axis_cov = max(axis_cov, grid_line_coverage(abs(gp.x), axis_half, fp_mm));
  axis_cov = max(axis_cov, grid_line_coverage(abs(gp.y), axis_half, fp_mm));

  let line_color = vec3<f32>(0.72, 0.80, 0.93);
  let major_color = vec3<f32>(0.46, 0.56, 0.70);
  let axis_color = vec3<f32>(1.0, 0.65, 0.35);

  var color = line_color;
  var weight = minor_cov * 0.8;
  let major_w = major_cov * 1.1;
  if (major_w > weight) {
    color = major_color;
    weight = major_w;
  }
  let axis_w = axis_cov * 1.6;
  if (axis_w > weight) {
    color = axis_color;
    weight = axis_w;
  }
  let composite = clamp(weight, 0.0, 1.0);
  if (composite <= 1e-3) {
    return vec4<f32>(0.0);
  }
  let intensity = mix(0.15, 0.75, composite);
  return vec4<f32>(color * intensity, composite);
}

// Background gradient — same math as the mesh path fs_main background branch.
fn background_gradient(uv: vec2<f32>) -> vec3<f32> {
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
  if (t <= 0.5) {
    let local = smoothstep(0.0, 0.5, t);
    return mix(uBg1.xyz, uBg2.xyz, local);
  }
  let local = smoothstep(0.5, 1.0, t);
  return mix(uBg2.xyz, uBg3.xyz, local);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------
struct RcVSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc_xy: vec2<f32>,
};

@vertex
fn vs_raycast(@builtin(vertex_index) vid: u32) -> RcVSOut {
  var xy = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out: RcVSOut;
  out.pos = vec4<f32>(xy[vid], 0.5, 1.0);
  out.ndc_xy = xy[vid];
  return out;
}

fn unproject(ndc: vec3<f32>) -> vec3<f32> {
  let w = RC.inv_vp * vec4<f32>(ndc, 1.0);
  return w.xyz / w.w;
}

struct RcFSOut {
  @location(0) color: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fs_raycast(in: RcVSOut) -> RcFSOut {
  let jitter_ndc = RC.jitter * 2.0 / max(RC.canvas_size, vec2<f32>(1.0, 1.0));
  let ndc = in.ndc_xy + jitter_ndc;

  // Unprojecting near+far handles perspective AND orthographic identically,
  // and guarantees exact agreement with vp_matrix() used by the overlays.
  let p_near = unproject(vec3<f32>(ndc, 0.0));
  let p_far = unproject(vec3<f32>(ndc, 1.0));
  let ro = p_near;
  let seg_vec = p_far - p_near;
  let ray_len = max(length(seg_vec), 1e-6);
  let rd = seg_vec / ray_len;

  // Per-pixel world footprint at both ends of the segment.
  let px_ndc = vec2<f32>(2.0 / max(RC.canvas_size.x, 1.0), 0.0);
  let fp_near = length(unproject(vec3<f32>(ndc + px_ndc, 0.0)) - p_near);
  let fp_far = length(unproject(vec3<f32>(ndc + px_ndc, 1.0)) - p_far);

  var out: RcFSOut;
  out.depth = 0.9999;

  let hit = march_pot(ro, rd, max(min(fp_near, fp_far), 1e-5));
  if (hit.hit) {
    let p = ro + rd * hit.t;
    let clip = vp_matrix() * vec4<f32>(p, 1.0);
    out.depth = clamp(clip.z / max(clip.w, 1e-9), 0.0, 1.0);
    if (RC.debug_mode > 0.5) {
      // Readback channel: hit distance along ray (mm), model z, radial rho.
      out.color = vec4<f32>(hit.t, p.z, length(p.xy), 1.0);
      return out;
    }
    let n = pot_normal(p);
    let H = max(getf(0u), 1e-4);
    let z_model = p.z + 0.5 * H;
    let eye = vec3<f32>(
      getf(CAMERA_EYE_OFFSET + 0u),
      getf(CAMERA_EYE_OFFSET + 1u),
      getf(CAMERA_EYE_OFFSET + 2u)
    );
    let base = gradient_color(clamp(z_model / H, 0.0, 1.0));
    let col = shade_color(base, n, eye - p);
    out.color = vec4<f32>(clamp(col, vec3<f32>(0.03), vec3<f32>(1.8)), 1.0);
    return out;
  }

  if (RC.debug_mode > 0.5) {
    out.color = vec4<f32>(-1.0, 0.0, 0.0, 1.0); // miss marker for readback
    return out;
  }

  // Ground plane at z = -H/2 (matches the mesh ground quad).
  let H2 = max(getf(0u), 1e-4);
  let ground_z = -0.5 * H2;
  if (abs(rd.z) > 1e-9) {
    let tg = (ground_z - ro.z) / rd.z;
    if (tg > 0.0) {
      let gp = ro + rd * tg;
      let base_r = max(getf(1u), getf(2u));
      let scene_r = getf(33u);
      let extent = max(max(base_r, scene_r), 1.0) * 2.4;
      if (abs(gp.x) <= extent && abs(gp.y) <= extent) {
        let fp_g = mix(fp_near, fp_far, clamp(tg / ray_len, 0.0, 1.0));
        let g = ground_grid_color(gp, fp_g);
        if (g.a > 1e-3) {
          let bgc = background_gradient(vec2<f32>((in.ndc_xy.x + 1.0) * 0.5, (in.ndc_xy.y + 1.0) * 0.5));
          out.color = vec4<f32>(mix(bgc, g.rgb, g.a), 1.0);
          let clipg = vp_matrix() * vec4<f32>(gp, 1.0);
          out.depth = clamp(clipg.z / max(clipg.w, 1e-9), 0.0, 1.0);
          return out;
        }
      }
    }
  }

  let uv = vec2<f32>((in.ndc_xy.x + 1.0) * 0.5, (in.ndc_xy.y + 1.0) * 0.5);
  out.color = vec4<f32>(background_gradient(uv), 1.0);
  return out;
}
