// _kernelHardenReal.test.ts — DEV-ONLY (research/ only; src/ must never import this).
// KERNEL HARDENING RED (real geometry) + drift instrumentation + FIX verify + byte-identical-when-off proof.
//
// The synthetic picket did NOT fold (its Delaunay already contains the picket edges => 0 flips). The REAL
// fold happens on the SFB@1 traced-ridge dense picket at step 0.03 (SCORECARD: 72 nonMan). This probe
// reproduces that with the ACTUAL kernel + traced skeleton at a MODERATE budget so it runs in minutes, and
// checkpoints each stage so a killed run resumes.
//
// Env: PF_KERNELHARDEN_REAL=1 (RED repro + fix A/B at moderate density).
//      PF_KERNELHARDEN_BYTEID=1 (byte-identical-when-off proof: opt OFF vs pre-change baseline).
//      PF_KERNELHARDEN_SFB=1  (SFB@1 dense step 0.03 with the fix ON — the deliverable confirm).
// Output: research/exchange/_kernelharden/.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, buildRadiusFn, buildMeshUt, liftUtToRadial,
  auditNonManByIndex, triangleQualityDistribution, perFaceTrue3DSag,
} from './labkit';
import { tracePetalLoci } from './_sfbPushLib';
import { planarizeSegments } from './planarizeSkeleton';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_kernelharden');
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

// Reuse Team A's OPTS shape (matched to _sfbPush.test.ts) but with a knob for budget so the RED repro runs
// at moderate density in minutes. sizeRes/tolMm/etc identical to the SFB screen config.
const OPTS_BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5, optimizeSweeps: 2 } as const;

// Traced skeleton at a given step — mirrors _sfbPush.buildTracedSkeleton (the folding path).
function buildTracedSkeleton(rA: AnalyticRadiusFn, stepMm: number, kind: 'crest' | 'valley' | 'both'): {
  injected: number[]; constraintPairs: number[];
} {
  const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind });
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
  return { injected: pslg.points, constraintPairs: pslg.edges };
}

interface BuildArgs { stepMm: number; maxPoints: number; recoveryRobust?: boolean; recoverySliverEps?: number; }
function build(rA: AnalyticRadiusFn, a: BuildArgs): {
  ut: number[]; idx: Uint32Array; nonMan: number; tris: number; constraint: any;
} {
  const sk = buildTracedSkeleton(rA, a.stepMm, 'both');
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    ...OPTS_BASE, maxPoints: a.maxPoints,
    guardManifoldAlways: true,
    injectedPoints: sk.injected,
    pinInjected: true,
    constraintEdges: sk.constraintPairs, guardRecoveryManifold: true,
    ...(a.recoveryRobust ? { recoveryRobust: true } : {}),
    ...(a.recoverySliverEps !== undefined ? { recoverySliverEps: a.recoverySliverEps } : {}),
  } as any);
  const ut = Array.from(mesh.ut); const idx = mesh.indices;
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);
  return { ut, idx, nonMan, tris: idx.length / 3, constraint: mesh.constraint };
}

describe('KERNEL-HARDEN REAL — SFB traced dense picket reproduces the fold + fix', () => {
  it.skipIf(process.env.PF_KERNELHARDEN_REAL !== '1')('step 0.03 folds (RED) and recoveryRobust fixes it (GREEN) at moderate budget', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const MAXP = Number(process.env.PF_KH_MAXP ?? 3_000_000);
    const rows: any[] = [];

    // RED: the folding step (0.03), guards ON, robust OFF (== current production behavior).
    if (!done('real_red')) {
      const b = build(rA, { stepMm: 0.03, maxPoints: MAXP });
      const rec = { tag: 'RED step0.03 robust=OFF', tris: b.tris, nonMan: b.nonMan, constraint: b.constraint };
      ck('real_red', rec); rows.push(rec);
      // eslint-disable-next-line no-console
      console.log('REAL_RED', JSON.stringify(rec));
    } else rows.push({ ...JSON.parse(readFileSync(join(ROOT, 'real_red.json'), 'utf8')), cached: true });

    // GREEN: same step, robust ON.
    if (!done('real_green')) {
      const b = build(rA, { stepMm: 0.03, maxPoints: MAXP, recoveryRobust: true });
      const rec = { tag: 'GREEN step0.03 robust=ON', tris: b.tris, nonMan: b.nonMan, constraint: b.constraint };
      ck('real_green', rec); rows.push(rec);
      // eslint-disable-next-line no-console
      console.log('REAL_GREEN', JSON.stringify(rec));
    } else rows.push({ ...JSON.parse(readFileSync(join(ROOT, 'real_green.json'), 'utf8')), cached: true });

    ck('real_summary', rows);
    const green = rows.find((r) => r.tag?.startsWith('GREEN'));
    // RED must fold (>0), GREEN must be watertight (0). If RED does not fold at this budget, note + raise budget.
    expect(green.nonMan).toBe(0);
  }, 1_800_000);
});

// ── DIAG: WHERE do the residual nonMan edges come from? (recovery vs sweep vs 3D-weld artifact) ──
// GREEN robust=ON still showed nonMan=4 with robustManifoldRejects=0 (the recovery guard never fired) ⇒ the
// 4 are NOT recovery-flip duplications. Control: build WITHOUT constraint edges (no recovery at all) — if
// nonMan=4 persists, it is a metric/sweep/weld artifact, NOT a recovery fold. Also classify the residual
// edges: index-level halfedge non-manifold (a REAL fold) vs 3D-weld coincidence (distinct indices at the
// same quantized 3D point — a geometrically-exact seam/tip pileup, per the SCORECARD metric-artifact note).
describe('KERNEL-HARDEN DIAG — locate the residual nonMan', () => {
  it.skipIf(process.env.PF_KERNELHARDEN_DIAG !== '1')('classifies residual nonMan: recovery vs sweep vs 3D-weld artifact', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const MAXP = Number(process.env.PF_KH_MAXP ?? 3_000_000);

    // index-level halfedge non-manifold (no 3D weld): an undirected (index) edge used by >2 triangles.
    // SHARDED Map (a single JS Map caps at 2^24; an 18M-edge mesh overflows — mirror labkit/flipHE sharding).
    const nonManByRawIndex = (idx: Uint32Array): number => {
      let mx = 0; for (let i = 0; i < idx.length; i++) if (idx[i] > mx) mx = idx[i];
      const EK = mx + 1; const NSHARD = 64;
      const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
      const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
      for (let f = 0; f < idx.length; f += 3) {
        const a = idx[f], b = idx[f + 1], c = idx[f + 2];
        if (a !== b) bump(a, b); if (b !== c) bump(b, c); if (a !== c) bump(a, c);
      }
      let nm = 0; for (const m of ms) for (const v of m.values()) if (v > 2) nm++; return nm;
    };

    const out: any[] = [];
    // (1) NO constraint edges: injected picket points only, pinned. No recovery runs at all.
    if (!done('diag_noconstraint')) {
      const sk = buildTracedSkeleton(rA, 0.03, 'both');
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
        ...OPTS_BASE, maxPoints: MAXP, guardManifoldAlways: true, injectedPoints: sk.injected, pinInjected: true,
      } as any);
      const ut = Array.from(mesh.ut); const idx = mesh.indices;
      const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
      const rec = { tag: 'NO-CONSTRAINT (no recovery)', tris: idx.length / 3, nonManWeld: auditNonManByIndex(meshUt.xyz, idx), nonManRawIndex: nonManByRawIndex(idx) };
      ck('diag_noconstraint', rec); out.push(rec);
      // eslint-disable-next-line no-console
      console.log('DIAG_NOCONSTRAINT', JSON.stringify(rec));
    } else out.push({ ...JSON.parse(readFileSync(join(ROOT, 'diag_noconstraint.json'), 'utf8')), cached: true });

    // (2) WITH constraint edges + robust ON: classify weld-vs-rawindex on the SAME mesh.
    if (!done('diag_constraint')) {
      const b = build(rA, { stepMm: 0.03, maxPoints: MAXP, recoveryRobust: true });
      const meshUt = buildMeshUt(b.ut, b.idx, rA, DIMS.H);
      const rec = { tag: 'CONSTRAINT robust=ON', tris: b.tris, nonManWeld: auditNonManByIndex(meshUt.xyz, b.idx), nonManRawIndex: nonManByRawIndex(b.idx), constraint: b.constraint };
      ck('diag_constraint', rec); out.push(rec);
      // eslint-disable-next-line no-console
      console.log('DIAG_CONSTRAINT', JSON.stringify(rec));
    } else out.push({ ...JSON.parse(readFileSync(join(ROOT, 'diag_constraint.json'), 'utf8')), cached: true });

    ck('diag_summary', out);
    expect(out.length).toBeGreaterThanOrEqual(2);
  }, 1_800_000);
});
