// _subsamplesSweep.test.ts — DEV-ONLY (env PF_SUBS=1). E-2026-07-01-CRESTAWARE PIVOT. The loci-band overlay was
// REFUTED (budget-inefficient: it flattened the aliasing peakRatio 1.29->1.09 but TRIPLED over05 at equal budget —
// _crestAwareCompare). ROOT-CAUSE re-read: the finestep window-max samples κ at only curvatureSubsamples² points
// (default 2 → cell EDGES, offsets ±0.5·du), so a crest at fracU 0.35/0.65 between the sampled points is under-read
// → aliased. HYPOTHESIS: raising curvatureSubsamples densifies the window sampling → catches the sub-cell crest →
// flattens the fracU peak → cuts over05, at EQUAL budget (it only changes the sizing-field compute, not the point
// count). This is a budget-NEUTRAL, one-lever fix on the EXISTING mechanism. Config B (SF stack) with subs ∈ {2,5,8}.
// Run: PF_SUBS=1 npx vitest run research/bridge/_subsamplesSweep.test.ts
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
  return { over05, histU, peakRatio: mean > 0 ? Math.max(...histU) / mean : 0 };
}

describe('curvatureSubsamples sweep (aliasing vs sub-cell window density)', () => {
  it.skipIf(process.env.PF_SUBS !== '1')('subs 2 vs 5 vs 8 at equal budget', () => {
    mkdirSync(OUT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const truth = buildFeatureTruth(STYLE, {}, DIMS, TRUTH_RES);
    const OPTS: InhouseMeshOpts = { tolMm: 0.02, hMin: 0.02, hMax: 8, sizeRes: 512, gradeBeta: 0.2, seedN: 14, maxPoints: 2_500_000, splitThresh: 1.5, optimizeSweeps: 2 };
    const base = buildInhouseMetricMesh(rA, H, { ...OPTS, guardManifoldAlways: true });
    const baseM = buildMeshUt(base.ut, base.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    const common = { ...OPTS, guardManifoldAlways: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gate.keep[i], planarizeConstraints: true as const, chordTolMm: 0.03, chordSteiner: true as const, curvatureFineStep: 1 / 2048, profile: true };

    for (const subs of [2, 5, 8]) {
      const m = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, curvatureSubsamples: subs });
      const idx = Uint32Array.from(m.indices); const mesh = buildMeshUt(m.ut, idx, rA, H);
      const sag = perFaceChordSag(m.ut, idx, rA, H); const nF = idx.length / 3;
      let red = 0, yel = 0, o10 = 0; for (let f = 0; f < nF; f++) { const e = sag.faceErr[f]; if (e > 0.15) red++; if (e > 0.1) o10++; if (e > 0.05) yel++; }
      const nonMan = auditNonManByIndex(mesh.xyz, idx);
      const res = residual(m.ut, idx, rA, H);
      dumpRenderBins(OUT, `gothic_subs${subs}`, mesh.xyz, idx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { ruler: 'radial', worstMm: sag.worstMm, pctRed: 100 * red / nF, pctYel: 100 * yel / nF, nonMan } });
      // eslint-disable-next-line no-console
      console.log(`subs=${subs} tris=${String(nF).padStart(8)} worst=${sag.worstMm.toFixed(3)} RED=${(100 * red / nF).toFixed(4)}% >0.1=${(100 * o10 / nF).toFixed(4)}% YEL=${(100 * yel / nF).toFixed(4)}% nonMan=${nonMan} | over05=${res.over05} peakRatio=${res.peakRatio.toFixed(2)} hist=[${res.histU.join(',')}]`);
    }
    expect(true).toBe(true);
  }, 120 * 60 * 1000);
});
