// E-2026-07-10-INTHASH — pure NEW module, unwired (src/ never imports research/, and nothing in
// research/ imports this except its own probe). Does NOT modify src/geometry/styles.ts or
// src/assets/shaders/styles.wgsl.
//
// REDIRECT from E-2026-07-09-VORONOI-TRUTHBRIDGE (REFUTED: per-op Math.fround f32-emulation only
// improved p99 1.21x; divergence-locus check showed f64 and f32-emulated CPU paths AGREE with each
// other — 0/500 argmin flips — while both disagree with the real GPU; leading mechanism = GPU
// FMA/fast-math fusion that post-hoc CPU rounding cannot predict). This spike eliminates the
// floating-point rounding path from cell selection ENTIRELY:
//
//   1. Cell id: floor(u,v) — unchanged, exact in both f32/f64 for these operand ranges.
//   2. Hash: PCG2D on INTEGER cell coordinates, pure u32 arithmetic (Math.imul + >>>0 coerces every
//      intermediate to an exact u32 — bit-identical to a WGSL u32 port by construction, since WGSL
//      integer arithmetic is exact/wrapping per spec, unlike its float arithmetic).
//   3. Hash -> jitter float: (h >>> 8) * 2**-24 — a dyadic rational (24 significant bits, power-of-two
//      exponent) EXACTLY representable in both f32 (24-bit mantissa incl. implicit leading 1) and f64.
//      Zero rounding divergence at the hash->float boundary BY CONSTRUCTION.
//   4. Downstream geometry (distance argmin over the 3x3 neighborhood, smoothstep web/bubble blend,
//      edge fade) is kept structurally IDENTICAL to rOuterVoronoi/periodicCellular — only the hash
//      primitive and the jitter-float derivation change, isolating the experiment to the mechanism
//      under test.
//
// Round-parameterized like _voronoi_truthbridge_lib.ts: the SAME algorithm evaluated at F64 (identity
// round) or F32 (Math.fround per-op) for the DOWNSTREAM float chain (distance/smoothstep/relief) —
// the hash itself has no float rounding path at all, so it needs no Round parameter.

type Round = (x: number) => number;
const F64: Round = (x) => x;
const F32: Round = Math.fround;

/** PCG2D — Jarzynski/Olano-style integer hash, pure u32 arithmetic. Every intermediate is coerced
 *  to an exact u32 via `>>>0` (or is already u32-typed from a prior `>>>0`/imul result), matching a
 *  WGSL u32 port bit-for-bit: WGSL's `u32` arithmetic is exact modulo-2^32 (wrapping), same as JS's
 *  `Math.imul`/`>>>0` idiom. No floating point appears anywhere in this function. */
function pcg2d(vx: number, vy: number): { x: number; y: number } {
  let x = vx >>> 0;
  let y = vy >>> 0;

  x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  y = (Math.imul(y, 1664525) + 1013904223) >>> 0;

  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;

  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;

  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;

  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;

  return { x: x >>> 0, y: y >>> 0 };
}

/** Convert a u32 hash lane to [0,1) via a dyadic rational: (h >>> 8) is a 24-bit integer in
 *  [0, 2^24), and multiplying by 2**-24 (an exact power of two) is EXACT in both f32 and f64 — the
 *  result always has <=24 significant mantissa bits, which fits f32's 24-bit mantissa (23 explicit +
 *  1 implicit) precisely. This is the boundary the truthbridge REFUTED hypothesis could not control
 *  (fract(p*0.1031...) accumulates rounding through a transcendental-adjacent chain); here the
 *  boundary is a single exact multiply, unconditionally lossless at both precisions. */
function u32ToUnitFloat(h: number): number {
  return (h >>> 8) * 2 ** -24;
}

export interface IntHashResult { x: number; y: number }

/** hash22 analog, INTEGER-EXACT cell coordinates in, [0,1)^2 float out. cx/cy must already be
 *  integers (post floor + periodic wrap) — this function performs NO float arithmetic internally
 *  except the final exact dyadic conversion. */
export function hash22Int(cx: number, cy: number): IntHashResult {
  // Bias coordinates positive before the >>> 0 u32 cast: JS's >>>0 on a negative number performs
  // two's-complement wrapping (same as a WGSL i32->u32 bitcast), so negative cell ids are already
  // handled correctly without an explicit offset — but we add a fixed odd bias to x/y so the seed
  // pair is never (0,0)-degenerate at the origin cell, mirroring common PCG2D usage.
  const seeded = pcg2d((cx + 0x9e3779b1) >>> 0, (cy + 0x85ebca77) >>> 0);
  return { x: u32ToUnitFloat(seeded.x), y: u32ToUnitFloat(seeded.y) };
}

// NOTE on what "bit-identical" means for this design: the HASH (hash22Int) and its u32->float
// conversion have NO Round parameter and are proven identical between F64/F32 call sites (measured
// separately by hashDeterminismProbe). The DOWNSTREAM distance chain (centerX/centerY/diff/sqrt)
// still runs through the Round operator, exactly like the float-hash baseline — F32-emulated
// per-op Math.fround rounding on THAT arithmetic still produces ~1-ULP-at-scale differences in the
// f1/f2 FLOAT VALUES even when the two hash inputs are bit-identical (ordinary float rounding on
// otherwise-identical inputs, not a divergence introduced by this design). The claim this design
// actually makes and must be tested for is narrower and is the one that matters physically: the
// int-hash removes CELL-BOUNDARY ARGMIN FLIPS (an O(cell-size) jump from selecting a DIFFERENT
// neighbor as the winner) — NOT bit-identical f1/f2 floats in the general case.
//
// CellResult carries the winning neighbor's ABSOLUTE integer cell id (f1CellX/f1CellY,
// f2CellX/f2CellY) rather than a RASTER index (0..8 relative to the local cellId origin). This
// distinction mattered in practice: a first version of this probe used a raster index and found
// ~100/2M spurious "flips" that were traced (see _voronoi_inthash.test.ts determinism-gate comment)
// to ordinary floor()-boundary crossings — when the smooth v/u coordinate sits ~1e-7 from an
// integer line, F64 and F32-emulated rounding can floor() to DIFFERENT local cellId origins, which
// shifts every neighbor's RASTER position by a constant offset while the ABSOLUTE winning cell
// (and its distance) stays the identical physical cell. Comparing absolute ids is the invariant
// that actually reflects "did the two precisions select the SAME physical cell as the winner".
export interface CellResult { f1: number; f2: number; f1CellX: number; f1CellY: number; f2CellX: number; f2CellY: number }

/** periodicCellular analog. ux/uy are the (already-computed, precision-dependent) scaled UV
 *  coordinates — cell id extraction (floor) and the periodic wrap of the neighbor id happen in
 *  INTEGER space (exact), then hash22Int (exact) produces the jitter float, then the REMAINING
 *  distance/argmin chain runs through the Round operator like the float-hash baseline, so this
 *  function's F64-vs-F32 comparison isolates "does removing the float hash close the gap" from
 *  "does the downstream distance math itself diverge" (it still can, marginally — measured, not
 *  assumed, by the determinism gate; see the CellResult doc comment above for what claim this
 *  actually tests). */
function periodicCellularInt(ux: number, uy: number, periodX: number, jitter: number, r: Round): CellResult {
  const cellIdX = Math.floor(ux);
  const cellIdY = Math.floor(uy);
  const cellUvX = r(ux - cellIdX);
  const cellUvY = r(uy - cellIdY);

  // periodX arrives as a float (it is `scaleVal`, itself Round-dependent upstream); for the
  // INTEGER wrap we need an integer period. scaleVal is always a small positive whole-ish number
  // in practice (style param default 8.0) — round it once to nearest integer for the modulo. This
  // matches the algorithmic INTENT of the original `(id % period + period) % period` (periodic
  // wrap of an integer cell id) without smuggling float rounding back into the hash's integer
  // domain: the rounding happens on a value that does not vary between F64/F32 call sites in this
  // library's own measurements (periodX is passed in as a plain constant, not re-derived per-round
  // inside this function), so it cannot itself be a source of F64-vs-F32 divergence.
  const periodXInt = Math.max(1, Math.round(periodX));

  let f1 = 999;
  let f2 = 999;
  let f1CellX = 0, f1CellY = 0, f2CellX = 0, f2CellY = 0;
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const neighborIdX = cellIdX + x; // ABSOLUTE (unwrapped) cell id — the physical identity of the candidate cell
      const neighborIdY = cellIdY + y;
      const wrappedX = ((neighborIdX % periodXInt) + periodXInt) % periodXInt; // wrap ONLY for the hash lookup (cylinder periodicity aliases distinct absolute X ids to the same hash cell by design)
      const pointHash = hash22Int(wrappedX, neighborIdY);
      const centerX = r(x + r(pointHash.x * jitter));
      const centerY = r(y + r(pointHash.y * jitter));
      const diffX = r(centerX - cellUvX);
      const diffY = r(centerY - cellUvY);
      const dist = r(Math.sqrt(r(r(diffX * diffX) + r(diffY * diffY))));
      if (dist < f1) {
        f2 = f1; f2CellX = f1CellX; f2CellY = f1CellY;
        f1 = dist; f1CellX = neighborIdX; f1CellY = neighborIdY;
      } else if (dist < f2) {
        f2 = dist; f2CellX = neighborIdX; f2CellY = neighborIdY;
      }
    }
  }
  return { f1, f2, f1CellX, f1CellY, f2CellX, f2CellY };
}

function smoothstep(e0: number, e1: number, x: number, r: Round): number {
  const s = Math.max(0, Math.min(1, r(r(x - e0) / r(e1 - e0))));
  return r(r(s * s) * r(3 - r(2 * s)));
}

export interface VoronoiParams {
  scale: number; jitter: number; thickness: number; relief: number;
  morph: number; zStretch: number; pulse: number; edgeFade: number;
}

function rOuterVoronoiIntAt(theta: number, z: number, r0: number, H: number, p: VoronoiParams, r: Round):
  { radius: number; cell: CellResult; uAnim: number; v: number } {
  const t = Math.max(0, Math.min(1, r(z / r(Math.max(H, 1e-4)))));
  const scaleVal = p.scale > 0 ? r(p.scale) : 8;
  const stretchVal = p.zStretch > 0 ? r(p.zStretch) : 1;

  const u = r(r(theta / r(Math.PI * 2)) * scaleVal);
  const uAnim = r(u + r(p.pulse * scaleVal));
  const v = r(r(t * scaleVal) * stretchVal);

  const cell = periodicCellularInt(uAnim, v, scaleVal, r(p.jitter), r);
  const cellSdf = r(cell.f2 - cell.f1);

  const web = r(1 - smoothstep(0, p.thickness, cellSdf, r));
  const bubble = smoothstep(1, 0, cell.f1, r);
  const pattern = r(r(bubble * r(1 - p.morph)) + r(web * p.morph));

  let fadeFactor = 1;
  const fadeLimit = Math.min(p.edgeFade, 0.49);
  if (fadeLimit > 0) {
    const bFade = smoothstep(0, fadeLimit, t, r);
    const tFade = r(1 - smoothstep(r(1 - fadeLimit), 1, t, r));
    fadeFactor = r(bFade * tFade);
  }
  return { radius: r(r0 + r(r(p.relief * pattern) * fadeFactor)), cell, uAnim, v };
}

/** f32-emulated int-hash rOuterVoronoi. */
export function rOuterVoronoiIntF32(theta: number, z: number, r0: number, H: number, p: VoronoiParams): number {
  return rOuterVoronoiIntAt(theta, z, r0, H, p, F32).radius;
}

/** f64 int-hash rOuterVoronoi (the reference/identity-round evaluation). */
export function rOuterVoronoiIntF64(theta: number, z: number, r0: number, H: number, p: VoronoiParams): number {
  return rOuterVoronoiIntAt(theta, z, r0, H, p, F64).radius;
}

/** Cell-argmin comparison at one (theta,z) for the INT-HASH chain: returns both precisions' F1/F2
 *  so the caller can classify "same winning cell" vs "different winning cell" (a jump), exactly
 *  mirroring cellArgminBothPrecisions in _voronoi_truthbridge_lib.ts for the float-hash chain. */
export function cellArgminBothPrecisionsInt(
  theta: number, z: number, H: number, p: VoronoiParams,
): { f64: CellResult; f32: CellResult } {
  const a = rOuterVoronoiIntAt(theta, z, 0, H, p, F64);
  const b = rOuterVoronoiIntAt(theta, z, 0, H, p, F32);
  return { f64: a.cell, f32: b.cell };
}

/** Raw hash22Int comparison at one (integer cx,cy) — used by the determinism gate to check the
 *  hash u32 output and derived jitter float are IDENTICAL regardless of any Round context (they
 *  should be, since hash22Int takes no Round parameter at all — this function exists so the probe
 *  can assert that invariant directly rather than only inferring it from downstream radius
 *  equality). */
export function hashDeterminismProbe(cx: number, cy: number): IntHashResult {
  return hash22Int(cx, cy);
}
