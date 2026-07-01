// _residualLocalize.test.ts — DEV-ONLY (env PF_RESLOC=1). Is the residual yellow/red REGULARLY SCATTERED (a
// grid-aligned sampling artifact — improvable) or clustered at the ~15 arch-apex cusps (irreducible)? Loads the
// SF mesh, finds faces with chord sag > 0.05mm, and tests their (u,t) against grid periods. If the fractional
// position within a sizing-grid cell peaks at the CENTER (0.5), the curvatureSubsamples=2 corner-sampling missed
// cell-center crests → a fixable bug, NOT a floor.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';

const TAU = 2 * Math.PI;
const H = 120;
const DIR = join('research', 'exchange', '_showcase');
const FILE = 'GothicArches_puregreen_SF';
const BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

function hist(fracs: number[], bins: number): number[] {
  const h = new Array(bins).fill(0);
  for (const f of fracs) h[Math.min(bins - 1, Math.floor(f * bins))]++;
  return h;
}

describe('residual localization', () => {
  it.skipIf(process.env.PF_RESLOC !== '1')('grid-alignment of the >0.05mm faces', () => {
    const rA = buildRadiusFn('GothicArches' as never, {}, { H, Rb: 40, Rt: 50, expn: 1 });
    const xyzBuf = readFileSync(join(DIR, `${FILE}.xyz.bin`)); const idxBuf = readFileSync(join(DIR, `${FILE}.idx.bin`));
    const xyz = new Float32Array(xyzBuf.buffer, xyzBuf.byteOffset, xyzBuf.byteLength / 4);
    const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
    const nF = idx.length / 3, nV = xyz.length / 3;
    const uu = new Float64Array(nV), tt = new Float64Array(nV);
    for (let i = 0; i < nV; i++) { const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2]; let u = Math.atan2(y, x) / TAU; if (u < 0) u += 1; uu[i] = u; tt[i] = z / H; }

    const fracU512: number[] = [], fracT512: number[] = [], fracU256: number[] = [], sags: number[] = [];
    const worst: Array<{ u: number; t: number; sag: number }> = [];
    let over05 = 0;
    for (let f = 0; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let ua = uu[a], ub = uu[b], uc = uu[c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const ta = tt[a], tb = tt[b], tc = tt[c];
      let sag = 0;
      for (const [w0, w1, w2] of BARY) {
        const um = w0 * ua + w1 * ub + w2 * uc, tm = w0 * ta + w1 * tb + w2 * tc;
        const th = TAU * um, z = tm * H, r = rA(th, z);
        const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
        if (d > sag) sag = d;
      }
      if (sag > 0.05) {
        over05++;
        const uc3 = (ua + ub + uc) / 3, tc3 = (ta + tb + tc) / 3;
        const cu = ((uc3 % 1) + 1) % 1;
        fracU512.push(((cu * 512) % 1 + 1) % 1); fracT512.push(((tc3 * 512) % 1 + 1) % 1); fracU256.push(((cu * 256) % 1 + 1) % 1);
        sags.push(sag);
        if (worst.length < 20) worst.push({ u: cu, t: tc3, sag });
      }
    }
    // eslint-disable-next-line no-console
    console.log(`residual faces (sag>0.05mm): ${over05} of ${nF} (${(100 * over05 / nF).toFixed(4)}%)`);
    // eslint-disable-next-line no-console
    console.log(`fracU512 hist (10 bins, cell-CENTER = bin ~5): [${hist(fracU512, 10).join(', ')}]`);
    // eslint-disable-next-line no-console
    console.log(`fracT512 hist (10 bins): [${hist(fracT512, 10).join(', ')}]`);
    // eslint-disable-next-line no-console
    console.log(`fracU256 hist (10 bins): [${hist(fracU256, 10).join(', ')}]`);
    const meanU = fracU512.reduce((s, x) => s + x, 0) / (fracU512.length || 1);
    const meanT = fracT512.reduce((s, x) => s + x, 0) / (fracT512.length || 1);
    // eslint-disable-next-line no-console
    console.log(`mean fracU512=${meanU.toFixed(3)} fracT512=${meanT.toFixed(3)} (0.5 => cell-CENTER bias = corner-sampling-miss bug)`);
    // t-band distribution: are they concentrated (apex) or spread?
    const tband = new Array(10).fill(0); for (const w of worst) tband[Math.min(9, Math.floor(w.t * 10))]++;
    // eslint-disable-next-line no-console
    console.log(`worst-20 sample (u,t,sag): ${worst.slice(0, 8).map((w) => `(${w.u.toFixed(3)},${w.t.toFixed(3)},${w.sag.toFixed(2)})`).join(' ')}`);
    expect(true).toBe(true);
  }, 10 * 60 * 1000);
});
