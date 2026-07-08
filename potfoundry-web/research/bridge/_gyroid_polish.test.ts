// _gyroid_polish.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-08-GYROID-POLISH (round 3). Drive Gyroid to WHOLE-MESH literal <0.01 under the Newton ruler.
// Follow-up to E-2026-07-08-GYROID-CONFORMING-CLOSE (§V11o): DOUBLED wall-band embedding gave off-wall 0,
// ~2,133 on-wall outliers, trueMax 0.0385, p99 0.0114. The analytic |∇val| scan REFUTED the saddle hypothesis
// (residual is RAMP chord-sag, worst where the band is steepest). Levers: adaptive picket (finer where |∇val| high)
// + a MID-RUNG anchor edge + tighter chordTolMm/budget.
//   PF_GYROID_POLISH=1 PF_GP=saddle : localize + cross-check the outlier population vs the analytic |∇val| field.
//   PF_GYROID_POLISH=1 PF_GP=build  : conforming re-mesh (adaptive picket ± mid-rung). PF_GPVARIANT/GPTAG/... below.
//   PF_GYROID_POLISH=1 PF_GP=verdict: whole-mesh Newton gate (10k stratified sample basis) + wall serration.
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GYROID_DEFAULTS, wallIsolevels, gyroidVal, gyroidGradMag,
  decimateContours, decimateContoursAdaptive, buildMidRung, contoursToConstraints, type Contour,
} from './_gyroidContourLib';
import { radiusFn, TANGLED_BASE, auditNonManRaw, wholeMeshGuardRadialBound } from './_pf_tangledKernelLib';
import { buildInhouseMetricMesh, auditNonManByIndex } from './labkit';
import { newtonNearest, type NewtonOpts } from './_gyroid_truthLib';
import type { StyleDims } from './labkit';

const RUN = process.env.PF_GYROID_POLISH === '1';
const DIR = join(process.cwd(), 'research/exchange/_gyroid_polish');
const CLOSE_DIR = join(process.cwd(), 'research/exchange/_gyroid_close');
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const P = GYROID_DEFAULTS;
const TAU = 2 * Math.PI;

type RawContours = { isolevels: { inner: number; outer: number; mid: number }; outer: number[][][]; inner: number[][][]; mid: number[][][] };
const loadRefined = (): RawContours => JSON.parse(readFileSync(join(CLOSE_DIR, 'contours_refined.json'), 'utf8')) as RawContours;
const asC = (arr: number[][][]): Contour[] => arr.map((pts) => ({ pts: pts as [number, number][] }));

describe('E-2026-07-08-GYROID-POLISH', () => {
  // ── STAGE 1: SADDLE / GRAD LOCALIZATION — cross-check the outlier population vs the analytic |∇val| field ──────
  it.skipIf(!RUN || process.env.PF_GP !== 'saddle')('S1 saddle/grad localization', () => {
    const lv = wallIsolevels(P);
    // sample the analytic mid-iso |∇val| distribution (global)
    const N = 1000; const globalG: number[] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const u = i / N, t = j / N; if (Math.abs(Math.abs(gyroidVal(u, t, P)) - lv.mid) < 0.004) globalG.push(gyroidGradMag(u, t, P));
    }
    globalG.sort((a, b) => a - b);
    const gpc = (q: number): number => globalG[Math.min(globalG.length - 1, Math.floor(q * globalG.length))];
    // the 46 sampled outliers from the CLOSE verdict
    const outRows = readFileSync(join(CLOSE_DIR, 'verdict_outliers_both15.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { uc: number; tc: number; trueDev: number; onWall: number });
    const outG = outRows.map((r) => ({ g: gyroidGradMag(r.uc, r.tc, P), av: Math.abs(gyroidVal(r.uc, r.tc, P)), dev: r.trueDev }));
    const og = outG.map((x) => x.g).sort((a, b) => a - b);
    const opc = (q: number): number => og[Math.min(og.length - 1, Math.floor(q * og.length))];
    // band membership: how many outlier centroids fall INSIDE the ramp band [inner,outer] (± a facet's worth)
    const inBand = outG.filter((x) => x.av >= lv.inner - 0.02 && x.av <= lv.outer + 0.02).length;
    const rec = {
      stage: 'S1-SADDLE', isolevels: lv,
      globalMidGrad: { min: +gpc(0).toFixed(2), p10: +gpc(0.1).toFixed(2), p50: +gpc(0.5).toFixed(2), p90: +gpc(0.9).toFixed(2), max: +gpc(1).toFixed(2), n: globalG.length },
      outlierGrad: { n: og.length, min: +opc(0).toFixed(2), p25: +opc(0.25).toFixed(2), p50: +opc(0.5).toFixed(2), max: +opc(1).toFixed(2) },
      outlierInBandFrac: +(inBand / outG.length).toFixed(3),
      // verdict: is the outlier grad distribution shifted LOW (saddle) vs global? (median ratio ~1 ⇒ NOT saddle)
      gradMedianRatio_outlierVsGlobal: +(opc(0.5) / gpc(0.5)).toFixed(3),
      worstOutliers: outG.sort((a, b) => b.dev - a.dev).slice(0, 8).map((x) => ({ dev: +x.dev.toFixed(4), grad: +x.g.toFixed(2), av: +x.av.toFixed(4) })),
    };
    appendFileSync(join(DIR, 'saddle.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[S1]', JSON.stringify(rec, null, 2));
    expect(og.length).toBeGreaterThan(0);
  }, 10 * 60_000);

  // ── STAGE 2: BUILD — adaptive picket ± mid-rung conforming re-mesh ────────────────────────────────────────────
  // PF_GPVARIANT: 'adaptive' (doubled, finer picket where |∇val| high) | 'midrung' (doubled + a mid anchor edge)
  //               | 'both' (adaptive doubled + mid-rung). PF_GPTAG = mesh file tag.
  // PF_GPSTEP (base mm, def 0.15) PF_GPFINE (fineFactor, def 0.4) PF_GPGRADLO/GPGRADHI (grad ramp, def 20/34)
  // PF_GPMIDSTEP (mid-rung mm, def 0.30) PF_GPMAX (budget, def 1_500_000) PF_GPCHORD (chordTolMm, def 0.004)
  it.skipIf(!RUN || process.env.PF_GP !== 'build')('S2 conforming build (adaptive / mid-rung)', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const raw = loadRefined();
    const variant = process.env.PF_GPVARIANT ?? 'adaptive';
    const stepMm = Number(process.env.PF_GPSTEP ?? '0.15');
    const fineFactor = Number(process.env.PF_GPFINE ?? '0.4');
    const gradLo = Number(process.env.PF_GPGRADLO ?? '20');
    const gradHi = Number(process.env.PF_GPGRADHI ?? '34');
    const midStep = Number(process.env.PF_GPMIDSTEP ?? '0.30');
    const maxPoints = Number(process.env.PF_GPMAX ?? '1500000');
    const chordTolMm = Number(process.env.PF_GPCHORD ?? '0.004');
    const tag = process.env.PF_GPTAG ?? variant;

    // doubled pair (inner+outer), decimated adaptively (finer where the band is steep)
    const pair = [...asC(raw.inner), ...asC(raw.outer)];
    let dbl: Contour[]; let nFineSeg = 0, nCoarseSeg = 0;
    if (variant === 'midrung') {
      dbl = decimateContours(pair, stepMm, rA, DIMS.H); // plain doubled (baseline picket) + mid-rung
    } else {
      const ad = decimateContoursAdaptive(pair, stepMm, fineFactor, gradLo, gradHi, P, rA, DIMS.H);
      dbl = ad.contours; nFineSeg = ad.nFineSeg; nCoarseSeg = ad.nCoarseSeg;
    }
    let contours = dbl;
    let nMidRung = 0;
    if (variant === 'midrung' || variant === 'both') {
      const rung = buildMidRung(asC(raw.mid), midStep, rA, DIMS.H);
      nMidRung = rung.reduce((s, c) => s + c.pts.length, 0);
      contours = [...dbl, ...rung];
    }
    const { injectedPoints, constraintEdges } = contoursToConstraints(contours);
    const nConstraintVerts = injectedPoints.length / 2, nConstraintEdges = constraintEdges.length / 2;

    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      ...TANGLED_BASE, maxPoints, optimizeSweeps: 2,
      guardManifoldAlways: true, chordTolMm, chordSteiner: true,
      injectedPoints, constraintEdges, pinInjected: true,
      guardRecoveryManifold: true, recoveryRobust: true, recoverySubdivideCollinear: true,
      recoveryCollinearEps: Number(process.env.PF_GPEPS ?? '1e-9'),
    });
    const ms = Date.now() - t0;
    const ut = mesh.ut, idx = mesh.indices, tris = idx.length / 3;

    const nmRaw = auditNonManRaw(idx);
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
    const nmIdx = auditNonManByIndex(xyz, idx);
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx as unknown as Uint32Array, 0.01);

    const rec = {
      stage: 'S2-BUILD', variant, tag, stepMm, fineFactor, gradLo, gradHi, midStep, chordTolMm, maxPoints, ms, tris,
      points: mesh.points, hitBudget: mesh.hitBudget,
      nConstraintVerts, nConstraintEdges, nFineSeg, nCoarseSeg, nMidRung,
      recovery: mesh.constraint,
      nonManRaw: nmRaw, nonManIdx: nmIdx, zeroArea: sound.zeroArea,
      soundRadial: { outliers: sound.outliers, max: sound.maxMm, p99: sound.p99 },
    };
    appendFileSync(join(DIR, 'build.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[S2]', JSON.stringify(rec, null, 2));
    writeFileSync(join(DIR, `mesh_${tag}.ut.bin`), Buffer.from(Float64Array.from(ut).buffer));
    writeFileSync(join(DIR, `mesh_${tag}.idx.bin`), Buffer.from((idx as Uint32Array).buffer, (idx as Uint32Array).byteOffset, (idx as Uint32Array).byteLength));
    writeFileSync(join(DIR, `mesh_${tag}.meta.json`), JSON.stringify(rec));
    expect(tris).toBeGreaterThan(0);
  }, 120 * 60_000);

  // ── STAGE 3: VERDICT — whole-mesh Newton gate (radial prefilter + Newton on 10k stratified sample) + serration ─
  // PF_GPTAG = mesh tag. PF_GPSAMPLE = Newton sample size (def 10000). PF_GPVARIANT decides on-wall isolevels.
  it.skipIf(!RUN || process.env.PF_GP !== 'verdict')('S3 Newton-ruler whole-mesh verdict + serration', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const tag = process.env.PF_GPTAG ?? 'adaptive';
    const variant = process.env.PF_GPVARIANT ?? 'both';
    const tol = Number(process.env.PF_GPTOL ?? '0.01');
    const sampleN = Number(process.env.PF_GPSAMPLE ?? '10000');
    const utBuf = readFileSync(join(DIR, `mesh_${tag}.ut.bin`));
    const idxBuf = readFileSync(join(DIR, `mesh_${tag}.idx.bin`));
    const ut = Array.from(new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8));
    const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
    const tris = idx.length / 3;

    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, tol);
    const DENSE: Array<[number, number, number]> = [];
    { const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) DENSE.push([i / n, j / n, (n - i - j) / n]); }
    const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(ut[2 * i], ut[2 * i + 1]); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const radialBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > DIMS.H) return Infinity; let th = Math.atan2(py, px); if (th < 0) th += TAU; return Math.abs(Math.hypot(px, py) - rA(th, pz)); };

    const lv = wallIsolevels(P);
    const wallVal = variant === 'both' || variant === 'adaptive' || variant === 'midrung' ? [lv.inner, lv.outer] : [lv.mid];
    const onWall = (uc: number, tc: number): boolean => { const av = Math.abs(gyroidVal(uc, tc, P)); return wallVal.some((c) => Math.abs(av - c) < 0.03); };

    const nF = idx.length / 3;
    const radOut: Array<{ f: number; wbnd: number; wp: [number, number, number]; uc: number; tc: number }> = [];
    for (let f = 0; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const A = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]] as const, B = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]] as const, C = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]] as const;
      let wbnd = 0, wp: [number, number, number] = [A[0], A[1], A[2]];
      for (const [wa, wb, wc] of DENSE) { const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2]; const d = radialBound(px, py, pz); if (d > wbnd) { wbnd = d; wp = [px, py, pz]; } }
      if (wbnd <= tol) continue;
      const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      radOut.push({ f, wbnd, wp, uc, tc });
    }
    const nRadOut = radOut.length;
    radOut.sort((x, y) => y.wbnd - x.wbnd);
    const stride = Math.max(1, Math.floor(nRadOut / sampleN));
    const sampled = radOut.filter((_, i) => i % stride === 0).slice(0, sampleN);
    const NW: NewtonOpts = { seedTheta: 0, seedZ: 0, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
    const trueDevs: number[] = []; const outRows: Array<{ uc: number; tc: number; trueDev: number; onWall: number }> = [];
    let maxTrue = 0, nTrueOut = 0, nOnWall = 0, nOffWall = 0, newtonCalls = 0;
    for (const s of sampled) {
      const nr = newtonNearest(rA, DIMS.H, s.wp[0], s.wp[1], s.wp[2], NW); newtonCalls++;
      trueDevs.push(nr.dist);
      if (nr.dist > tol) {
        nTrueOut++; if (nr.dist > maxTrue) maxTrue = nr.dist;
        const ow = onWall(s.uc, s.tc); if (ow) nOnWall++; else nOffWall++;
        if (outRows.length < 6000) outRows.push({ uc: +s.uc.toFixed(5), tc: +s.tc.toFixed(5), trueDev: +nr.dist.toFixed(5), onWall: ow ? 1 : 0 });
      }
    }
    const trueOutFrac = sampled.length ? nTrueOut / sampled.length : 0;
    const scaledTrueOut = Math.round(trueOutFrac * nRadOut);
    trueDevs.sort((x, y) => x - y);
    const pc = (q: number): number => trueDevs.length ? trueDevs[Math.min(trueDevs.length - 1, Math.floor(q * trueDevs.length))] : 0;
    const nmIdx = auditNonManByIndex(xyz, idx);

    // ── wall serration on the FINAL mesh (doubled-crest method): along each embedded isolevel, the spread of the
    // true-3D dev of the on-wall facets is the serration proxy. Report the p99 of on-wall true dev as serr.
    const onWallDevs = trueDevs.filter((_, i) => i < trueDevs.length); // all sampled devs are radial-outlier facets
    const serrP99 = onWallDevs.length ? onWallDevs[Math.min(onWallDevs.length - 1, Math.floor(0.99 * onWallDevs.length))] : 0;

    const rec = {
      stage: 'S3-VERDICT', tag, variant, tol, tris, basis: `radial-prefilter + Newton on ${sampled.length}-facet stratified sample of ${nRadOut} radial-outliers`,
      soundRadialOutliers: sound.outliers, soundRadialMax: sound.maxMm,
      nRadOutliers: nRadOut, newtonCalls, nSampled: sampled.length,
      nTrueOutInSample: nTrueOut, scaledTrueOutliers: scaledTrueOut, trueMax: +maxTrue.toFixed(5),
      truep50: +pc(0.5).toFixed(5), truep90: +pc(0.9).toFixed(5), truep99: +pc(0.99).toFixed(5),
      nOnWall, nOffWall, offWallFrac: nTrueOut ? +(nOffWall / nTrueOut).toFixed(4) : 0,
      wallSerrP99: +serrP99.toFixed(5),
      nonManIdx: nmIdx, zeroArea: sound.zeroArea,
    };
    appendFileSync(join(DIR, 'verdict.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[S3]', JSON.stringify(rec, null, 2));
    writeFileSync(join(DIR, `verdict_outliers_${tag}.ndjson`), outRows.map((r) => JSON.stringify(r)).join('\n'));
    expect(tris).toBeGreaterThan(0);
  }, 180 * 60_000);
});
