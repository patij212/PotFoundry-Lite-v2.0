// _hotspotProbe.test.ts — DEV-ONLY (env PF_HOTSPOT=1). Characterize the residual hotspot at (u~0.50, t~0.54):
// is the GothicArches surface genuinely extreme there (real feature) or is it an artifact? Sample rA on fine
// 1D cuts through the hotspot and compare local relief amplitude + max |2nd-deriv| to a reference crest region.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './runStyle';

const H = 120, TAU = 2 * Math.PI;

describe('hotspot characterization', () => {
  it.skipIf(process.env.PF_HOTSPOT !== '1')('rA structure at (0.5,0.54) vs a reference crest', () => {
    const rA = buildRadiusFn('GothicArches' as never, {}, { H, Rb: 40, Rt: 50, expn: 1 });
    const rAt = (u: number, t: number): number => rA(TAU * u, t * H);

    // relief amplitude + curvature magnitude on a fine window around a point, scanning u across ribs.
    const analyze = (label: string, u0: number, t0: number): void => {
      // u-cut at t0: sample fine, find local min/max radius + max |d2r/du2|
      const N = 400, uw = 0.06; // ±0.03 in u
      let rmin = 1e9, rmax = -1e9, d2max = 0;
      const rs: number[] = [];
      for (let i = 0; i <= N; i++) { const u = u0 - uw / 2 + (uw * i) / N; const r = rAt(u, t0); rs.push(r); if (r < rmin) rmin = r; if (r > rmax) rmax = r; }
      const du = uw / N;
      for (let i = 1; i < rs.length - 1; i++) { const d2 = Math.abs((rs[i + 1] - 2 * rs[i] + rs[i - 1]) / (du * du)); if (d2 > d2max) d2max = d2; }
      // t-cut at u0
      let tmin = 1e9, tmax = -1e9, d2tmax = 0; const rts: number[] = []; const tw = 0.06;
      for (let i = 0; i <= N; i++) { const t = t0 - tw / 2 + (tw * i) / N; const r = rAt(u0, t); rts.push(r); if (r < tmin) tmin = r; if (r > tmax) tmax = r; }
      const dt = tw / N;
      for (let i = 1; i < rts.length - 1; i++) { const d2 = Math.abs((rts[i + 1] - 2 * rts[i] + rts[i - 1]) / (dt * dt)); if (d2 > d2tmax) d2tmax = d2; }
      // eslint-disable-next-line no-console
      console.log(`${label.padEnd(22)} u-relief=${(rmax - rmin).toFixed(3)}mm |d2r/du2|max=${d2max.toExponential(2)}  t-relief=${(tmax - tmin).toFixed(3)}mm |d2r/dt2|max=${d2tmax.toExponential(2)}  r(center)=${rAt(u0, t0).toFixed(3)}`);
    };

    analyze('HOTSPOT(0.50,0.54)', 0.50, 0.54);
    analyze('near(0.494,0.540)', 0.494, 0.540);
    // reference crests elsewhere (bulk residual fracU 0.35/0.65 → pick some crest u at other t)
    analyze('ref(0.35,0.30)', 0.35, 0.30);
    analyze('ref(0.65,0.70)', 0.65, 0.70);
    analyze('ref(0.20,0.50)', 0.20, 0.50);
    analyze('ref-mid(0.50,0.30)', 0.50, 0.30);
    analyze('ref-mid(0.50,0.80)', 0.50, 0.80);
    expect(true).toBe(true);
  }, 5 * 60 * 1000);
});
