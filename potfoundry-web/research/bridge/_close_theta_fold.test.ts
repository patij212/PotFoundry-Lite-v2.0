// _close_theta_fold.test.ts — DEV-ONLY (PF_CT_FOLD=1). Decisive: are the SFB ridge-graph "36mm true-3D" red
// facets FOLD-BRIDGING triangles (a real mesh defect: a flat facet cutting 36mm through a petal fold, whose
// same-(u,t) radial reads ~0 because each vertex is on-surface) or a metric artifact? Print the worst red facets'
// vertex (u,t)+xyz + edge-length + u/t-span so we can SEE the bridge. Cheap: one mesh build, no full brute.
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag } from './labkit';
import { analyticBruteDist } from './_sfbPushLib';
import { buildScaleColMesh } from './_scaleColDriver';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_CT_FOLD === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_close_theta');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H, TAU = 2 * Math.PI;

describe('CLOSE-THETA fold localizer (SFB)', () => {
  it.skipIf(!RUN)('SFB worst red facets', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn('SuperformulaBlossom' as StyleId, {}, DIMS);
    const build = buildScaleColMesh(rA, H, { hRowMm: 0.5 });
    const m = build.mesh; const ut = m.ut; const idx = m.idx;
    const xyz = m.xyz instanceof Float64Array ? m.xyz : Float64Array.from(m.xyz);
    const radial = perFaceChordSag(ut, idx, rA, H);
    const nF = idx.length / 3;
    const red: number[] = [];
    for (let f = 0; f < nF; f++) if (radial.faceErr[f] > 0.1) red.push(f);
    red.sort((x, y) => radial.faceErr[y] - radial.faceErr[x]);
    const lift = (i: number): [number, number, number] => { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    // classify the worst 60: is the true-3D own-region big? and is it a long/spanning facet (fold bridge)?
    let bridge = 0, tiny = 0; const samples: string[] = [];
    for (const f of red.slice(0, 60)) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const P = [lift(a), lift(b), lift(c)];
      const cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3, cz = (P[0][2] + P[1][2] + P[2][2]) / 3;
      const own = analyticBruteDist(cx, cy, cz, rA, H, { nTheta: 4096, zWinMm: 2.0, nZ: 9 });
      const maxEdge = Math.max(
        Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1], P[0][2] - P[1][2]),
        Math.hypot(P[1][0] - P[2][0], P[1][1] - P[2][1], P[1][2] - P[2][2]),
        Math.hypot(P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]),
      );
      const us = [ut[2 * a], ut[2 * b], ut[2 * c]].map((u) => ((u % 1) + 1) % 1);
      const uSpanRaw = Math.max(...us) - Math.min(...us);
      const uSpan = Math.min(uSpanRaw, 1 - uSpanRaw);
      const tSpan = Math.max(ut[2 * a + 1], ut[2 * b + 1], ut[2 * c + 1]) - Math.min(ut[2 * a + 1], ut[2 * b + 1], ut[2 * c + 1]);
      if (own > 1.0 && maxEdge > 5) bridge++; else if (own < 0.1) tiny++;
      if (samples.length < 8) samples.push(`f=${f} own=${own.toFixed(2)}mm radial=${radial.faceErr[f].toFixed(3)} maxEdge=${maxEdge.toFixed(1)}mm uSpan=${uSpan.toFixed(3)} tSpan=${tSpan.toFixed(3)} u=[${us.map((x) => x.toFixed(3)).join(',')}]`);
    }
    const row = { style: 'SuperformulaBlossom', hRow: 0.5, worst60_bridge: bridge, worst60_tiny: tiny, samples };
    appendFileSync(join(DIR, 'fold.ndjson'), JSON.stringify(row) + '\n');
    console.log(`SFB FOLD: of worst-60 red facets, ${bridge} are FOLD-BRIDGES (own>1mm & maxEdge>5mm), ${tiny} tiny.`);
    for (const s of samples) console.log('  ' + s);
    expect(nF).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
