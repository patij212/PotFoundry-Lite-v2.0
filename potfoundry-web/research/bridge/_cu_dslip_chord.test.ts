// _cu_dslip_chord.test.ts — DEV-ONLY. Isolated. FAST sheet-chord discriminator for TRACK A.
//
// The BVH-closed-object ruler is ~17min/config (3M-tri ref). But the SHEET vertices lie EXACTLY on r(θ,z),
// so the faithful sheet ruler is the RADIAL own-region chord (registry metric note: BVH needed only at the
// z-discontinuity treads, which are already clean at lipP99=0.0016). This probe measures the sheet per-facet
// radial chord sag (facet centroid & edge-mids → r(θ,z) at that point) at several sheet z-densities in SECONDS,
// to (a) confirm density-responsiveness and (b) pick the z-density + grading that drives sheet chord ≤0.01
// BEFORE spending BVH minutes. The BVH probe then CONFIRMS the winner (radial ≈ BVH on the sheet since verts
// are on-surface). Also reports %<20 so we co-optimize quality.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, triangleQualityDistribution } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_cu_dslip');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'chord.log'), `${new Date().toISOString()} ${m}\n`); console.log(m); };

function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }

// Sheet rows, z-density = nZband per band; zGrade clusters rows toward high-t within each band via a power law.
function buildRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number, opts: { lipRows?: number; lipBandMm?: number; zPow?: number }): RowSpec[] {
  const zEps = 5e-4; const lipRows = opts.lipRows ?? 0; const lipBand = opts.lipBandMm ?? 0.6; const zPow = opts.zPow ?? 1;
  const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z); const th = (): Float64Array => evenThetas(nTh);
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const pushSheetBand = (z0: number, z1: number, n: number): void => {
    for (let i = 1; i < n; i++) {
      // graded fraction: zPow>1 clusters toward z1 (the ring above, where relief deepens). zPow=1 → uniform.
      const frac = Math.pow(i / n, zPow);
      const z = z0 + (z1 - z0) * frac; if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' });
    }
  };
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

// radial own-region chord: for each SHEET facet, sample 4 barycentric pts, compute chord (facet plane) vs the
// true radial position r(θ,z)·(cosθ,sinθ,·) at that (θ,z). Distance = |P_facet − P_true| (full 3D, radial ruler).
const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

describe('CU-DSLIP-CHORD', () => {
  it.skipIf(process.env.PF_CU_DSLIP_CHORD !== '1')('sheet radial-chord vs sheet z-density + grading (fast)', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();
    const configs: { name: string; nTh: number; nZ: number; zPow: number; lipRows: number }[] = [
      { name: 'z30', nTh: 1800, nZ: 30, zPow: 1, lipRows: 4 },
      { name: 'z50', nTh: 1800, nZ: 50, zPow: 1, lipRows: 4 },
      { name: 'z80', nTh: 1800, nZ: 80, zPow: 1, lipRows: 4 },
      { name: 'z120', nTh: 1800, nZ: 120, zPow: 1, lipRows: 4 },
      { name: 'z60grade', nTh: 1800, nZ: 60, zPow: 1.6, lipRows: 4 },
      { name: 'z90grade', nTh: 1800, nZ: 90, zPow: 1.6, lipRows: 4 },
    ];
    for (const cfg of configs) {
      const rows = buildRows(rA, rings, cfg.nTh, cfg.nZ, { lipRows: cfg.lipRows, zPow: cfg.zPow });
      const rowOf = new Int32Array(1); // placeholder; recompute after build
      const mesh = buildStructuredWall(rA, H, rows);
      const ro = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) ro[v] = r;
      const { xyz, idx } = mesh;
      const sheetVals: number[] = [];
      for (let f = 0; f < mesh.nF; f++) {
        const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
        const ka = rows[ro[a]].kind, kb = rows[ro[b]].kind, kc = rows[ro[c]].kind;
        const isLip = [ka, kb, kc].some(k => k === 'ringBelow' || k === 'ringAbove' || k === 'tread');
        if (isLip) continue; // sheet only
        const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
        const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
        const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
        let mx = 0;
        for (const [w0, w1, w2] of BARY) {
          const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz;
          const th = Math.atan2(py, px); const rTrue = rA(th < 0 ? th + TAU : th, pz);
          const tx = rTrue * Math.cos(th), ty = rTrue * Math.sin(th);
          const d = Math.hypot(px - tx, py - ty); // radial distance in-plane (z equal)
          if (d > mx) mx = d;
        }
        sheetVals.push(mx);
      }
      sheetVals.sort((x, y) => x - y);
      const p99 = sheetVals[Math.floor(0.99 * sheetVals.length)], mxv = sheetVals[sheetVals.length - 1];
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      plog(`${cfg.name} tris=${mesh.nF} sheetChordP99=${p99.toFixed(5)} max=${mxv.toFixed(5)} %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)}`);
      void rowOf;
    }
    expect(true).toBe(true);
  }, 600_000);
});
