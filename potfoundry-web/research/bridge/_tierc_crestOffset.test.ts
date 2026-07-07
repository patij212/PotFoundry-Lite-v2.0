// _tierc_crestOffset.test.ts — DEV-ONLY diagnostic (PF_TIERC_DIAG=1).
// HYPOTHESIS (full-Gothic-gate stall, 2nd root-cause candidate): the Tier-C
// protected complex comes from detectFeatures at fineRes 120 (~2.4mm u-cells);
// if the detected crest chains sit ~0.5-2mm OFF the true ridge, the locked
// edges protect the WRONG line and facets bridge the real cusp beside them —
// an insertion-invariant ~0.4mm floor (matches the measured plateau).
// MEASURE: for sampled points on the complex's constraint chains, the offset
// (mm of arc) between the chain point and the local TRUE ridge of r(u) at
// fixed t (golden-section max over ±1 detector cell). Report the offset
// distribution. Confirmed iff p90 offset ≳ 0.3mm (the floor scale); refuted
// iff offsets ≪ 0.1mm (then the stall has yet another cause).
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';

const TAU = 2 * Math.PI;

describe('tierC diag — constraint-chain offset from the true ridge', () => {
  it.skipIf(process.env.PF_TIERC_DIAG !== '1')('Gothic chain→ridge offsets', () => {
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 });
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const { uToMm, tToMm } = complex;
    const rAt = (u: number, t: number): number => {
      const [x, y] = sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
      return Math.hypot(x, y);
    };
    // Golden-section MAXIMIZE r along u at fixed t within ±win (detector cell ~1/120).
    const ridgeU = (u0: number, t: number, win: number): number => {
      let a = u0 - win, b = u0 + win;
      const gr = (Math.sqrt(5) - 1) / 2;
      let c = b - gr * (b - a), d = a + gr * (b - a);
      for (let i = 0; i < 60; i++) {
        if (rAt(c, t) > rAt(d, t)) { b = d; } else { a = c; }
        c = b - gr * (b - a); d = a + gr * (b - a);
      }
      return (a + b) / 2;
    };
    const offs: number[] = [];
    const step = Math.max(1, Math.floor(complex.edges.length / 4000));
    for (let ei = 0; ei < complex.edges.length; ei += step) {
      const [a, b] = complex.edges[ei];
      const u = ((complex.vertices[2 * a] + complex.vertices[2 * b]) / 2) / uToMm;
      const t = ((complex.vertices[2 * a + 1] + complex.vertices[2 * b + 1]) / 2) / tToMm;
      if (t < 0.05 || t > 0.95) continue;
      const uStar = ridgeU(u, t, 1 / 120);
      // Only count when a genuine local max exists (ridge amplitude > 0.05mm
      // vs the window edges — otherwise the chain is a t-running crease where
      // the u-ridge probe is the wrong instrument; skip, don't pollute).
      const rPeak = rAt(uStar, t);
      const amp = rPeak - Math.max(rAt(u - 1 / 120, t), rAt(u + 1 / 120, t));
      if (amp < 0.05) continue;
      offs.push(Math.abs(uStar - u) * uToMm);
    }
    offs.sort((x, y) => x - y);
    const pc = (q: number): number => offs.length ? offs[Math.min(offs.length - 1, Math.floor(q * offs.length))] : -1;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      chainsSampled: offs.length,
      offsetP50mm: +pc(0.5).toFixed(4),
      offsetP90mm: +pc(0.9).toFixed(4),
      offsetMaxMm: offs.length ? +offs[offs.length - 1].toFixed(4) : -1,
      uCellMm: +(uToMm / 120).toFixed(3),
    }));
    expect(offs.length).toBeGreaterThan(50);
  }, 30 * 60 * 1000);
});
