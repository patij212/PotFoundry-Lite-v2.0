// _breadthDiag2.test.ts — DEV-ONLY (PF_BREADTH_DIAG2=1). The BambooSegments worst facet at 2880x1600 was at
// t=0.9998 (the TOP RIM row) — a boundary-truncation artifact (a node bulge peaks at the rim, and the outer wall's
// last row straddles it; in the closed pot the rim joins the inner wall so this is NOT a surface defect). Re-measure
// the INTERIOR worst (t∈[0.02,0.98]) + density response to isolate the genuine node-ring crest residual.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, perFaceTrue3DSag, bruteNearestOnRadialSurface } from './labkit';
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

describe('BREADTH-DIAG2', () => {
  it.skipIf(process.env.PF_BREADTH_DIAG2 !== '1')('BambooSegments INTERIOR (rim-excluded) worst + density response', () => {
    const rA = buildRadiusFn('BambooSegments' as StyleId, {}, DIMS);
    const sweep: any[] = [];
    for (const [nTh, nZ] of [[1440, 800], [1440, 1600], [1440, 3200]] as const) {
      const mesh = buildSheet(rA, nTh, nZ);
      const sag = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, DIMS.H, { preFilterMm: 0.005 });
      // INTERIOR mask: exclude facets touching t<0.02 or t>0.98 (boundary rows)
      const interior: number[] = [];
      for (let f = 0; f < mesh.nF; f++) {
        const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
        const tmin = Math.min(mesh.ut[2 * a + 1], mesh.ut[2 * b + 1], mesh.ut[2 * c + 1]);
        const tmax = Math.max(mesh.ut[2 * a + 1], mesh.ut[2 * b + 1], mesh.ut[2 * c + 1]);
        if (tmin < 0.02 || tmax > 0.98) continue;
        interior.push(f);
      }
      const errs = interior.map(f => sag.faceErr[f]).sort((x, y) => x - y);
      const p99 = errs[Math.floor(0.99 * errs.length)];
      let over01 = 0; for (const f of interior) if (sag.faceErr[f] > 0.01) over01++;
      // brute-trusted worst interior: top-30 interior facets, anchor at centroid (fine grid)
      const order = [...interior].sort((x, y) => sag.faceErr[y] - sag.faceErr[x]).slice(0, 30);
      let trustedMax = 0; let worstLoc = { t: 0, th: 0, trusted: 0, gn: 0 };
      for (const f of order) {
        const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
        const cx = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, cy = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, cz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
        const tr = Math.min(sag.faceErr[f], bruteNearestOnRadialSurface(cx, cy, cz, rA, DIMS.H, { nTheta: 12288, nZ: 2400 }).dist);
        if (tr > trustedMax) { trustedMax = tr; const t = (mesh.ut[2 * a + 1] + mesh.ut[2 * b + 1] + mesh.ut[2 * c + 1]) / 3, u = (mesh.ut[2 * a] + mesh.ut[2 * b] + mesh.ut[2 * c]) / 3; worstLoc = { t, th: u * TAU, trusted: tr, gn: sag.faceErr[f] }; }
      }
      sweep.push({ nTh, nZ, tris: mesh.nF, interiorFaces: interior.length, interiorP99: p99, interiorOver01: over01, interiorPctOver01: 100 * over01 / interior.length, interiorTrustedMax: trustedMax, worstLoc });
      // eslint-disable-next-line no-console
      console.log(`[diag2 BS] ${nTh}x${nZ} tris=${mesh.nF} interiorP99=${p99.toFixed(4)} over01=${over01}(${(100 * over01 / interior.length).toFixed(3)}%) trustedMax=${trustedMax.toFixed(4)} worst@t=${worstLoc.t.toFixed(3)}(z=${(worstLoc.t * DIMS.H).toFixed(1)}) th=${worstLoc.th.toFixed(3)} | node bnds t=0.2,0.4,0.6,0.8`);
    }
    save('diag2_BambooSegments_interior', { note: 'rim-excluded (t in [0.02,0.98]); node ring boundaries at t=k/5', sweep });
  }, 1_500_000);
});
