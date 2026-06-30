// _warpFix2Probe.test.ts — DEV-ONLY (env PF_WARPFIX2=1). D2 fix-candidate probe for E-2026-06-30-FEAT-CONFORM-WARP.
//
// MEASURE-ONLY (no src/ edits). D1b proved the regression is the LOCKED straight constraint-EDGE chord cutting
// across step/occlusion relief (B≈C, refine irrelevant). Candidate fixes, A/B-tested on true-3D at EQUAL budget:
//
//   A. base+guard                    — baseline (the target NOT to regress below).
//   B. conf-refined (shipped)        — locked constraint edges (reproduces the regress).
//   G. inject-only-gated (Stage A)   — pin vertices on the GATED loci, NO constraint edges (NO lock). If this
//                                      does NOT regress (Delaunay/flip free to chord the step) AND keeps the
//                                      sliver win, it is the warp-family fix: "vertices yes, locked edges no".
//   H. conf denser step 0.04         — shorter locked chords (half injectStep). Tests whether finer chords hug
//                                      the step (mechanism check; expected to help little if the LOCK is the issue).
//
// Control = GyroidManifold (must NOT regress under G/H — its conforming HELP must survive).
//
// Run: PF_WARPFIX2=1 npx vitest run research/bridge/_warpFix2Probe.test.ts
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { buildFeatureConformingMeshB, buildFeatureConformingMesh } from './featureConformingMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, featureLineChord3D,
  featureAdjacentSlivers, type FeatureTruth,
} from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;
const STEP_MM = 0.08;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;
const OUT = join('research', 'exchange', '_featconform_all20');
function row(o: unknown): void { try { mkdirSync(OUT, { recursive: true }); appendFileSync(join(OUT, 'warpfix2.ndjson'), JSON.stringify(o) + '\n'); } catch { /* */ } }

const STYLES: StyleId[] = ['BasketWeave', 'CelticKnot', 'GyroidManifold'];
const OPTS: InhouseMeshOpts = {
  tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 250_000, splitThresh: 1.5, optimizeSweeps: 2,
};

function auditNonMan(ut: number[], indices: ArrayLike<number>, rA: (th: number, z: number) => number, H: number): number {
  const TAU = 2 * Math.PI; const n = ut.length / 2; const xyz = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const canon = new Int32Array(n); const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) { const k = `${Math.round(xyz[3 * i] * 1e4)}_${Math.round(xyz[3 * i + 1] * 1e4)}_${Math.round(xyz[3 * i + 2] * 1e4)}`; const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; } }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const ec = new Map<number, number>();
  for (let k = 0; k < indices.length; k += 3) { const a = canon[indices[k]], b = canon[indices[k + 1]], c = canon[indices[k + 2]]; if (a === b || b === c || a === c) continue; for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const kk = key(p, q); ec.set(kk, (ec.get(kk) ?? 0) + 1); } }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

interface R { style: string; mode: string; tris: number; p99: number; max: number; rms: number; slivR: number; gate: number; nonMan: number; cRec?: number; cReq?: number; cFail?: number; }
function meas(style: StyleId, mode: string, ut: number[], indices: Uint32Array, truth: FeatureTruth, gate: number, c?: { requested: number; recovered: number; failed: number }): R {
  const rA = buildRadiusFn(style, {}, DIMS);
  const m = buildMeshUt(ut, indices, rA, DIMS.H);
  const loc = buildLocator(m, 256);
  const fl = featureLineChord(truth, loc, rA, DIMS.H, STEP_MM);
  const fl3 = featureLineChord3D(truth, loc, m, rA, DIMS.H, STEP_MM, fl.p99Mm, CELL_R);
  const sl = featureAdjacentSlivers(truth, loc, m, STEP_MM);
  const r: R = { style: String(style), mode, tris: indices.length / 3, p99: fl3.p99Mm, max: fl3.maxMm, rms: fl3.rmsMm, slivR: sl.sliverRatio, gate, nonMan: auditNonMan(ut, indices, rA, DIMS.H), cRec: c?.recovered, cReq: c?.requested, cFail: c?.failed };
  // eslint-disable-next-line no-console
  console.log(`${r.style.padEnd(15)} ${r.mode.padEnd(20)} tris=${String(r.tris).padStart(7)} 3dP99=${r.p99.toFixed(4)} 3dMax=${r.max.toFixed(3)} slivR=${r.slivR.toFixed(2)} nonMan=${r.nonMan}${c ? ` rec=${c.recovered}/${c.requested}` : ''}`);
  row(r); return r;
}

describe('warp fix-candidate probe', () => {
  it.skipIf(process.env.PF_WARPFIX2 !== '1')('inject-only (no lock) vs denser-chord vs baseline', () => {
    for (const style of STYLES) {
      // eslint-disable-next-line no-console
      console.log(`\n--- ${style} (budget ${OPTS.maxPoints}) ---`);
      const rA = buildRadiusFn(style, {}, DIMS);
      const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);
      const base = buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true });
      const baseM = buildMeshUt(base.ut, base.indices, rA, DIMS.H);
      const baseLoc = buildLocator(baseM, 256);
      const gate = computeMeasuredGate(truth, baseLoc, baseM, rA, DIMS.H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
      meas(style, 'A.base+guard', base.ut, base.indices, truth, gate.kept);

      const common = { ...OPTS, guardManifoldAlways: true, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth } as const;

      // B. conf refined (shipped)
      const B = buildFeatureConformingMeshB(style, {}, DIMS, { ...common, injectStepMm: 0.08, lineFilter: (_l, i) => gate.keep[i] });
      meas(style, 'B.conf-refined', B.ut, B.indices, truth, gate.kept, B.constraint);

      // G. inject-only-gated (Stage A — pinned vertices on gated loci, NO constraint edges/lock)
      const G = buildFeatureConformingMesh(style, {}, DIMS, { ...common, injectStepMm: 0.08, lineFilter: (_l, i) => gate.keep[i] });
      meas(style, 'G.inject-only-gated', G.ut, G.indices, truth, gate.kept);

      // H. conf denser chord (injectStep 0.04 — shorter locked chords)
      const H = buildFeatureConformingMeshB(style, {}, DIMS, { ...common, injectStepMm: 0.04, lineFilter: (_l, i) => gate.keep[i] });
      meas(style, 'H.conf-denserStep', H.ut, H.indices, truth, gate.kept, H.constraint);
    }
    expect(true).toBe(true);
  }, 120 * 60 * 1000);
});
