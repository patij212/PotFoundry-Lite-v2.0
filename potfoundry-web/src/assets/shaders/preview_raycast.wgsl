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

// Per-z-bin conservative radius bounds from raycast_bound.wgsl:
// u32 bits [0..63] = per-bin MAX radius, [64..127] = per-bin MIN radius,
// [128/129] = global max |dr/dtheta| (mm/rad) / max |dr/dt|,
// [130..193] = per-bin max |dr/dtheta|, [194..257] = per-bin max |dr/dt|
// (positive-f32 bit patterns; see cs_bound). Drives the banded march's skips
// and the certified Lipschitz step size below.
struct RcLut {
  bins: array<vec4<u32>, 65>,
};
@group(0) @binding(10) var<uniform> RCLUT : RcLut;

const RC_BISECT_ITERS : u32 = 12u;
const RC_TANGENT_TERNARY_ITERS : u32 = 14u;
const RC_BOUND_MARGIN : f32 = 1.10; // safety on the sampled global r_max
const RC_BOUND_PAD_MM : f32 = 1.0;
const RC_NORMAL_EPS : f32 = 0.002;  // mm — numerical-precision-scale differencing
const RC_LUT_BINS : f32 = 64.0;
const RC_BAND_PAD_MM : f32 = 2.0;   // covers the 256x128 kernel sampling gaps + bin quantization
const RC_PAD_Z_MM : f32 = 1.0;      // fine-march window around the flat faces (rim/floor/underside)
const RC_MAX_SKIP_MM : f32 = 12.0;  // hard cap per analytic skip — bounds any degenerate blind jump
const RC_L_HEADROOM : f32 = 2.0;    // safety on the grid-sampled Lipschitz slope bounds (see cs_bound)
const RC_MIN_STEP_MM : f32 = 0.02;  // certified-step floor: converts the sphere-trace asymptote into a bracketed crossing
// March-phase offset / skip minimum-progress scale. A CONSTANT, deliberately
// NOT the feature floor: when it scaled with the floor, production and the
// high-budget reference walked slightly different trajectories and disagreed
// on ~0.2% razor-graze pixels (A15). With a constant, quality tiers differ by
// eval budget ONLY — the certified march needs no comb for the floor to tune.
const RC_PHASE_STEP_MM : f32 = 0.25;

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
// Banded march + bisection.
// The naive uniform march spent its step budget across the whole clipped
// segment — mostly empty air and cavity interior — so the effective step near
// the surface was segLen/cap (1.25–3.3mm), 5–13x the feature floor; measured
// 32% wrong-surface pixels on DragonScales at the shipped accumulation cap
// (e2e/_raycast_quality_diag.mjs, 2026-07-08). This march instead:
//   - skips analytically while outside every fine band (bands are
//     theta-independent cylinders/planes, so skips are exact),
//   - fine-steps at the feature floor only inside the per-z-bin radial band
//     [minR - wall - pad, maxR + pad] where a wall crossing is possible,
//   - fine-steps IN Z (direction-scaled) inside the flat-face pad windows
//     (rim z=H, floor z=bottom, underside z=0, drain wall),
//   - RC.step_cap now caps FIELD EVALS, not uniform subdivisions.
// Sign change refined by 12 bisection iterations on the true field, so hit
// exactness is unchanged — bands only decide step SIZE, and a sign change
// across a (theoretically impossible) skip still brackets and bisects.
// ---------------------------------------------------------------------------
struct RayHit {
  hit: bool,
  t: f32,
  evals: f32,   // field evaluations spent (diagnostics)
  capped: f32,  // 1.0 if the march terminated on the eval cap (diagnostics)
};

fn rc_lut(i: u32) -> f32 {
  return bitcast<f32>(RCLUT.bins[i >> 2u][i & 3u]);
}

// Conservative radial band [lo, hi] where a wall crossing is possible at model
// height z. Unions the bin with its neighbours (bin-edge quantization) and
// pads; lo subtracts the wall thickness (inner surface = outer - wall).
fn band_for_z(z: f32, H: f32) -> vec2<f32> {
  let b = u32(clamp(z / H, 0.0, 0.999) * RC_LUT_BINS);
  let b0 = select(b - 1u, 0u, b == 0u);
  let b1 = min(b + 1u, 63u);
  let hi = max(rc_lut(b), max(rc_lut(b0), rc_lut(b1)));
  let lo = min(rc_lut(64u + b), min(rc_lut(64u + b0), rc_lut(64u + b1)));
  let wall = max(getf(25u), 0.4);
  return vec2<f32>(max(lo - wall - RC_BAND_PAD_MM, 0.0), hi + RC_BAND_PAD_MM);
}

// Analytic skip: from t_cur (currently outside every fine band), the earliest
// t where the ray could enter one — the current z-bin's radial band, a
// neighbouring z-bin (bands change there), or a flat-face pad window. All
// candidates are exact cylinder/plane intersections.
fn skip_to_band(ro: vec3<f32>, rd: vec3<f32>, t_cur: f32, t_end: f32, H: f32, bottom: f32, dt_fine: f32) -> f32 {
  let p = ro + rd * t_cur;
  let z = p.z + 0.5 * H;
  var t_best = t_end;

  if (abs(rd.z) > 1e-9) {
    // Next z-bin boundary. This candidate MUST always advance: a previous skip
    // can land EXACTLY on a boundary (measured: z=118.125 on bin 63/62), where
    // the naive computation yields t_bin == t_cur and gets rejected — letting a
    // radial candidate, validated against only the CURRENT bin's band, leap
    // across many bins with different bands and jump straight past the surface
    // (the persistent-hole bug). When degenerate, target the boundary one full
    // bin further; every skip is then capped to <= one bin of z-travel, so
    // radial skips can never outrun their band's validity.
    let bin_h = H / RC_LUT_BINS;
    var z_target = floor(z / bin_h) * bin_h;
    if (rd.z > 0.0) {
      z_target += bin_h;
    }
    var t_bin = t_cur + (z_target - z) / rd.z;
    if (t_bin <= t_cur + 1e-5) {
      t_bin += bin_h / abs(rd.z);
    }
    t_best = min(t_best, t_bin);
    // flat-face pad windows: z = bottom + pad (from above), z = H - pad (from below)
    let t_floor = t_cur + ((bottom + RC_PAD_Z_MM) - z) / rd.z;
    if (t_floor > t_cur) {
      t_best = min(t_best, t_floor);
    }
    let t_rim = t_cur + ((H - RC_PAD_Z_MM) - z) / rd.z;
    if (t_rim > t_cur) {
      t_best = min(t_best, t_rim);
    }
  }

  // radial entry into the current bin's band
  let band = band_for_z(z, H);
  let a = dot(rd.xy, rd.xy);
  if (a > 1e-12) {
    let b2 = dot(ro.xy, rd.xy);
    let c0 = dot(ro.xy, ro.xy);
    let rho2 = dot(p.xy, p.xy);
    if (rho2 > band.y * band.y) {
      let disc = b2 * b2 - a * (c0 - band.y * band.y);
      if (disc >= 0.0) {
        let sq = sqrt(disc);
        let t_in = (-b2 - sq) / a;
        let t_out = (-b2 + sq) / a;
        if (t_in > t_cur) {
          // outside the band: entry where rho falls to band.y (smaller root)
          t_best = min(t_best, t_in);
        } else if (t_out > t_cur) {
          // Degenerate band-edge landing: rho reads a hair ABOVE band.y while
          // the quadratic says the cursor is already at/inside the entry
          // (t_in behind, t_out ahead). Without this, no radial candidate
          // fires and the skip falls to the bin-boundary candidate — which
          // for a near-horizontal ray is ~meters away, producing a blind
          // jump straight through the wall (measured: 28mm skips through the
          // pot face at rd.z ~= 0.011 — the "straight-on view" dash misses).
          // Just fine-step through the numerical noise.
          return t_cur + dt_fine;
        }
      }
    } else if (rho2 < band.x * band.x) {
      // cavity air: exit where rho grows back to band.x (larger root)
      let disc = b2 * b2 - a * (c0 - band.x * band.x);
      if (disc >= 0.0) {
        let t_out = (-b2 + sqrt(disc)) / a;
        if (t_out > t_cur) {
          t_best = min(t_best, t_out);
        }
      }
    }
  }

  // Belt-and-braces: cap any skip so no degenerate candidate rejection can
  // ever blind-jump through geometry — a capped skip only costs one extra
  // landing per RC_MAX_SKIP_MM of empty travel.
  t_best = min(t_best, t_cur + RC_MAX_SKIP_MM);

  // always make progress; a skip is never shorter than a fine step
  return max(t_best, t_cur + dt_fine);
}

// fp01 = pixel footprint at ray-param 0 and at ray_len (near/far unprojections);
// the fine step uses the footprint AT THE MARCHED SEGMENT, interpolated to the
// segment midpoint — using the near-plane footprint here was a bug that forced
// dt to the 0.02mm clamp for every pixel, making the feature floor a no-op.
fn march_pot(ro: vec3<f32>, rd: vec3<f32>, fp01: vec2<f32>, ray_len: f32) -> RayHit {
  let seg = clip_to_bound(ro, rd);
  if (!seg.hit) {
    return RayHit(false, 0.0, 0.0, 0.0);
  }
  let H = max(getf(0u), 1e-4);
  let bottom = clamp(getf(26u), 0.0, H);
  let rdz_abs = abs(rd.z);

  var t = min(seg.t0 + RC.march_phase * RC_PHASE_STEP_MM, seg.t1);
  let f_start = pot_field(ro + rd * t);
  if (f_start < 0.0) {
    return RayHit(true, t, 1.0, 0.0); // camera starts inside the solid
  }
  var evals = 1.0;

  // Tangent-graze detector state: three consecutive FINE samples (t_b,f_b),
  // (t_a,f_a), (t_next,f). A local minimum of the field between fine samples
  // (f_b > f_a < f, with f_a already small) marks a razor-tangent crossing
  // whose in-solid extent is smaller than dt_fine — sampling (even jittered
  // across 16 accumulation phases) provably misses sub-0.01mm grazes at the
  // silhouette (measured: 17 converged holes on GothicArches flanks). The
  // detector ternary-searches the minimum; if it dips below zero, the graze
  // is bisected like any other crossing. Deterministic, not stochastic.
  var t_a = t;
  var f_a = 1e9;
  var t_b = t;
  var f_b = 1e9;
  var contig = 0u; // consecutive fine-sample count in the current run
  // Field value at the current cursor — loop invariant f_cur = f(t) >= 0.
  var f_cur = f_start;

  // CERTIFIED LIPSCHITZ MARCH (2026-07-10). Every sampling comb tried before
  // (fixed, proximity-shrunk, escalated) aliased against high-frequency
  // relief at grazing incidence — the field oscillates along the ray at a
  // period near the comb, so misses come and go in view-angle-dependent
  // bands (user round 3: inner-wall hole bands), and the 3-point tangent
  // detector fired on every groove dip (29-41 evals each = the few-FPS
  // detector storm). Replacement: a certified step. The bound kernel reduces
  // grid max |dr/dtheta| and |dr/dt|; along a ray,
  //   |df/dt| <= |rd.xy|                                   (radial term)
  //            + L_th * (|rd.xy|/rho + |ddelta/dz|*|rd.z|)  (theta sweep + twist shear)
  //            + L_tz * |rd.z|/H                            (height term)
  //            + |rd.z|                                     (plane terms)
  // so a step of f/L can NEVER skip a crossing — at ANY size, phase, or
  // angle. Steps grow to whatever the local safety margin allows (perf) and
  // the march stays exact by construction (correctness). The RC_MIN_STEP_MM
  // floor turns the sphere-trace tangency asymptote into an ordinary
  // bracketed crossing (f goes negative on a floored step -> bisect); only
  // dips shallower than ~floor*L can be floored over, a sub-pixel class.
  let cap = max(RC.step_cap, 64.0);
  let hard_cap = cap * 4.0; // TDR ceiling — the only budget break
  let rdxy_len = length(rd.xy);
  let turns_abs = abs(getf(4u));
  let tw_curve = max(getf(6u), 1e-4);
  let tw_k = TAU * turns_abs * tw_curve / H; // * pow(t_h, curve-1) per sample

  loop {
    if (t >= seg.t1 || evals >= hard_cap) {
      break;
    }

    var t_next: f32;
    var fine_step = false;
    {
      let p = ro + rd * t;
      let z = p.z + 0.5 * H;
      let rho = length(p.xy);
      let band = band_for_z(z, H);
      let in_z_window = (z < bottom + RC_PAD_Z_MM) || (abs(z - H) < RC_PAD_Z_MM);

      if ((rho >= band.x && rho <= band.y) || (in_z_window && rho <= band.y)) {
        // a crossing is possible here — take the certified Lipschitz step.
        // The step floor escalates quadratically with spent budget: near a
        // tangency the global L is wildly pessimistic (true along-ray slope
        // ~0), pinning f/L at the base floor for tens of mm and truncating
        // the ray at hard_cap (measured: 93 stall-truncated misses, all at
        // exactly evals=896). An escalated floor trades bounded blindness
        // (<= ~1.6mm chords, only in the extreme budget tail, still watched
        // by the graze detector) for guaranteed segment completion.
        let bp = evals / cap;
        let floor_eff = RC_MIN_STEP_MM + 0.10 * bp * bp;
        let rho_safe = max(rho, 1.0);
        // pow() only when twist is actually on — it runs on every in-band step
        var tw_shear = 0.0;
        if (tw_k > 0.0) {
          tw_shear = tw_k * pow(clamp(z / H, 1e-3, 1.0), tw_curve - 1.0);
        }
        // per-z-bin slope bounds (union with neighbours, band_for_z pattern):
        // relief varies with height, so the local L is far below the global
        // one over most of the pot — bigger certified steps, less budget
        let lb = u32(clamp(z / H, 0.0, 0.999) * RC_LUT_BINS);
        let lb0 = select(lb - 1u, 0u, lb == 0u);
        let lb1 = min(lb + 1u, 63u);
        let L_th = RC_L_HEADROOM * max(rc_lut(130u + lb), max(rc_lut(130u + lb0), rc_lut(130u + lb1)));
        let L_tz = RC_L_HEADROOM * max(rc_lut(194u + lb), max(rc_lut(194u + lb0), rc_lut(194u + lb1)));
        let L = rdxy_len * (1.0 + L_th / rho_safe)
              + rdz_abs * (1.0 + L_th * tw_shear + L_tz / H);
        t_next = t + clamp(f_cur / max(L, 1e-3), floor_eff, 12.0);
        fine_step = true;
      } else {
        t_next = skip_to_band(ro, rd, t, seg.t1, H, bottom, RC_PHASE_STEP_MM);
      }
    }
    t_next = min(t_next, seg.t1);

    let f = pot_field(ro + rd * t_next);
    evals += 1.0;
    f_cur = f;

    // Tangent-graze check: field dipped to a small local minimum at (t_a, f_a)
    // between contiguous samples — locate the true minimum; a sub-zero dip is
    // a hit. This detector is the correctness net for silhouette/tangent
    // chords thinner than any stride, so it must never be budget-disabled
    // below the hard TDR ceiling (gating it on `cap` created a detector-dead
    // zone right where exhausted rays needed it most — the inner-wall dash
    // rows). Reserve its worst case against hard_cap only.
    let tangent_cost = 2.0 * f32(RC_TANGENT_TERNARY_ITERS) + 1.0 + f32(RC_BISECT_ITERS);
    if (fine_step && contig >= 2u && f_b > f_a && f_a < f && f_a < 1.0 && f >= 0.0 && evals + tangent_cost <= hard_cap) {
      var lo_m = t_b;
      var hi_m = t_next;
      for (var k = 0u; k < RC_TANGENT_TERNARY_ITERS; k += 1u) {
        let m1 = lo_m + (hi_m - lo_m) / 3.0;
        let m2 = hi_m - (hi_m - lo_m) / 3.0;
        if (pot_field(ro + rd * m1) < pot_field(ro + rd * m2)) {
          hi_m = m2;
        } else {
          lo_m = m1;
        }
      }
      evals += 28.0;
      let tm = 0.5 * (lo_m + hi_m);
      let f_min = pot_field(ro + rd * tm);
      evals += 1.0;
      if (f_min < 0.0) {
        var lo = t_b;
        var hi = tm;
        for (var k = 0u; k < RC_BISECT_ITERS; k += 1u) {
          let mid = 0.5 * (lo + hi);
          if (pot_field(ro + rd * mid) < 0.0) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        evals += f32(RC_BISECT_ITERS);
        return RayHit(true, 0.5 * (lo + hi), evals, 0.0);
      }
    }
    if (fine_step) {
      t_b = t_a;
      f_b = f_a;
      t_a = t_next;
      f_a = f;
      contig = min(contig + 1u, 8u);
    } else {
      contig = 0u;
      f_a = 1e9;
      f_b = 1e9;
    }

    if (f < 0.0) {
      // bracket [t, t_next]: f(t) >= 0 is a loop invariant
      var lo = t;
      var hi = t_next;
      for (var k = 0u; k < RC_BISECT_ITERS; k += 1u) {
        let mid = 0.5 * (lo + hi);
        if (pot_field(ro + rd * mid) < 0.0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      evals += f32(RC_BISECT_ITERS);
      return RayHit(true, 0.5 * (lo + hi), evals, select(0.0, 1.0, evals >= cap));
    }
    t = t_next;
  }
  return RayHit(false, 0.0, evals, select(0.0, 1.0, evals >= cap));
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

  if (RC.debug_mode > 1.5 && RC.debug_mode < 2.5) {
    // Diagnostic channels: near/far footprints, LUT band-hi at mid-height,
    // and the floor uniform as the shader sees it.
    let Hd = max(getf(0u), 1e-4);
    let band_mid = band_for_z(0.5 * Hd, Hd);
    out.color = vec4<f32>(fp_near, fp_far, band_mid.y, RC.feature_floor);
    return out;
  }

  if (RC.debug_mode > 4.5 && RC.debug_mode < 5.5) {
    // LUT dump: pixel column i (0..63) reports bin i's [max, min] radius bits.
    let i = u32(in.pos.x) & 63u;
    out.color = vec4<f32>(rc_lut(i), rc_lut(64u + i), f32(i), 1.0);
    return out;
  }
  if (RC.debug_mode > 5.5 && RC.debug_mode < 6.5) {
    out.color = vec4<f32>(ro, 1.0); // per-pixel ray origin (world)
    return out;
  }
  if (RC.debug_mode > 6.5) {
    out.color = vec4<f32>(rd, 1.0); // per-pixel ray direction
    return out;
  }
  if (RC.debug_mode > 3.5) {
    // Ground-truth forensics: uniform fine march with NO skips — the band
    // logic is bypassed entirely. Outputs the true hit's model z, rho, and the
    // band bounds the production march would have used at that z, exposing
    // any band-exclusion directly (rho outside [band.x, band.y] = the bug).
    let seg = clip_to_bound(ro, rd);
    if (!seg.hit) {
      out.color = vec4<f32>(-2.0, 0.0, 0.0, 1.0);
      return out;
    }
    let Ht = max(getf(0u), 1e-4);
    var tD = seg.t0;
    var found = false;
    for (var i = 0u; i < 6000u; i += 1u) {
      tD = min(seg.t0 + f32(i) * 0.1, seg.t1);
      if (pot_field(ro + rd * tD) < 0.0) { found = true; break; }
      if (tD >= seg.t1) { break; }
    }
    if (!found) {
      out.color = vec4<f32>(-1.0, 0.0, 0.0, 1.0);
      return out;
    }
    var loD = max(tD - 0.1, seg.t0);
    var hiD = tD;
    for (var k = 0u; k < RC_BISECT_ITERS; k += 1u) {
      let mid = 0.5 * (loD + hiD);
      if (pot_field(ro + rd * mid) < 0.0) { hiD = mid; } else { loD = mid; }
    }
    let pD = ro + rd * (0.5 * (loD + hiD));
    let zD = pD.z + 0.5 * Ht;
    let bandD = band_for_z(zD, Ht);
    out.color = vec4<f32>(zD, length(pD.xy), bandD.x, bandD.y);
    return out;
  }

  let hit = march_pot(ro, rd, vec2<f32>(fp_near, fp_far), ray_len);
  if (RC.debug_mode > 2.5) {
    // March forensics: hit distance (miss = -1), evals spent, capped/coarse flag.
    out.color = vec4<f32>(select(-1.0, hit.t, hit.hit), hit.evals, hit.capped, 1.0);
    return out;
  }
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
