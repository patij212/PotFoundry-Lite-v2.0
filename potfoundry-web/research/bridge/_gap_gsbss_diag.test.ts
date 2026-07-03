// _gap_gsbss_diag.test.ts — DEV-ONLY (PF_GAP_DIAG=1). Localize the density-INVARIANT true-3D tail on
// BambooSegments (and optionally GeometricStar): where are the worst GN facets? seam? node-ring flank? What is the
// facet's local radial span vs the analytic radius there? This decides steep-EXCLUDE (genuine near-vertical cliff)
// vs under-tessellated smooth ridge. NEW file; reuses _sharp3dMesh + labkit READ-ONLY.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, perFaceTrue3DSag, bruteNearestOnRadialSurface } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join(process.cwd(), 'research', 'exchange', '_gap_gsbss');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'diag.log'), `${m}\n`); /* eslint-disable-next-line no-console */ console.log(m); };

function diag(style: string, nTh: number, nZ: number): void {
  const rA = buildRadiusFn(style as StyleId, {}, DIMS);
  const rows: RowSpec[] = [];
  for (let j = 0; j <= nZ; j++) { const z = (H * j) / nZ; rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
  const mesh = buildStructuredWall(rA, H, rows);
  const gn = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, H, { preFilterMm: 0.004 });
  const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((a, b) => gn.faceErr[b] - gn.faceErr[a]).slice(0, 25);
  plog(`\n=== ${style} nTh=${nTh} nZ=${nZ} tris=${mesh.nF} worst-25 GN facets ===`);
  const lift = (i: number): [number, number, number] => { const th = TAU * mesh.ut[2 * i], z = mesh.ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  for (const f of order) {
    const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
    const ua = mesh.ut[2 * a], ub = mesh.ut[2 * b], uc = mesh.ut[2 * c];
    const ta = mesh.ut[2 * a + 1] * H, tb = mesh.ut[2 * b + 1] * H, tc = mesh.ut[2 * c + 1] * H;
    const [ax, ay, az] = lift(a), [bx, by, bz] = lift(b), [cx2, cy2, cz2] = lift(c);
    const px = (ax + bx + cx2) / 3, py = (ay + by + cy2) / 3, pz = (az + bz + cz2) / 3;
    const bd = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 4096, nZ: 1000 });
    // radial span of the 3 verts (how much r varies across the facet)
    const ra = Math.hypot(ax, ay), rb = Math.hypot(bx, by), rc = Math.hypot(cx2, cy2);
    const rSpan = Math.max(ra, rb, rc) - Math.min(ra, rb, rc);
    const uMin = Math.min(ua, ub, uc), uMax = Math.max(ua, ub, uc);
    const seam = (uMax - uMin) > 0.5 ? 'SEAM' : '   ';
    // local dr/dz at the centroid (analytic slope) — steepness of the surface here
    const thC = Math.atan2(py, px), zC = pz;
    const drdz = (rA(thC, Math.min(H, zC + 0.5)) - rA(thC, Math.max(0, zC - 0.5))) / 1.0;
    plog(`  f=${f} gnErr=${gn.faceErr[f].toFixed(4)} bruteFloor=${bd.dist.toFixed(4)} z=[${ta.toFixed(2)},${tb.toFixed(2)},${tc.toFixed(2)}] u=[${uMin.toFixed(3)},${uMax.toFixed(3)}] ${seam} rSpan=${rSpan.toFixed(4)} dr/dz=${drdz.toFixed(3)}`);
  }
}

describe('GAP-GSBSS-DIAG', () => {
  it.skipIf(process.env.PF_GAP_DIAG !== '1')('localize BambooSegments density-invariant tail', () => {
    diag('BambooSegments', 900, 900);
    diag('BambooSegments', 1400, 1600);
    expect(true).toBe(true);
  }, 600000);
  it.skipIf(process.env.PF_GAP_DIAG_GS !== '1')('localize GeometricStar tail (C0 crease vs C1)', () => {
    diag('GeometricStar', 1600, 680);
    diag('GeometricStar', 2600, 1100);
    expect(true).toBe(true);
  }, 900000);
});
