// _cu_dslip_diag.test.ts — DEV-ONLY (research/ oracle; src/ must NEVER import). Isolated. TRACK A diagnostic.
// GOAL: BEFORE building the "projected rung rows" fix, LOCALIZE the 0.0105 true-3D p99 residual on the
// lip-refined DragonScales mesh. The mandate ASSUMES the residual is the near-vertical lip wall (straight rung
// vs slanted/curved true wall). BUT the prior scorecard shows lipP99=0.0016 (the lip is ALREADY clean) while
// the OVERALL p99=0.0105 — so the worst facets are NOT on the lip. This probe partitions faceErr by facet CLASS
// (sheet / tread / ringBelow / ringAbove) and by z-band, and prints the worst-20 facets' (z, class, radial span,
// z-span) so the fix targets the REAL residual. Cheapest possible discriminator: reuse the exact _pf_dslip
// builder + ref, add per-class p99. No new mesh math.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_cu_dslip');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'diag.log'), `${new Date().toISOString()} ${m}\n`); console.log(m); };

const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }

function buildLipRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number, opts: { lipRows?: number; lipBandMm?: number }): RowSpec[] {
  const zEps = 5e-4; const lipRows = opts.lipRows ?? 0; const lipBand = opts.lipBandMm ?? 0.5;
  const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z); const th = (): Float64Array => evenThetas(nTh);
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const pushSheetBand = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    for (let i = lipRows; i >= 1; i--) { const z = ring.z - lipBand * (i / (lipRows + 1)); if (z > cursor + 1e-6) rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn); const rMean = 0.5 * (rIn + rOut); const arc = (TAU * rMean) / nTh;
    const treadSub = Math.max(2, Math.min(24, Math.round(span / Math.max(arc, 1e-4)) + 1));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    for (let i = 1; i <= lipRows; i++) { const z = ring.z + lipBand * (i / (lipRows + 1)); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}

describe('CU-DSLIP-DIAG', () => {
  it.skipIf(process.env.PF_CU_DSLIP_DIAG !== '1')('localize the 0.0105 residual by facet class + z-band', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();
    const t0 = Date.now();
    const ref = buildStepReference(rA, H, rings, { nTheta: 3840, nZperBand: 48, zEps: 5e-4 });
    const loc = buildRefLocator(ref, 2.0);
    plog(`ref nF=${ref.nF} built (${Date.now() - t0}ms)`);
    const rows = buildLipRows(rA, rings, 1800, 30, { lipRows: 4, lipBandMm: 0.6 });
    const mesh = buildStructuredWall(rA, H, rows);
    plog(`mesh nF=${mesh.nF} nV=${mesh.nV} (${Date.now() - t0}ms)`);
    const rowOf = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;

    const faceErr = new Float64Array(mesh.nF);
    const faceZ = new Float64Array(mesh.nF); const faceClass = new Array<string>(mesh.nF);
    const faceRSpan = new Float64Array(mesh.nF); const faceZSpan = new Float64Array(mesh.nF);
    const { xyz, idx } = mesh;
    for (let f = 0; f < mesh.nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      let mx = 0;
      for (const [w0, w1, w2] of BARY) { const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz; const d = loc.dist(px, py, pz); if (d > mx) mx = d; }
      faceErr[f] = mx;
      faceZ[f] = (az + bz + cz) / 3;
      const ra = Math.hypot(ax, ay), rb = Math.hypot(bx, by), rc = Math.hypot(cx, cy);
      faceRSpan[f] = Math.max(ra, rb, rc) - Math.min(ra, rb, rc);
      faceZSpan[f] = Math.max(az, bz, cz) - Math.min(az, bz, cz);
      const ks = [a, b, c].map(v => rows[rowOf[v]].kind);
      faceClass[f] = ks.includes('ringBelow') || ks.includes('ringAbove') || ks.includes('tread') ? 'lip' : 'sheet';
    }
    // per-class p99
    for (const cls of ['sheet', 'lip']) {
      const e: number[] = []; for (let f = 0; f < mesh.nF; f++) if (faceClass[f] === cls) e.push(faceErr[f]);
      e.sort((x, y) => x - y);
      const p99 = e.length ? e[Math.floor(0.99 * e.length)] : 0; const mxv = e.length ? e[e.length - 1] : 0;
      plog(`CLASS ${cls}: n=${e.length} p99=${p99.toFixed(5)} max=${mxv.toFixed(5)}`);
    }
    // worst-20 facets
    const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((i, j) => faceErr[j] - faceErr[i]);
    plog('WORST-20 facets (err, z, class, rSpan, zSpan, distFromRing):');
    const ringZs = rings.map(r => r.z);
    for (let i = 0; i < 20; i++) { const f = order[i]; const dR = Math.min(...ringZs.map(rz => Math.abs(faceZ[f] - rz))); plog(`  err=${faceErr[f].toFixed(5)} z=${faceZ[f].toFixed(3)} ${faceClass[f]} rSpan=${faceRSpan[f].toFixed(4)} zSpan=${faceZSpan[f].toFixed(4)} dRing=${dR.toFixed(3)}`); }
    // z-band histogram of over-0.01 facets
    const bandCount = new Map<number, number>();
    for (let f = 0; f < mesh.nF; f++) if (faceErr[f] > 0.01) { const bnd = Math.floor(faceZ[f] / 15); bandCount.set(bnd, (bandCount.get(bnd) ?? 0) + 1); }
    plog(`over-0.01 by 15mm z-band: ${JSON.stringify(Array.from(bandCount.entries()).sort((a, b) => a[0] - b[0]))}`);
    expect(true).toBe(true);
  }, 1_800_000);
});
