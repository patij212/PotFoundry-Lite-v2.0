// _sfbChainMeasure.test.ts — DEV-ONLY. E-2026-07-02-SFB-CHAIN: re-measure a CACHED SFB-push mesh (the ladder
// step0.03 / step0.08 builds) with the RAW-INDEX watertight criterion (the task's standard; weld over-counts at
// dense sharp tips per E-KERNEL-HARDEN) + the honest own-region trusted ruler, and LOCALIZE the residual in 3D
// (tips t<0.05 vs seam u~0/1 vs interior). Read-only: loads a cached mesh bin from _sfbpush/, measures, dumps.
// Does NOT rebuild and does NOT touch _sfbPush* files. Env PF_SFBCHAIN_MEASURE.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, buildMeshUt, liftUtToRadial, auditNonManByIndex, perFaceChordSag, perFaceTrue3DSag, projectPointToRadialSurface, triangleQualityDistribution } from './labkit';
import { trustedWorstAnalytic, serrationToMeshEdge, tracePetalLoci } from './_sfbPushLib';
import type { StyleDims } from './runStyle';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const OUT = join('research', 'exchange', '_sfbchain');

function nonManByRawIndex(idx: Uint32Array): number {
  let mx = 0; for (let i = 0; i < idx.length; i++) if (idx[i] > mx) mx = idx[i];
  const EK = mx + 1; const NSHARD = 64;
  const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
  for (let f = 0; f < idx.length; f += 3) { const a = idx[f], b = idx[f + 1], c = idx[f + 2]; if (a !== b) bump(a, b); if (b !== c) bump(b, c); if (a !== c) bump(a, c); }
  let nm = 0; for (const m of ms) for (const v of m.values()) if (v > 2) nm++; return nm;
}

describe('SFB-CHAIN MEASURE — raw-index + localize residual on a cached ladder mesh', () => {
  it.skipIf(process.env.PF_SFBCHAIN_MEASURE !== '1')('re-measures + localizes (read-only)', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const binPath = process.env.PF_SFBCHAIN_MEASURE_BIN ?? join('research', 'exchange', '_sfbpush', 'ladder', 'ladder_both_step0p03_offs6_brow_v2_mesh.bin');
    const raw = readFileSync(binPath);
    const nUt = raw.readUInt32LE(0); const nIdx = raw.readUInt32LE(4);
    const ut = Array.from(new Float64Array(raw.buffer.slice(raw.byteOffset + 8, raw.byteOffset + 8 + nUt * 8)));
    const idx = new Uint32Array(raw.buffer.slice(raw.byteOffset + 8 + nUt * 8, raw.byteOffset + 8 + nUt * 8 + nIdx * 4));
    const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
    const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
    const tris = idx.length / 3;
    const weldNonMan = auditNonManByIndex(meshUt.xyz, idx);
    const rawNonMan = nonManByRawIndex(idx);

    // honest ruler: own-(u,t) chord to FILTER degenerate seam slivers, then analytic-nearest to MEASURE.
    const own = perFaceChordSag(ut, idx, rA, DIMS.H);
    const twOwn = trustedWorstAnalytic(ut, meshUt.xyz, idx, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 1200, 0.01);
    // GN true-3D (whole mesh) for the p99 statistic
    const gn = perFaceTrue3DSag(ut, idx, rA, DIMS.H, { preFilterMm: 0.007 });
    const p99 = Array.from(own.faceErr).sort((a, b) => a - b)[Math.floor(0.99 * tris)] ?? 0;

    // LOCALIZE the over-0.01 own-trusted facets: tip (t<0.05 or t>0.95), seam (u<0.01 or u>0.99), interior.
    let tip = 0, seam = 0, interior = 0;
    for (const f of twOwn.overFacets) {
      const isSeam = f.u < 0.01 || f.u > 0.99;
      const isTip = f.t < 0.05 || f.t > 0.95;
      if (isSeam) seam++; else if (isTip) tip++; else interior++;
    }
    // serration to traced loci
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
    const featUt: number[] = []; for (const ln of loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, meshUt.xyz, idx);
    const tq = triangleQualityDistribution({ vertices: vtx, indices: idx });

    const rec = {
      bin: binPath, tris, weldNonMan, rawNonMan,
      ownTrustedWorstMm: twOwn.worstMm, ownTrustedNOver01: twOwn.nOverTol,
      ownWorstMm: own.worstMm, ownP99Mm: p99, ownNOver01: Math.round(own.fracOver(0.01) * tris), pctOver01: 100 * own.fracOver(0.01),
      gnWorstMm: gn.worstMm,
      maxBruteMinusGn: twOwn.maxBruteMinusGn, maxGnMinusBrute: twOwn.maxGnMinusBrute,
      residualLocalization: { tip, seam, interior, totalOverTol: twOwn.overFacets.length },
      worstFacets: twOwn.overFacets.slice(0, 15),
      serrationMm: { worst: serr.worstMm, p99: serr.p99Mm, mean: serr.meanMm, n: serr.n },
      quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    mkdirSync(OUT, { recursive: true });
    const tag = binPath.split(/[\\/]/).pop()!.replace('_mesh.bin', '');
    writeFileSync(join(OUT, `measure_${tag}.json`), JSON.stringify(rec, null, 2));
    console.log(`MEASURE ${tag}: tris ${tris} | ownTrusted ${twOwn.worstMm.toFixed(4)} nOver01 ${twOwn.nOverTol} | p99 ${p99.toFixed(4)} | weldNonMan ${weldNonMan} rawNonMan ${rawNonMan} | serr ${serr.worstMm.toExponential(2)} | localize tip ${tip} seam ${seam} interior ${interior} | maxBruteMinusGn ${twOwn.maxBruteMinusGn.toFixed(3)}`);
    expect(tris).toBeGreaterThan(0);
  }, 3_600_000);
});
