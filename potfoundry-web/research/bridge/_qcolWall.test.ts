// _qcolWall.test.ts — DEV-ONLY. E-2026-07-03-STRUCTCOL2 DELIVERABLE: the M-SQUARE sliver-kill wall. Build the
// full closed SFB@1 wall with M-square cell sizing (msquareRows + rasterizeColumnsSquare) and measure BOTH gates:
//   QUALITY (the new priority gate): minAngle, %<20  — kill the sliver tail.
//   CHORD (trusted true-3D): interior worst / p99 / %>0.01 via min(GN, analyticBrute) on worst-K.
//   serration (feature curve -> nearest mesh EDGE), rawNonMan (by INDEX).
//
// KILL-CRITERION (pre-registered, this arc): min-angle > ~12 AND %<20 sharply down (target < ~5%) AND interior
// true-3D worst <= 0.012 AND %>0.01 ~ 0 AND serration ~ 0 AND rawNonMan == 0. Then SFB@1 is COMPLETE and the
// recipe (ridge-graph + M-square columns + seam cliff) is the family template.
//
// Env PF_STRUCTCOL2=1 gates; PF_QCOL_SUB names the run; PF_QCOL_HROW = target square edge (mm); PF_QCOL_SEAM=1
// uses buildStructWallSeam (explicit C0 cliff, full closed wall). Resumable per-config json checkpoint.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface, dumpRenderBins } from './labkit';
import { buildRidgeGraph } from './_structColLib';
import { msquareRows, rasterizeColumnsSquare, buildStructWall, buildStructWallSquare, buildStructWallSeamSquare, buildStructWallSeam } from './_qcolMsquare';
import { trustedWorstAnalytic, serrationToMeshEdge, vertColorsFrom, tracePetalLoci, analyticBruteDist } from './_sfbPushLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol2');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];

function rawAudit(idxA: Uint32Array): { nonMan: number; boundary: number } {
  let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i];
  const EK = mx + 1; const NSHARD = 64;
  const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
  for (let f = 0; f < idxA.length; f += 3) { const a = idxA[f], b = idxA[f + 1], c = idxA[f + 2]; bump(a, b); bump(b, c); bump(a, c); }
  let nm = 0, bd = 0; for (const m of ms) for (const v of m.values()) { if (v > 2) nm++; else if (v === 1) bd++; } return { nonMan: nm, boundary: bd };
}

describe('QCOL WALL — M-square structured wall (E-STRUCTCOL2 deliverable)', () => {
  it.skipIf(process.env.PF_STRUCTCOL2 !== '1')('builds M-square wall; measures quality + chord + serration + rawNonMan (resumable)', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const hRowMm = Number(process.env.PF_QCOL_HROW ?? '0.12');   // target 3D-square edge (mm)
    const wFloorMm = Number(process.env.PF_QCOL_WFLOOR ?? '0.03'); // narrowest sub-column
    const wCapMm = Number(process.env.PF_QCOL_WCAP ?? '0.6');      // widest cell (flat valley)
    const hCapMm = Number(process.env.PF_QCOL_HCAP ?? (hRowMm * 6).toString()); // dz cap (flat chord guard)
    const tipArcMm = Number(process.env.PF_QCOL_TIPARC ?? '0.03');
    const nSh = Number(process.env.PF_QCOL_NSH ?? '0');
    const scanN = Number(process.env.PF_QCOL_SCANN ?? '12000');
    const useSeam = process.env.PF_QCOL_SEAM === '1';
    const seamSubPerMm = Number(process.env.PF_QCOL_SEAMSUB ?? '4');
    const sub = process.env.PF_QCOL_SUB ?? 'ms1';
    const name = `qcol_${sub}_h${String(hRowMm).replace('.', 'p')}_wf${String(wFloorMm).replace('.', 'p')}_wc${String(wCapMm).replace('.', 'p')}${useSeam ? '_seam' : ''}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }

    const ts = msquareRows(rA, DIMS.H, hRowMm, BIRTHS, { hRowCapMm: Number(hCapMm), seamBand: 0.02 });
    console.log(`rows ${ts.length}`);
    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const rows = rasterizeColumnsSquare(g, rA, DIMS.H, tipArcMm, nSh, wFloorMm, wCapMm);
    const builder = process.env.PF_QCOL_BUILDER ?? 'legacy'; // 'legacy' = u-merge (best chord); 'square' = key-aware; 'seamsq' = M-square explicit seam cliff
    const mesh = builder === 'seamsq'
      ? buildStructWallSeamSquare(rA, DIMS.H, rows)
      : useSeam ? buildStructWallSeam(rA, DIMS.H, rows, seamSubPerMm, 2)
        : builder === 'square' ? buildStructWallSquare(rA, DIMS.H, rows, 'wrap')
          : buildStructWall(rA, DIMS.H, rows);
    const idxA = mesh.idx; const nF = mesh.nF;
    console.log(`wall ${nF} tris, ${mesh.nV} verts`);

    const audit = rawAudit(idxA);
    const utArr = mesh.ut; const xyzF = Float32Array.from(mesh.xyz);
    const own = perFaceChordSag(utArr, idxA, rA, DIMS.H);
    const seamBand = 0.01;
    const faceUcheck = (f: number): boolean => { for (let e = 0; e < 3; e++) { const u = utArr[2 * idxA[3 * f + e]]; if (u < seamBand || u > 1 - seamBand) return false; } return true; };
    let intWorst = 0, intOver = 0, intN = 0; for (let f = 0; f < nF; f++) { if (faceUcheck(f)) { intN++; if (own.faceErr[f] > intWorst) intWorst = own.faceErr[f]; if (own.faceErr[f] > 0.01) intOver++; } }
    // trusted true-3D on worst-K interior facets = min(GN, analyticBrute).
    let intTrue = 0, intTrueOver = 0;
    const worstInt: Array<{ f: number; sag: number; u: number; t: number }> = [];
    {
      const intFaces: number[] = []; for (let f = 0; f < nF; f++) if (faceUcheck(f)) intFaces.push(f);
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
        if (d > 0.01) { intTrueOver++; if (worstInt.length < 20) worstInt.push({ f, sag: +d.toFixed(4), u: +utArr[2 * a].toFixed(4), t: +utArr[2 * a + 1].toFixed(4) }); }
      }
    }
    const twOwn = trustedWorstAnalytic(utArr, xyzF, idxA, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 1000, 0.01);
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
    const featUt: number[] = []; for (const ln of loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, xyzF, idxA);
    const tq = triangleQualityDistribution({ vertices: Float64Array.from(mesh.xyz), indices: idxA });
    const p99 = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * nF)] ?? 0;
    const rec = {
      config: name, hRowMm, wFloorMm, wCapMm, hCapMm: Number(hCapMm), tipArcMm, nSh, useSeam,
      rows: ts.length, tris: nF, verts: mesh.nV, nCrest: g.nCrest, nValley: g.nValley,
      nonManRaw: audit.nonMan, boundaryEdges: audit.boundary,
      quality: { minAngle: tq.minAngleDeg, p5MinAngle: tq.p5MinAngleDeg, medianMinAngle: tq.medianMinAngleDeg, meanMinAngle: tq.meanMinAngleDeg, pctBelow10: tq.pctBelow10, pctBelow20: tq.pctBelow20, pctBelow30: tq.pctBelow30 },
      interiorRadial: { seamBand, worstMm: +intWorst.toFixed(4), nOver01: intOver, n: intN, pctOver01: +(100 * intOver / Math.max(1, intN)).toFixed(5) },
      interiorTrue3d: { worstMm: +intTrue.toFixed(4), nOver01: intTrueOver, worstFacets: worstInt },
      ownWorstMm: own.worstMm, ownP99Mm: p99,
      ownTrustedWorstMm: twOwn.worstMm, ownTrustedNOver01: twOwn.nOverTol,
      serrationMm: { worst: serr.worstMm, p99: serr.p99Mm, mean: serr.meanMm, n: serr.n },
    };
    ckpt(name, rec);
    if (process.env.PF_QCOL_RENDER === '1') {
      // chord heatmap
      const col = vertColorsFrom(own.vertErr, 0.01);
      dumpRenderBins(ROOT, name, xyzF, idxA, { colors: col, meta: { ruler: 'true3d(own-radial)', worstMm: intTrue, p99Mm: p99, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: STYLE }, stl: process.env.PF_QCOL_STL === '1' });
      // QUALITY heatmap: per-vertex min incident-triangle min-angle, colored green(>=25)->red(<12)
      const nV = mesh.nV; const vAng = new Float64Array(nV).fill(180);
      const angOf = (f: number): number => {
        const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
        const e = (p: number, q: number): number => Math.hypot(mesh.xyz[3 * p] - mesh.xyz[3 * q], mesh.xyz[3 * p + 1] - mesh.xyz[3 * q + 1], mesh.xyz[3 * p + 2] - mesh.xyz[3 * q + 2]);
        const A = e(b, c), B = e(c, a), C = e(a, b); const cl = (x: number): number => Math.max(-1, Math.min(1, x));
        const aa = Math.acos(cl((B * B + C * C - A * A) / (2 * B * C || 1e-30))); const ab = Math.acos(cl((A * A + C * C - B * B) / (2 * A * C || 1e-30)));
        return Math.min(aa, ab, Math.PI - aa - ab) * 180 / Math.PI;
      };
      for (let f = 0; f < nF; f++) { const mn = angOf(f); for (let e = 0; e < 3; e++) { const v = idxA[3 * f + e]; if (mn < vAng[v]) vAng[v] = mn; } }
      const qcol = new Float32Array(nV * 3);
      for (let v = 0; v < nV; v++) { const a = vAng[v]; const g0 = Math.max(0, Math.min(1, (a - 12) / (25 - 12))); qcol[3 * v] = 1 - g0; qcol[3 * v + 1] = 0.2 + 0.6 * g0; qcol[3 * v + 2] = 0.13 * g0; }
      dumpRenderBins(ROOT, `${name}_qual`, xyzF, idxA, { colors: qcol, meta: { ruler: 'minAngle(deg): red<12 green>=25', worstMm: tq.minAngleDeg, p99Mm: tq.p5MinAngleDeg, pctOver0_01: tq.pctBelow20, scaleMm: 20, style: STYLE } });
    }
    console.log(`QCOLWALL ${name} | minAngle ${tq.minAngleDeg} %<20 ${tq.pctBelow20} %<10 ${tq.pctBelow10} p5 ${tq.p5MinAngleDeg} | TRUE3D int worst ${intTrue.toFixed(4)} over01 ${intTrueOver} | radial-int worst ${intWorst.toFixed(4)} over01 ${intOver}/${intN} | serr ${serr.worstMm.toExponential(2)} rawNonMan ${audit.nonMan} tris ${nF}`);
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
