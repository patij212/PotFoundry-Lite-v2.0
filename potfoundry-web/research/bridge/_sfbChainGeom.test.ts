// _sfbChainGeom.test.ts — DEV-ONLY. E-2026-07-02-SFB-CHAIN cheap geometry probe (no mesh build):
// characterize the SFB@1 petal-ridge column structure needed for the STRUCTURED-RIDGE-COLUMNS lever (Lever 2).
// For each t-row: how many petal crests (radial maxima)? do the crest count / ordering stay constant across
// t-bands (so an equal-count structured strip tracks each ridge as a mesh-edge column)? where does the count
// change (petal-birth transitions needing a merge strip)?

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_sfbchain');

describe('SFB-CHAIN GEOM — petal-ridge column structure', () => {
  it.skipIf(process.env.PF_SFBCHAIN_GEOM !== '1')('counts crests per row + detects transitions', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const N = 6000;
    const crestsAt = (t: number): number[] => {
      const z = t * DIMS.H;
      const vals = new Float64Array(N);
      for (let i = 0; i < N; i++) vals[i] = rA(TAU * (i / N), z);
      const found: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = vals[(i - 1 + N) % N], b = vals[i], c = vals[(i + 1) % N];
        if (b >= a && b > c) found.push(i / N);
      }
      return found;
    };
    const rows: any[] = [];
    const nRows = 121;
    let prevCount = -1;
    const transitions: any[] = [];
    for (let r = 0; r < nRows; r++) {
      const t = r / (nRows - 1);
      const cr = crestsAt(t);
      if (cr.length !== prevCount && prevCount >= 0) transitions.push({ t: +t.toFixed(4), from: prevCount, to: cr.length });
      prevCount = cr.length;
      if (r % 12 === 0) rows.push({ t: +t.toFixed(3), nCrest: cr.length, us: cr.map((u) => +u.toFixed(4)) });
    }
    const rec = { style: STYLE, nRowsScanned: nRows, transitions, sampleRows: rows };
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'geom.json'), JSON.stringify(rec, null, 2));
    console.log('GEOM transitions', JSON.stringify(transitions));
    console.log('GEOM counts', JSON.stringify(rows.map((r) => ({ t: r.t, n: r.nCrest }))));
    expect(rows.length).toBeGreaterThan(0);
  }, 300_000);
});
