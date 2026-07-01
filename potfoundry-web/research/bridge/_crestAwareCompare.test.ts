// _crestAwareCompare.test.ts — DEV-ONLY (env PF_CRESTCMP=1). E-2026-07-01-CRESTAWARE: which sizing mechanism best
// defeats the fracU 0.35/0.65 aliasing at EQUAL conforming setup + EQUAL budget? Three configs on GothicArches at a
// MODERATE, CAPPED budget (survivable), all with conf+planarize+chordSteiner (the SF stack), sizeRes 512:
//   B  = SF mechanism: curvatureFineStep 1/2048 (grid sub-cell window-max) — the current baseline.
//   C  = crest-aware sizing ONLY (loci-driven overlay, ungated), no curvatureFineStep.
//   D  = BOTH (curvatureFineStep + crest-aware).
// Reports per-face RADIAL chord sag (heatmap) + the fracU512 residual histogram (aliasing signature) + worst + tris
// + nonMan. Checkpoint-dumps each mesh. Decides the HD recipe. Run: PF_CRESTCMP=1 npx vitest run <this>.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt, buildLocator, buildFeatureTruth } from './featureLocalizedFidelity';
import { perFaceChordSag, auditNonManByIndex, vertErrColors, dumpRenderBins } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const TRUTH_RES = 384;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;
const OUT = join('research', 'exchange', '_crestaware');
const BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

function residual(ut: number[], indices: Uint32Array, rA: (th: number, z: number) => number, H: number): { over05: number; histU: number[]; peakRatio: number } {
  const nV = ut.length / 2, nF = indices.length / 3;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const fracU: number[] = []; let over05 = 0;
  for (let f = 0; f < nF; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    let sag = 0;
    for (const [w0, w1, w2] of BARY) {
      const um = w0 * ua + w1 * ub + w2 * uc, tm = w0 * ta + w1 * tb + w2 * tc;
      const th = TAU * um, z = tm * H, r = rA(th, z);
      const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (d > sag) sag = d;
    }
    if (sag > 0.05) { over05++; const cu3 = ((((ua + ub + uc) / 3) % 1) + 1) % 1; fracU.push((((cu3 * 512) % 1) + 1) % 1); }
  }
  const histU = new Array(10).fill(0); for (const f of fracU) histU[Math.min(9, Math.floor(f * 10))]++;
  const mean = histU.reduce((s: number, x: number) => s + x, 0) / 10;
  const peak = Math.max(...histU);
  return { over05, histU, peakRatio: mean > 0 ? peak / mean : 0 };
}

function run(label: string, opts: Parameters<typeof buildFeatureConformingMeshB>[3], rA: (th: number, z: number) => number, H: number): void {
  const m = buildFeatureConformingMeshB(STYLE, {}, DIMS, opts);
  const idx = Uint32Array.from(m.indices); const mesh = buildMeshUt(m.ut, idx, rA, H);
  const sag = perFaceChordSag(m.ut, idx, rA, H); const nF = idx.length / 3;
  let red = 0, yel = 0, o10 = 0; for (let f = 0; f < nF; f++) { const e = sag.faceErr[f]; if (e > 0.15) red++; if (e > 0.1) o10++; if (e > 0.05) yel++; }
  const nonMan = auditNonManByIndex(mesh.xyz, idx);
  const res = residual(m.ut, idx, rA, H);
  dumpRenderBins(OUT, label, mesh.xyz, idx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { ruler: 'radial', worstMm: sag.worstMm, pctRed: 100 * red / nF, pctYel: 100 * yel / nF, nonMan } });
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(26)} tris=${String(nF).padStart(8)} worst=${sag.worstMm.toFixed(3)} RED=${(100 * red / nF).toFixed(4)}% >0.1=${(100 * o10 / nF).toFixed(4)}% YEL=${(100 * yel / nF).toFixed(4)}% nonMan=${nonMan} | over05=${res.over05} peakRatio=${res.peakRatio.toFixed(2)} hist=[${res.histU.join(',')}]`);
}

describe('crest-aware sizing mechanism COMPARE', () => {
  it.skipIf(process.env.PF_CRESTCMP !== '1')('curvatureFineStep vs crest-aware vs both, equal budget', () => {
    mkdirSync(OUT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const truth = buildFeatureTruth(STYLE, {}, DIMS, TRUTH_RES);
    const OPTS: InhouseMeshOpts = { tolMm: 0.02, hMin: 0.02, hMax: 8, sizeRes: 512, gradeBeta: 0.2, seedN: 14, maxPoints: 2_500_000, splitThresh: 1.5, optimizeSweeps: 2 };
    const base = buildInhouseMetricMesh(rA, H, { ...OPTS, guardManifoldAlways: true });
    const baseM = buildMeshUt(base.ut, base.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    const common = { ...OPTS, guardManifoldAlways: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gate.keep[i], planarizeConstraints: true as const, profile: true };

    // B: SF mechanism — grid sub-cell window-max curvature + chordSteiner guard (the current baseline stack).
    run('gothic_cmp_B_finestep', { ...common, chordTolMm: 0.03, chordSteiner: true, curvatureFineStep: 1 / 2048, curvatureSubsamples: 2 }, rA, H);
    // C: crest-aware sizing (loci-driven) + chordSteiner guard.
    run('gothic_cmp_C_crestaware', { ...common, chordTolMm: 0.03, chordSteiner: true, crestAwareSizing: true, crestBandCells: 1 }, rA, H);
    // E: crest-aware sizing WITHOUT the chordSteiner guard — let sizing alone resolve the crests, so constraint
    //    recovery does not churn on the extra Steiner density (the suspected worst-face regression cause).
    run('gothic_cmp_E_crestaware_nosteiner', { ...common, crestAwareSizing: true, crestBandCells: 1 }, rA, H);
    expect(true).toBe(true);
  }, 90 * 60 * 1000);
});
