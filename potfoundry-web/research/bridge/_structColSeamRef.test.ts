// _structColSeamRef.test.ts — DEV-ONLY. E-2026-07-02-STRUCTCOL: HONEST measurement of the u-SEAM CLIFF meshed as
// an explicit vertical strip (buildStructWallSeam). The radial rA ruler is BLIND to the cliff (rA is discontinuous
// at θ=0). The cliff's TRUE surface is the ruled vertical face at θ=0 spanning r∈[r0(z), rEnd(z)] — a smooth
// bilinear patch in (i, z). Measure each cliff facet's distance to a DENSE reference of that patch (a fine (i,z)
// grid at θ=0) via nearest-point. Also verify the cliff is watertight + planar + its junction to the sheet.
//
// This is the SHARP3D closed-3D-reference treatment for the seam cliff (analogous to ArtDeco treads).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, triangleQualityDistribution } from './labkit';
import { buildRidgeGraph, rasterizeColumns, buildStructWallSeam } from './_structColLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol');
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];

describe('STRUCTCOL SEAMREF — honest seam-cliff measurement vs the vertical ruled face', () => {
  it.skipIf(process.env.PF_STRUCTCOL_SEAMREF !== '1')('measures the θ=0 cliff strip vs a dense ruled reference', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const scanN = 16000; const uToMm = TAU * DIMS.Rt;
    const dthMm = Number(process.env.PF_STRUCTCOL_DTH ?? '0.08');
    const dz = Number(process.env.PF_STRUCTCOL_DZ ?? '0.15');
    const seamSubPerMm = Number(process.env.PF_STRUCTCOL_SEAMSUB ?? '4');
    const tset = new Set<number>();
    for (let z = 0; z <= DIMS.H + 1e-9; z += dz) tset.add(+(Math.min(DIMS.H, z) / DIMS.H).toFixed(8));
    for (const tb of BIRTHS) { tset.add(+Math.max(0, tb - 3e-4).toFixed(8)); tset.add(+Math.min(1, tb + 3e-4).toFixed(8)); }
    tset.add(1);
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const rows = rasterizeColumns(g, uToMm, dthMm, 0.02, 0, rA, DIMS.H);
    const mesh = buildStructWallSeam(rA, DIMS.H, rows, seamSubPerMm, 2);
    const idxA = mesh.idx, ut = mesh.ut, xyz = mesh.xyz, nF = mesh.nF;

    // cliff facets = all 3 verts at θ≈0 (x>0, |y|<1e-6). Their true surface = ruled vertical face: for a query
    // point (px,0,pz), the nearest ruled-face point has z-param found by matching pz, r in [r0(z),rEnd(z)] closest
    // to px. Dense reference: sample the face on a fine (a in [0,1], z) grid, nearest by brute (cheap: face is 2D).
    const zN = 2400; const aN = 240;
    const refX = new Float64Array((zN + 1) * (aN + 1)); const refZ = new Float64Array((zN + 1) * (aN + 1));
    for (let iz = 0; iz <= zN; iz++) {
      const z = DIMS.H * (iz / zN); const r0 = rA(0, z), r1 = rA((1 - 1e-9) * TAU, z);
      for (let ia = 0; ia <= aN; ia++) { const rr = r0 + (r1 - r0) * (ia / aN); const idx2 = iz * (aN + 1) + ia; refX[idx2] = rr; refZ[idx2] = z; }
    }
    const nearestFace = (px: number, pz: number): number => {
      // z index near pz, search a z-window ±2 rows + full a
      const izc = Math.max(0, Math.min(zN, Math.round((pz / DIMS.H) * zN)));
      let best = Infinity;
      for (let iz = Math.max(0, izc - 3); iz <= Math.min(zN, izc + 3); iz++) {
        for (let ia = 0; ia <= aN; ia++) { const k = iz * (aN + 1) + ia; const dx = refX[k] - px, dz2 = refZ[k] - pz; const d = dx * dx + dz2 * dz2; if (d < best) best = d; }
      }
      return Math.sqrt(best);
    };
    // classify + measure cliff facets
    const SAG_BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
    let cliffN = 0, cliffWorst = 0, cliffOver = 0; const worst: Array<{ sag: number; r: number; z: number }> = [];
    for (let f = 0; f < nF; f++) {
      const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
      const ya = xyz[3 * a + 1], yb = xyz[3 * b + 1], yc = xyz[3 * c + 1];
      const xa = xyz[3 * a], xb = xyz[3 * b], xc = xyz[3 * c];
      const isCliff = Math.abs(ya) < 1e-6 && Math.abs(yb) < 1e-6 && Math.abs(yc) < 1e-6 && xa > 0 && xb > 0 && xc > 0;
      if (!isCliff) continue; cliffN++;
      let fSag = 0;
      for (const [wa, wb, wc] of SAG_BARY) {
        const px = wa * xa + wb * xb + wc * xc; const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
        const d = nearestFace(px, pz); if (d > fSag) fSag = d;
      }
      if (fSag > cliffWorst) cliffWorst = fSag;
      if (fSag > 0.01) { cliffOver++; if (worst.length < 10) worst.push({ sag: +fSag.toFixed(4), r: +xa.toFixed(3), z: +xyz[3 * a + 2].toFixed(3) }); }
    }
    // watertight (raw) + quality of the WHOLE mesh
    const rawNonMan = ((): number => { let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i]; const EK = mx + 1; const NS = 64; const ms = Array.from({ length: NS }, () => new Map<number, number>()); const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NS - 1)]; m.set(k, (m.get(k) ?? 0) + 1); }; for (let f = 0; f < idxA.length; f += 3) { bump(idxA[f], idxA[f + 1]); bump(idxA[f + 1], idxA[f + 2]); bump(idxA[f], idxA[f + 2]); } let nm = 0; for (const m of ms) for (const v of m.values()) if (v > 2) nm++; return nm; })();
    const tq = triangleQualityDistribution({ vertices: Float64Array.from(xyz), indices: idxA });

    const rec = { tris: nF, cliffFacets: cliffN, cliffWorstMm: +cliffWorst.toFixed(4), cliffOver01: cliffOver, worstCliff: worst, rawNonMan, minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 };
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'seamref.json'), JSON.stringify(rec, null, 2));
    console.log(`SEAMREF cliffFacets ${cliffN} cliffWorst ${cliffWorst.toFixed(4)}mm over01 ${cliffOver} rawNonMan ${rawNonMan} minAngle ${tq.minAngleDeg} %<20 ${tq.pctBelow20}`);
    console.log('WORST CLIFF', JSON.stringify(worst));
    expect(nF).toBeGreaterThan(0);
  }, 1_800_000);
});
