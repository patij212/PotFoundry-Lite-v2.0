// _structColSeam.test.ts — DEV-ONLY. E-2026-07-02-STRUCTCOL: diagnose the SEAM residual. The vc1 wall's worst
// facets (2.85mm) sit at u~1.0, t~0.67 (NOT a birth). Inspect the columns near the seam + the triangles that
// touch u~1.0 to find whether a seam feature is duplicated / a spanning facet is emitted.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag } from './labkit';
import { buildRidgeGraph, rasterizeColumns, buildStructWall } from './_structColLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol');

describe('STRUCTCOL SEAM — diagnose the u~1.0 seam residual', () => {
  it.skipIf(process.env.PF_STRUCTCOL_SEAM !== '1')('inspects seam columns + worst-facet geometry', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const scanN = 16000; const uToMm = TAU * DIMS.Rt;
    // coarse-ish rows, dense near t=0.67
    const tset = new Set<number>();
    for (let i = 0; i <= 150; i++) tset.add(+(i / 150).toFixed(8));
    for (let k = -4; k <= 4; k++) tset.add(+(0.6728 + k * 0.003).toFixed(8));
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const rows = rasterizeColumns(g, uToMm, 0.3, 0.02, 4);
    const mesh = buildStructWall(rA, DIMS.H, rows);
    const own = perFaceChordSag(mesh.ut, mesh.idx, rA, DIMS.H);
    const idxA = mesh.idx; const ut = mesh.ut; const xyz = mesh.xyz; const nF = mesh.nF;

    // rows near t=0.67: list columns with u in [0.94,1) U [0,0.06] (near seam)
    let rr = -1; for (let r = 0; r < ts.length; r++) if (Math.abs(ts[r] - 0.6728) < 1e-6) rr = r;
    if (rr < 0) { let bd = Infinity; for (let r = 0; r < ts.length; r++) { const d = Math.abs(ts[r] - 0.6728); if (d < bd) { bd = d; rr = r; } } }
    const rowInfo = (r: number): Array<{ u: number; key: string }> => {
      const out: Array<{ u: number; key: string }> = [];
      for (let k = 0; k < rows[r].u.length; k++) { const u = rows[r].u[k]; if (u > 0.94 || u < 0.06) out.push({ u: +u.toFixed(5), key: rows[r].key[k] }); }
      return out.sort((a, b) => a.u - b.u);
    };

    // worst facets near t=0.67 with vertex u/t + radial span
    const faceT = (f: number): number => (ut[2 * idxA[3 * f] + 1] + ut[2 * idxA[3 * f + 1] + 1] + ut[2 * idxA[3 * f + 2] + 1]) / 3;
    const worst: Array<{ f: number; sag: number; verts: Array<{ u: number; t: number; r: number }> }> = [];
    const order = Array.from({ length: nF }, (_, f) => f).sort((a, b) => own.faceErr[b] - own.faceErr[a]);
    for (const f of order) {
      if (worst.length >= 8) break;
      if (own.faceErr[f] < 0.5) break;
      const vs = [idxA[3 * f], idxA[3 * f + 1], idxA[3 * f + 2]].map((v) => ({ u: +ut[2 * v].toFixed(5), t: +ut[2 * v + 1].toFixed(5), r: +Math.hypot(xyz[3 * v], xyz[3 * v + 1]).toFixed(4) }));
      worst.push({ f, sag: +own.faceErr[f].toFixed(4), verts: vs });
    }

    // ANCHORED-FRAME full column list near the seam at t=0.9: consecutive columns + 3D gap (radial delta at same z)
    let r9 = 0; { let bd = Infinity; for (let r = 0; r < ts.length; r++) { const d = Math.abs(ts[r] - 0.9); if (d < bd) { bd = d; r9 = r; } } }
    const z9 = ts[r9] * DIMS.H;
    const cols9: Array<{ u: number; key: string; r: number }> = [];
    for (let k = 0; k < rows[r9].u.length; k++) { const u = rows[r9].u[k]; cols9.push({ u: +u.toFixed(6), key: rows[r9].key[k], r: +rA(u * TAU, z9).toFixed(3) }); }
    // find consecutive columns with big 3D gap (arc + radial)
    const bigGaps: Array<{ i: number; uA: number; uB: number; keyA: string; keyB: string; gap3d: number }> = [];
    for (let k = 0; k < cols9.length; k++) {
      const a = cols9[k], b = cols9[(k + 1) % cols9.length];
      const thA = a.u * TAU, thB = b.u * TAU;
      const dx = a.r * Math.cos(thA) - b.r * Math.cos(thB), dy = a.r * Math.sin(thA) - b.r * Math.sin(thB);
      const g3 = Math.hypot(dx, dy);
      if (g3 > 1.0) bigGaps.push({ i: k, uA: a.u, uB: b.u, keyA: a.key, keyB: b.key, gap3d: +g3.toFixed(3) });
    }
    const rec = { rowT: +ts[rr].toFixed(5), t9: +ts[r9].toFixed(5), nCols9: cols9.length, bigGaps, seamCols: rowInfo(rr), worstFacets: worst };
    console.log('BIG 3D GAPS at t=0.9:', JSON.stringify(bigGaps));
    // graph slot u's near the seam at t=0.9 vs the raw extrema
    const rawCrest = ((): number[] => { const N = 16000; const z = z9; const vals = new Float64Array(N); for (let i = 0; i < N; i++) vals[i] = rA(TAU * (i / N), z); const o: number[] = []; for (let i = 0; i < N; i++) { const a = vals[(i - 1 + N) % N], b = vals[i], c = vals[(i + 1) % N]; if (b >= a && b > c) o.push(+(i / N).toFixed(4)); } return o; })();
    console.log('t9', ts[r9].toFixed(4), 'graph crestU9', g.crestU[r9][9], 'valleyU9', g.valleyU[r9][9], 'crestU0', g.crestU[r9][0], 'valleyU8', g.valleyU[r9][8]);
    console.log('raw crest us (all):', JSON.stringify(rawCrest));
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'seam_diag.json'), JSON.stringify(rec, null, 2));
    console.log('ROW t', ts[rr].toFixed(4), 'seam cols', JSON.stringify(rowInfo(rr)));
    console.log('WORST FACETS', JSON.stringify(worst, null, 1));
    expect(mesh.nF).toBeGreaterThan(0);
  }, 600_000);
});
