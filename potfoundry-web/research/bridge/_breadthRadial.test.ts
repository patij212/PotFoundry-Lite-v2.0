// _breadthRadial.test.ts — DEV-ONLY (PF_BREADTH_RADIAL=1). The BSnode probe showed the anchored PERP over-reads on
// azimuthal relief (BS node boundary: perp/brute 0.54mm but RADIAL 0.025mm, vertices exactly on surface). For a
// structured mesh whose vertices lie EXACTLY on r(θ,z) by construction, the FAITHFUL per-facet fidelity is the
// facet's deviation from ITS OWN (u,t) region — the RADIAL chord sag (perFaceChordSag) — NOT the global-nearest
// perpendicular (which can land on a different feature/azimuth and spuriously read large). This re-measures the 3
// smooth/crease styles by RADIAL chord at their high-density configs = the honest "reaches ≤0.01mm?" number, and
// reports the fraction over 0.01 + worst/p99 (interior, rim-excluded). We report perp AND radial so both are on record.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, perFaceChordSag } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_radial');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe('BREADTH-RADIAL', () => {
  it.skipIf(process.env.PF_BREADTH_RADIAL !== '1')('faithful RADIAL chord (facet-own-region) for the 3 smooth/crease styles', () => {
    const cfgs: Array<[StyleId, number, number]> = [
      ['BambooSegments' as StyleId, 2160, 700],
      ['GeometricStar' as StyleId, 3600, 1100],
      ['LowPolyFacet' as StyleId, 2160, 700],
    ];
    const out: Record<string, unknown> = {};
    for (const [style, nTh, nZ] of cfgs) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const rows: RowSpec[] = [];
      for (let j = 0; j <= nZ; j++) { const z = DIMS.H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
      const mesh = buildStructuredWall(rA, DIMS.H, rows);
      const rad = perFaceChordSag(mesh.ut, mesh.idx, rA, DIMS.H);
      // interior mask (rim-excluded)
      const interior: number[] = [];
      for (let f = 0; f < mesh.nF; f++) {
        const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
        const tmin = Math.min(mesh.ut[2 * a + 1], mesh.ut[2 * b + 1], mesh.ut[2 * c + 1]);
        const tmax = Math.max(mesh.ut[2 * a + 1], mesh.ut[2 * b + 1], mesh.ut[2 * c + 1]);
        if (tmin < 0.02 || tmax > 0.98) continue; interior.push(f);
      }
      const eAll = Float64Array.from(rad.faceErr).sort();
      const eInt = interior.map(f => rad.faceErr[f]).sort((x, y) => x - y);
      let over01all = 0; for (let f = 0; f < mesh.nF; f++) if (rad.faceErr[f] > 0.01) over01all++;
      let over01int = 0; for (const f of interior) if (rad.faceErr[f] > 0.01) over01int++;
      const rec = {
        style, nTh, nZ, tris: mesh.nF,
        radial_worst_all: rad.worstMm, radial_p99_all: eAll[Math.floor(0.99 * eAll.length)], radial_over01_all: over01all, radial_pctOver01_all: 100 * over01all / mesh.nF,
        radial_worst_int: eInt[eInt.length - 1], radial_p99_int: eInt[Math.floor(0.99 * eInt.length)], radial_over01_int: over01int, radial_pctOver01_int: 100 * over01int / interior.length,
      };
      out[style] = rec;
      // eslint-disable-next-line no-console
      console.log(`[radial ${style}] tris=${mesh.nF} | ALL worst=${rad.worstMm.toFixed(4)} p99=${rec.radial_p99_all.toFixed(4)} over01=${over01all}(${rec.radial_pctOver01_all.toFixed(3)}%) | INTERIOR worst=${rec.radial_worst_int.toFixed(4)} p99=${rec.radial_p99_int.toFixed(4)} over01=${over01int}(${rec.radial_pctOver01_int.toFixed(3)}%)`);
    }
    save('radial', out);
  }, 1_500_000);
});
