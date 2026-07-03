// _weaveHonest.test.ts — DEV-ONLY. HONEST true-3D perpendicular measurement of the doubled-grid weave mesh using
// bruteAnchoredRedPerp (the trusted steep-lattice ruler; centroid-anchored min(GN,brute,fine)). The radial/GN
// screen OVERSTATES near-vertical cliff facets up to 7x (LAB-CHEATSHEET). If the cliff facets genuinely lie ON the
// near-vertical surface, their TRUE perpendicular error is tiny even when the radial ruler is red. This decides
// whether the doubled-grid mesh is ACTUALLY faithful (chord-wise) and isolates the remaining problem to QUALITY.
// Env PF_WEAVE=1.

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, bruteAnchoredRedPerp, triangleQualityDistribution } from './labkit';
import { buildWeaveDoubledGrid, buildWeaveCreaseMesh, basketWeaveGrid } from './_weaveLib';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe.skipIf(!RUN)('WEAVE honest perp — brute-anchored true-3D on cliffs', () => {
  it('measure honest perpendicular error of doubled-grid vs crease-conforming', () => {
    const H = DIMS.H;
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const grid = basketWeaveGrid(DEFAULT_BASKET_WEAVE.bwStrands, DEFAULT_BASKET_WEAVE.bwLayers, DEFAULT_BASKET_WEAVE.bwPhase);
    const which = process.env.PF_WEAVE_WHICH ?? 'dg';
    const hRowMm = Number(process.env.PF_WEAVE_HROW ?? '0.3');
    const cliffChordMm = Number(process.env.PF_WEAVE_CLIFF ?? '0.05');
    let mesh, tag: string;
    if (which === 'dg') { const b = buildWeaveDoubledGrid(rA, H, grid, { hRowMm, wTargetMm: hRowMm, cliffChordMm, seamMode: 'cliff' }); mesh = b.mesh; tag = `dg_h${String(hRowMm).replace('.', 'p')}_c${String(cliffChordMm).replace('.', 'p')}`; }
    else { const b = buildWeaveCreaseMesh(rA, H, grid, { hRowMm, seamMode: 'cliff' }); mesh = b.mesh; tag = `crease_h${hRowMm}`; }
    const idx = mesh.idx; const ut = mesh.ut;
    // radial screen
    const own = perFaceChordSag(ut, idx, rA, H);
    // honest brute-anchored perpendicular on the red facets (redMm 0.05 so we catch the cliff facets). Cheaper
    // coarse/fine grids than the default so the read is minutes not tens-of-minutes (still resolves the ~2mm step).
    const anch = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.05, sampleN: 120, overMm: 0.05, disagreeMm: 0.01, radial: own, coarse: { nTheta: 1024, nZ: 300 }, fine: { nTheta: 3072, nZ: 900 } });
    const tq = triangleQualityDistribution({ vertices: Float64Array.from(mesh.xyz), indices: idx });
    const rec = {
      which, tag, tris: mesh.nF, hRowMm, cliffChordMm,
      radialWorst: +own.worstMm.toFixed(4),
      honest: { nRed: anch.nRed, nSample: anch.nSample, gnP99: +anch.gnP99.toFixed(4), trustedP99: +anch.trustedP99.toFixed(4), trustedMax: +anch.trustedMax.toFixed(4), gnOver: anch.gnOver, bruteOver: anch.bruteOver },
      quality: { minAngle: tq.minAngleDeg, p5: tq.p5MinAngleDeg, median: tq.medianMinAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    ck(`honest_${tag}`, rec);
    console.log(`HONEST[${which}]: radialWorst=${own.worstMm.toFixed(3)} | nRed=${anch.nRed} gnP99=${anch.gnP99.toFixed(3)} trustedP99=${anch.trustedP99.toFixed(4)} trustedMax=${anch.trustedMax.toFixed(4)} | %<20=${tq.pctBelow20.toFixed(1)} minA=${tq.minAngleDeg.toFixed(1)}`);
  }, 3_600_000);
});
