// _breadthDiag.test.ts — DEV-ONLY (PF_BREADTH_DIAG=1). Diagnose the BambooSegments 0.177mm anchored-worst surprise:
// WHERE are the worst facets (which feature: node ring? striation? base?), and is the error DENSITY-RESPONSIVE
// (under-tessellation, closes with density) or FLAT (a real fine feature the uniform z-grid steps over)?
// Also confirm GeometricStar's worst-red anchored floor is a resolvable crease-chord (density-responsive).
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, perFaceTrue3DSag, bruteAnchoredRedPerp, bruteNearestOnRadialSurface } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_diag');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

function buildSheet(rA: (th: number, z: number) => number, nTh: number, nZ: number): BuiltMesh {
  const rows: RowSpec[] = [];
  for (let j = 0; j <= nZ; j++) { const z = DIMS.H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
  return buildStructuredWall(rA, DIMS.H, rows);
}

describe('BREADTH-DIAG', () => {
  it.skipIf(process.env.PF_BREADTH_DIAG !== '1')('locate + density-response of BambooSegments & GeometricStar worst facets', () => {
    for (const style of ['BambooSegments', 'GeometricStar'] as StyleId[]) {
      const rA = buildRadiusFn(style, {}, DIMS);
      // density sweep: vary z (the suspect axis) and theta. Report GN worst/p99/over01 + trusted worst-red.
      const sweep: any[] = [];
      const cfgs: Array<[number, number]> = [[1440, 400], [1440, 800], [1440, 1600], [2880, 800], [2880, 1600]];
      for (const [nTh, nZ] of cfgs) {
        const mesh = buildSheet(rA, nTh, nZ);
        const sag = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, DIMS.H, { preFilterMm: 0.005 });
        const sorted = Float64Array.from(sag.faceErr).sort();
        const p99 = sorted[Math.floor(0.99 * sorted.length)];
        let over01 = 0; for (let f = 0; f < mesh.nF; f++) if (sag.faceErr[f] > 0.01) over01++;
        const anch = bruteAnchoredRedPerp(mesh.ut, mesh.idx, rA, DIMS.H, { redMm: 0.05, sampleN: 40, coarse: { nTheta: 4096, nZ: 800 }, fine: { nTheta: 12288, nZ: 2400 } });
        sweep.push({ nTh, nZ, tris: mesh.nF, gnWorst: sag.worstMm, gnP99: p99, over01, pctOver01: 100 * over01 / mesh.nF, trustedP99: anch.trustedP99, trustedMax: anch.trustedMax, nRed: anch.nRed });
        // eslint-disable-next-line no-console
        console.log(`[diag ${style}] ${nTh}x${nZ} tris=${mesh.nF} gnWorst=${sag.worstMm.toFixed(4)} gnP99=${p99.toFixed(4)} over01=${over01}(${(100 * over01 / mesh.nF).toFixed(3)}%) trustedP99=${anch.trustedP99.toFixed(4)} trustedMax=${anch.trustedMax.toFixed(4)} nRed=${anch.nRed}`);
      }
      // LOCATE worst 20 facets at the densest cfg + report their (t, θ) and the local relief amplitude.
      const mesh = buildSheet(rA, 2880, 1600);
      const sag = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, DIMS.H, { preFilterMm: 0.005 });
      const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => sag.faceErr[y] - sag.faceErr[x]).slice(0, 20);
      const worst = order.map(f => {
        const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
        const t = (mesh.ut[2 * a + 1] + mesh.ut[2 * b + 1] + mesh.ut[2 * c + 1]) / 3;
        const u = (mesh.ut[2 * a] + mesh.ut[2 * b] + mesh.ut[2 * c]) / 3;
        // trusted at centroid
        const cx = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, cy = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, cz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
        const trusted = bruteNearestOnRadialSurface(cx, cy, cz, rA, DIMS.H, { nTheta: 12288, nZ: 2400 }).dist;
        return { gn: sag.faceErr[f], trusted, t, z: t * DIMS.H, u, th: u * TAU };
      });
      save(`diag_${style}`, { sweep, worst });
      // eslint-disable-next-line no-console
      console.log(`[diag ${style}] worst facet: gn=${worst[0].gn.toFixed(4)} trusted=${worst[0].trusted.toFixed(4)} t=${worst[0].t.toFixed(4)}(z=${worst[0].z.toFixed(2)}) th=${worst[0].th.toFixed(3)}`);
    }
  }, 1_500_000);
});
