// _pf_geostar_recon.test.ts — DEV-ONLY (PF_GSRECON=1). Recon-only: characterize GeometricStar's crest structure to
// pick a valid patch window for the perfect-mesher brute kernel. NOT a verdict — just measurement.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

function rowCrests(rA: (th: number, z: number) => number, t: number, H: number, uLo: number, uHi: number, N: number, minAmp: number): number[] {
  const z = t * H; const rad = new Float64Array(N + 1); const us = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const u = uLo + (uHi - uLo) * (i / N); us[i] = u; rad[i] = rA(TAU * (((u % 1) + 1) % 1), z); }
  const out: number[] = [];
  for (let i = 1; i < N; i++) {
    if (rad[i] > rad[i - 1] && rad[i] >= rad[i + 1]) {
      const W = Math.max(2, Math.round(N / 40)); let lo = rad[i];
      for (let k = 1; k <= W; k++) { if (i - k >= 0 && rad[i - k] < lo) lo = rad[i - k]; if (i + k <= N && rad[i + k] < lo) lo = rad[i + k]; }
      if (rad[i] - lo < minAmp) continue; out.push(us[i]);
    }
  }
  return out;
}

describe('geostar-recon', () => {
  it.skipIf(process.env.PF_GSRECON !== '1')('crest structure', () => {
    const dims: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
    const H = dims.H;
    const rA = buildRadiusFn('GeometricStar' as StyleId, {}, dims);
    // full-ring crest count per row across t (find count-oscillation + a stable-count band)
    /* eslint-disable no-console */
    console.log('--- per-row full-ring u-crest count vs t ---');
    const counts: Array<{ t: number; n: number }> = [];
    for (let ti = 0; ti <= 40; ti++) {
      const t = ti / 40;
      const n = rowCrests(rA, t, H, 0, 1, 8192, 0.03).length;
      counts.push({ t: +t.toFixed(3), n });
    }
    console.log(counts.map((c) => `${c.t}:${c.n}`).join(' '));
    // relief amplitude vs t (peak-to-mean) to find a t with strong straps
    console.log('--- amplitude vs t (max radius - r0) at a few t ---');
    for (const t of [0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.85]) {
      const z = t * H; let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < 4096; i++) { const r = rA(TAU * (i / 4096), z); if (r < mn) mn = r; if (r > mx) mx = r; }
      const nc = rowCrests(rA, t, H, 0, 1, 8192, 0.03).length;
      console.log(`t=${t} rMin=${mn.toFixed(3)} rMax=${mx.toFixed(3)} amp=${(mx - mn).toFixed(3)} nCrest=${nc}`);
    }
    // r0 baseline (baseRadius) at those t
    // one-crest local kink profile: pick t=0.15 (below first tile boundary t=0.25), find a crest, sample radius across it
    const tK = 0.15; const z = tK * H;
    const uc = rowCrests(rA, tK, H, 0, 0.3, 8000, 0.03);
    console.log(`--- crest kink profile at t=${tK}: crests in [0,0.3]=`, uc.map((u) => +u.toFixed(4)));
    if (uc.length) {
      const u0 = uc[0]; const du = 0.01;
      const prof: string[] = [];
      for (let k = -20; k <= 20; k++) { const u = u0 + (k / 20) * du; prof.push(rA(TAU * (((u % 1) + 1) % 1), z).toFixed(3)); }
      console.log('radius across crest (±0.01 u):', prof.join(','));
      // estimate gradU (dr/d(arc)) near the crest flank
      const arcPerU = TAU * 45;
      const uL = u0 - 0.002, uR = u0 + 0.002;
      const g = Math.abs(rA(TAU * (((uR % 1) + 1) % 1), z) - rA(TAU * (((uL % 1) + 1) % 1), z)) / ((uR - uL) * TAU);
      console.log(`gradU near crest ~ ${g.toFixed(1)} (arcPerU=${arcPerU.toFixed(1)})`);
    }
    /* eslint-enable no-console */
    expect(true).toBe(true);
  }, 5 * 60 * 1000);
});
