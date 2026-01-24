
// ============================================================================
// Common Constants & Helpers
// ============================================================================

const TAU = 6.28318530718;
const PI = 3.14159265359;
const PI_OVER_2 = 1.57079632679;
const BOTTOM_Z_OFFSET = 1e-3;
const STYLE_PARAM_CAPACITY : u32 = 48u;

const CAMERA_EYE_OFFSET : u32 = 36u;
const CAMERA_MODE_OFFSET : u32 = 39u;
const VP_MATRIX_OFFSET : u32 = 40u;
const CAMERA_RIGHT_OFFSET : u32 = 56u;
const CAMERA_UP_OFFSET : u32 = 60u;
const CAMERA_FORWARD_OFFSET : u32 = 64u;
const GRID_FLAG_OFFSET : u32 = 68u;
const SPECULAR_GAIN_OFFSET : u32 = 69u;
const ROUGHNESS_OFFSET : u32 = 70u;
const SHOW_INNER_OFFSET : u32 = 71u;
const DRAIN_RADIUS_OFFSET : u32 = 13u;

// ============================================================================
// SDF & Math Helper Functions
// ============================================================================

fn sat(x: f32) -> f32 { return min(1.0, max(0.0, x)); }

fn smoothstep2(e0: f32, e1: f32, x: f32) -> f32 {
  let t = sat((x - e0) / max(1e-6, e1 - e0));
  return t * t * (3.0 - 2.0 * t);
}

fn ridge(d: f32, w_in: f32, sharp: f32) -> f32 {
  let w = max(1e-6, w_in);
  return pow(max(0.0, 1.0 - abs(d) / w), sharp);
}

fn ridge_sin(phi: f32, w_in: f32, sharp: f32) -> f32 {
  let w = max(1e-6, w_in);
  return pow(max(0.0, 1.0 - abs(sin(phi)) / w), sharp);
}

fn safe_normalize(v: vec3<f32>) -> vec3<f32> {
  let len = length(v);
  if (len < 1e-6) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }
  return v / len;
}

// Smooth max
fn smax(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
}

// Wrap unit interval
fn wrap_unit(value: f32) -> f32 {
  let w = fract(value);
  if (w < 0.0) {
    return w + 1.0;
  }
  return w;
}

fn wrap_dist_u(u: f32, u0: f32) -> f32 {
  return fract(u - u0 + 0.5) - 0.5;
}

fn sd_line_x(p: vec2<f32>, x: f32) -> f32 { return abs(p.x - x); }
fn sd_line_y(p: vec2<f32>, y: f32) -> f32 { return abs(p.y - y); }

fn sd_quarter_arc(p: vec2<f32>, c: vec2<f32>, r: f32, quad: vec2<f32>) -> f32 {
  let inx = select(0.0, 1.0, (quad.x > 0.0 && p.x >= 0.5) || (quad.x < 0.0 && p.x <= 0.5));
  let iny = select(0.0, 1.0, (quad.y > 0.0 && p.y >= 0.5) || (quad.y < 0.0 && p.y <= 0.5));
  if (inx * iny < 0.5) { return 1e5; }
  return abs(length(p - c) - r);
}

fn ribbon_mask(d: f32, half_w: f32) -> f32 {
  let aa = 0.01; 
  return smoothstep(half_w + aa, half_w - aa, d);
}

fn band_mask(t: f32, y0: f32, y1: f32, feather: f32) -> f32 {
  let a = smoothstep(y0, y0 + feather, t);
  let b = 1.0 - smoothstep(y1 - feather, y1, t);
  return a * b;
}

fn ribbon_height(d: f32, half_w: f32, r: f32) -> f32 {
  let x = clamp(d / max(half_w, 1e-5), 0.0, 1.0);
  let h_lin = 1.0 - x;
  let h_cos = cos(x * PI * 0.5);
  return mix(h_lin, h_cos, r);
}

fn edge_aa(half_w: f32) -> f32 { return max(0.006, half_w * 0.25); }

// Bezier Helpers
fn bezier3(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, t: f32) -> vec2<f32> {
  let u = 1.0 - t;
  return (u*u*u)*p0 + (3.0*u*u*t)*p1 + (3.0*u*t*t)*p2 + (t*t*t)*p3;
}

fn sd_segment_sq(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  let d = pa - ba * h;
  return dot(d, d);
}

fn sd_bezier_poly(p: vec2<f32>, p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>) -> f32 {
  const N: i32 = 12;
  var prev = p0;
  var best = 1e9;
  for (var i = 1; i <= N; i++) {
    let t = f32(i) / f32(N);
    let cur = bezier3(p0, p1, p2, p3, t);
    best = min(best, sd_segment_sq(p, prev, cur));
    prev = cur;
  }
  return sqrt(best);
}
