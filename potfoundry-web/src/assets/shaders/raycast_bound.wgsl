// ============================================================================
// Conservative radius bounds for the ray-cast preview.
// Samples style_radius over a 256x128 (theta, t) grid and atomically reduces:
//   BOUND.bits[0]        — global max radius (drives the outer bounding cylinder)
//   BOUND.bits[1..64]    — per-z-bin max radius (64 bins over t ∈ [0,1])
//   BOUND.bits[65..128]  — per-z-bin min radius
// The per-bin [min,max] band lets the ray marcher skip empty air / cavity
// interior analytically and spend its fine (feature-floor) steps only where a
// wall crossing is possible — without this, the step cap dominates the feature
// floor everywhere (measured: 32% wrong-surface pixels on DragonScales at the
// shipped accumulation cap; e2e/_raycast_quality_diag.mjs, 2026-07-08).
// Positive IEEE-754 floats order-preserve as u32 bit patterns, so
// atomicMax/atomicMin on bitcast<u32> are exact. The raycast shader applies
// conservative pads on top (RC_BOUND_MARGIN / RC_BAND_PAD_MM); min slots must
// be pre-initialized to 0x7F7FFFFF (f32 max) by the CPU before dispatch.
// ============================================================================

struct BoundOut {
  bits: array<atomic<u32>, 129>,
};
@group(0) @binding(9) var<storage, read_write> BOUND : BoundOut;

const BOUND_NU : u32 = 256u;  // theta samples
const BOUND_NT : u32 = 128u;  // t samples
const BOUND_BINS : u32 = 64u; // z bins (2 t-samples per bin)

@compute @workgroup_size(256)
fn cs_bound(@builtin(local_invocation_index) li: u32) {
  var local_max = 0.0;
  let style_id = i32(getf(7u));
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
    idx += 256u;
  }
  atomicMax(&BOUND.bits[0], bitcast<u32>(local_max));
}
