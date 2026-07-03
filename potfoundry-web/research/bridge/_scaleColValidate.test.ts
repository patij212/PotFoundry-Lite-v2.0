// _scaleColValidate.test.ts — DEV-ONLY. E-2026-07-03-SCALECOL STEP-2/3: validate the STYLE-AGNOSTIC structured-
// column + M-square recipe (via _scaleColDriver.buildScaleColMesh) on ONE style per run (resumable). Measures the
// full "0.01 + quality" scorecard: chord worst/p99/%>0.01 (trusted analytic-brute true-3D on worst-K), min-angle/
// %<20 (quality), serration (feature->mesh-edge), rawNonMan (by INDEX).
//
// Resilience: PER-STYLE checkpoint (research/exchange/_scalecol/val_<STYLE>_<sub>.json). A killed run resumes by
// re-running the unfinished style. Env PF_SCALECOL=1 gates; PF_SCALECOL_STYLE picks the style; PF_SCALECOL_HROW the
// density; PF_SCALECOL_SUB names the run; PF_SCALECOL_RENDER=1 dumps heatmaps.
//
// Trusted rulers (LAB-CHEATSHEET): OWN-region radial screen + analytic-brute min(GN,brute) true-3D (single-valued
// styles; the wrong-well guard). RAW-index nonMan. min-angle for quality. Reuses committed libs read-only.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface, dumpRenderBins,
} from './labkit';
import { buildScaleColMesh } from './_scaleColDriver';
import {
  trustedWorstAnalytic, serrationToMeshEdge, vertColorsFrom, tracePetalLoci, analyticBruteDist,
} from './_sfbPushLib';
import type { StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SCALECOL === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_scalecol');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

/** raw-index nonManifold + boundary edge count (a UV-seam crack that shares a 3D index is NOT a real crack; this is
 * the STRUCTURED-BUILDER-index audit — every column is a shared index by construction). */
function rawAudit(idxA: Uint32Array): { nonMan: number; boundary: number } {
  let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i];
  const EK = mx + 1; const NSHARD = 64;
  const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
  for (let f = 0; f < idxA.length; f += 3) { const a = idxA[f], b = idxA[f + 1], c = idxA[f + 2]; bump(a, b); bump(b, c); bump(a, c); }
  let nm = 0, bd = 0; for (const m of ms) for (const v of m.values()) { if (v > 2) nm++; else if (v === 1) bd++; } return { nonMan: nm, boundary: bd };
}

describe.skipIf(!RUN)('E-SCALECOL STEP-2/3 validate (style-agnostic driver)', () => {
  it('build one style through the driver; measure the 0.01+quality scorecard (resumable)', () => {
    const STYLE = (process.env.PF_SCALECOL_STYLE ?? 'HarmonicRipple') as StyleId;
    const hRowMm = Number(process.env.PF_SCALECOL_HROW ?? '0.15');
    const scanN = Number(process.env.PF_SCALECOL_SCANN ?? '8000');
    const sub = process.env.PF_SCALECOL_SUB ?? 'v1';
    const name = `val_${STYLE}_${sub}_h${String(hRowMm).replace('.', 'p')}`;
    if (done(name)) { console.log(`SKIP ${name} (checkpoint exists)`); return; }
    const t0 = Date.now();
    const rA = buildRadiusFn(STYLE, {}, DIMS);

    const forcePath = process.env.PF_SCALECOL_PATH as ('ridge-graph' | 'uniform-smooth' | undefined);
    const build = buildScaleColMesh(rA, DIMS.H, { hRowMm, scanN, ...(forcePath ? { forcePath } : {}) });
    const mesh = build.mesh; const idxA = mesh.idx; const nF = mesh.nF;
    console.log(`${STYLE}: path=${build.path} builder=${build.builder} kink=${build.kinkiness.toFixed(3)} seamStep=${build.seamStepMaxMm.toFixed(3)} rows=${build.ts.length} nCrest=${build.nCrest} nValley=${build.nValley} births=${build.births} tris=${nF} verts=${mesh.nV} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

    const audit = rawAudit(idxA);
    const utArr = mesh.ut; const xyzF = Float32Array.from(mesh.xyz);
    // OWN-region radial screen (fast upper bound; picks worst-K for the trusted true-3D pass).
    const own = perFaceChordSag(utArr, idxA, rA, DIMS.H);
    // interior mask: exclude the seam band (u within 0.01) + rim rows so the seam cliff / base don't dominate.
    const seamBand = 0.01;
    const faceInt = (f: number): boolean => { for (let e = 0; e < 3; e++) { const u = utArr[2 * idxA[3 * f + e]]; if (u < seamBand || u > 1 - seamBand) return false; } return true; };
    let intWorstR = 0, intOverR = 0, intN = 0;
    for (let f = 0; f < nF; f++) if (faceInt(f)) { intN++; if (own.faceErr[f] > intWorstR) intWorstR = own.faceErr[f]; if (own.faceErr[f] > 0.01) intOverR++; }
    // TRUSTED true-3D on worst-K interior facets = min(GN, analyticBrute) (the wrong-well guard for single-valued).
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
    // WHOLE-wall trusted worst (incl seam) via the analytic-brute worst-K guard.
    const twAll = trustedWorstAnalytic(utArr, xyzF, idxA, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 1200, 0.01);
    // serration: feature loci -> nearest mesh EDGE (0 => embedded by construction).
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
    const featUt: number[] = []; for (const ln of loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, xyzF, idxA);
    const tq = triangleQualityDistribution({ vertices: Float64Array.from(mesh.xyz), indices: idxA });
    const p99R = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * nF)] ?? 0;

    const rec = {
      style: STYLE, config: name, hRowMm, scanN, elapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
      path: build.path, builder: build.builder, kinkiness: +build.kinkiness.toFixed(4),
      seamStepMaxMm: +build.seamStepMaxMm.toFixed(4), seamIsPeriodic: build.seamIsPeriodic,
      rows: build.ts.length, tris: nF, verts: mesh.nV, nCrest: build.nCrest, nValley: build.nValley, births: build.births,
      nonManRaw: audit.nonMan, boundaryEdges: audit.boundary,
      quality: { minAngle: tq.minAngleDeg, p5MinAngle: tq.p5MinAngleDeg, medianMinAngle: tq.medianMinAngleDeg, meanMinAngle: tq.meanMinAngleDeg, pctBelow10: tq.pctBelow10, pctBelow20: tq.pctBelow20, pctBelow30: tq.pctBelow30 },
      interiorRadial: { seamBand, worstMm: +intWorstR.toFixed(4), nOver01: intOverR, n: intN, pctOver01: +(100 * intOverR / Math.max(1, intN)).toFixed(5) },
      interiorTrue3d: { worstMm: +intTrue.toFixed(4), nOver01: intTrueOver, worstFacets: worstInt },
      wholeTrue3d: { worstMm: +twAll.worstMm.toFixed(4), nOver01: twAll.nOverTol, maxGnMinusBrute: +twAll.maxGnMinusBrute.toFixed(4), maxBruteMinusGn: +twAll.maxBruteMinusGn.toFixed(4) },
      ownWorstMm: +own.worstMm.toFixed(4), ownP99Mm: +p99R.toFixed(4),
      serrationMm: { worst: +serr.worstMm.toFixed(4), p99: +serr.p99Mm.toFixed(4), mean: +serr.meanMm.toFixed(4), n: serr.n },
    };
    ckpt(name, rec);
    console.log(`${STYLE}: chord true-3D interior worst=${intTrue.toFixed(4)} whole=${twAll.worstMm.toFixed(4)} | minAngle=${tq.minAngleDeg.toFixed(1)} p5=${tq.p5MinAngleDeg.toFixed(1)} %<20=${tq.pctBelow20.toFixed(1)} | serr=${serr.worstMm.toFixed(3)} | rawNonMan=${audit.nonMan}`);

    if (process.env.PF_SCALECOL_RENDER === '1') {
      const col = vertColorsFrom(own.vertErr, 0.01);
      dumpRenderBins(ROOT, name, xyzF, idxA, { colors: col, meta: { ruler: 'true3d(own-radial screen)', worstMm: intTrue, p99Mm: p99R, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: STYLE }, stl: process.env.PF_SCALECOL_STL === '1' });
    }
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
