// _structColGeom.test.ts — DEV-ONLY. E-2026-07-02-STRUCTCOL geometry probe for the ridge-GRAPH builder.
// Establish the EXACT birth mechanism of SFB@1 crests/valleys: at each transition (count k->k+1) WHERE (u,t) is
// the new feature born, is it always at the seam, and does a robust "logical slot" tracking (evenly-spaced
// crest lattice) hold cleanly across the whole height? Cheap (no mesh build). Feeds the builder design.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol');

// per-row extrema of a given sign (+1 crest / -1 valley), golden-refined, sorted asc in u.
function rowExtrema(rA: (th: number, z: number) => number, z: number, sign: number, N: number): number[] {
  const vals = new Float64Array(N);
  for (let i = 0; i < N; i++) vals[i] = sign * rA(TAU * (i / N), z);
  const f = (u: number): number => sign * rA(TAU * (((u % 1) + 1) % 1), z);
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = vals[(i - 1 + N) % N], b = vals[i], c = vals[(i + 1) % N];
    if (b >= a && b > c) {
      let lo = (i - 1) / N, hi = (i + 1) / N; const gr = (Math.sqrt(5) - 1) / 2;
      let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = f(c1), f2 = f(c2);
      for (let it = 0; it < 60 && hi - lo > 1e-10; it++) { if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); } else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); } }
      let u = (lo + hi) / 2; u = ((u % 1) + 1) % 1; out.push(u);
    }
  }
  out.sort((a, b) => a - b);
  // dedup near-coincident (seam split) within 1e-4
  const dd: number[] = [];
  for (const u of out) if (dd.length === 0 || Math.abs(u - dd[dd.length - 1]) > 1e-4) dd.push(u);
  if (dd.length > 1 && dd[0] + 1 - dd[dd.length - 1] < 1e-4) dd.pop();
  return dd;
}

describe('STRUCTCOL GEOM — birth mechanism + logical-slot check', () => {
  it.skipIf(process.env.PF_STRUCTCOL_GEOM !== '1')('locates each crest/valley birth (u,t) + tests evenly-spaced lattice', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const N = 20000;
    // 1) bisect the exact t of each crest-count and valley-count transition + the u of the new feature.
    const findBirths = (sign: number): Array<{ t: number; count0: number; count1: number; uNew: number }> => {
      const countAt = (t: number): number[] => rowExtrema(rA, t * DIMS.H, sign, N);
      const births: Array<{ t: number; count0: number; count1: number; uNew: number }> = [];
      const nScan = 400;
      let prev = countAt(0);
      for (let r = 1; r <= nScan; r++) {
        const t = r / nScan;
        const cur = countAt(t);
        if (cur.length !== prev.length) {
          // bisect t between (r-1)/nScan and r/nScan to the count jump
          let lo = (r - 1) / nScan, hi = t; const c0 = prev.length;
          for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (countAt(mid).length === c0) lo = mid; else hi = mid; }
          const tb = hi; const after = countAt(tb);
          // the new feature = the one in `after` with no near match in `before`
          const before = countAt(lo);
          let uNew = -1, bd = Infinity;
          for (const ua of after) {
            let md = Infinity; for (const ub of before) { let d = Math.abs(ua - ub); if (d > 0.5) d = 1 - d; if (d < md) md = d; }
            if (md > 0.02 && md < bd) { bd = md; uNew = ua; } // isolated-from-before = the newborn
          }
          if (after.length > before.length) births.push({ t: +tb.toFixed(5), count0: before.length, count1: after.length, uNew: +((uNew < 0 ? (after[after.length - 1]) : uNew).toFixed(5)) });
          prev = cur;
        } else prev = cur;
      }
      return births;
    };
    const crestBirths = findBirths(1);
    const valleyBirths = findBirths(-1);

    // 2) evenly-spaced lattice test: for several rows, fit u_k = off + k/n and report the max residual (mm).
    const latticeTest = (sign: number, t: number): { n: number; off: number; maxResidMm: number } => {
      const us = rowExtrema(rA, t * DIMS.H, sign, N);
      const n = us.length; if (n < 2) return { n, off: us[0] ?? 0, maxResidMm: 0 };
      // best offset = mean of (u_k - k/n) with cyclic care (us already sorted asc, k=0..n-1)
      let off = 0; for (let k = 0; k < n; k++) off += us[k] - k / n; off /= n;
      let maxR = 0; for (let k = 0; k < n; k++) { let d = Math.abs(us[k] - (off + k / n)); if (d > 0.5) d = 1 - d; maxR = Math.max(maxR, d); }
      return { n, off: +off.toFixed(5), maxResidMm: +(maxR * TAU * 50).toFixed(4) };
    };
    const rows = [0, 0.05, 0.1, 0.2, 0.3, 0.35, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.85, 0.9, 1.0];
    const lat = rows.map((t) => ({ t, crest: latticeTest(1, t), valley: latticeTest(-1, t) }));

    const rec = { style: STYLE, crestBirths, valleyBirths, lattice: lat };
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'geom_birth.json'), JSON.stringify(rec, null, 2));
    console.log('CREST BIRTHS', JSON.stringify(crestBirths));
    console.log('VALLEY BIRTHS', JSON.stringify(valleyBirths));
    console.log('LATTICE maxResid(mm)', JSON.stringify(lat.map((l) => ({ t: l.t, cN: l.crest.n, cR: l.crest.maxResidMm, vN: l.valley.n, vR: l.valley.maxResidMm }))));
    expect(crestBirths.length).toBeGreaterThan(0);
  }, 600_000);
});
