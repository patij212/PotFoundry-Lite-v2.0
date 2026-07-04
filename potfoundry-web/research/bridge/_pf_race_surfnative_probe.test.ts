// _pf_race_surfnative_probe.test.ts — DEV-ONLY (PF_SN_PROBE=1). Cross-section characterization of ONE worst Gothic
// rib-crest cusp, to size the SURFACE-NATIVE single-cusp proxy. Reads _gd_gothic redfacets (worst-200 crest facets),
// picks the reddest true CREST facet, recovers its (u,t) apex, and dumps the radial cross-section (r vs u at fixed t)
// so we can SEE the cusp half-angle + whether the apex is a knife-edge (C0) or a smooth-but-steep ridge. Writes
// research/exchange/_pf_race_surfnative/probe.json. No mesh build — fast, crash-proof.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, type AnalyticRadiusFn } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const R_MEAN = 48;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_race_surfnative');

// Find the u of the local radial maximum (crest) near a seed u at fixed t, by golden section on rA.
function refineCrestU(rA: AnalyticRadiusFn, uSeed: number, t: number, win: number): { u: number; r: number } {
  const z = t * H; const GR = (Math.sqrt(5) - 1) / 2;
  let a = uSeed - win, b = uSeed + win;
  const f = (u: number): number => rA(TAU * (u - Math.floor(u)), z);
  let c = b - GR * (b - a), d = a + GR * (b - a); let fc = f(c), fd = f(d);
  for (let i = 0; i < 60; i++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = f(d); } if (b - a < 1e-9) break; }
  const u = (a + b) / 2; return { u, r: f(u) };
}

describe('sn-probe: characterize one worst Gothic cusp cross-section', () => {
  it.skipIf(process.env.PF_SN_PROBE !== '1')('dump cross-section', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    // We only have facet indices in redfacets (no (u,t)). Instead scan a t-row for crests and pick the SHARPEST one
    // (largest local curvature at the apex). This is representative of the count-unstable rib crest cusp.
    const t = 0.62; const z = t * H; const N = 8192;
    const rad = new Float64Array(N);
    for (let i = 0; i < N; i++) rad[i] = rA(TAU * (i / N), z);
    // local maxima
    const crests: Array<{ u: number; r: number; curv: number }> = [];
    for (let i = 0; i < N; i++) {
      const rp = rad[(i - 1 + N) % N], rc = rad[i], rn = rad[(i + 1) % N];
      if (!(rc > rp && rc >= rn)) continue;
      const cr = refineCrestU(rA, i / N, t, 1.5 / N);
      // apex curvature in mm-arc: second difference of r over a small u window mapped to arc length
      const du = 0.5 / N; const arc = du * TAU * R_MEAN;
      const rC = cr.r, rL = rA(TAU * ((cr.u - du) - Math.floor(cr.u - du)), z), rR = rA(TAU * ((cr.u + du) - Math.floor(cr.u + du)), z);
      const curv = Math.abs((rL - 2 * rC + rR)) / (arc * arc); // 1/mm approx of d2r/darc2
      crests.push({ u: cr.u, r: rC, curv });
    }
    crests.sort((a, b) => b.curv - a.curv);
    const sharp = crests[0];
    // cross-section r(u) around the sharpest crest over +/- half a bay
    const bay = 1 / crests.length; // approx bay pitch
    const halfWin = bay * 0.6;
    const M = 401; const cross: Array<[number, number]> = [];
    for (let k = 0; k < M; k++) {
      const u = sharp.u + halfWin * (2 * k / (M - 1) - 1);
      cross.push([+((u - sharp.u) * TAU * R_MEAN).toFixed(4), +rA(TAU * (u - Math.floor(u)), z).toFixed(5)]);
    }
    // valley radius (min over the window) => relief height
    let rMin = Infinity; for (const [, r] of cross) if (r < rMin) rMin = r;
    const reliefMm = sharp.r - rMin;
    // half-angle estimate: slope of r vs arc on each flank near apex (over ~0.3mm arc)
    const idxApex = Math.round((M - 1) / 2);
    const slopeR = (cross[idxApex + 8][1] - cross[idxApex][1]) / (cross[idxApex + 8][0] - cross[idxApex][0]);
    const slopeL = (cross[idxApex - 8][1] - cross[idxApex][1]) / (cross[idxApex - 8][0] - cross[idxApex][0]);
    const out = {
      t, nCrestsInRow: crests.length, bayPitchMmArc: +(bay * TAU * R_MEAN).toFixed(3),
      apexU: sharp.u, apexR: +sharp.r.toFixed(4), apexCurv1PerMm: +sharp.curv.toFixed(4),
      reliefMm: +reliefMm.toFixed(4), flankSlopeR_mmPerMmArc: [+slopeL.toFixed(3), +slopeR.toFixed(3)],
      note: 'cross = [arcMm_from_apex, r_mm]; a near-vertical flank => |slopeR| large; knife-edge => curvature spikes at apex',
      cross,
    };
    writeFileSync(join(DIR, 'probe.json'), JSON.stringify(out, null, 1));
    // eslint-disable-next-line no-console
    console.log(`[SN-PROBE] apexR=${out.apexR} relief=${out.reliefMm}mm bay=${out.bayPitchMmArc}mm-arc curv=${out.apexCurv1PerMm} flankSlopeR=${out.flankSlopeR_mmPerMmArc}`);
    expect(cross.length).toBe(M);
  }, 5 * 60 * 1000);
});
