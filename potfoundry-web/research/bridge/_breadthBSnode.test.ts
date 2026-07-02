// _breadthBSnode.test.ts — DEV-ONLY (PF_BREADTH_BSNODE=1). Is the BambooSegments node-ring ~0.5mm density-INVARIANT
// residual a REAL chord defect, or a perpendicular-metric wrong-wall artifact at a near-vertical node bulge?
// Discriminator: at the worst node-boundary facet, compare (a) perpendicular brute-nearest dist, (b) the facet's
// chord sag measured RADIALLY (same-(u,t) plane dist — the facet's own-region deviation), and (c) verify the mesh
// vertices are ON the surface (by construction). If (b)≈0 while (a)=0.5, the surface IS faithful and the perp metric
// is landing on an adjacent node wall (near-vertical). Also report the node-bulge dr/dz slope there.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, perFaceChordSag, perFaceTrue3DSag, bruteNearestOnRadialSurface } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_diag');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe('BREADTH-BSNODE', () => {
  it.skipIf(process.env.PF_BREADTH_BSNODE !== '1')('BambooSegments node-ring: real chord defect or perp wrong-wall?', () => {
    const rA = buildRadiusFn('BambooSegments' as StyleId, {}, DIMS);
    const nTh = 1440, nZ = 3200;
    const rows: RowSpec[] = [];
    for (let j = 0; j <= nZ; j++) { const z = DIMS.H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
    const mesh = buildStructuredWall(rA, DIMS.H, rows);
    const perp = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, DIMS.H, { preFilterMm: 0.005 });
    const radial = perFaceChordSag(mesh.ut, mesh.idx, rA, DIMS.H);
    // interior facets, find worst by perp
    const order: number[] = [];
    for (let f = 0; f < mesh.nF; f++) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const tmin = Math.min(mesh.ut[2 * a + 1], mesh.ut[2 * b + 1], mesh.ut[2 * c + 1]);
      const tmax = Math.max(mesh.ut[2 * a + 1], mesh.ut[2 * b + 1], mesh.ut[2 * c + 1]);
      if (tmin < 0.02 || tmax > 0.98) continue; order.push(f);
    }
    order.sort((x, y) => perp.faceErr[y] - perp.faceErr[x]);
    const worst = order.slice(0, 10).map(f => {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const t = (mesh.ut[2 * a + 1] + mesh.ut[2 * b + 1] + mesh.ut[2 * c + 1]) / 3, u = (mesh.ut[2 * a] + mesh.ut[2 * b] + mesh.ut[2 * c]) / 3;
      const z = t * DIMS.H, th = u * TAU;
      const cx = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, cy = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, cz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
      const brute = bruteNearestOnRadialSurface(cx, cy, cz, rA, DIMS.H, { nTheta: 12288, nZ: 4800 });
      // slope dr/dz at (th,z)
      const dz = 0.01; const drdz = (rA(th, z + dz) - rA(th, z - dz)) / (2 * dz);
      // vertex on-surface check: each vertex's r vs rA
      const vErr = Math.max(
        Math.abs(Math.hypot(mesh.xyz[3 * a], mesh.xyz[3 * a + 1]) - rA(TAU * mesh.ut[2 * a], mesh.ut[2 * a + 1] * DIMS.H)),
        Math.abs(Math.hypot(mesh.xyz[3 * b], mesh.xyz[3 * b + 1]) - rA(TAU * mesh.ut[2 * b], mesh.ut[2 * b + 1] * DIMS.H)),
      );
      return { perp: perp.faceErr[f], radial: radial.faceErr[f], bruteDist: brute.dist, bruteFootZ: brute.z, dzCentroidToFoot: Math.abs(brute.z - cz), t, z, th, drdz, vErr };
    });
    save('bsnode', { note: 'perp=facet→surface perpendicular; radial=same-(u,t) chord (facet own-region); if radial<<perp the surface is faithful and perp lands on adjacent node wall', nZ, worst });
    for (const w of worst.slice(0, 6)) {
      // eslint-disable-next-line no-console
      console.log(`[bsnode] perp=${w.perp.toFixed(4)} radial=${w.radial.toFixed(4)} brute=${w.bruteDist.toFixed(4)} footΔz=${w.dzCentroidToFoot.toFixed(3)} t=${w.t.toFixed(3)}(z=${w.z.toFixed(1)}) dr/dz=${w.drdz.toFixed(2)} vErr=${w.vErr.toExponential(1)}`);
    }
  }, 900_000);
});
