// _ck_close.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-08-CK-CLOSE. Env-gated resumable probes (PF_CK=1). The last un-attempted tangled/weave arm.
// CelticKnot is §V11r-4 RE-CLASSIFIED CLIFF-CLASS (Newton NON-monotone UP 58,403→70,143; worstTrue pinned ~0.295;
// bimodal 37% steep crossing tail + 63% flat). Mission: derive the over/under strand-crossing cliff loci CLOSED-FORM,
// doubled-picket conforming build, Newton verdict; CLOSE to literal Newton-0 at ≤10M OR report a priced frontier.
//
//   PF_CKSTAGE=localize : reproduce the §V11r density mesh, score EVERY facet (radial → Newton on flagged), dump
//                         the outlier (u,t)+slope scatter, and OVERLAY the derived loci — does the derived-locus
//                         band CONTAIN the outliers? which family (column/center/border)? (KILL-1 discriminator).
//   PF_CKSTAGE=extract  : derive the loci + lociOnCliff step-jump validation + doubled-picket contour persist.
//   PF_CKSTAGE=build    : conforming re-mesh with the DOUBLED picket pair (planarized PSLG); recovery/tris/proj/water.
//   PF_CKSTAGE=verdict  : whole-mesh radial prefilter + Newton verdict (on/off-wall split); the CLOSE gate.
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ckParams, ckReliefField, columnWallLines, strandCenterLines, strandBorderLines,
  ckDoubledPickets, contoursToConstraints, lociOnCliff, localUToU, strandX,
  CK_LADDER_U, CK_FINE_LADDER_U, type Contour,
} from './_ckFieldLib';
import { radiusFn, TANGLED_BASE, wholeMeshGuardRadialBound, buildTangled } from './_pf_tangledKernelLib';
import { planarizeMM } from './_pf_planarizeMM';
import { buildInhouseMetricMesh, auditNonManByIndex } from './labkit';
import { newtonNearest, type NewtonOpts } from './_gyroid_truthLib';
import type { StyleDims } from './labkit';

const RUN = process.env.PF_CK === '1';
const ROOT = join(process.cwd(), 'research/exchange/_ck_close');
const DIR = join(ROOT, 'CelticKnot');
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const NW: NewtonOpts = { seedTheta: 0, seedZ: 0, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };

function ensureDir(d: string): void { try { mkdirSync(d, { recursive: true }); } catch { /* exists */ } }

const lift = (rA: (th: number, z: number) => number, u: number, t: number): [number, number, number] => {
  const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z];
};

// Shared doubled-picket conforming build path.
function buildConforming(
  rA: (th: number, z: number) => number, injectedPoints: number[], constraintEdges: number[],
  maxPoints: number, chordTolMm: number,
): ReturnType<typeof buildInhouseMetricMesh> {
  return buildInhouseMetricMesh(rA as never, DIMS.H, {
    ...TANGLED_BASE, maxPoints, optimizeSweeps: 2,
    guardManifoldAlways: true, chordTolMm, chordSteiner: true,
    injectedPoints, constraintEdges, pinInjected: true,
    guardRecoveryManifold: true, recoveryRobust: true, recoverySubdivideCollinear: true,
    recoveryCollinearEps: Number(process.env.PF_CKEPS ?? '1e-9'),
  });
}

// Newton verdict on the radial-flagged population of a mesh (mirrors the Gyroid/BW Q3 recipe) + wall-slope + scatter.
function newtonVerdict(
  rA: (th: number, z: number) => number, ut: number[], idx: Uint32Array, tol: number,
  onWall: (uc: number, tc: number) => boolean, sampleN: number, dumpScatter?: string,
): Record<string, number> {
  const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, ut[2 * i], ut[2 * i + 1]); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const DENSE: Array<[number, number, number]> = [];
  { const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) DENSE.push([i / n, j / n, (n - i - j) / n]); }
  const radialBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > DIMS.H) return Infinity; let th = Math.atan2(py, px); if (th < 0) th += TAU; return Math.abs(Math.hypot(px, py) - rA(th, pz)); };
  const nF = idx.length / 3;
  const radOut: Array<{ wbnd: number; wp: [number, number, number]; uc: number; tc: number }> = [];
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const A = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]] as const, B = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]] as const, C = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]] as const;
    let wbnd = 0, wp: [number, number, number] = [A[0], A[1], A[2]];
    for (const [wa, wb, wc] of DENSE) { const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2]; const d = radialBound(px, py, pz); if (d > wbnd) { wbnd = d; wp = [px, py, pz]; } }
    if (wbnd <= tol) continue;
    const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    radOut.push({ wbnd, wp, uc, tc });
  }
  const nRadOut = radOut.length;
  radOut.sort((x, y) => y.wbnd - x.wbnd);
  const stride = Math.max(1, Math.floor(nRadOut / sampleN));
  const sampled = radOut.filter((_, i) => i % stride === 0).slice(0, sampleN);
  const trueDevs: number[] = []; let nTrueOut = 0, maxTrue = 0, nOnWall = 0, nOffWall = 0;
  const scatter: string[] = [];
  let worstUt: [number, number, number] = [0, 0, 0];
  for (const s of sampled) {
    const nr = newtonNearest(rA as never, DIMS.H, s.wp[0], s.wp[1], s.wp[2], NW);
    trueDevs.push(nr.dist);
    // wall slope proxy: |∇h| in (u,t) at the sample (radial finite-diff), a steep>1 tell for cliff vs density.
    const h = (uu: number, tt: number): number => { const th = TAU * ((uu % 1 + 1) % 1), z = tt * DIMS.H; return rA(th, z); };
    const du = 4e-4, dt = 4e-4;
    const gh = Math.hypot((h(s.uc + du, s.tc) - h(s.uc - du, s.tc)) / (2 * du), (h(s.uc, s.tc + dt) - h(s.uc, s.tc - dt)) / (2 * dt));
    if (nr.dist > tol) { nTrueOut++; if (nr.dist > maxTrue) { maxTrue = nr.dist; worstUt = [s.uc, s.tc, nr.dist]; } if (onWall(s.uc, s.tc)) nOnWall++; else nOffWall++; }
    if (dumpScatter && scatter.length < 4000) scatter.push(JSON.stringify({ uc: +s.uc.toFixed(5), tc: +s.tc.toFixed(5), dev: +nr.dist.toFixed(5), slope: +gh.toFixed(3), onWall: onWall(s.uc, s.tc) ? 1 : 0 }));
  }
  if (dumpScatter) writeFileSync(dumpScatter, scatter.join('\n'));
  const trueOutFrac = sampled.length ? nTrueOut / sampled.length : 0;
  const scaledTrueOut = Math.round(trueOutFrac * nRadOut);
  trueDevs.sort((x, y) => x - y);
  const pc = (q: number): number => trueDevs.length ? trueDevs[Math.min(trueDevs.length - 1, Math.floor(q * trueDevs.length))] : 0;
  return {
    nRadOutliers: nRadOut, nSampled: sampled.length, nTrueOutInSample: nTrueOut, scaledTrueOutliers: scaledTrueOut,
    trueMax: +maxTrue.toFixed(5), truep50: +pc(0.5).toFixed(5), truep90: +pc(0.9).toFixed(5), truep99: +pc(0.99).toFixed(5),
    nOnWall, nOffWall, offWallFrac: nTrueOut ? +(nOffWall / nTrueOut).toFixed(4) : 0,
    worstUc: +worstUt[0].toFixed(4), worstTc: +worstUt[1].toFixed(4),
  };
}

// on-wall test: a facet centroid is ON-wall if within band of ANY derived cliff locus (column | strand-center |
// strand-border), computed by sampling the loci onto a (u,t) hash grid once.
function buildOnWall(p: ReturnType<typeof ckParams>, band: number): (uc: number, tc: number) => boolean {
  const cell = Math.max(band, 2e-3);
  const grid = new Set<string>();
  const key = (u: number, t: number): string => `${Math.round(((u % 1 + 1) % 1) / cell)}_${Math.round(t / cell)}`;
  const stamp = (lines: Array<{ pts: Array<[number, number]> }>): void => {
    for (const L of lines) for (const [u, t] of L.pts) {
      // stamp a small neighborhood so band-radius membership is O(1)
      const r = Math.ceil(band / cell);
      for (let du = -r; du <= r; du++) for (let dt = -r; dt <= r; dt++) grid.add(`${Math.round(((u % 1 + 1) % 1) / cell) + du}_${Math.round(t / cell) + dt}`);
    }
  };
  stamp(columnWallLines(p, 400)); stamp(strandCenterLines(p, 800)); stamp(strandBorderLines(p, 800));
  return (uc: number, tc: number): boolean => grid.has(key(uc, tc));
}

describe('E-2026-07-08-CK-CLOSE', () => {
  // ── STAGE localize: reproduce the §V11r density mesh, score, dump outlier scatter + loci overlay ─────────────────
  it.skipIf(!RUN || process.env.PF_CKSTAGE !== 'localize')('CK localize outliers vs derived loci', () => {
    ensureDir(DIR);
    const rA = radiusFn('CelticKnot', DIMS);
    // §V11r-4 base b0.008/s224 anchor (the finest converged density point: tris 1.30M, Newton 70,143).
    const chordTolMm = Number(process.env.PF_CKCHORD ?? '0.02');
    const tolMm = Number(process.env.PF_CKTOL ?? '0.008');
    const sizeRes = Number(process.env.PF_CKSIZERES ?? '224');
    const maxPoints = Number(process.env.PF_CKMAX ?? '3000000');
    const sampleN = Number(process.env.PF_CKSAMPLE ?? '2500');
    const t0 = Date.now();
    const b = buildTangled('CelticKnot', DIMS, { chordTolMm, tolMm, sizeRes, maxPoints, optimizeSweeps: 2 });
    const buildMs = Date.now() - t0;
    const ut = b.ut, idx = b.idx as Uint32Array;
    // persist so verdict/extract can resume without rebuild
    writeFileSync(join(DIR, 'mesh_base.ut.bin'), Buffer.from(Float64Array.from(ut).buffer));
    writeFileSync(join(DIR, 'mesh_base.idx.bin'), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
    const p = ckParams();
    const onWall = buildOnWall(p, Number(process.env.PF_CKWALLBAND ?? '0.006'));
    const verdict = newtonVerdict(rA, ut, idx, 0.01, onWall, sampleN, join(DIR, 'scatter_localize.ndjson'));
    const rec = {
      stage: 'CK-LOCALIZE', chordTolMm, tolMm, sizeRes, maxPoints, buildMs, tris: b.tris, points: b.points, hitBudget: b.hitBudget,
      projFullPot: b.tris * 2, ...verdict,
    };
    appendFileSync(join(DIR, 'localize.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[CK-LOCALIZE]', JSON.stringify(rec, null, 2));
    expect(b.tris).toBeGreaterThan(0);
  }, 90 * 60_000);

  // ── STAGE extract: derive loci + step-jump validation + doubled-picket contour persist ──────────────────────────
  it.skipIf(!RUN || process.env.PF_CKSTAGE !== 'extract')('CK extract + validate cliff loci', () => {
    ensureDir(DIR);
    const rA = radiusFn('CelticKnot', DIMS);
    const p = ckParams();
    const steps = lociOnCliff(p);
    const stepMm = Number(process.env.PF_CKSTEP ?? '0.12');
    const fine = process.env.PF_CKFINE === '1';
    const ladSc = Number(process.env.PF_CKLADSC ?? '1');
    const offsetsU = (fine ? CK_FINE_LADDER_U : CK_LADDER_U).map((o) => o * ladSc);
    const includeColumns = process.env.PF_CKNOCOL !== '1';
    const includeCenters = process.env.PF_CKNOCENTER !== '1';
    const includeBorders = process.env.PF_CKNOBORDER !== '1';
    const doubled = ckDoubledPickets(p, rA, DIMS.H, { offsetsU, stepMm, includeColumns, includeCenters, includeBorders });
    const nPts = doubled.contours.reduce((a, c) => a + c.pts.length, 0);
    const rec = {
      stage: 'CK-EXTRACT', params: p, stepJumps: steps, offsetsU, stepMm,
      families: { includeColumns, includeCenters, includeBorders },
      doubled: { nContours: doubled.contours.length, nColumn: doubled.nColumn, nCenter: doubled.nCenter, nBorder: doubled.nBorder, nPts },
    };
    appendFileSync(join(DIR, 'extract.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[CK-EXTRACT]', JSON.stringify(rec, null, 2));
    const ser = (cs: Contour[]): number[][][] => cs.map((c) => c.pts);
    writeFileSync(join(DIR, 'contours.json'), JSON.stringify({ doubled: ser(doubled.contours) }));
    writeFileSync(join(DIR, 'scatter_loci.ndjson'),
      doubled.contours.flatMap((c) => c.pts.map(([u, t]) => JSON.stringify({ uc: +u.toFixed(5), tc: +t.toFixed(5), dev: 0.02 }))).join('\n'));
    // KILL(1): at least ONE strand family must sit on a genuine step (jumpFrac high, maxStepJump > 0.2mm) — the
    // over/under crossing cliff. Column walls may be weaker; the crossing tail is the §V11r-4 killer population.
    const anyStep = steps.some((s) => s.maxStepJump > 0.2 && s.jumpFrac > 0.1);
    expect(anyStep).toBe(true);
  }, 20 * 60_000);

  // ── STAGE build: doubled-picket conforming build (planarized PSLG) ──────────────────────────────────────────────
  it.skipIf(!RUN || process.env.PF_CKSTAGE !== 'build')('CK conforming build', () => {
    ensureDir(DIR);
    const rA = radiusFn('CelticKnot', DIMS);
    const maxPoints = Number(process.env.PF_CKMAX ?? '3000000');
    const chordTolMm = Number(process.env.PF_CKCHORD ?? '0.004');
    const raw = JSON.parse(readFileSync(join(DIR, 'contours.json'), 'utf8')) as { doubled: number[][][] };
    const contours: Contour[] = raw.doubled.map((pts) => ({ pts: pts as [number, number][] }));
    const flat = contoursToConstraints(contours);
    const SCALE = Number(process.env.PF_CKPSCALE ?? '100');
    const scaled = flat.injectedPoints.map((v) => v * SCALE);
    const edgePairs: Array<[number, number]> = [];
    for (let i = 0; i < flat.constraintEdges.length; i += 2) edgePairs.push([flat.constraintEdges[i], flat.constraintEdges[i + 1]]);
    const pl = planarizeMM(scaled, edgePairs);
    const injectedPoints = pl.pts.map((v) => v / SCALE);
    const constraintEdges: number[] = [];
    for (const e of pl.edges) constraintEdges.push(e[0], e[1]);
    const nConstraintVerts = injectedPoints.length / 2, nConstraintEdges = constraintEdges.length / 2;

    const t0 = Date.now();
    const mesh = buildConforming(rA, injectedPoints, constraintEdges, maxPoints, chordTolMm);
    const ms = Date.now() - t0;
    const ut = mesh.ut, idx = mesh.indices as Uint32Array, tris = idx.length / 3;
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, ut[2 * i], ut[2 * i + 1]); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const nmIdx = auditNonManByIndex(xyz, idx);
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, 0.01);
    const projFullPot = tris * 2;
    const failed = mesh.constraint?.failed ?? 0;
    const recovery = nConstraintEdges ? +(100 * (1 - failed / nConstraintEdges)).toFixed(2) : 100;
    const rec = {
      stage: 'CK-BUILD', maxPoints, chordTolMm, ms, tris, points: mesh.points, hitBudget: mesh.hitBudget,
      planarize: { addedVerts: pl.addedVerts, residual: pl.residual }, nConstraintVerts, nConstraintEdges,
      recovery, recoveryRaw: mesh.constraint, nonManIdx: nmIdx, zeroArea: sound.zeroArea, projFullPot,
      soundRadial: { outliers: sound.outliers, max: sound.maxMm, p99: sound.p99 },
    };
    appendFileSync(join(DIR, 'build.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[CK-BUILD]', JSON.stringify(rec, null, 2));
    const tag = process.env.PF_CKTAG ?? 'doubled';
    writeFileSync(join(DIR, `mesh_${tag}.ut.bin`), Buffer.from(Float64Array.from(ut).buffer));
    writeFileSync(join(DIR, `mesh_${tag}.idx.bin`), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
    writeFileSync(join(DIR, `mesh_${tag}.meta.json`), JSON.stringify(rec));
    // KILL(2): recovery ≥ 90% (failed < 10%); KILL(3): residualCrossings 0 (planarize residual)
    expect(pl.residual).toBe(0);
    expect(failed).toBeLessThan(nConstraintEdges * 0.1);
  }, 120 * 60_000);

  // ── STAGE verdict: Newton verdict — the CLOSE gate ──────────────────────────────────────────────────────────────
  it.skipIf(!RUN || process.env.PF_CKSTAGE !== 'verdict')('CK Newton verdict', () => {
    ensureDir(DIR);
    const rA = radiusFn('CelticKnot', DIMS);
    const tag = process.env.PF_CKTAG ?? 'doubled';
    const tol = Number(process.env.PF_CKTOL ?? '0.01');
    const sampleN = Number(process.env.PF_CKSAMPLE ?? '2500');
    const utBuf = readFileSync(join(DIR, `mesh_${tag}.ut.bin`));
    const idxBuf = readFileSync(join(DIR, `mesh_${tag}.idx.bin`));
    const ut = Array.from(new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8));
    const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
    const p = ckParams();
    const onWall = buildOnWall(p, Number(process.env.PF_CKWALLBAND ?? '0.006'));
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, ut[2 * i], ut[2 * i + 1]); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, tol);
    const nm = auditNonManByIndex(xyz, idx);
    const verdict = newtonVerdict(rA, ut, idx, tol, onWall, sampleN, join(DIR, `scatter_${tag}.ndjson`));
    const rec = {
      stage: 'CK-VERDICT', tag, tol, tris: idx.length / 3,
      soundRadialOutliers: sound.outliers, soundRadialMax: sound.maxMm, soundRadialP99: sound.p99,
      ...verdict, nonManIdx: nm, zeroArea: sound.zeroArea,
    };
    appendFileSync(join(DIR, 'verdict.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[CK-VERDICT]', JSON.stringify(rec, null, 2));
    expect(idx.length).toBeGreaterThan(0);
  }, 180 * 60_000);
});
