// featureConformingMesh.test.ts — DEV-ONLY (env PF_FEATCONF=1). MEASURE-ONLY.
//
// E-2026-06-30-FEAT-CONFORM-SPIKE. Baseline (kernel, no injection) vs Stage A (feature-conforming vertex
// injection) on the 2 worst styles (ArtDeco + GothicArches) + a smooth-style regression control
// (HarmonicRipple). Equal budget/opts between baseline and Stage A. Scored by the SAME harness instruments.
//
// Run: PF_FEATCONF=1 npx vitest run research/bridge/featureConformingMesh.test.ts
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh, type InhouseMeshOpts, type ConstraintRecoveryStats } from './inhouseMetricMesh';
import { buildFeatureConformingMesh, buildFeatureConformingMeshB, type FeatureConformOpts } from './featureConformingMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, featureLineChord3D,
  crestValleyRetention, featureAdjacentSlivers, globalChord,
} from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;
// Metric feature-sampling step. 0.05mm (vs R2's 0.025) halves the true-3D point-to-triangle cost on the big
// Stage-A/B meshes while still sampling every feature triangle at this mesh density; the comparison is
// apples-to-apples (same step for baseline/A/B).
const STEP_MM = 0.05;
const HMIN = 0.02;

// EQUAL-BUDGET kernel opts. maxPoints 400k (vs R2's 800k) keeps the Stage-A/B meshes small enough that the
// heavy metric harness finishes; density-invariance (E-2026-06-30-FEAT-FID-R2) means the budget level does
// not change the crest-under conclusion, and all three modes share this exact config (the control).
const BASE_OPTS: InhouseMeshOpts = {
  tolMm: 0.01, hMin: HMIN, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 400_000, splitThresh: 1.5, optimizeSweeps: 2,
};
// injectStepMm tuned so Stage A/B tris stay < ~2× the 800k-budget baseline (Stage B is MORE tri-efficient
// than blind density — band prototype: Stage B 80k beat Stage A 321k on true-3D — so a coarse step suffices).
const CONFORM_OPTS: FeatureConformOpts = {
  injectStepMm: 0.08, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, profile: true,
};

interface Row {
  style: string; mode: string; tris: number; pts: number; runtimeS: number;
  injected: number; meanMoveMm: number;
  crestUnderWorstMm: number; crestUnderWorstPct: number; crestUnderMeanMm: number;
  fl3d_p99: number; fl3d_max: number; fl3d_rms: number; fl3d_radOvr: number;
  globalRms: number; globalVtxMax: number;
  featAdj_pct20: number; wholeMesh_pct20: number; sliverRatio: number;
  manifold: ManifoldStat;
  constraint?: ConstraintRecoveryStats;
}

interface ManifoldStat { nonManifoldEdges: number; boundaryEdges: number; flippedTris: number; }

// RIGOROUS manifold/watertight audit. The kernel meshes an OPEN (u,t) patch with a NON-stitched periodic
// seam (u=0 and u=1 are two separate boundaries), so a by-(u,t)-index audit miscounts the seam. We WELD
// vertices by lifted 3D position (hash at 1e-4 mm) — the seam twins share a position and merge — then count
// undirected edges by welded id: non-manifold = shared by >2; boundary = shared by 1 (legit only at t=0/1).
// "Inverted" is measured as a per-triangle 3D-normal sign flip relative to the MAJORITY orientation (a
// consistent winding ⇒ 0; the prior outward-radial proxy was wrong — flagged ~all tris).
function auditManifold(ut: number[], indices: ArrayLike<number>, rA: (th: number, z: number) => number, H: number): ManifoldStat {
  const TAU = 2 * Math.PI;
  const n = ut.length / 2;
  const xyz = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z);
    xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z;
  }
  // weld by 3D position
  const canon = new Int32Array(n);
  const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(xyz[3 * i] * 1e4)}_${Math.round(xyz[3 * i + 1] * 1e4)}_${Math.round(xyz[3 * i + 2] * 1e4)}`;
    const hit = wmap.get(k); if (hit !== undefined) canon[i] = hit; else { wmap.set(k, i); canon[i] = i; }
  }
  const EK = n + 1;
  const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const edgeCount = new Map<number, number>();
  const m = indices.length;
  let degen = 0, inverted = 0;
  // reference orientation: outward radial · normal sign of the MAJORITY (count both, report the minority).
  let outCount = 0, inCount = 0;
  for (let k = 0; k < m; k += 3) {
    const a = canon[indices[k]], b = canon[indices[k + 1]], c = canon[indices[k + 2]];
    if (a === b || b === c || a === c) { degen++; continue; }
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const kk = key(p, q); edgeCount.set(kk, (edgeCount.get(kk) ?? 0) + 1); }
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3;
    if (nx * gx + ny * gy >= 0) outCount++; else inCount++;
  }
  inverted = Math.min(outCount, inCount); // minority winding = inconsistently-oriented tris
  let nonMan = 0, bnd = 0;
  for (const v of edgeCount.values()) { if (v > 2) nonMan++; else if (v === 1) bnd++; }
  void degen;
  return { nonManifoldEdges: nonMan, boundaryEdges: bnd, flippedTris: inverted };
}

function measure(style: StyleId, mode: string, ut: number[], indices: Uint32Array, runtimeS: number, injected: number, meanMoveMm: number, constraint?: ConstraintRecoveryStats): Row {
  const rA = buildRadiusFn(style, {}, DIMS);
  const meshUt = buildMeshUt(ut, indices, rA, DIMS.H);
  const locator = buildLocator(meshUt, 256);
  const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);
  const gc = globalChord(ut, indices, rA, DIMS.H);
  const fl = featureLineChord(truth, locator, rA, DIMS.H, STEP_MM);
  const fl3 = featureLineChord3D(truth, locator, meshUt, rA, DIMS.H, STEP_MM, fl.p99Mm);
  const cr = crestValleyRetention(truth, locator, rA, DIMS.H, STEP_MM);
  const sl = featureAdjacentSlivers(truth, locator, meshUt, STEP_MM);
  const man = auditManifold(ut, indices, rA, DIMS.H);
  return {
    style: String(style), mode, tris: indices.length / 3, pts: ut.length / 2, runtimeS, injected, meanMoveMm,
    crestUnderWorstMm: cr.crestUnderWorstMm, crestUnderWorstPct: cr.crestUnderWorstPct, crestUnderMeanMm: cr.crestUnderMeanMm,
    fl3d_p99: fl3.p99Mm, fl3d_max: fl3.maxMm, fl3d_rms: fl3.rmsMm, fl3d_radOvr: fl3.radialOverstatementRatio,
    globalRms: gc.rmsMm, globalVtxMax: gc.vertexMaxMm,
    featAdj_pct20: sl.featureAdj_pct20, wholeMesh_pct20: sl.wholeMesh_pct20, sliverRatio: sl.sliverRatio,
    manifold: man, constraint,
  };
}

function printRow(r: Row): void {
  const c = r.constraint ? ` rec=${r.constraint.recovered}/${r.constraint.requested}(present=${r.constraint.alreadyPresent},fail=${r.constraint.failed})` : '';
  // eslint-disable-next-line no-console
  console.log(
    `${r.style.padEnd(14)} ${r.mode.padEnd(8)} tris=${String(r.tris).padStart(7)} inj=${String(r.injected).padStart(6)} mv=${r.meanMoveMm.toFixed(3)} ` +
    `crestU=${r.crestUnderWorstMm.toFixed(3)}mm(${r.crestUnderWorstPct.toFixed(0)}%) mean=${r.crestUnderMeanMm.toFixed(3)} ` +
    `3dP99=${r.fl3d_p99.toFixed(4)} 3dMax=${r.fl3d_max.toFixed(3)} radOvr=${r.fl3d_radOvr.toFixed(1)}x gRms=${r.globalRms.toFixed(4)} ` +
    `adj=${r.featAdj_pct20.toFixed(1)}%/${r.wholeMesh_pct20.toFixed(1)}%(x${r.sliverRatio.toFixed(1)}) ` +
    `nonMan=${r.manifold.nonManifoldEdges} bnd=${r.manifold.boundaryEdges} flip=${r.manifold.flippedTris}${c} ${r.runtimeS.toFixed(0)}s`,
  );
}

describe('feature-conforming spike (Stage A + Stage B)', () => {
  it.skipIf(!process.env.PF_FEATCONF)('baseline vs Stage A vs Stage B on ArtDeco + GothicArches + HarmonicRipple', () => {
    // Stage B is run on the genuine-3D-defect styles; HarmonicRipple (smooth control) only needs Stage A
    // to show no-regression. constrainLabels limits constraints to the actual crest families (ridge +
    // relief-wall) to keep the O(constraints) recovery bounded; crease loci coincide with these.
    const stageBStyles = new Set<string>(['GothicArches', 'ArtDeco']);
    const styles: StyleId[] = ['ArtDeco', 'GothicArches', 'HarmonicRipple'] as StyleId[];
    const rows: Row[] = [];
    // eslint-disable-next-line no-console
    console.log('\n=== FEAT-CONFORM-SPIKE (E-2026-06-30-FEAT-CONFORM-SPIKE) ===\n');

    for (const style of styles) {
      const rA = buildRadiusFn(style, {}, DIMS);
      // BASELINE — kernel, no injection
      let t0 = Date.now();
      const base = buildInhouseMetricMesh(rA, DIMS.H, BASE_OPTS);
      const baseRt = (Date.now() - t0) / 1000;
      const rBase = measure(style, 'baseline', base.ut, base.indices, baseRt, 0, 0);
      rows.push(rBase); printRow(rBase);

      // STAGE A — feature-conforming injection at the SAME budget/opts
      t0 = Date.now();
      const conf = buildFeatureConformingMesh(style, {}, DIMS, { ...BASE_OPTS, ...CONFORM_OPTS });
      const confRt = (Date.now() - t0) / 1000;
      const rStageA = measure(style, 'stageA', conf.ut, conf.indices, confRt, conf.injected, conf.meanRefineMoveMm);
      rows.push(rStageA); printRow(rStageA);

      // STAGE B — constrained edges (only on the genuine-3D-defect styles)
      if (stageBStyles.has(String(style))) {
        t0 = Date.now();
        const confB = buildFeatureConformingMeshB(style, {}, DIMS, {
          ...BASE_OPTS, ...CONFORM_OPTS,
          constrainLabels: ['ridge-truth', 'relief-wall-truth'],
        });
        const confBRt = (Date.now() - t0) / 1000;
        const rStageB = measure(style, 'stageB', confB.ut, confB.indices, confBRt, confB.injected, confB.meanRefineMoveMm, confB.constraint);
        rows.push(rStageB); printRow(rStageB);
      }
    }

    // eslint-disable-next-line no-console
    console.log('\n=== JSON ===\n' + JSON.stringify(rows, null, 2));
    expect(rows.length).toBeGreaterThanOrEqual(7);
  }, 120 * 60 * 1000);
});
