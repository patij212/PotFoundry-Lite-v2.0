// _ct_sfbwaterDiag.test.ts — DEV-ONLY (PF_CT_SFBWATER=1). Localize the 35mm red facets of Fix A's seam ladder:
// are they (a) genuine near-vertical cliff cells (radial step ≤6mm, true-3D small), (b) a monotone-merge bridge
// (a facet spanning a large azimuth/radius), or (c) the last-body↔first-body flank chain crossing θ=0?
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag } from './labkit';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { findBirths } from './_scaleColDriver';
import { msquareRows, rasterizeColumnsSquare } from './_qcolMsquare';
import { buildSeamLadderWatertight } from './_ct_sfbwaterLib';
import type { StyleId } from '../../src/geometry/types';
const RUN = process.env.PF_CT_SFBWATER === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_ct_sfbwater');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 }; const H = 120, TAU = 2 * Math.PI;
describe('SFB-WATER Fix A red-facet localizer', () => {
  it.skipIf(!RUN)('classify worst red seam facets', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn('SuperformulaBlossom' as StyleId, {}, DIMS);
    const h = 0.5; // coarse
    const births = findBirths(rA, H, 4096);
    const ts = msquareRows(rA, H, h, births, { seamBand: 0.02, speedBlend: 0.5, hRowCapMm: h * 6 });
    const g = buildRidgeGraphDeflicker(rA, H, ts, 4096, { persistFrac: 0.06 });
    const rows = rasterizeColumnsSquare(g, rA, H, 0.03, 2, 0.03, 0.6);
    const m = buildSeamLadderWatertight(rA, H, rows);
    const ut = m.ut, idx = m.idx, xyz = m.xyz;
    const radial = perFaceChordSag(ut, Array.from(idx), rA, H);
    const nF = idx.length / 3; const red: number[] = [];
    for (let f = 0; f < nF; f++) if (radial.faceErr[f] > 0.1) red.push(f);
    red.sort((a, b) => radial.faceErr[b] - radial.faceErr[a]);
    let bigAz = 0, bigRad = 0, cliff = 0; const samples: string[] = [];
    for (const f of red.slice(0, 200)) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const P = [a, b, c].map((v) => [xyz[3 * v], xyz[3 * v + 1], xyz[3 * v + 2]] as [number, number, number]);
      const us = [a, b, c].map((v) => ((ut[2 * v] % 1) + 1) % 1);
      const maxEdge = Math.max(
        Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1], P[0][2] - P[1][2]),
        Math.hypot(P[1][0] - P[2][0], P[1][1] - P[2][1], P[1][2] - P[2][2]),
        Math.hypot(P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]),
      );
      // azimuth span (accounting for wrap near θ=0): use atan2
      const az = P.map((p) => Math.atan2(p[1], p[0]));
      let azSpan = Math.max(...az) - Math.min(...az); if (azSpan > Math.PI) azSpan = TAU - azSpan;
      const rad = P.map((p) => Math.hypot(p[0], p[1])); const radSpan = Math.max(...rad) - Math.min(...rad);
      if (azSpan > 0.1) bigAz++; else if (radSpan > 10) bigRad++; else cliff++;
      if (samples.length < 12) samples.push(`f=${f} err=${radial.faceErr[f].toFixed(2)} maxEdge=${maxEdge.toFixed(1)} azSpan=${(azSpan * 180 / Math.PI).toFixed(1)}deg radSpan=${radSpan.toFixed(2)} u=[${us.map((x) => x.toFixed(3)).join(',')}]`);
    }
    const row = { probe: 'redLoc', hRow: h, nRedTotal: red.length, worst200_bigAz: bigAz, worst200_bigRad: bigRad, worst200_cliff: cliff, samples };
    appendFileSync(join(DIR, 'redloc.ndjson'), JSON.stringify(row) + '\n');
    console.log(`RED LOC: total=${red.length} | of worst-200: bigAz(>0.1rad)=${bigAz} bigRad(>10mm)=${bigRad} cliff=${cliff}`);
    for (const s of samples) console.log('  ' + s);
    expect(nF).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
