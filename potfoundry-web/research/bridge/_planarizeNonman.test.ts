// _planarizeNonman.test.ts — DEV-ONLY (env PF_PLANNM=1). Locate the nonMan=2 edges the planarize path leaves.
// Reports each non-manifold undirected edge's welded endpoints: 3D position, incident-triangle count, and the
// (u,t) of the mesh vertices that welded there — to classify: apex-collapse (two distinct (u,t) lifting to one
// 3D point), seam, or locked-edge pin. Also A/B: planarize + LOCK vs planarize + inject-only (no constraint
// edges) — if inject-only is nonMan=0, the lock is the cause.
//
// Run: PF_PLANNM=1 npx vitest run research/bridge/_planarizeNonman.test.ts
import { describe, it, expect } from 'vitest';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt, buildLocator, buildFeatureTruth } from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const TRUTH_RES = 384;

/** report every non-manifold undirected edge (weld by 3D position @1e-4mm) with diagnostics. */
function reportNonMan(label: string, ut: number[], indices: ArrayLike<number>, rA: (th: number, z: number) => number, H: number): number {
  const m = buildMeshUt(ut, indices as Uint32Array, rA, H); const xyz = m.xyz; const n = xyz.length / 3;
  const q = 1e4; const canon = new Int32Array(n); const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`;
    const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; }
  }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const ec = new Map<number, number>(); const rep = new Map<number, [number, number]>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = canon[indices[t]], b = canon[indices[t + 1]], c = canon[indices[t + 2]];
    if (a === b || b === c || a === c) continue;
    for (const [p, r] of [[a, b], [b, c], [c, a]] as const) { const kk = key(p, r); ec.set(kk, (ec.get(kk) ?? 0) + 1); if (!rep.has(kk)) rep.set(kk, [p, r]); }
  }
  let nm = 0;
  for (const [kk, v] of ec.entries()) {
    if (v <= 2) continue; nm++;
    const [p, r] = rep.get(kk) as [number, number];
    // list the ORIGINAL vertices that welded onto p and r
    const onP: number[] = [], onR: number[] = [];
    for (let i = 0; i < n; i++) { if (canon[i] === p) onP.push(i); if (canon[i] === r) onR.push(i); }
    const uvOf = (vs: number[]): string => vs.slice(0, 4).map(i => `(${ut[2 * i].toFixed(5)},${ut[2 * i + 1].toFixed(5)})`).join(' ');
    // eslint-disable-next-line no-console
    console.log(`  [${label}] nonMan edge #${nm}: incident=${v} | P xyz=(${xyz[3 * p].toFixed(3)},${xyz[3 * p + 1].toFixed(3)},${xyz[3 * p + 2].toFixed(3)}) welds=${onP.length} uv=${uvOf(onP)} | R xyz=(${xyz[3 * r].toFixed(3)},${xyz[3 * r + 1].toFixed(3)},${xyz[3 * r + 2].toFixed(3)}) welds=${onR.length} uv=${uvOf(onR)}`);
  }
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(30)} nonMan=${nm} verts=${n}`);
  return nm;
}

describe('planarize nonMan diagnosis', () => {
  it.skipIf(process.env.PF_PLANNM !== '1')('locate + classify the 2 non-manifold edges', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const truth = buildFeatureTruth(STYLE, {}, DIMS, TRUTH_RES);
    const OPTS: InhouseMeshOpts = { tolMm: 0.01, hMin: 0.012, hMax: 8, sizeRes: 200, gradeBeta: 0.2, seedN: 12, maxPoints: 900_000, splitThresh: 1.5, optimizeSweeps: 2 };
    const base = buildInhouseMetricMesh(rA, H, { ...OPTS, guardManifoldAlways: true });
    const baseM = buildMeshUt(base.ut, base.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: 0.12, trueFloorMm: 0.1, cellR: 3 });
    const common = { ...OPTS, guardManifoldAlways: true as const, guardRecoveryManifold: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gate.keep[i] };

    // A: planarize + LOCK (the current nonMan=2 config)
    const lock = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, planarizeConstraints: true });
    reportNonMan('planar+LOCK', lock.ut, lock.indices, rA, H);

    // B: planarize but do NOT emit constraint edges (inject-only) → isolates whether the LOCK causes it.
    // We build the planar graph then drop the constraintEdges by passing constrainLabels that match nothing?
    // Simpler: buildFeatureConformingMesh (Stage A, inject-only) with the SAME planarized points is not wired;
    // instead re-run B with planarize on but strip locks via a kernel path: pass constraintEdges but with the
    // recovery disabled is not an option. So B = Stage-A inject-only (no constraints at all) as the control.
    // (If A has nonMan and the shipped non-planar conf had 0, and inject-only planar has 0, the lock+planar is it.)
    expect(lock.indices.length).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
