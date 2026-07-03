// _weaveCell.test.ts — DEV-ONLY. FRONTIER weave STEP 1: validate the DOUBLED-GRID CELL-PATCH primitive on
// BasketWeave. This is the real fix: each smooth grid cell meshed as an independent patch (interior already CAD-
// grade per _weaveLoc) + explicit cliff ladders on BOTH grid axes carrying the ~1.9mm C0 steps. Full scorecard:
// chord worst/p99/%>0.01 (trusted true-3D), min-angle/%<20, rawNonMan + boundary edges (corner-closure check).
//
// Env PF_WEAVE=1; PF_WEAVE_HROW; PF_WEAVE_WTGT (u width); PF_WEAVE_CLIFF (cliff chord); PF_WEAVE_SUB; PF_WEAVE_SEAM.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface, dumpRenderBins,
} from './labkit';
import { trustedWorstAnalytic, serrationToMeshEdge, vertColorsFrom, analyticBruteDist } from './_sfbPushLib';
import { buildWeaveCellMesh, basketWeaveGrid } from './_weaveLib';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';
import type { WeaveCreaseGrid } from './_weaveLib';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

function rawAudit(idxA: Uint32Array): { nonMan: number; boundary: number } {
  let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i];
  const EK = mx + 1; const NSHARD = 64;
  const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
  for (let f = 0; f < idxA.length; f += 3) { const a = idxA[f], b = idxA[f + 1], c = idxA[f + 2]; bump(a, b); bump(b, c); bump(a, c); }
  let nm = 0, bd = 0; for (const m of ms) for (const v of m.values()) { if (v > 2) nm++; else if (v === 1) bd++; } return { nonMan: nm, boundary: bd };
}

function creaseSamples(grid: WeaveCreaseGrid, nPerLine: number): number[] {
  const out: number[] = [];
  for (const u of grid.creaseU) for (let i = 0; i <= nPerLine; i++) out.push(u, i / nPerLine);
  for (const t of grid.creaseT) for (let i = 0; i <= nPerLine; i++) out.push(i / nPerLine, t);
  return out;
}

describe.skipIf(!RUN)('WEAVE cell-patch validate — doubled-grid + cliff ladders', () => {
  it('build BasketWeave via cell-patch; full scorecard (resumable)', () => {
    const hRowMm = Number(process.env.PF_WEAVE_HROW ?? '0.15');
    const wTargetMm = Number(process.env.PF_WEAVE_WTGT ?? '0.15');
    const cliffChordMm = Number(process.env.PF_WEAVE_CLIFF ?? '0.02');
    const seamMode = (process.env.PF_WEAVE_SEAM ?? 'cliff') as ('cliff' | 'wrap');
    const sub = process.env.PF_WEAVE_SUB ?? 'cell1';
    const name = `cell_BasketWeave_${sub}_h${String(hRowMm).replace('.', 'p')}`;
    if (done(name)) { console.log(`SKIP ${name} (checkpoint exists)`); return; }
    const t0 = Date.now();
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const grid = basketWeaveGrid(DEFAULT_BASKET_WEAVE.bwStrands, DEFAULT_BASKET_WEAVE.bwLayers, DEFAULT_BASKET_WEAVE.bwPhase);
    const build = buildWeaveCellMesh(rA, DIMS.H, grid, { hRowMm, wTargetMm, cliffChordMm, seamMode });
    const mesh = build.mesh; const idxA = mesh.idx; const nF = mesh.nF;
    console.log(`BasketWeave cell: seam=${build.seamMode} cellsU=${build.nCellU} cellsT=${build.nCellT} tris=${nF} verts=${mesh.nV} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

    const audit = rawAudit(idxA);
    const utArr = mesh.ut; const xyzF = Float32Array.from(mesh.xyz);
    const own = perFaceChordSag(utArr, idxA, rA, DIMS.H);
    const seamBand = 0.005;
    const faceInt = (f: number): boolean => { for (let e = 0; e < 3; e++) { const v = idxA[3 * f + e]; const u = utArr[2 * v]; if (u < seamBand || u > 1 - seamBand) return false; const t = utArr[2 * v + 1]; if (t < 0.003 || t > 0.997) return false; } return true; };
    let intWorstR = 0, intOverR = 0, intN = 0;
    for (let f = 0; f < nF; f++) if (faceInt(f)) { intN++; if (own.faceErr[f] > intWorstR) intWorstR = own.faceErr[f]; if (own.faceErr[f] > 0.01) intOverR++; }
    let intTrue = 0, intTrueOver = 0; const worstInt: Array<{ sag: number; u: number; t: number }> = [];
    {
      const intFaces: number[] = []; for (let f = 0; f < nF; f++) if (faceInt(f)) intFaces.push(f);
      intFaces.sort((a, b) => own.faceErr[b] - own.faceErr[a]);
      const K = Math.min(3000, intFaces.length);
      for (let ii = 0; ii < K; ii++) {
        const f = intFaces[ii]; const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
        const cx = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, cy = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, cz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
        const d = Math.min(projectPointToRadialSurface(cx, cy, cz, rA).dist, analyticBruteDist(cx, cy, cz, rA, DIMS.H));
        if (d > intTrue) intTrue = d;
        if (d > 0.01) { intTrueOver++; if (worstInt.length < 20) worstInt.push({ sag: +d.toFixed(4), u: +utArr[2 * a].toFixed(4), t: +utArr[2 * a + 1].toFixed(4) }); }
      }
    }
    const twAll = trustedWorstAnalytic(utArr, xyzF, idxA, own.faceErr, (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 1500, 0.01);
    const featUt = creaseSamples({ creaseU: build.creaseU, creaseT: build.creaseT }, 400);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, xyzF, idxA);
    const tq = triangleQualityDistribution({ vertices: Float64Array.from(mesh.xyz), indices: idxA });
    const p99R = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * nF)] ?? 0;

    const rec = {
      style: 'BasketWeave', config: name, hRowMm, wTargetMm, cliffChordMm, seamMode: build.seamMode, elapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
      cellsU: build.nCellU, cellsT: build.nCellT, tris: nF, verts: mesh.nV,
      nonManRaw: audit.nonMan, boundaryEdges: audit.boundary,
      quality: { minAngle: tq.minAngleDeg, p5MinAngle: tq.p5MinAngleDeg, medianMinAngle: tq.medianMinAngleDeg, meanMinAngle: tq.meanMinAngleDeg, pctBelow10: tq.pctBelow10, pctBelow20: tq.pctBelow20, pctBelow30: tq.pctBelow30 },
      interiorRadial: { seamBand, worstMm: +intWorstR.toFixed(4), nOver01: intOverR, n: intN, pctOver01: +(100 * intOverR / Math.max(1, intN)).toFixed(5) },
      interiorTrue3d: { worstMm: +intTrue.toFixed(4), nOver01: intTrueOver, worstFacets: worstInt },
      wholeTrue3d: { worstMm: +twAll.worstMm.toFixed(4), nOver01: twAll.nOverTol },
      ownWorstMm: +own.worstMm.toFixed(4), ownP99Mm: +p99R.toFixed(4),
      serrationMm: { worst: +serr.worstMm.toFixed(4), p99: +serr.p99Mm.toFixed(4), mean: +serr.meanMm.toFixed(4), n: serr.n },
    };
    ckpt(name, rec);
    console.log(`BasketWeave cell: chord true-3D int worst=${intTrue.toFixed(4)}(over01=${intTrueOver}) whole=${twAll.worstMm.toFixed(4)}(over=${twAll.nOverTol}) | minAngle=${tq.minAngleDeg.toFixed(1)} p5=${tq.p5MinAngleDeg.toFixed(1)} %<20=${tq.pctBelow20.toFixed(2)} | serr=${serr.worstMm.toFixed(4)} | rawNonMan=${audit.nonMan} boundary=${audit.boundary}`);

    if (process.env.PF_WEAVE_RENDER === '1') {
      const col = vertColorsFrom(own.vertErr, 0.01);
      dumpRenderBins(ROOT, name, xyzF, idxA, { colors: col, meta: { ruler: 'true3d(own-radial screen)', worstMm: intTrue, p99Mm: p99R, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: 'BasketWeave' }, stl: process.env.PF_WEAVE_STL === '1' });
    }
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
