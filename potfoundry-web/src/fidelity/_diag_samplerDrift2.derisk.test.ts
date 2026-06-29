/**
 * T2b — clean interior-peak isolation. Pick a single petal PEAK far from the u-seam,
 * at t=0.45, and show (a) the analytic R profile across that peak, (b) the bilinear
 * sampler radius at each 512-grid node spanning the peak, (c) the sampler radius at a
 * mid-cell point exactly between the two nodes straddling the tip. This separates
 * "bilinear chords between two grid nodes" from any seam/port confound.
 */
import { describe, it, expect } from 'vitest';
import { styleSampler, type StyleId } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';

const H = 120, R0 = 40;
const DIMS = { H, Rt: R0, Rb: R0, expn: 1 };
const EPS = 1e-9;
const SF = { sfMBase: 6, sfMTop: 10, sfMCurveExp: 1.2, sfN1: 0.35, sfN1Top: 0.5, sfN2: 0.8, sfN2Top: 1.4, sfN3: 0.8, sfN3Top: 0.8, sfA: 1, sfB: 1 };
function sfv(theta: number, m: number, n1: number, n2: number, n3: number, a: number, b: number): number {
  const c = Math.pow(Math.abs(Math.cos((m * theta) / 4) / Math.max(a, EPS)), n2);
  const s = Math.pow(Math.abs(Math.sin((m * theta) / 4) / Math.max(b, EPS)), n3);
  const denom = Math.pow(c + s, 1 / Math.max(n1, EPS));
  return denom <= EPS ? 0 : Math.min(1 / denom, 4);
}
function Rtrue(u: number, t: number): number {
  const theta = 2 * Math.PI * u;
  const m = SF.sfMBase + (SF.sfMTop - SF.sfMBase) * Math.pow(t, SF.sfMCurveExp);
  const n1 = SF.sfN1 + (SF.sfN1Top - SF.sfN1) * t, n2 = SF.sfN2 + (SF.sfN2Top - SF.sfN2) * t, n3 = SF.sfN3 + (SF.sfN3Top - SF.sfN3) * t;
  const seamOffset = Math.PI / Math.max(m, 1);
  return R0 * (0.9 + 0.35 * sfv(theta + seamOffset, m, n1, n2, n3, SF.sfA, SF.sfB));
}

describe.skipIf(!process.env.PF_DERISK)('T2b interior-peak bilinear chord isolation', () => {
  it('shows the chord-across-tip at a clean interior peak', () => {
    const s = styleSampler('SuperformulaBlossom' as StyleId, { sf_strength: 1 }, DIMS);
    const resU = s.gridResolution?.()?.resU ?? 512;
    const t = 0.45;
    // Find an interior analytic peak in u in [0.3,0.4] (away from seam at u~0/1).
    let bestU = 0.35, bestR = -1;
    for (let i = 0; i < 60000; i++) { const u = 0.30 + 0.10 * i / 60000; const R = Rtrue(u, t); if (R > bestR) { bestR = R; bestU = u; } }
    // eslint-disable-next-line no-console
    console.log(`[T2b] interior peak: u*=${bestU.toFixed(5)} R_true(peak)=${bestR.toFixed(4)}mm  (1/resU=${(1 / resU).toFixed(5)})`);
    // The two grid nodes straddling the peak:
    const col = Math.floor(bestU * resU);
    const uL = col / resU, uR = (col + 1) / resU, uMid = (uL + uR) / 2;
    const rad = (u: number): number => { const p = s.position(u, t); return Math.hypot(p[0], p[1]); };
    // eslint-disable-next-line no-console
    console.log(`[T2b] grid nodes straddling peak: uL=${uL.toFixed(5)} (R_true=${Rtrue(uL, t).toFixed(4)}, r_samp=${rad(uL).toFixed(4)})  uR=${uR.toFixed(5)} (R_true=${Rtrue(uR, t).toFixed(4)}, r_samp=${rad(uR).toFixed(4)})`);
    // eslint-disable-next-line no-console
    console.log(`[T2b] MID-CELL u=${uMid.toFixed(5)}: R_true=${Rtrue(uMid, t).toFixed(4)}  r_sampler(bilinear)=${rad(uMid).toFixed(4)}  drift=${(rad(uMid) - Rtrue(uMid, t)).toFixed(4)}mm`);
    // The true peak vs the linear chord of the two node radii at the peak u:
    const fu = (bestU - uL) / (uR - uL);
    const chord = Rtrue(uL, t) + (Rtrue(uR, t) - Rtrue(uL, t)) * fu;
    // eslint-disable-next-line no-console
    console.log(`[T2b] AT TRUE PEAK u*: R_true=${bestR.toFixed(4)}  linear-chord-of-nodes=${chord.toFixed(4)}  r_sampler=${rad(bestU).toFixed(4)}  ⇒ tip cut by ${(bestR - rad(bestU)).toFixed(4)}mm`);
    // node-level error (should be tiny — proves nodes are on-surface, gaps are the chord):
    let nodeMax = 0;
    for (let c = 0; c <= resU; c++) { const u = c / resU; const e = Math.abs(rad(u % 1) - Rtrue(u % 1, t)); if (e > nodeMax) nodeMax = e; }
    // eslint-disable-next-line no-console
    console.log(`[T2b] MAX |r_samp - R_true| OVER ALL ${resU} GRID NODES at t=${t} = ${nodeMax.toFixed(4)}mm  (small ⇒ nodes on-surface; off-surface error is between nodes = bilinear chord)`);
    expect(bestR).toBeGreaterThan(0);
  }, 60000);
});
