// ============================================================================
// Conservative radius bounds for the ray-cast preview.
// Samples style_radius over a 256x512 (theta, t) grid and atomically reduces:
//   BOUND.bits[0]        — global max radius (drives the outer bounding cylinder)
//   BOUND.bits[1..64]    — per-z-bin max radius (64 bins over t ∈ [0,1])
//   BOUND.bits[65..128]  — per-z-bin min radius
//   BOUND.bits[129]      — global max |∂r/∂θ| (mm/rad, finite-difference)
//   BOUND.bits[130]      — global max |∂r/∂t|  (mm per unit t, finite-difference)
//   BOUND.bits[131..194] — per-z-bin max |∂r/∂θ| (relief varies with height;
//   BOUND.bits[195..258] — per-z-bin max |∂r/∂t|   local L => bigger certified
//                          steps => less budget burned => fewer escalated-floor
//                          blind steps AND faster frames)
// The per-bin [min,max] band lets the ray marcher skip empty air / cavity
// interior analytically; the slope bounds give the marcher a certified
// along-ray Lipschitz constant so steps of f/L can NEVER skip a surface
// crossing (replaces the fixed sampling comb + tangent-detector reliance —
// the comb aliased against fine grooves at grazing incidence, producing
// view-angle-dependent hole bands on the inner wall, 2026-07-10).
// Finite differences at grid pitch UNDERSAMPLE slope peaks for content above
// ~128 cycles/rev, so the marcher applies a headroom factor on top.
// Positive IEEE-754 floats order-preserve as u32 bit patterns, so
// atomicMax/atomicMin on bitcast<u32> are exact. The raycast shader applies
// conservative pads on top (RC_BOUND_MARGIN / RC_BAND_PAD_MM); min slots must
// be pre-initialized to 0x7F7FFFFF (f32 max) by the CPU before dispatch;
// max/slope slots to 0.
// ============================================================================

struct BoundOut {
  bits: array<atomic<u32>, 259>,
};
@group(0) @binding(9) var<storage, read_write> BOUND : BoundOut;

const BOUND_NU : u32 = 256u;  // theta samples
const BOUND_NT : u32 = 512u;  // t samples (8 per z-bin; the extra density is cheap one-off safety margin for z-spiky relief — verified NOT load-bearing for DragonScales lips, whose side-on seams are real occlusion boundaries)
const BOUND_BINS : u32 = 64u; // z bins (8 t-samples per bin)

@compute @workgroup_size(256)
fn cs_bound(@builtin(local_invocation_index) li: u32) {
  var local_max = 0.0;
  var local_sth = 0.0; // max |Δr/Δθ|
  var local_st = 0.0;  // max |Δr/Δt|
  let style_id = i32(getf(7u));
  let d_th = TAU / f32(BOUND_NU);
  let d_t = 1.0 / f32(BOUND_NT - 1u);
  let total = BOUND_NU * BOUND_NT;
  var idx = li;
  loop {
    if (idx >= total) {
      break;
    }
    let iu = idx % BOUND_NU;
    let it = idx / BOUND_NU;
    let th = (f32(iu) + 0.5) / f32(BOUND_NU) * TAU;
    let t = f32(it) / f32(BOUND_NT - 1u);
    let r = max(style_radius(style_id, th, t, r_base(t)), 0.0);
    local_max = max(local_max, r);
    let bin = min(it / (BOUND_NT / BOUND_BINS), BOUND_BINS - 1u);
    atomicMax(&BOUND.bits[1u + bin], bitcast<u32>(r));
    atomicMin(&BOUND.bits[1u + BOUND_BINS + bin], bitcast<u32>(r));
    // forward finite differences for the Lipschitz reductions (theta wraps)
    let r_th = max(style_radius(style_id, th + d_th, t, r_base(t)), 0.0);
    let s_th = abs(r_th - r) / d_th;
    local_sth = max(local_sth, s_th);
    let t2 = min(t + d_t, 1.0);
    let r_t = max(style_radius(style_id, th, t2, r_base(t2)), 0.0);
    let s_t = abs(r_t - r) / d_t;
    local_st = max(local_st, s_t);
    atomicMax(&BOUND.bits[131u + bin], bitcast<u32>(s_th));
    atomicMax(&BOUND.bits[195u + bin], bitcast<u32>(s_t));
    idx += 256u;
  }
  atomicMax(&BOUND.bits[0], bitcast<u32>(local_max));
  atomicMax(&BOUND.bits[129], bitcast<u32>(local_sth));
  atomicMax(&BOUND.bits[130], bitcast<u32>(local_st));
}
