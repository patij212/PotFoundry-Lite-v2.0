// _weaveValidate.test.ts — DEV-ONLY. FRONTIER weave STEP 1: validate the crease-conforming structured primitive on
// BasketWeave (simplest weave). Full scorecard: chord worst/p99/%>0.01 (trusted analytic-brute min(GN,brute)
// true-3D on worst-K), min-angle/%<20 (quality — the pinned-21.5% axis the wall must beat), serration (crease ->
// nearest mesh edge, 0 => embedded by construction), rawNonMan (by INDEX).
//
// TARGET (pre-registered in SCORECARD.md): int true-3D worst <= 0.012mm + %<20 < ~5% + rawNonMan 0.
//
// Resilience: PER-CONFIG checkpoint research/exchange/_weave/val_<STYLE>_<sub>_h<hRow>.json; resumable.
// Env PF_WEAVE=1; PF_WEAVE_STYLE (BasketWeave|CelticKnot); PF_WEAVE_HROW density; PF_WEAVE_SUB names run;
// PF_WEAVE_SEAM (cliff|wrap); PF_WEAVE_RENDER=1 dumps heatmap bins.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface, dumpRenderBins,
} from './labkit';
import { trustedWorstAnalytic, serrationToMeshEdge, vertColorsFrom, analyticBruteDist } from './_sfbPushLib';
import { buildWeaveCreaseMesh, basketWeaveGrid } from './_weaveLib';
import { celticKnotGrid } from './_braidLib';
import { DEFAULT_BASKET_WEAVE, DEFAULT_CELTIC_KNOT } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';
import type { WeaveCreaseGrid } from './_weaveLib';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const TAU = 2 * Math.PI;
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

/** raw-index nonManifold + boundary edge count (structured-builder index audit). */
function rawAudit(idxA: Uint32Array): { nonMan: number; boundary: number } {
  let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i];
  const EK = mx + 1; const NSHARD = 64;
  const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
  for (let f = 0; f < idxA.length; f += 3) { const a = idxA[f], b = idxA[f + 1], c = idxA[f + 2]; bump(a, b); bump(b, c); bump(a, c); }
  let nm = 0, bd = 0; for (const m of ms) for (const v of m.values()) { if (v > 2) nm++; else if (v === 1) bd++; } return { nonMan: nm, boundary: bd };
}

/** crease-line feature samples for serration: sample each constant-u vertical crease over t, and each constant-t
 * ring over u. If the mesh conforms, these all land on mesh edges => serration ~0. */
function creaseSamples(grid: WeaveCreaseGrid, nPerLine: number): number[] {
  const out: number[] = [];
  for (const u of grid.creaseU) for (let i = 0; i <= nPerLine; i++) out.push(u, i / nPerLine);
  for (const t of grid.creaseT) for (let i = 0; i <= nPerLine; i++) out.push(i / nPerLine, t);
  return out;
}

describe.skipIf(!RUN)('WEAVE validate — crease-conforming structured primitive', () => {
  it('build one weave style; measure the 0.01 + quality scorecard (resumable)', () => {
    const STYLE = (process.env.PF_WEAVE_STYLE ?? 'BasketWeave') as StyleId;
    const hRowMm = Number(process.env.PF_WEAVE_HROW ?? '0.15');
    const sub = process.env.PF_WEAVE_SUB ?? 'v1';
    const seamMode = (process.env.PF_WEAVE_SEAM ?? (STYLE === 'BasketWeave' ? 'cliff' : 'wrap')) as ('cliff' | 'wrap');
    const name = `val_${STYLE}_${sub}_h${String(hRowMm).replace('.', 'p')}`;
    if (done(name)) { console.log(`SKIP ${name} (checkpoint exists)`); return; }
    const t0 = Date.now();
    const rA = buildRadiusFn(STYLE, {}, DIMS);

    const grid: WeaveCreaseGrid = STYLE === 'BasketWeave'
      ? basketWeaveGrid(DEFAULT_BASKET_WEAVE.bwStrands, DEFAULT_BASKET_WEAVE.bwLayers, DEFAULT_BASKET_WEAVE.bwPhase)
      : celticKnotGrid(rA, DIMS.H, DEFAULT_CELTIC_KNOT);

    const build = buildWeaveCreaseMesh(rA, DIMS.H, grid, { hRowMm, seamMode });
    const mesh = build.mesh; const idxA = mesh.idx; const nF = mesh.nF;
    console.log(`${STYLE}: seam=${build.seamMode} rows=${build.ts.length} nCol=${build.nCol} creaseU=${build.creaseU.length} creaseT=${build.creaseT.length} tris=${nF} verts=${mesh.nV} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

    const audit = rawAudit(idxA);
    const utArr = mesh.ut; const xyzF = Float32Array.from(mesh.xyz);
    const own = perFaceChordSag(utArr, idxA, rA, DIMS.H);
    // interior mask: exclude seam band (u within 0.01) + rim rows.
    const seamBand = 0.01;
    const faceInt = (f: number): boolean => { for (let e = 0; e < 3; e++) { const u = utArr[2 * idxA[3 * f + e]]; if (u < seamBand || u > 1 - seamBand) return false; const t = utArr[2 * idxA[3 * f + e] + 1]; if (t < 0.005 || t > 0.995) return false; } return true; };
    let intWorstR = 0, intOverR = 0, intN = 0;
    for (let f = 0; f < nF; f++) if (faceInt(f)) { intN++; if (own.faceErr[f] > intWorstR) intWorstR = own.faceErr[f]; if (own.faceErr[f] > 0.01) intOverR++; }
    // TRUSTED true-3D on worst-K interior facets = min(GN, analyticBrute).
    let intTrue = 0, intTrueOver = 0; const worstInt: Array<{ sag: number; u: number; t: number }> = [];
    {
      const intFaces: number[] = []; for (let f = 0; f < nF; f++) if (faceInt(f)) intFaces.push(f);
      intFaces.sort((a, b) => own.faceErr[b] - own.faceErr[a]);
      const K = Math.min(3000, intFaces.length);
      for (let ii = 0; ii < K; ii++) {
        const f = intFaces[ii];
        const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
        const cx = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3;
        const cy = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3;
        const cz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
        const gn = projectPointToRadialSurface(cx, cy, cz, rA).dist;
        const br = analyticBruteDist(cx, cy, cz, rA, DIMS.H);
        const d = Math.min(gn, br);
        if (d > intTrue) intTrue = d;
        if (d > 0.01) { intTrueOver++; if (worstInt.length < 20) worstInt.push({ sag: +d.toFixed(4), u: +utArr[2 * a].toFixed(4), t: +utArr[2 * a + 1].toFixed(4) }); }
      }
    }
    // WHOLE-wall trusted worst (incl seam).
    const twAll = trustedWorstAnalytic(utArr, xyzF, idxA, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 1200, 0.01);
    // serration: crease grid samples -> nearest mesh edge.
    const featUt = creaseSamples({ creaseU: build.creaseU, creaseT: build.creaseT }, 400);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, xyzF, idxA);
    const tq = triangleQualityDistribution({ vertices: Float64Array.from(mesh.xyz), indices: idxA });
    const p99R = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * nF)] ?? 0;

    const rec = {
      style: STYLE, config: name, hRowMm, seamMode: build.seamMode, elapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
      rows: build.ts.length, nCol: build.nCol, tris: nF, verts: mesh.nV, creaseU: build.creaseU.length, creaseT: build.creaseT.length,
      nonManRaw: audit.nonMan, boundaryEdges: audit.boundary,
      quality: { minAngle: tq.minAngleDeg, p5MinAngle: tq.p5MinAngleDeg, medianMinAngle: tq.medianMinAngleDeg, meanMinAngle: tq.meanMinAngleDeg, pctBelow10: tq.pctBelow10, pctBelow20: tq.pctBelow20, pctBelow30: tq.pctBelow30 },
      interiorRadial: { seamBand, worstMm: +intWorstR.toFixed(4), nOver01: intOverR, n: intN, pctOver01: +(100 * intOverR / Math.max(1, intN)).toFixed(5) },
      interiorTrue3d: { worstMm: +intTrue.toFixed(4), nOver01: intTrueOver, worstFacets: worstInt },
      wholeTrue3d: { worstMm: +twAll.worstMm.toFixed(4), nOver01: twAll.nOverTol, maxGnMinusBrute: +twAll.maxGnMinusBrute.toFixed(4), maxBruteMinusGn: +twAll.maxBruteMinusGn.toFixed(4) },
      ownWorstMm: +own.worstMm.toFixed(4), ownP99Mm: +p99R.toFixed(4),
      serrationMm: { worst: +serr.worstMm.toFixed(4), p99: +serr.p99Mm.toFixed(4), mean: +serr.meanMm.toFixed(4), n: serr.n },
    };
    ckpt(name, rec);
    console.log(`${STYLE}: chord true-3D interior worst=${intTrue.toFixed(4)} (over01=${intTrueOver}) whole=${twAll.worstMm.toFixed(4)} | minAngle=${tq.minAngleDeg.toFixed(1)} p5=${tq.p5MinAngleDeg.toFixed(1)} %<20=${tq.pctBelow20.toFixed(2)} | serr=${serr.worstMm.toFixed(4)} | rawNonMan=${audit.nonMan}`);

    if (process.env.PF_WEAVE_RENDER === '1') {
      const col = vertColorsFrom(own.vertErr, 0.01);
      dumpRenderBins(ROOT, name, xyzF, idxA, { colors: col, meta: { ruler: 'true3d(own-radial screen)', worstMm: intTrue, p99Mm: p99R, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: STYLE }, stl: process.env.PF_WEAVE_STL === '1' });
    }
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
