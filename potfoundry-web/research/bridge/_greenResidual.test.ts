// _greenResidual.test.ts — DEV-ONLY (env PF_GREENRES=1). Localize the residual RED/YELLOW faces on the dumped
// t20 pure-green mesh. Reads research/exchange/_showcase/GothicArches_puregreen_t20.{xyz,idx}.bin, recomputes
// per-face chord sag (labkit), and reports the WORST faces' geography: (u,t) centroid, sag, edge lengths (mm),
// local surface steepness (|dr/dz| via rA finite-diff → is it a near-vertical apex?), and t-band histogram of
// the yellow faces. This tells us WHAT the residual is: apex-cusp (steep), budget-starved (large facets), or a
// specific t-band — so we know whether tighter chordTolMm / more budget can close it or it's irreducible.
//
// Run: PF_GREENRES=1 npx vitest run research/bridge/_greenResidual.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_showcase');
const BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

describe('green residual localization', () => {
  it.skipIf(process.env.PF_GREENRES !== '1')('geography of the worst faces', () => {
    const FILE = process.env.PF_GREENRES_FILE ?? 'GothicArches_puregreen_t20';
    const xyzBuf = readFileSync(join(DIR, `${FILE}.xyz.bin`)); const idxBuf = readFileSync(join(DIR, `${FILE}.idx.bin`));
    const xyz = new Float32Array(xyzBuf.buffer, xyzBuf.byteOffset, xyzBuf.byteLength / 4);
    const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
    const nV = xyz.length / 3, nF = idx.length / 3;
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;

    const uu = new Float64Array(nV), tt = new Float64Array(nV);
    for (let i = 0; i < nV; i++) { const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2]; let u = Math.atan2(y, x) / TAU; if (u < 0) u += 1; uu[i] = u; tt[i] = z / H; }

    // steepness proxy at (u,t): |dr/dz| in mm/mm (near-vertical relief ⇒ large).
    const steep = (u: number, t: number): number => {
      const th = TAU * u, z = t * H; const dz = 0.2;
      const r0 = rA(th, Math.max(0, z - dz)), r1 = rA(th, Math.min(H, z + dz));
      return Math.abs((r1 - r0) / (2 * dz));
    };

    type F = { f: number; sag: number; u: number; t: number; emax: number; emin: number; st: number };
    const worst: F[] = [];
    const yelTband = new Array(24).fill(0); // yellow-face t-histogram (24 bins)
    let red = 0, yel = 0, worstSag = 0;
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
      let err = 0;
      for (const [wa, wb, wc] of BARY) {
        const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
        const th = TAU * um, z = tm * H, r = rA(th, z);
        const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
        if (d > err) err = d;
      }
      if (err > worstSag) worstSag = err;
      if (err > 0.15) red++;
      if (err > 0.05) {
        yel++;
        const tm = (ta + tb + tc) / 3; yelTband[Math.min(23, Math.max(0, Math.floor(tm * 24)))]++;
        const e0 = Math.hypot(ax - bx, ay - by, az - bz), e1 = Math.hypot(bx - cx, by - cy, bz - cz), e2 = Math.hypot(cx - ax, cy - ay, cz - az);
        worst.push({ f, sag: err, u: ((ua + ub + uc) / 3) % 1, t: tm, emax: Math.max(e0, e1, e2), emin: Math.min(e0, e1, e2), st: steep((ua + ub + uc) / 3, tm) });
      }
    }
    worst.sort((p, q) => q.sag - p.sag);
    // eslint-disable-next-line no-console
    console.log(`${FILE}: faces=${nF} verts=${nV} | RED(>0.15)=${red} (${(100 * red / nF).toFixed(4)}%) YEL(>0.05)=${yel} (${(100 * yel / nF).toFixed(4)}%) worst=${worstSag.toFixed(3)}mm`);
    // eslint-disable-next-line no-console
    console.log('  worst 15 faces (sag / u,t / edgeMax,edgeMin mm / steepness |dr/dz|):');
    for (const w of worst.slice(0, 15)) {
      // eslint-disable-next-line no-console
      console.log(`    sag=${w.sag.toFixed(3)} (u=${w.u.toFixed(4)},t=${w.t.toFixed(4)}) eMax=${w.emax.toFixed(3)} eMin=${w.emin.toFixed(4)} steep=${w.st.toFixed(1)}`);
    }
    // eslint-disable-next-line no-console
    console.log('  yellow-face t-band histogram (24 bins over t): ' + yelTband.map((v, i) => v > 0 ? `${i}:${v}` : '').filter(Boolean).join(' '));
    expect(nF).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
