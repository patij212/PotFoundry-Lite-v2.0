// _budgetLocalize.test.ts — DEV-ONLY (env PF_BUDLOC=1). E-2026-07-01-CRESTAWARE decision probe. Sizing-based
// aliasing fixes (loci overlay, denser subsamples) all REGRESS at equal budget (they flatten peakRatio but 3x
// over05 — the residual is constraint-RECOVERY-limited, not sizing-limited). So test the REAL lever: config B
// (the SF stack at the LEAST-aggressive subs=2) at INCREASING budget. Does RED/YEL/worst monotonically shrink toward
// 0 (reducible = more work) or plateau (irreducible floor)? AND localize the worst faces at the top budget: are they
// (i) constraint-recovery-failed locked spans, (ii) near-C0 arch-tip cusps, or (iii) crest-straddle? That names the
// true residual + the real green lever. Checkpoint-dumps each budget. Run: PF_BUDLOC=1 npx vitest run <this>.
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

// characterize the worst faces: steepness |dr/dz|, local d2r/du2 & d2r/dt2, t-band, fracU512.
function localizeWorst(ut: number[], indices: Uint32Array, rA: (th: number, z: number) => number, H: number, thr: number): void {
  const nV = ut.length / 2, nF = indices.length / 3;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const worst: Array<{ u: number; t: number; sag: number }> = [];
  const tband = new Array(10).fill(0); const fracUhi: number[] = []; let over = 0;
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
    if (sag > thr) {
      over++; const uu = ((((ua + ub + uc) / 3) % 1) + 1) % 1, tt = (ta + tb + tc) / 3;
      tband[Math.min(9, Math.floor(tt * 10))]++; fracUhi.push((((uu * 512) % 1) + 1) % 1);
      worst.push({ u: uu, t: tt, sag });
    }
  }
  worst.sort((p, q) => q.sag - p.sag);
  const histU = new Array(10).fill(0); for (const f of fracUhi) histU[Math.min(9, Math.floor(f * 10))]++;
  // per-worst-face local curvature (steepness + 2nd derivs), for the top 12.
  const rAt = (u: number, t: number): number => { let uu = u - Math.floor(u); if (uu < 0) uu += 1; const tc = t < 0 ? 0 : t > 1 ? 1 : t; return rA(TAU * uu, tc * H); };
  // eslint-disable-next-line no-console
  console.log(`  worst>${thr}: ${over} faces | tband=[${tband.join(',')}] fracU512=[${histU.join(',')}]`);
  const lines: string[] = [];
  for (const w of worst.slice(0, 12)) {
    const hh = 1 / 4096;
    const drdu = (rAt(w.u + hh, w.t) - rAt(w.u - hh, w.t)) / (2 * hh);
    const drdt = (rAt(w.u, w.t + hh) - rAt(w.u, w.t - hh)) / (2 * hh);
    const d2u = (rAt(w.u + hh, w.t) - 2 * rAt(w.u, w.t) + rAt(w.u - hh, w.t)) / (hh * hh);
    const d2t = (rAt(w.u, w.t + hh) - 2 * rAt(w.u, w.t) + rAt(w.u, w.t - hh)) / (hh * hh);
    // steepness |dr/dz| = |dr/dt| / H
    lines.push(`(${w.u.toFixed(3)},${w.t.toFixed(3)},sag=${w.sag.toFixed(2)},|dr/dz|=${(Math.abs(drdt) / H).toFixed(2)},d2u=${d2u.toExponential(1)},d2t=${d2t.toExponential(1)})`);
  }
  // eslint-disable-next-line no-console
  console.log(`  top12: ${lines.join(' ')}`);
}

describe('config-B budget sweep + worst localization', () => {
  it.skipIf(process.env.PF_BUDLOC !== '1')('subs2 stack at rising budget → reducible or floor?', () => {
    mkdirSync(OUT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const truth = buildFeatureTruth(STYLE, {}, DIMS, TRUTH_RES);
    const OPTS: InhouseMeshOpts = { tolMm: 0.02, hMin: 0.015, hMax: 8, sizeRes: 512, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5, optimizeSweeps: 2 };
    const base = buildInhouseMetricMesh(rA, H, { ...OPTS, maxPoints: 2_500_000, guardManifoldAlways: true });
    const baseM = buildMeshUt(base.ut, base.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    const common = { ...OPTS, guardManifoldAlways: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gate.keep[i], planarizeConstraints: true as const, chordTolMm: 0.02, chordSteiner: true as const, curvatureFineStep: 1 / 2048, curvatureSubsamples: 2, profile: true };

    for (const budget of [2_500_000, 5_000_000, 9_000_000]) {
      const m = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, maxPoints: budget });
      const idx = Uint32Array.from(m.indices); const mesh = buildMeshUt(m.ut, idx, rA, H);
      const sag = perFaceChordSag(m.ut, idx, rA, H); const nF = idx.length / 3;
      let red = 0, yel = 0, o10 = 0; for (let f = 0; f < nF; f++) { const e = sag.faceErr[f]; if (e > 0.15) red++; if (e > 0.1) o10++; if (e > 0.05) yel++; }
      const nonMan = auditNonManByIndex(mesh.xyz, idx);
      const rec = m.constraint;
      dumpRenderBins(OUT, `gothic_bud${budget / 1e6}M`, mesh.xyz, idx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { ruler: 'radial', worstMm: sag.worstMm, pctRed: 100 * red / nF, pctYel: 100 * yel / nF, nonMan } });
      // eslint-disable-next-line no-console
      console.log(`BUD=${budget / 1e6}M tris=${String(nF).padStart(8)} worst=${sag.worstMm.toFixed(3)} RED=${(100 * red / nF).toFixed(5)}% >0.1=${(100 * o10 / nF).toFixed(5)}% YEL=${(100 * yel / nF).toFixed(5)}% nonMan=${nonMan} recFail=${rec?.failed ?? '?'}/${rec?.requested ?? '?'}`);
      localizeWorst(m.ut, idx, rA, H, 0.05);
    }
    expect(true).toBe(true);
  }, 180 * 60 * 1000);
});
