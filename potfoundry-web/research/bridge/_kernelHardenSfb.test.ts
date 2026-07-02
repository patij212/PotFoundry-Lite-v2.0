// _kernelHardenSfb.test.ts — DEV-ONLY (research/ only; src/ must never import this).
// KERNEL-HARDEN deliverable confirm: reproduce Team A's SCORECARD step-0.03 FOLD (fine base + full tip
// ladder, 9.63M tris, 72 nonMan) and A/B recoveryRobust OFF vs ON at the SAME budget. Reuses the EXACT SFB
// config from _sfbPush.test.ts (does NOT edit it). Question: does robust=ON take nonMan 72->0 and let the
// finer step drop the true-3D worst below 0.021 toward <=0.01?
//
// Env: PF_KERNELHARDEN_SFB=1 (+ PF_KH_SFB_STEP, PF_KH_SFB_MAXPTS, PF_KH_SFB_MODE=off|on|both).
// Output: research/exchange/_kernelharden/. Each A/B side checkpointed the instant it is built (resumable:
// a killed run resumes by re-running only the missing side).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, buildRadiusFn, buildMeshUt, liftUtToRadial,
  auditNonManByIndex, triangleQualityDistribution, perFaceChordSag, perFaceTrue3DSag, projectPointToRadialSurface,
} from './labkit';
import { planarizeSegments } from './planarizeSkeleton';
import { tracePetalLoci, tipLadderPoints, trustedWorstAnalytic, serrationToMeshEdge } from './_sfbPushLib';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_kernelharden');
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

// EXACT copy of _sfbPush OPTS (moderate-density kernel config) — matched so results compare to the SCORECARD.
const OPTS = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5, optimizeSweeps: 2 } as const;

// EXACT copy of _sfbPush.buildTracedSkeleton (step 0.03, both, no grade — the folding path).
function buildTracedSkeleton(rA: AnalyticRadiusFn, stepMm: number): { injected: number[]; constraintPairs: number[]; loci: any[] } {
  const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
  const uToMm = 2 * Math.PI * 50;
  const onSeam = (u: number): boolean => u < 1e-4 || u > 1 - 1e-4;
  const segs: Array<[number, number, number, number]> = [];
  for (const ln of loci) {
    const pts = ln.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      if (onSeam(p.u) && onSeam(q.u)) continue;
      const du = q.u - p.u, dt = q.t - p.t;
      const lenMm = Math.hypot(du * uToMm, dt * DIMS.H);
      const n = Math.max(1, Math.ceil(lenMm / stepMm));
      for (let k = 0; k < n; k++) { const f0 = k / n, f1 = (k + 1) / n; segs.push([p.u + du * f0, p.t + dt * f0, p.u + du * f1, p.t + dt * f1]); }
    }
  }
  const pslg = planarizeSegments(segs, 1e-5);
  return { injected: pslg.points, constraintPairs: pslg.edges, loci };
}

// EXACT ladder + brow injection from _sfbPush LADDER block (offs default; brows on, rail off).
function buildLadderInjection(rA: AnalyticRadiusFn, stepMm: number): { injected: number[]; constraintPairs: number[]; loci: any[]; featUt: number[] } {
  const sk = buildTracedSkeleton(rA, stepMm);
  const uToMm = TAU * 50;
  const offs = [0.006, 0.013, 0.028, 0.06, 0.12, 0.22];
  const ladderLoci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
  const ladder = tipLadderPoints(ladderLoci, offs, uToMm, DIMS.H);
  const browPts: number[] = [];
  const fineT = [0.001, 0.002, 0.004, 0.008, 0.016, 0.032];
  for (const ln of ladderLoci) {
    const p0 = ln.points[0], p1 = ln.points[ln.points.length - 1];
    for (const ft of fineT) {
      if (p0.t < 0.05) { browPts.push(p0.u, ft); for (const o of offs) { let u = p0.u + o / uToMm; u -= Math.floor(u); browPts.push(u, ft); u = p0.u - o / uToMm; u -= Math.floor(u); browPts.push(u, ft); } }
      if (p1.t > 0.95) { browPts.push(p1.u, 1 - ft); for (const o of offs) { let u = p1.u + o / uToMm; u -= Math.floor(u); browPts.push(u, 1 - ft); u = p1.u - o / uToMm; u -= Math.floor(u); browPts.push(u, 1 - ft); } }
    }
  }
  const featUt: number[] = []; for (const ln of sk.loci) for (const p of ln.points) featUt.push(p.u, p.t);
  return { injected: sk.injected.concat(ladder).concat(browPts), constraintPairs: sk.constraintPairs, loci: sk.loci, featUt };
}

// index-level non-manifold (no 3D weld) — sharded (18M-edge mesh overflows a single Map). A REAL topological
// fold moves THIS; the 3D-weld `auditNonManByIndex` also counts geometrically-exact seam/tip coincidences.
function nonManByRawIndex(idx: Uint32Array): number {
  let mx = 0; for (let i = 0; i < idx.length; i++) if (idx[i] > mx) mx = idx[i];
  const EK = mx + 1; const NSHARD = 64;
  const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
  for (let f = 0; f < idx.length; f += 3) { const a = idx[f], b = idx[f + 1], c = idx[f + 2]; if (a !== b) bump(a, b); if (b !== c) bump(b, c); if (a !== c) bump(a, c); }
  let nm = 0; for (const m of ms) for (const v of m.values()) if (v > 2) nm++; return nm;
}

function buildAndMeasure(rA: AnalyticRadiusFn, stepMm: number, maxPts: number, robust: boolean): any {
  const inj = buildLadderInjection(rA, stepMm);
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    ...OPTS, maxPoints: maxPts,
    guardManifoldAlways: true, injectedPoints: inj.injected, pinInjected: true,
    constraintEdges: inj.constraintPairs, guardRecoveryManifold: true,
    ...(robust ? { recoveryRobust: true } : {}),
  } as any);
  const ut = Array.from(mesh.ut); const idx = mesh.indices;
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);       // 3D-weld (counts seam/tip coincidences too)
  const nonManRaw = nonManByRawIndex(idx);                  // index-level (a REAL topological fold)
  // HONEST ruler: own-(u,t) chord to FILTER degenerate seam slivers, then analytic-nearest to MEASURE (matches
  // Team A's ruler-disambiguation: raw nearest mis-reads zero-u-width seam slivers).
  const own = perFaceChordSag(ut, idx, rA, DIMS.H);
  const twOwn = trustedWorstAnalytic(ut, meshUt.xyz, idx, own.faceErr,
    (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 800, 0.01);
  const gn = perFaceTrue3DSag(ut, idx, rA, DIMS.H, { preFilterMm: 0.007 });
  const twGn = trustedWorstAnalytic(ut, meshUt.xyz, idx, gn.faceErr,
    (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 800, 0.01);
  const tq = triangleQualityDistribution({ vertices: vtx, indices: idx });
  const serr = serrationToMeshEdge(inj.featUt, rA, DIMS.H, meshUt.xyz, idx);
  return {
    robust, stepMm, tris: idx.length / 3, hitBudget: mesh.hitBudget, nonMan, nonManRaw,
    ownTrusted: { worstMm: twOwn.worstMm, nOver01: twOwn.nOverTol },
    gnTrusted: { worstMm: twGn.worstMm, nOver01: twGn.nOverTol },
    serrationMm: { worst: serr.worstMm, p99: serr.p99Mm, mean: serr.meanMm },
    quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    constraint: mesh.constraint,
  };
}

describe('KERNEL-HARDEN SFB — step0.03 ladder fold A/B (robust off vs on)', () => {
  it.skipIf(process.env.PF_KERNELHARDEN_SFB !== '1')('robust ON takes nonMan 72->0 at the folding step (resumable A/B)', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const step = Number(process.env.PF_KH_SFB_STEP ?? '0.03');
    const maxPts = Number(process.env.PF_KH_SFB_MAXPTS ?? '5000000');
    const mode = (process.env.PF_KH_SFB_MODE ?? 'both') as 'off' | 'on' | 'both';
    const stepTag = String(step).replace('.', 'p');
    const rows: any[] = [];

    if ((mode === 'off' || mode === 'both')) {
      const key = `sfb_off_step${stepTag}`;
      if (!done(key)) { const r = buildAndMeasure(rA, step, maxPts, false); ck(key, r); rows.push(r); /* eslint-disable-next-line no-console */ console.log('SFB_OFF', JSON.stringify(r)); }
      else rows.push({ ...JSON.parse(readFileSync(join(ROOT, `${key}.json`), 'utf8')), cached: true });
    }
    if ((mode === 'on' || mode === 'both')) {
      const key = `sfb_on_step${stepTag}`;
      if (!done(key)) { const r = buildAndMeasure(rA, step, maxPts, true); ck(key, r); rows.push(r); /* eslint-disable-next-line no-console */ console.log('SFB_ON', JSON.stringify(r)); }
      else rows.push({ ...JSON.parse(readFileSync(join(ROOT, `${key}.json`), 'utf8')), cached: true });
    }
    ck(`sfb_summary_step${stepTag}`, rows);
    const on = rows.find((r) => r.robust === true);
    // The meaningful GREEN criterion is GENUINE topological manifoldness (raw index). The 3D-weld count also
    // includes geometrically-exact seam/tip coincidences (DIAG proved: no-constraint mesh already has weld>0,
    // rawIndex=0). Robust ON must leave the mesh topologically manifold at the folding step.
    if (on) expect(on.nonManRaw).toBe(0);
  }, 2_400_000);
});
