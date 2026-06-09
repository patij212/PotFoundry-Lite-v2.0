/**
 * BicubicSurfaceSampler.ts — C1 Catmull-Rom reconstruction of a pre-evaluated
 * (u,t) position grid, for the FAITHFUL CAD-fidelity serration reference.
 *
 * {@link GpuSurfaceSampler} interpolates the same grid BILINEARLY (C0): its
 * derivative jumps at every cell boundary, so the serration metric's 2D-Newton
 * (angle,z)→(u,t) inversion grows NOISIER near a sharp petal cusp as the reference
 * grid is refined (the measured non-monotonic crestRms at high reference
 * resolution). Catmull-Rom is interpolatory (passes through the nodes), C1
 * (continuous tangents → a well-conditioned, de-noised inversion), and has O(h^4)
 * interpolation error versus bilinear's O(h^2) — so for a smooth surface it tracks
 * the true shape between nodes far closer, removing most of the reference's own
 * cusp-smoothing from the measurement. It is a drop-in {@link SurfaceSampler}: same
 * row-major grid, u periodic, t clamped.
 *
 * @module conforming/BicubicSurfaceSampler
 */

import type { SamplerGridResolution, SurfaceSampler, Vec3 } from './SurfaceSampler';

/**
 * Catmull-Rom basis for fraction `f ∈ [0,1]` between `p1` and `p2`, with `p0`,`p3`
 * the outer neighbours: q(f) = 0.5·( 2p1 + (−p0+p2)f + (2p0−5p1+4p2−p3)f² +
 * (−p0+3p1−3p2+p3)f³ ). Reproduces affine data exactly and passes through p1 (f=0)
 * and p2 (f=1).
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, f: number): number {
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  return ((a * f + b) * f + c) * f + p1;
}

/**
 * Production-compatible {@link SurfaceSampler} that reconstructs a dense
 * `resU × resT` row-major position grid (`positions[(row*resU + col)*3]`) with
 * bicubic Catmull-Rom interpolation.
 *
 * - `u` is **periodic**: column indices wrap (u = 1 ≡ u = 0).
 * - `t` is **clamped** to `[0,1]`: row indices clamp at the caps (no read outside).
 */
export class BicubicSurfaceSampler implements SurfaceSampler {
  constructor(
    private readonly positions: Float32Array,
    private readonly resU: number,
    private readonly resT: number,
  ) {}

  gridResolution(): SamplerGridResolution {
    return { resU: this.resU, resT: this.resT };
  }

  position(u: number, t: number): Vec3 {
    const { positions, resU, resT } = this;

    // u in [0,1) periodic → continuous column index; t in [0,1] clamped → row index.
    let uu = u - Math.floor(u);
    if (uu < 0) uu += 1;
    const uf = uu * resU;
    const u1 = Math.floor(uf) % resU;
    const fu = uf - Math.floor(uf);

    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const tf = tc * (resT - 1);
    const t1 = Math.min(Math.floor(tf), resT - 1);
    const ft = tf - t1;

    // 4 column indices: u is PERIODIC, so the outer neighbours wrap (correct true
    // neighbours of a closed surface — no extrapolation needed).
    const uCols = [
      (u1 - 1 + resU) % resU,
      u1,
      (u1 + 1) % resU,
      (u1 + 2) % resU,
    ];
    // The two t-rows bracketing the sample (t is CLAMPED, not periodic). t1+1 is
    // valid for every interior cell; it only coincides with t1 at t=1 (ft=0, where
    // the cubic returns row t1 exactly), so a min-clamp is safe there.
    const rowLo = t1;
    const rowHi = Math.min(t1 + 1, resT - 1);

    const out: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      // Catmull-Rom across the 4 u-columns of a given row, for component c.
      const rowU = (row: number): number => {
        const base = row * resU;
        return catmullRom(
          positions[(base + uCols[0]) * 3 + c],
          positions[(base + uCols[1]) * 3 + c],
          positions[(base + uCols[2]) * 3 + c],
          positions[(base + uCols[3]) * 3 + c],
          fu,
        );
      };
      const a1 = rowU(rowLo);
      const a2 = rowU(rowHi);
      // The t-direction outer neighbours: real rows when in range, else LINEAR
      // EXTRAPOLATION of the edge (phantom = 2·edge − inner). Clamping instead would
      // duplicate the edge row and halve the boundary tangent — a large cap-cell
      // error (the t-axis is not periodic). Extrapolation keeps Catmull-Rom exact on
      // affine data right to the caps.
      const a0 = t1 - 1 >= 0 ? rowU(t1 - 1) : 2 * a1 - a2;
      const a3 = t1 + 2 <= resT - 1 ? rowU(t1 + 2) : 2 * a2 - a1;
      out[c] = catmullRom(a0, a1, a2, a3, ft);
    }
    return out;
  }
}
