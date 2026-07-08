// _gyroid_close.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-08-GYROID-CONFORMING-CLOSE. Env-gated resumable probes (PF_GYROID_CLOSE=1).
//   Q1 EXTRACT   (PF_GYROID_CLOSE=1 PF_GC=extract): analytic contour extraction + 3D placement validation + scatter overlay ndjson.
//   Q2 BUILD     (PF_GYROID_CLOSE=1 PF_GC=build):   conforming re-mesh (single vs doubled), constraint recovery stats, watertight, zeroArea, tris.
//   Q3 VERDICT   (PF_GYROID_CLOSE=1 PF_GC=verdict): whole-mesh Newton-ruler gate (off-wall outliers, wall serration).
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GYROID_DEFAULTS, wallIsolevels, gyroidVal, marchAbsIso, linkSegments, isoResidual3D, refineAndFilterContours,
  decimateContours, contoursToConstraints, type Contour,
} from './_gyroidContourLib';
import { radiusFn, TANGLED_BASE, auditNonManRaw, wholeMeshGuardRadialBound } from './_pf_tangledKernelLib';
import { buildInhouseMetricMesh, auditNonManByIndex } from './labkit';
import { newtonNearest, type NewtonOpts } from './_gyroid_truthLib';
import type { StyleDims } from './labkit';
import { readFileSync } from 'node:fs';

const RUN = process.env.PF_GYROID_CLOSE === '1';
const DIR = join(process.cwd(), 'research/exchange/_gyroid_close');
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const P = GYROID_DEFAULTS;

describe('E-2026-07-08-GYROID-CONFORMING-CLOSE', () => {
  it.skipIf(!RUN || process.env.PF_GC !== 'extract')('Q1 extract + validate contour placement', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const lv = wallIsolevels(P);
    // marching-squares grid: gmScale=4 ⇒ the val field oscillates ~4 periods in u and ~16/(2π)≈2.5 in t? zT=16t so
    // ~2.5 periods in t. A 1200×1200 grid gives ~150 cells/period in u — ample for the smooth field.
    const opts = { nu: 1200, nt: 1200, polishIters: 40 };
    const t0 = Date.now();
    const outSegs = marchAbsIso(lv.outer, P, opts);
    const innerSegs = marchAbsIso(lv.inner, P, opts);
    const midSegs = marchAbsIso(lv.mid, P, opts);
    // refine+filter: polish every vertex onto the true isolevel, DROP the ~0.3% saddle strays (valErr>1e-4).
    const rfOut = refineAndFilterContours(linkSegments(outSegs), lv.outer, P);
    const rfInner = refineAndFilterContours(linkSegments(innerSegs), lv.inner, P);
    const rfMid = refineAndFilterContours(linkSegments(midSegs), lv.mid, P);
    const outC = rfOut.contours, innerC = rfInner.contours, midC = rfMid.contours;
    const ms = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log('[Q1 refine] outer dropped', rfOut.dropped, 'kept', rfOut.kept, '| inner dropped', rfInner.dropped, 'kept', rfInner.kept, '| mid dropped', rfMid.dropped, 'kept', rfMid.kept);

    // ── placement validation: sample points ON each polyline, measure 3D disp off the target isolevel ──
    const validate = (contours: { pts: [number, number][] }[], c: number): { n: number; maxDisp: number; p99Disp: number; maxValErr: number } => {
      const disps: number[] = []; let maxValErr = 0;
      for (const cont of contours) for (const [u, t] of cont.pts) {
        const r = isoResidual3D(u, t, c, P, rA, DIMS.H);
        disps.push(r.disp3D); if (r.valErr > maxValErr) maxValErr = r.valErr;
      }
      disps.sort((a, b) => a - b);
      const p99 = disps.length ? disps[Math.min(disps.length - 1, Math.floor(0.99 * disps.length))] : 0;
      return { n: disps.length, maxDisp: disps.length ? disps[disps.length - 1] : 0, p99Disp: p99, maxValErr };
    };
    const vOut = validate(outC, lv.outer), vInner = validate(innerC, lv.inner), vMid = validate(midC, lv.mid);

    // checkpoint: counts + placement + isolevels
    const rec = {
      stage: 'Q1-EXTRACT', ms, isolevels: lv,
      outer: { nContours: outC.length, nSegs: outSegs.length, nPts: vOut.n, maxDisp: +vOut.maxDisp.toFixed(6), p99Disp: +vOut.p99Disp.toFixed(6), maxValErr: +vOut.maxValErr.toExponential(3) },
      inner: { nContours: innerC.length, nSegs: innerSegs.length, nPts: vInner.n, maxDisp: +vInner.maxDisp.toFixed(6), p99Disp: +vInner.p99Disp.toFixed(6), maxValErr: +vInner.maxValErr.toExponential(3) },
      mid: { nContours: midC.length, nSegs: midSegs.length, nPts: vMid.n, maxDisp: +vMid.maxDisp.toFixed(6), p99Disp: +vMid.p99Disp.toFixed(6), maxValErr: +vMid.maxValErr.toExponential(3) },
    };
    appendFileSync(join(DIR, 'extract.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[Q1]', JSON.stringify(rec, null, 2));

    // persist the refined contours for Q2 (resumable): JSON per isolevel, polyline arrays of [u,t].
    const serialize = (contours: { pts: [number, number][] }[]): number[][][] => contours.map((c) => c.pts);
    writeFileSync(join(DIR, 'contours_refined.json'), JSON.stringify({
      isolevels: lv, outer: serialize(outC), inner: serialize(innerC), mid: serialize(midC),
    }));

    // overlay scatter ndjson: dump all polyline points (u,t) for utScatter (one file per isolevel, tagged)
    const dumpPts = (contours: { pts: [number, number][] }[], tag: string): void => {
      let s = '';
      for (const cont of contours) for (const [u, t] of cont.pts) s += JSON.stringify({ uc: +u.toFixed(5), tc: +t.toFixed(5), dev: 0.05, tag }) + '\n';
      writeFileSync(join(DIR, `contour_${tag}.ndjson`), s);
    };
    dumpPts(outC, 'outer'); dumpPts(innerC, 'inner'); dumpPts(midC, 'mid');
    // combined (both band edges) for the doubled overlay
    writeFileSync(join(DIR, 'contour_both.ndjson'),
      [...outC, ...innerC].flatMap((cont) => cont.pts.map(([u, t]) => JSON.stringify({ uc: +u.toFixed(5), tc: +t.toFixed(5), dev: 0.05 }))).join('\n'));

    expect(vMid.maxDisp).toBeLessThan(0.01); // KILL: extractor must reach sub-0.01 placement
  }, 20 * 60_000);

  // ── Q2 BUILD: conforming re-mesh with the wall contours as constraint edges ──────────────────────────────────
  // PF_GC=build PF_GCVARIANT=mid|both  PF_GCSTEP=<decimate mm>  PF_GCMAX=<maxPoints>
  it.skipIf(!RUN || process.env.PF_GC !== 'build')('Q2 conforming build (single vs doubled)', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const variant = process.env.PF_GCVARIANT ?? 'mid';
    const stepMm = Number(process.env.PF_GCSTEP ?? '0.3');
    const maxPoints = Number(process.env.PF_GCMAX ?? '3000000');
    const chordTolMm = Number(process.env.PF_GCCHORD ?? '0.004');
    // reload refined contours from Q1
    const raw = JSON.parse(readFileSync(join(DIR, 'contours_refined.json'), 'utf8')) as {
      isolevels: { inner: number; outer: number; mid: number }; outer: number[][][]; inner: number[][][]; mid: number[][][];
    };
    const asC = (arr: number[][][]): Contour[] => arr.map((pts) => ({ pts: pts as [number, number][] }));
    let contours: Contour[];
    if (variant === 'mid') contours = asC(raw.mid);
    else if (variant === 'both') contours = [...asC(raw.inner), ...asC(raw.outer)];
    else throw new Error('variant must be mid|both');
    const dec = decimateContours(contours, stepMm, rA, DIMS.H);
    const { injectedPoints, constraintEdges } = contoursToConstraints(dec);
    const nConstraintVerts = injectedPoints.length / 2, nConstraintEdges = constraintEdges.length / 2;

    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      ...TANGLED_BASE, maxPoints, optimizeSweeps: 2,
      guardManifoldAlways: true, chordTolMm, chordSteiner: true,
      injectedPoints, constraintEdges, pinInjected: true,
      guardRecoveryManifold: true, recoveryRobust: true, recoverySubdivideCollinear: true,
      recoveryCollinearEps: Number(process.env.PF_GCEPS ?? '1e-9'),
    });
    const ms = Date.now() - t0;
    const ut = mesh.ut, idx = mesh.indices, tris = idx.length / 3;

    // watertight (index) + zeroArea via the sound radial guard
    const nmRaw = auditNonManRaw(idx);
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = 2 * Math.PI * u, z = t * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
    const nmIdx = auditNonManByIndex(xyz, idx);
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx as unknown as Uint32Array, 0.01);

    const rec = {
      stage: 'Q2-BUILD', variant, stepMm, chordTolMm, maxPoints, ms, tris, points: mesh.points, hitBudget: mesh.hitBudget,
      nConstraintVerts, nConstraintEdges,
      recovery: mesh.constraint,
      nonManRaw: nmRaw, nonManIdx: nmIdx, zeroArea: sound.zeroArea,
      soundRadial: { outliers: sound.outliers, max: sound.maxMm, p99: sound.p99 },
    };
    appendFileSync(join(DIR, 'build.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[Q2]', JSON.stringify(rec, null, 2));

    // persist the mesh bins for Q3 (resumable): ut + idx
    writeFileSync(join(DIR, `mesh_${variant}.ut.bin`), Buffer.from(Float64Array.from(ut).buffer));
    writeFileSync(join(DIR, `mesh_${variant}.idx.bin`), Buffer.from((idx as Uint32Array).buffer, (idx as Uint32Array).byteOffset, (idx as Uint32Array).byteLength));
    writeFileSync(join(DIR, `mesh_${variant}.meta.json`), JSON.stringify(rec));

    expect(mesh.constraint?.failed ?? 0).toBeLessThan(nConstraintEdges * 0.05); // KILL: recovery must not collapse
  }, 120 * 60_000);

  // ── Q3 VERDICT: whole-mesh Newton-ruler gate on the conforming mesh ──────────────────────────────────────────
  // PF_GC=verdict PF_GCVARIANT=mid|both. Loads the persisted mesh, runs the SOUND radial guard whole-mesh (fast),
  // then the VALIDATED Newton on the radial-outlier facet worst points (radial is a strict upper bound → green
  // facets are PROVABLY ≤tol, only non-green need Newton). Classifies each true outlier as ON-wall vs OFF-wall.
  it.skipIf(!RUN || process.env.PF_GC !== 'verdict')('Q3 Newton-ruler verdict (off-wall outliers, wall serration)', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const variant = process.env.PF_GCVARIANT ?? 'mid';
    const tol = Number(process.env.PF_GCTOL ?? '0.01');
    const utBuf = readFileSync(join(DIR, `mesh_${variant}.ut.bin`));
    const idxBuf = readFileSync(join(DIR, `mesh_${variant}.idx.bin`));
    const ut = Array.from(new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8));
    const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
    const tris = idx.length / 3;

    // whole-mesh SOUND radial bound (fast) — the prefilter. Every facet ≤tol here is PROVABLY faithful.
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, tol);
    // dense bary for facet worst-point true-3D
    const DENSE: Array<[number, number, number]> = [];
    { const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) DENSE.push([i / n, j / n, (n - i - j) / n]); }
    const lift = (u: number, t: number): [number, number, number] => { const th = 2 * Math.PI * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(ut[2 * i], ut[2 * i + 1]); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const radialBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > DIMS.H) return Infinity; let th = Math.atan2(py, px); if (th < 0) th += 2 * Math.PI; return Math.abs(Math.hypot(px, py) - rA(th, pz)); };

    // collect radial-outlier facets (sound upper bound > tol) and Newton-verify their worst point
    const nF = idx.length / 3;
    const trueDevs: number[] = []; let newtonCalls = 0;
    const outRows: Array<{ uc: number; tc: number; trueDev: number; onWall: number }> = [];
    // wall proximity: distance in (u,t) from the facet centroid to the nearest embedded contour vertex (mid isolevel)
    const lv = wallIsolevels(P);
    const wallVal = variant === 'both' ? [lv.inner, lv.outer] : [lv.mid];
    const onWall = (uc: number, tc: number): boolean => { const av = Math.abs(gyroidVal(uc, tc, P)); return wallVal.some((c) => Math.abs(av - c) < 0.03); };
    let maxTrue = 0, nTrueOut = 0, nOnWall = 0, nOffWall = 0;
    const NW: NewtonOpts = { seedTheta: 0, seedZ: 0, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
    for (let f = 0; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const A = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]] as const, B = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]] as const, C = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]] as const;
      // sound bound over dense bary — skip facet if all ≤ tol (provably faithful)
      let bnd = 0;
      for (const [wa, wb, wc] of DENSE) { const d = radialBound(wa * A[0] + wb * B[0] + wc * C[0], wa * A[1] + wb * B[1] + wc * C[1], wa * A[2] + wb * B[2] + wc * C[2]); if (d > bnd) bnd = d; }
      if (bnd <= tol) continue;
      // Newton the worst point (highest-bound sample) for honest true-3D
      let wbnd = 0, wp: [number, number, number] = A as unknown as [number, number, number];
      for (const [wa, wb, wc] of DENSE) { const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2]; const d = radialBound(px, py, pz); if (d > wbnd) { wbnd = d; wp = [px, py, pz]; } }
      const nr = newtonNearest(rA, DIMS.H, wp[0], wp[1], wp[2], NW); newtonCalls++;
      trueDevs.push(nr.dist);
      if (nr.dist > tol) {
        nTrueOut++; if (nr.dist > maxTrue) maxTrue = nr.dist;
        const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
        const ow = onWall(uc, tc); if (ow) nOnWall++; else nOffWall++;
        if (outRows.length < 4000) outRows.push({ uc: +uc.toFixed(5), tc: +tc.toFixed(5), trueDev: +nr.dist.toFixed(5), onWall: ow ? 1 : 0 });
      }
    }
    trueDevs.sort((x, y) => x - y);
    const pc = (q: number): number => trueDevs.length ? trueDevs[Math.min(trueDevs.length - 1, Math.floor(q * trueDevs.length))] : 0;
    const nmIdx = auditNonManByIndex(xyz, idx);
    const rec = {
      stage: 'Q3-VERDICT', variant, tol, tris,
      soundRadialOutliers: sound.outliers, soundRadialMax: sound.maxMm,
      newtonCalls, nTrueOutliers: nTrueOut, trueMax: +maxTrue.toFixed(5),
      truep50: +pc(0.5).toFixed(5), truep90: +pc(0.9).toFixed(5), truep99: +pc(0.99).toFixed(5),
      nOnWall, nOffWall, offWallFrac: nTrueOut ? +(nOffWall / nTrueOut).toFixed(4) : 0,
      nonManIdx: nmIdx, zeroArea: sound.zeroArea,
    };
    appendFileSync(join(DIR, 'verdict.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[Q3]', JSON.stringify(rec, null, 2));
    // dump outlier scatter for OFF-wall classification
    writeFileSync(join(DIR, `verdict_outliers_${variant}.ndjson`), outRows.map((r) => JSON.stringify(r)).join('\n'));
    expect(tris).toBeGreaterThan(0);
  }, 180 * 60_000);

  it.skipIf(!RUN || process.env.PF_GC !== 'diag')('DIAG: distribution of placement disp + bad-point loci', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const lv = wallIsolevels(P);
    const segs = marchAbsIso(lv.mid, P, { nu: 1200, nt: 1200, polishIters: 40 });
    const conts = linkSegments(segs);
    const disps: number[] = []; const valErrs: number[] = []; const bad: Array<{ u: number; t: number; disp: number; valErr: number; av: number }> = [];
    for (const cont of conts) for (const [u, t] of cont.pts) {
      const r = isoResidual3D(u, t, lv.mid, P, rA, DIMS.H);
      disps.push(r.disp3D); valErrs.push(r.valErr);
      if (r.disp3D > 0.01 || r.valErr > 1e-4) { const v = gyroidVal(u, t, P); bad.push({ u: +u.toFixed(5), t: +t.toFixed(5), disp: +r.disp3D.toFixed(5), valErr: +r.valErr.toExponential(3), av: +Math.abs(v).toFixed(5) }); }
    }
    disps.sort((a, b) => a - b); valErrs.sort((a, b) => a - b);
    const pc = (arr: number[], q: number): number => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
    // eslint-disable-next-line no-console
    console.log('[DIAG disp3D] n=', disps.length, 'p50=', pc(disps, 0.5).toExponential(2), 'p90=', pc(disps, 0.9).toExponential(2), 'p99=', pc(disps, 0.99).toExponential(2), 'p999=', pc(disps, 0.999).toExponential(3), 'max=', pc(disps, 1).toFixed(4), 'nBad(disp>0.01)=', disps.filter((d) => d > 0.01).length);
    // eslint-disable-next-line no-console
    console.log('[DIAG valErr] p99=', pc(valErrs, 0.99).toExponential(2), 'p999=', pc(valErrs, 0.999).toExponential(2), 'max=', pc(valErrs, 1).toExponential(3), 'nBadVal(>1e-4)=', valErrs.filter((v) => v > 1e-4).length);
    // eslint-disable-next-line no-console
    console.log('[DIAG] worst 20 bad points:', JSON.stringify(bad.sort((a, b) => b.disp - a.disp).slice(0, 20)));
    expect(disps.length).toBeGreaterThan(0);
  }, 10 * 60_000);
});
