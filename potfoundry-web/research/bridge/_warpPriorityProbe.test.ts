// _warpPriorityProbe.test.ts — DEV-ONLY (env PF_WARPPRI=1). D5 (recovery priority-ordering) for FEAT-CONFORM-WARP.
//
// MEASURE-ONLY (no src/ edits). Task 4: when two constraint loci cross (the 9.4% GothicArches residual), lock the
// STRONGER/SHARPER locus first (by relief amplitude) and let the weaker give up. Tests whether recovery% rises
// and whether it changes true-3D on the conformed styles.
//
//   For GothicArches (the recovery-limited style) + BasketWeave/CelticKnot (warp) + GyroidManifold (control):
//     conf-default  — constraints in line order (shipped).
//     conf-priority — constraints ordered strongest-first (constraintPriority:true).
//   Report recovery% (recovered/requested) + failed + true-3D p99 for both.
//
// Run: PF_WARPPRI=1 npx vitest run research/bridge/_warpPriorityProbe.test.ts
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, featureLineChord3D,
  featureAdjacentSlivers, type FeatureTruth,
} from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384, STEP_MM = 0.08;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;
const OUT = join('research', 'exchange', '_featconform_all20');
function row(o: unknown): void { try { mkdirSync(OUT, { recursive: true }); appendFileSync(join(OUT, 'warppri.ndjson'), JSON.stringify(o) + '\n'); } catch { /* */ } }

const STYLES: StyleId[] = ['GothicArches', 'BasketWeave', 'CelticKnot', 'GyroidManifold'];
const OPTS: InhouseMeshOpts = {
  tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 350_000, splitThresh: 1.5, optimizeSweeps: 2,
};

interface R { style: string; mode: string; tris: number; p99: number; max: number; slivR: number; recPct: number; rec: number; req: number; fail: number; }
function meas(style: StyleId, mode: string, ut: number[], indices: Uint32Array, truth: FeatureTruth, c: { requested: number; recovered: number; failed: number; alreadyPresent: number }): R {
  const rA = buildRadiusFn(style, {}, DIMS);
  const m = buildMeshUt(ut, indices, rA, DIMS.H);
  const loc = buildLocator(m, 256);
  const fl = featureLineChord(truth, loc, rA, DIMS.H, STEP_MM);
  const fl3 = featureLineChord3D(truth, loc, m, rA, DIMS.H, STEP_MM, fl.p99Mm, CELL_R);
  const sl = featureAdjacentSlivers(truth, loc, m, STEP_MM);
  const got = c.alreadyPresent + c.recovered;
  const recPct = c.requested ? 100 * got / c.requested : 0;
  const r: R = { style: String(style), mode, tris: indices.length / 3, p99: fl3.p99Mm, max: fl3.maxMm, slivR: sl.sliverRatio, recPct, rec: c.recovered, req: c.requested, fail: c.failed };
  // eslint-disable-next-line no-console
  console.log(`${r.style.padEnd(14)} ${r.mode.padEnd(14)} tris=${String(r.tris).padStart(7)} 3dP99=${r.p99.toFixed(4)} 3dMax=${r.max.toFixed(3)} slivR=${r.slivR.toFixed(2)} REC=${recPct.toFixed(1)}% (present=${c.alreadyPresent}+rec=${c.recovered}/${c.requested}, fail=${c.failed})`);
  row(r); return r;
}

describe('recovery priority-ordering probe', () => {
  it.skipIf(process.env.PF_WARPPRI !== '1')('strongest-first ordering: recovery% + true-3D', () => {
    for (const style of STYLES) {
      // eslint-disable-next-line no-console
      console.log(`\n--- ${style} (budget ${OPTS.maxPoints}) ---`);
      const rA = buildRadiusFn(style, {}, DIMS);
      const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);
      const base = buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true });
      const baseM = buildMeshUt(base.ut, base.indices, rA, DIMS.H);
      const baseLoc = buildLocator(baseM, 256);
      const gate = computeMeasuredGate(truth, baseLoc, baseM, rA, DIMS.H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });

      const common = { ...OPTS, guardManifoldAlways: true, injectStepMm: 0.08, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, lineFilter: (_l: unknown, i: number) => gate.keep[i] } as const;
      const D = buildFeatureConformingMeshB(style, {}, DIMS, { ...common, constraintPriority: false });
      if (D.constraint) meas(style, 'conf-default', D.ut, D.indices, truth, D.constraint);
      const P = buildFeatureConformingMeshB(style, {}, DIMS, { ...common, constraintPriority: true });
      if (P.constraint) meas(style, 'conf-priority', P.ut, P.indices, truth, P.constraint);
    }
    expect(true).toBe(true);
  }, 120 * 60 * 1000);
});
