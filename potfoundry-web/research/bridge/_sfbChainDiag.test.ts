// _sfbChainDiag.test.ts — DEV-ONLY (research/ only). E-2026-07-02-SFB-CHAIN Stage 0 DIAGNOSTIC.
// Builds SFB@1 with the traced ridge constraint edges (same recipe as E-SFB-PUSH), but routes recovery
// through the DIAGNOSTIC hook (_sfbChainRecovery.recoverAndLockEdgesDiag) which CLASSIFIES each recoveryFailed
// as CAP-LIMITED (stall / maxFlips — Lever 3 fixes) vs GEOMETRY-BLOCKED (collinear/locked — needs Lever 1/2)
// and also sweeps stallCap / maxFlipsPerEdge to see whether the failed chains COMPLETE with higher caps.
//
// The cheapest discriminator: decides which lever to spend build-hours on BEFORE the expensive rebuild.
// ISOLATION: NEW files only (_sfbChain*). Reuses _sfbPushLib (read-only) + labkit + planarizeSkeleton.
// Does NOT touch _sfbPush*/_kernelHarden*/_breadth*/src/. Output dir research/exchange/_sfbchain/. Env PF_SFBCHAIN*.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh, buildRadiusFn, buildMeshUt, liftUtToRadial, auditNonManByIndex } from './labkit';
import { tracePetalLoci, tipLadderPoints } from './_sfbPushLib';
import { planarizeSegments } from './planarizeSkeleton';
import { recoverAndLockEdgesDiag } from './_sfbChainRecovery';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_sfbchain');
const OPTS = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;

const ckptDir = (): string => { mkdirSync(ROOT, { recursive: true }); return ROOT; };
const ckpt = (name: string, obj: unknown): void => { writeFileSync(join(ckptDir(), `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

// ─── replicate _sfbPush buildTracedSkeleton (I read it; it is not exported — re-implement to stay isolated) ───
function buildTracedSkeleton(rA: AnalyticRadiusFn, stepMm: number): { injected: number[]; constraintPairs: number[]; loci: ReturnType<typeof tracePetalLoci> } {
  const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
  const uToMm = TAU * 50;
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
      for (let k = 0; k < n; k++) {
        const f0 = k / n, f1 = (k + 1) / n;
        segs.push([p.u + du * f0, p.t + dt * f0, p.u + du * f1, p.t + dt * f1]);
      }
    }
  }
  const pslg = planarizeSegments(segs, 1e-5);
  return { injected: pslg.points, constraintPairs: pslg.edges, loci };
}

// tip ladder + brows exactly as _sfbPush BLOCK 5 (the BEST recipe), so the diagnostic sees the same picket.
function buildFullInjection(rA: AnalyticRadiusFn, stepMm: number, offs: number[]): { injected: number[]; constraintPairs: number[] } {
  const sk = buildTracedSkeleton(rA, stepMm);
  const uToMm = TAU * 50;
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
  return { injected: sk.injected.concat(ladder).concat(browPts), constraintPairs: sk.constraintPairs };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — CLASSIFY the recovery failures + sweep caps (does raising caps complete the chains?)
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-CHAIN DIAG — classify recovery failures + cap sweep', () => {
  it.skipIf(process.env.PF_SFBCHAIN_DIAG !== '1')('classifies failures and tests raised caps (resumable, ONE cap per run)', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const stepMm = Number(process.env.PF_SFBCHAIN_STEP ?? '0.03');
    const maxPts = Number(process.env.PF_SFBCHAIN_MAXPTS ?? '2500000');
    const offs = (process.env.PF_SFBCHAIN_OFFS ?? '0.004,0.009,0.018,0.04,0.09,0.18').split(',').map(Number);
    // ONE cap per run (env PF_SFBCHAIN_STALL / PF_SFBCHAIN_MAXFLIPS) so a slow raised-cap run is isolated +
    // resumable. Default = shipped baseline (4, 64).
    const stallCap = Number(process.env.PF_SFBCHAIN_STALL ?? '4');
    const maxFlips = Number(process.env.PF_SFBCHAIN_MAXFLIPS ?? '64');
    const caps: Array<[number, number]> = [[stallCap, maxFlips]];
    const stepTag = String(stepMm).replace('.', 'p');

    const inj = buildFullInjection(rA, stepMm, offs);
    console.log(`injection: ${inj.injected.length / 2} pts, ${inj.constraintPairs.length / 2} constraint edges`);

    for (const [stallCap, maxFlips] of caps) {
      const name = `diag_step${stepTag}_s${stallCap}_m${maxFlips}`;
      if (done(name)) { console.log(`SKIP ${name}`); continue; }
      let diagStats: any = null;
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
        ...OPTS, maxPoints: maxPts,
        guardManifoldAlways: true, injectedPoints: inj.injected, pinInjected: true,
        constraintEdges: inj.constraintPairs,
        recoveryHook: (tris, heF, uv, cverts) => {
          const r = recoverAndLockEdgesDiag(tris, heF, uv, cverts, maxFlips, stallCap);
          diagStats = {
            requested: cverts.length / 2, alreadyPresent: r.alreadyPresent, recovered: r.recovered, failed: r.recoveryFailed, flips: r.flips,
            failStall: r.failStall, failMaxFlips: r.failMaxFlips, failNoConvex: r.failNoConvex, failBlocked: r.failBlocked,
            failChainLenMax: r.failChainLenMax, failChainLenAvg: r.recoveryFailed ? +(r.failChainLenSum / r.recoveryFailed).toFixed(1) : 0,
          };
          return { locked: r.locked, stats: { requested: cverts.length / 2, alreadyPresent: r.alreadyPresent, recovered: r.recovered, failed: r.recoveryFailed, flips: r.flips } };
        },
      } as any);
      const ut = Array.from(mesh.ut); const idx = mesh.indices;
      const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
      const weldNonMan = auditNonManByIndex(meshUt.xyz, idx);
      const rec = { name, stepMm, stallCap, maxFlips, tris: idx.length / 3, hitBudget: mesh.hitBudget, weldNonMan, diag: diagStats };
      ckpt(name, rec);
      console.log(`DIAG ${name}: failed=${diagStats.failed} [stall ${diagStats.failStall} | maxFlips ${diagStats.failMaxFlips} | noConvex ${diagStats.failNoConvex} | blocked ${diagStats.failBlocked}] chainLen max=${diagStats.failChainLenMax} avg=${diagStats.failChainLenAvg} | recovered=${diagStats.recovered} weldNonMan=${weldNonMan}`);
    }
    expect(inj.constraintPairs.length).toBeGreaterThan(0);
  }, 3_600_000);
});
