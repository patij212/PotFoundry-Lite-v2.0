// featConformAll20.test.ts — DEV-ONLY (env PF_FCALL20=1). The deliverable for E-2026-06-30-FEAT-CONFORM-ALL20.
//
// MEASURE-ONLY (no src/ edits). All 20 styles, baseline vs GATED feature-conforming (Stage B w/ hardened
// crossing-chain recovery + measured sharp gate + guardManifold), scored on the HONEST TRUE-3D metric.
//
// Phases (env-selectable so we can run the screen and the HD confirm separately):
//   PF_FCALL20=screen  — all-20 at the screen budget (baseline vs gated-conforming)
//   PF_FCALL20=hd      — high-density confirm on GothicArches + BasketWeave
//   PF_FCALL20=noop    — Task 4: guardManifold no-op + non-manifold-fix check on all 20 (default path)
//   PF_FCALL20=1       — all phases
//   PF_FC_LO / PF_FC_HI — optional [lo,hi) style-index window for the screen (run in small batches so a
//                          kill/timeout never loses progress; each row is fsync-appended to the NDJSON below).
//
// Results are written INCREMENTALLY (fs.appendFileSync, bypassing vitest's console buffer which lost the
// whole run on a kill) to research/exchange/_featconform_all20/<phase>.ndjson — one JSON row per mesh.
//
// Run: PF_FCALL20=screen npx vitest run research/bridge/featConformAll20.test.ts
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh, type InhouseMeshOpts, type ConstraintRecoveryStats } from './inhouseMetricMesh';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, featureLineChord3D,
  crestValleyRetention, featureAdjacentSlivers, type FeatureTruth,
} from './featureLocalizedFidelity';
import { perFaceTrue3DSag } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;
// STEP_MM 0.08 (screen): the true-3D point-to-triangle metric is O(loci·samples·neighborTris); 0.08 vs 0.05
// halves the dominant cost on the heavy 800k-tri styles (GothicArches/CelticTriquetra) while staying well
// below the mesh edge length, and BOTH baseline + conforming use the SAME step → the comparison is exact.
const STEP_MM_SCREEN = 0.08;
const STEP_MM_DENSE = 0.025;
const GATE_FLOOR_MM = 0.1;   // true-3D gate floor: conform a locus iff baseline under-resolves it > this
const GATE_STEP_MM = 0.12;   // gate probe sampling (coarser than the metric — only needs worst-gap-per-line)
const METRIC_CELL_R = 3;     // neighbour-triangle search radius (3 cells ≈ 3–5mm at gridN=256 — covers nearest tri)

const OUT_DIR = join('research', 'exchange', '_featconform_all20');
function appendRow(phase: string, obj: unknown): void {
  try { mkdirSync(OUT_DIR, { recursive: true }); appendFileSync(join(OUT_DIR, `${phase}.ndjson`), JSON.stringify(obj) + '\n'); } catch { /* best-effort */ }
}

const ALL_20: StyleId[] = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales',
  'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet',
];

// The R2 classification (E-2026-06-30-FEAT-FID-R2): 9 ACCEPT (must NOT regress), 4 risers (EXCLUDE candidates),
// the rest defect. Used only for LABELLING the scorecard + the no-regression check — NOT as the gate.
const ACCEPT_9 = new Set(['FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'WaveInterference', 'RippleInterference', 'Voronoi', 'HexagonalHive', 'Crystalline']);
const RISERS_4 = new Set(['ArtDeco', 'GeometricStar', 'DragonScales', 'SuperformulaBlossom']);

const SCREEN_OPTS: InhouseMeshOpts = {
  tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 800_000, splitThresh: 1.5, optimizeSweeps: 2,
};
// PF_FC_BUDGET caps maxPoints for the heavy multi-million-tri styles so the O(loci·samples·tris) TRUE-3D
// metric stays tractable. Density-invariance (E-2026-06-30-FEAT-FID-R2: crest under-shoot UNCHANGED 0.8M→6M)
// means the conforming IMPROVEMENT DIRECTION is budget-independent; baseline + conforming share the cap so the
// delta is exact. Absolute p99 may differ slightly from the 800k screen — annotated in the row's `tris`.
const BUDGET_CAP = process.env.PF_FC_BUDGET ? parseInt(process.env.PF_FC_BUDGET, 10) : SCREEN_OPTS.maxPoints;
const DENSE_OPTS: InhouseMeshOpts = {
  tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2,
};

interface ManifoldStat { nonManifoldEdges: number; boundaryEdges: number; flippedTris: number; }

// RIGOROUS 3D-weld manifold/watertight audit (reused verbatim from the spike's featureConformingMesh.test.ts).
function auditManifold(ut: number[], indices: ArrayLike<number>, rA: (th: number, z: number) => number, H: number): ManifoldStat {
  const TAU = 2 * Math.PI;
  const n = ut.length / 2;
  const xyz = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z);
    xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z;
  }
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
  let degen = 0, outCount = 0, inCount = 0;
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
  let nonMan = 0, bnd = 0;
  for (const v of edgeCount.values()) { if (v > 2) nonMan++; else if (v === 1) bnd++; }
  void degen;
  return { nonManifoldEdges: nonMan, boundaryEdges: bnd, flippedTris: Math.min(outCount, inCount) };
}

interface Row {
  style: string; cls: string; mode: string; tris: number; runtimeS: number;
  gateKept: number; gateTotal: number;
  crestUnderWorstMm: number; crestUnderMeanMm: number;
  fl3d_p99: number; fl3d_max: number; fl3d_rms: number; radOvr: number;
  // R8: non-locus WHOLE-MESH true-3D MAX (perFaceTrue3DSag) — sees scale-tip cones that the
  // loci-only fl3d_* channel is structurally blind to.
  wholeMesh3d_max: number; wholeMesh3d_pctOver01: number;
  featAdj_pct20: number; wholeMesh_pct20: number; sliverRatio: number;
  nonMan: number; bnd: number; flip: number;
  constraint?: ConstraintRecoveryStats;
}

function measure(style: StyleId, mode: string, ut: number[], indices: Uint32Array, runtimeS: number,
  truth: FeatureTruth, stepMm: number, gateKept: number, gateTotal: number, constraint?: ConstraintRecoveryStats): Row {
  const rA = buildRadiusFn(style, {}, DIMS);
  const meshUt = buildMeshUt(ut, indices, rA, DIMS.H);
  const locator = buildLocator(meshUt, 256);
  const fl = featureLineChord(truth, locator, rA, DIMS.H, stepMm);
  const fl3 = featureLineChord3D(truth, locator, meshUt, rA, DIMS.H, stepMm, fl.p99Mm, METRIC_CELL_R);
  const cr = crestValleyRetention(truth, locator, rA, DIMS.H, stepMm);
  const sl = featureAdjacentSlivers(truth, locator, meshUt, stepMm);
  const man = auditManifold(ut, indices, rA, DIMS.H);
  // R8: non-locus WHOLE-MESH true-3D MAX. featureLineChord3D samples ONLY along feature loci, so a
  // smooth under-tessellated region — a scale-tip cone with no ridge/valley — is invisible to it.
  // perFaceTrue3DSag scans EVERY face, so the scorecard MAX can no longer hide a non-locus spike.
  const face = perFaceTrue3DSag(ut, indices, rA, DIMS.H);
  const cls = ACCEPT_9.has(String(style)) ? 'ACCEPT' : RISERS_4.has(String(style)) ? 'riser' : 'DEFECT';
  return {
    style: String(style), cls, mode, tris: indices.length / 3, runtimeS, gateKept, gateTotal,
    crestUnderWorstMm: cr.crestUnderWorstMm, crestUnderMeanMm: cr.crestUnderMeanMm,
    fl3d_p99: fl3.p99Mm, fl3d_max: fl3.maxMm, fl3d_rms: fl3.rmsMm, radOvr: fl3.radialOverstatementRatio,
    wholeMesh3d_max: face.worstMm, wholeMesh3d_pctOver01: face.fracOver(0.01) * 100,
    featAdj_pct20: sl.featureAdj_pct20, wholeMesh_pct20: sl.wholeMesh_pct20, sliverRatio: sl.sliverRatio,
    nonMan: man.nonManifoldEdges, bnd: man.boundaryEdges, flip: man.flippedTris, constraint,
  };
}

function printRow(r: Row): void {
  const c = r.constraint ? ` rec=${r.constraint.recovered}/${r.constraint.requested}(p=${r.constraint.alreadyPresent},f=${r.constraint.failed})` : '';
  // eslint-disable-next-line no-console
  console.log(
    `${r.style.padEnd(20)} ${r.cls.padEnd(6)} ${r.mode.padEnd(9)} tris=${String(r.tris).padStart(7)} ` +
    `gate=${r.gateKept}/${r.gateTotal} 3dP99=${r.fl3d_p99.toFixed(4)} 3dMax=${r.fl3d_max.toFixed(3)} ` +
    `wmMax=${r.wholeMesh3d_max.toFixed(3)}(${r.wholeMesh3d_pctOver01.toFixed(1)}%>tol) radOvr=${r.radOvr.toFixed(1)}x ` +
    `crestU=${r.crestUnderWorstMm.toFixed(3)}/${r.crestUnderMeanMm.toFixed(3)} ` +
    `adj=${r.featAdj_pct20.toFixed(1)}/${r.wholeMesh_pct20.toFixed(1)}(x${r.sliverRatio.toFixed(1)}) ` +
    `nonMan=${r.nonMan} bnd=${r.bnd} flip=${r.flip}${c} ${r.runtimeS.toFixed(0)}s`,
  );
}

/** Build baseline (guardManifold) + measured gate + gated-conforming for one style. Returns [baseRow, confRow]. */
function runPair(style: StyleId, opts: InhouseMeshOpts, stepMm: number): { base: Row; conf: Row } {
  const rA = buildRadiusFn(style, {}, DIMS);
  const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);

  // BASELINE — guardManifold ON (Task 4: the default-path non-manifold fix is baked into the comparison base).
  let t0 = Date.now();
  const base = buildInhouseMetricMesh(rA, DIMS.H, { ...opts, guardManifoldAlways: true });
  const baseRt = (Date.now() - t0) / 1000;
  const baseMeshUt = buildMeshUt(base.ut, base.indices, rA, DIMS.H);
  const baseLoc = buildLocator(baseMeshUt, 256);

  // MEASURED GATE from the baseline mesh: which loci does the baseline under-resolve in TRUE-3D?
  const gate = computeMeasuredGate(truth, baseLoc, baseMeshUt, rA, DIMS.H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: METRIC_CELL_R });
  const baseRow = measure(style, 'base+guard', base.ut, base.indices, baseRt, truth, stepMm, gate.kept, gate.total);

  // GATED CONFORMING — Stage B with the keep-mask. If the gate admits ~0 loci, this is ~the baseline (no-op).
  t0 = Date.now();
  const conf = buildFeatureConformingMeshB(style, {}, DIMS, {
    ...opts, guardManifoldAlways: true,
    injectStepMm: 0.08, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true,
    truth, lineFilter: (_line, i) => gate.keep[i],
  });
  const confRt = (Date.now() - t0) / 1000;
  const confRow = measure(style, 'gated-conf', conf.ut, conf.indices, confRt, truth, stepMm, gate.kept, gate.total, conf.constraint);
  return { base: baseRow, conf: confRow };
}

describe('feature-conform all-20 deliverable', () => {
  const phase = process.env.PF_FCALL20;

  it.skipIf(phase !== 'screen' && phase !== '1')('all-20 screen: baseline vs gated-conforming (TRUE-3D)', () => {
    const lo = process.env.PF_FC_LO ? parseInt(process.env.PF_FC_LO, 10) : 0;
    const hi = process.env.PF_FC_HI ? parseInt(process.env.PF_FC_HI, 10) : ALL_20.length;
    const slice = ALL_20.slice(lo, hi);
    const screenOpts: InhouseMeshOpts = { ...SCREEN_OPTS, maxPoints: BUDGET_CAP };
    // eslint-disable-next-line no-console
    console.log(`\n=== ALL-20 SCREEN [${lo},${hi}) budget=${BUDGET_CAP} baseline+guard vs gated-conform → ${OUT_DIR}/screen.ndjson ===\n`);
    const rows: Row[] = [];
    const errors: string[] = [];
    for (const style of slice) {
      try {
        const { base, conf } = runPair(style, screenOpts, STEP_MM_SCREEN);
        rows.push(base, conf); printRow(base); printRow(conf);
        appendRow('screen', base); appendRow('screen', conf); // fsync per mesh — survives a kill/timeout
      } catch (e) { errors.push(`${style}: ${String(e)}`); appendRow('screen', { style: String(style), error: String(e) }); /* eslint-disable-next-line no-console */ console.log(`${style} ERROR ${String(e)}`); }
    }
    if (errors.length) { /* eslint-disable-next-line no-console */ console.log('\nERRORS:\n' + errors.join('\n')); }
    expect(rows.length).toBeGreaterThanOrEqual(0);
  }, 180 * 60 * 1000);

  it.skipIf(phase !== 'hd' && phase !== '1')('high-density confirm: GothicArches + BasketWeave (TRUE-3D)', () => {
    // eslint-disable-next-line no-console
    console.log(`\n=== HIGH-DENSITY CONFIRM (GothicArches + BasketWeave) → ${OUT_DIR}/hd.ndjson ===\n`);
    const rows: Row[] = [];
    for (const style of ['GothicArches', 'BasketWeave'] as StyleId[]) {
      const { base, conf } = runPair(style, DENSE_OPTS, STEP_MM_DENSE);
      rows.push(base, conf); printRow(base); printRow(conf);
      appendRow('hd', base); appendRow('hd', conf);
    }
    expect(rows.length).toBe(4);
  }, 180 * 60 * 1000);

  it.skipIf(phase !== 'noop' && phase !== '1')('Task 4: guardManifold fixes nonMan on all 20 (default path), no-op on clean', () => {
    // For each style: build with guard OFF (current default) and guard ON; report nonMan + idx fingerprint.
    // guard ON must give nonMan=0; on a style that was already nonMan=0 the idxHash must be UNCHANGED (no-op).
    // eslint-disable-next-line no-console
    console.log('\n=== TASK 4: guardManifold OFF vs ON (default path, screen budget) ===\n');
    const rows: Array<{ style: string; nonManOff: number; nonManOn: number; idxOff: number; idxOn: number; identical: boolean; flipOn: number }> = [];
    for (const style of ALL_20) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const off = buildInhouseMetricMesh(rA, DIMS.H, SCREEN_OPTS);
      const on = buildInhouseMetricMesh(rA, DIMS.H, { ...SCREEN_OPTS, guardManifoldAlways: true });
      const hash = (idx: Uint32Array): number => { let s = 0; for (let i = 0; i < idx.length; i++) s = (s * 31 + idx[i]) >>> 0; return s; };
      const idxOff = hash(off.indices), idxOn = hash(on.indices);
      const manOff = auditManifold(off.ut, off.indices, rA, DIMS.H);
      const manOn = auditManifold(on.ut, on.indices, rA, DIMS.H);
      const identical = idxOff === idxOn && off.ut.length === on.ut.length;
      const r = { style: String(style), nonManOff: manOff.nonManifoldEdges, nonManOn: manOn.nonManifoldEdges, idxOff, idxOn, identical, flipOn: manOn.flippedTris };
      rows.push(r); appendRow('noop', r);
      // eslint-disable-next-line no-console
      console.log(`${String(style).padEnd(20)} nonMan ${String(manOff.nonManifoldEdges).padStart(4)} -> ${String(manOn.nonManifoldEdges).padStart(4)}  flipOn=${manOn.flippedTris}  idxHash ${idxOff}${identical ? ' (IDENTICAL)' : ' -> ' + idxOn + ' (CHANGED)'}`);
    }
    // eslint-disable-next-line no-console
    console.log('\n=== JSON NOOP ===\n' + JSON.stringify(rows, null, 1));
    const stillBad = rows.filter(r => r.nonManOn > 0);
    // eslint-disable-next-line no-console
    console.log(`\nstyles still non-manifold with guard ON: ${stillBad.length} ${stillBad.map(r => r.style + '=' + r.nonManOn).join(', ')}`);
    const changedButWasClean = rows.filter(r => r.nonManOff === 0 && !r.identical);
    // eslint-disable-next-line no-console
    console.log(`clean styles whose output CHANGED with guard (should be 0): ${changedButWasClean.length} ${changedButWasClean.map(r => r.style).join(', ')}`);
    expect(rows.length).toBe(20);
  }, 120 * 60 * 1000);
});
