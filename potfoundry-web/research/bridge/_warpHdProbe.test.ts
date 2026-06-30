// _warpHdProbe.test.ts — DEV-ONLY. D3 (Voronoi full-density gate) + D4 (GothicArches HD) for FEAT-CONFORM-WARP.
//
// MEASURE-ONLY (no src/ edits).
//   PF_WARPHD=voronoi  — D3: build Voronoi at FULL budget, run the measured gate; confirm it fires ~0 at full
//                        density (regression was a lean-budget artifact). Gate-count is cheap; then conf vs base
//                        true-3D at full budget to prove no-regression.
//   PF_WARPHD=gothic   — D4: GothicArches HD (maxPoints 3M, tolMm 0.004, hMin 0.008) gated Stage B; does true-3D
//                        p99 clear < 0.1? (from 0.132 @800k). Diagnose if not.
//   PF_WARPHD=1        — both.
//
// Run: PF_WARPHD=voronoi npx vitest run research/bridge/_warpHdProbe.test.ts
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, featureLineChord3D,
  crestValleyRetention, featureAdjacentSlivers, type FeatureTruth,
} from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;
const OUT = join('research', 'exchange', '_featconform_all20');
function row(o: unknown): void { try { mkdirSync(OUT, { recursive: true }); appendFileSync(join(OUT, 'warphd.ndjson'), JSON.stringify(o) + '\n'); } catch { /* */ } }

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

interface R { style: string; mode: string; tris: number; p99: number; max: number; rms: number; crestU: number; slivR: number; gate: number; gateTot: number; nonMan: number; cRec?: number; cReq?: number; cFail?: number; }
function meas(style: StyleId, mode: string, ut: number[], indices: Uint32Array, truth: FeatureTruth, stepMm: number, gate: number, gateTot: number, c?: { requested: number; recovered: number; failed: number }): R {
  const rA = buildRadiusFn(style, {}, DIMS);
  const m = buildMeshUt(ut, indices, rA, DIMS.H);
  const loc = buildLocator(m, 256);
  const fl = featureLineChord(truth, loc, rA, DIMS.H, stepMm);
  const fl3 = featureLineChord3D(truth, loc, m, rA, DIMS.H, stepMm, fl.p99Mm, CELL_R);
  const cr = crestValleyRetention(truth, loc, rA, DIMS.H, stepMm);
  const sl = featureAdjacentSlivers(truth, loc, m, stepMm);
  const r: R = { style: String(style), mode, tris: indices.length / 3, p99: fl3.p99Mm, max: fl3.maxMm, rms: fl3.rmsMm, crestU: cr.crestUnderWorstMm, slivR: sl.sliverRatio, gate, gateTot, nonMan: auditNonMan(ut, indices, rA, DIMS.H), cRec: c?.recovered, cReq: c?.requested, cFail: c?.failed };
  // eslint-disable-next-line no-console
  console.log(`${r.style.padEnd(14)} ${r.mode.padEnd(13)} tris=${String(r.tris).padStart(8)} 3dP99=${r.p99.toFixed(4)} 3dMax=${r.max.toFixed(3)} crestU=${r.crestU.toFixed(3)} slivR=${r.slivR.toFixed(2)} gate=${gate}/${gateTot} nonMan=${r.nonMan}${c ? ` rec=${c.recovered}/${c.requested}(f${c.failed})` : ''}`);
  row(r); return r;
}

function runStyleAt(style: StyleId, opts: InhouseMeshOpts, stepMm: number): void {
  const rA = buildRadiusFn(style, {}, DIMS);
  const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);
  const base = buildInhouseMetricMesh(rA, DIMS.H, { ...opts, guardManifoldAlways: true });
  const baseM = buildMeshUt(base.ut, base.indices, rA, DIMS.H);
  const baseLoc = buildLocator(baseM, 256);
  const gate = computeMeasuredGate(truth, baseLoc, baseM, rA, DIMS.H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
  meas(style, 'A.base+guard', base.ut, base.indices, truth, stepMm, gate.kept, gate.total);
  const B = buildFeatureConformingMeshB(style, {}, DIMS, { ...opts, guardManifoldAlways: true, injectStepMm: 0.08, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, lineFilter: (_l, i) => gate.keep[i] });
  meas(style, 'B.gated-conf', B.ut, B.indices, truth, stepMm, gate.kept, gate.total, B.constraint);
}

describe('warp HD probes', () => {
  const phase = process.env.PF_WARPHD;

  it.skipIf(phase !== 'voronoi' && phase !== '1')('D3: Voronoi FULL-density gate fires ~0 (regression was lean-budget)', () => {
    // Full budget — no cap. Voronoi at ~1.6M tris should resolve its hash-floor loci ⇒ gate ~0.
    const FULL: InhouseMeshOpts = { tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 2_000_000, splitThresh: 1.5, optimizeSweeps: 2 };
    // eslint-disable-next-line no-console
    console.log('\n=== D3: VORONOI FULL DENSITY (maxPoints 2M) ===\n');
    runStyleAt('Voronoi', FULL, 0.05);
    expect(true).toBe(true);
  }, 120 * 60 * 1000);

  it.skipIf(phase !== 'gothic' && phase !== '1')('D4: GothicArches HD true-3D p99 < 0.1?', () => {
    const HD: InhouseMeshOpts = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2 };
    // eslint-disable-next-line no-console
    console.log('\n=== D4: GOTHICARCHES HD (maxPoints 3M, tol 0.004, hMin 0.008) ===\n');
    runStyleAt('GothicArches', HD, 0.025);
    expect(true).toBe(true);
  }, 180 * 60 * 1000);
});
