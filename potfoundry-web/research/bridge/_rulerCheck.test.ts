// _rulerCheck.test.ts — DEV-ONLY (env PF_RULER=1). E-2026-07-01-CRESTAWARE decisive ruler test. The subs=2 worst
// faces are STEEP near-vertical arch ribs (|dr/dz| 1.2–5.1, |d2r/du2| 5e6–1e7, high t) — _budgetLocalize. The lab's
// whole metric discipline says the RADIAL per-face chord OVERSTATES near-vertical relief 2–370× while TRUE-3D is
// CAD-grade (E-FRONTIER-BUILD3: GothicArches radial ribs 0.6–1.2mm vs true-3D 0.127mm). So: is the mission's RADIAL
// heatmap residual a RULER artifact? Load an existing subs=2 mesh dump, recover (u,t) from xyz, and measure BOTH
// perFaceChordSag (radial) AND perFaceTrue3DSag (honest nearest-surface) → compare RED/YEL/worst under each ruler.
// No mesh build — pure re-measurement of a dumped mesh (minutes). Run: PF_RULER=1 npx vitest run <this>.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { perFaceChordSag, perFaceTrue3DSag } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_crestaware');

function loadUtIdx(name: string, H: number): { ut: number[]; idx: Uint32Array } | undefined {
  const xf = join(DIR, `${name}.xyz.bin`), inf = join(DIR, `${name}.idx.bin`);
  if (!existsSync(xf) || !existsSync(inf)) return undefined;
  const xb = readFileSync(xf), ib = readFileSync(inf);
  const xyz = new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4);
  const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  const nV = xyz.length / 3; const ut = new Array(nV * 2);
  for (let i = 0; i < nV; i++) { const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2]; let u = Math.atan2(y, x) / TAU; if (u < 0) u += 1; ut[2 * i] = u; ut[2 * i + 1] = z / H; }
  return { ut, idx };
}

function stats(name: string, faceErr: Float64Array, worst: number): { red: number; yel: number; o03: number; worst: number } {
  const nF = faceErr.length; let red = 0, yel = 0, o03 = 0;
  for (let f = 0; f < nF; f++) { const e = faceErr[f]; if (e > 0.15) red++; if (e > 0.05) yel++; if (e > 0.03) o03++; }
  // eslint-disable-next-line no-console
  console.log(`  ${name.padEnd(8)} worst=${worst.toFixed(4)}mm RED(>0.15)=${(100 * red / nF).toFixed(5)}% YEL(>0.05)=${(100 * yel / nF).toFixed(5)}% >0.03=${(100 * o03 / nF).toFixed(5)}% (${red}/${yel}/${o03} faces of ${nF})`);
  return { red: 100 * red / nF, yel: 100 * yel / nF, o03: 100 * o03 / nF, worst };
}

describe('radial vs true-3D ruler on the subs=2 residual', () => {
  it.skipIf(process.env.PF_RULER !== '1')('is the mission RADIAL residual a ruler artifact?', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    // try the budget dumps in order of preference (whichever exist)
    for (const name of ['gothic_bud2.5M', 'gothic_subs2', 'gothic_cmp_B_finestep']) {
      const m = loadUtIdx(name, H);
      if (!m) { continue; }
      // eslint-disable-next-line no-console
      console.log(`${name}: tris=${m.idx.length / 3}`);
      const rad = perFaceChordSag(m.ut, m.idx, rA, H);
      stats('RADIAL', rad.faceErr, rad.worstMm);
      const t3 = perFaceTrue3DSag(m.ut, m.idx, rA, H, { preFilterMm: 0.02 });
      stats('TRUE-3D', t3.faceErr, t3.worstMm);
      break; // one is enough (they're the same mesh family)
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
