// ============================================================================
// Conservative bounding radius for the ray-cast preview.
// Samples style_radius over a 128x128 (theta, t) grid and atomically reduces
// the max. Positive IEEE-754 floats order-preserve as u32 bit patterns, so
// atomicMax on bitcast<u32> is exact. The raycast shader applies a
// 1.10x + 1mm margin on top (RC_BOUND_MARGIN / RC_BOUND_PAD_MM).
// ============================================================================

struct BoundOut {
  bits: atomic<u32>,
};
@group(0) @binding(9) var<storage, read_write> BOUND : BoundOut;

const BOUND_N : u32 = 128u;

@compute @workgroup_size(256)
fn cs_bound(@builtin(local_invocation_index) li: u32) {
  var local_max = 0.0;
  let style_id = i32(getf(7u));
  let total = BOUND_N * BOUND_N;
  var idx = li;
  loop {
    if (idx >= total) {
      break;
    }
    let iu = idx % BOUND_N;
    let it = idx / BOUND_N;
    let th = (f32(iu) + 0.5) / f32(BOUND_N) * TAU;
    let t = f32(it) / f32(BOUND_N - 1u);
    let r = style_radius(style_id, th, t, r_base(t));
    local_max = max(local_max, r);
    idx += 256u;
  }
  atomicMax(&BOUND.bits, bitcast<u32>(max(local_max, 0.0)));
}
