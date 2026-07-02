// _breadthLPradial.test.ts — DEV-ONLY (PF_BREADTH_LPRAD=1). One-shot LowPolyFacet RADIAL (faithful) heatmap into a
// FRESH race-safe dir (_breadth/_lprad/) — the main heatmap run's LP anchored dump is slow and the LP radial is
// queued behind it; this gets the faithful LP visual (green flat faces + red edge ridges) independently.
import { describe, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, perFaceChordSag, vertErrColors, dumpRenderBins } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_lprad');

describe('BREADTH-LP-RADIAL', () => {
  it.skipIf(process.env.PF_BREADTH_LPRAD !== '1')('LowPolyFacet faithful radial heatmap (fresh dir)', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn('LowPolyFacet' as StyleId, {}, DIMS);
    const nTh = 2160, nZ = 700;
    const rows: RowSpec[] = [];
    for (let j = 0; j <= nZ; j++) { const z = DIMS.H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
    const mesh = buildStructuredWall(rA, DIMS.H, rows);
    const rad = perFaceChordSag(mesh.ut, mesh.idx, rA, DIMS.H);
    const sorted = Float64Array.from(rad.faceErr).sort();
    const p99 = sorted[Math.floor(0.99 * sorted.length)];
    dumpRenderBins(DIR, 'LowPolyFacet_radialheat', mesh.xyz, mesh.idx, {
      colors: vertErrColors(rad.vertErr, 0.01),
      meta: { ruler: 'radial (facet-own-region, FAITHFUL)', label: 'LowPolyFacet — RADIAL chord vs own (u,t) (scale 0.01mm); faces flat-perfect, red=convex polygon edges', worstMm: rad.worstMm, p99Mm: p99, pctOver0_01: 100 * rad.fracOver(0.01), scaleMm: 0.01 },
    });
    // eslint-disable-next-line no-console
    console.log(`[lprad] tris=${mesh.nF} radialWorst=${rad.worstMm.toFixed(4)} p99=${p99.toFixed(4)} pctOver01=${(100 * rad.fracOver(0.01)).toFixed(3)}%`);
  }, 600_000);
});
