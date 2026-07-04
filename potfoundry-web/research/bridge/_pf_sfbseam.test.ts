// _pf_sfbseam.test.ts — DEV-ONLY (PF_SFBSEAM=1). E-2026-07-04-SFB-SEAM-DIAG + doubled-edge builder.
// SuperformulaBlossom's lone residual = the NON-2π θ-seam: m = 6 + 4·t^1.2 (non-integer petal count) ⇒ rA(0,z) ≠
// rA(2π⁻,z) ⇒ a genuine radius DISCONTINUITY (a vertical cliff wall) at θ=0. Body is CAD-grade (own-region 0.0033),
// CDT-reroute already made rawNonMan 0. Prior finish attempts (in _ct_sfbwater scorecard):
//   FIXB-cdt (constraint): rawNonMan 0, true-3D 0.057, but seamSerration 9.5 (constraint recovery 73/200 — lossy).
//   A2-wrap:               rawNonMan 0, seamSerration 0, but true-3D 1.9 (single bridging facet across the cliff).
//   FIXA-ladder:           rawNonMan 0, but true-3D 4.5 AND serration 9.2 (rung labels lift wrong).
//
// D) DIAGNOSTIC: quantify the seam step |rA(0,z)−rA(2π⁻,z)| across z, and answer the LOAD-BEARING question:
//    does the TRUE-3D ruler (bruteNearestOnRadialSurface, full-azimuth) SEE the seam wall? A point on the vertical
//    seam wall at θ=0, radius r_mid ∈ (r0,r1) has NO parametric-surface neighbour except r0 (θ=0⁺) / r1 (θ=2π⁻) on
//    its own ray ⇒ nearest-surface dist = min(|r_mid−r0|,|r_mid−r1|) up to seamStep/2. If so, ANY correctly-meshed
//    seam wall reads "far" against the parametric surface ⇒ the ruler is BLIND to the seam wall (a real object
//    feature), and true-3D ≤0.01 on the seam is UNACHIEVABLE-BY-CONSTRUCTION unless the ruler includes the wall.
//
// The kill-criterion + verdict live in the return; this probe just produces the numbers, checkpointed to ndjson.
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, bruteNearestOnRadialSurface } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SFBSEAM === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_sfbseam');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H, TAU = 2 * Math.PI;
const STYLE = 'SuperformulaBlossom' as StyleId;

describe('E-SFB-SEAM — diagnose the non-2π seam wall + ruler blind-spot', () => {
  it.skipIf(!RUN)('D: seam step across z + ruler visibility of the seam wall', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const LEDGER = join(DIR, 'diag.ndjson');

    // 1) seam step |rA(0,z) − rA(2π⁻,z)| across z, and the seam-wall geometry.
    let maxStep = 0, sumStep = 0, nz = 0;
    const rows: Array<Record<string, number>> = [];
    for (let j = 0; j <= 40; j++) {
      const z = (j / 40) * H;
      const r0 = rA(1e-9, z);
      const r1 = rA((1 - 1e-9) * TAU, z);
      const step = Math.abs(r0 - r1);
      if (step > maxStep) maxStep = step;
      sumStep += step; nz++;
      if (j % 5 === 0) rows.push({ z: +z.toFixed(1), r0: +r0.toFixed(4), r1: +r1.toFixed(4), step: +step.toFixed(4) });
    }
    const meanStep = sumStep / nz;

    // 2) RULER VISIBILITY: place a point on the MIDDLE of the seam wall (θ=0, radius = (r0+r1)/2) at the z of the
    //    worst step, and measure its true-3D nearest-surface distance. If it reads ≈ step/2, the ruler is BLIND
    //    to the seam wall (the wall is a real object feature the parametric-surface ruler cannot see).
    let worstZ = 0, worstStep = 0;
    for (let j = 0; j <= 200; j++) { const z = (j / 200) * H; const s = Math.abs(rA(1e-9, z) - rA((1 - 1e-9) * TAU, z)); if (s > worstStep) { worstStep = s; worstZ = z; } }
    const r0w = rA(1e-9, worstZ), r1w = rA((1 - 1e-9) * TAU, worstZ);
    const rMid = 0.5 * (r0w + r1w);
    // point on the seam wall (θ=0 ray, mid radius)
    const P = { x: rMid * Math.cos(0), y: rMid * Math.sin(0), z: worstZ };
    const near = bruteNearestOnRadialSurface(P.x, P.y, P.z, rA, H, { nTheta: 8192, nZ: 800 });
    // also a point at 1/4 up the wall
    const rQ = r1w + 0.25 * (r0w - r1w);
    const PQ = { x: rQ, y: 0, z: worstZ };
    const nearQ = bruteNearestOnRadialSurface(PQ.x, PQ.y, PQ.z, rA, H, { nTheta: 8192, nZ: 800 });

    const row = {
      label: 'DIAG', maxStep: +maxStep.toFixed(4), meanStep: +meanStep.toFixed(4),
      worstZ: +worstZ.toFixed(2), worstStep: +worstStep.toFixed(4),
      r0w: +r0w.toFixed(4), r1w: +r1w.toFixed(4), rMid: +rMid.toFixed(4),
      wallMidNearDist: +near.dist.toFixed(4), wallMidExpectHalf: +(worstStep / 2).toFixed(4),
      wallQtrNearDist: +nearQ.dist.toFixed(4), wallQtrExpect: +Math.min(Math.abs(rQ - r0w), Math.abs(rQ - r1w)).toFixed(4),
      sampleRows: rows,
    };
    appendFileSync(LEDGER, JSON.stringify(row) + '\n');
    // eslint-disable-next-line no-console
    console.log(`DIAG seamStep max=${row.maxStep} mean=${row.meanStep} worstZ=${row.worstZ} | wall-mid trueDist=${row.wallMidNearDist} (expect step/2=${row.wallMidExpectHalf}) | wall-qtr trueDist=${row.wallQtrNearDist} (expect ${row.wallQtrExpect})`);
    for (const r of rows) console.log('  ', JSON.stringify(r));
    expect(maxStep).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
