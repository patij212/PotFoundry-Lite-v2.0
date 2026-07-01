// _crestAwareScreen.test.ts — DEV-ONLY (env PF_CRESTSCREEN=1). E-2026-07-01-CRESTAWARE mechanism SCREEN.
// A/B at EQUAL, MODERATE budget: gated-conforming GothicArches with crest-aware sizing OFF vs ON. Measures per-face
// RADIAL chord sag (the heatmap, brief primary metric) + the _residualLocalize fracU histogram (mechanism proof:
// does crest-aware FLATTEN the fracU 0.35/0.65 peaks?). Dumps each mesh the INSTANT it is built (checkpoint) so a
// killed run keeps completed meshes. Cheap enough to survive the environment (moderate budget, ~minutes).
//
// Run: PF_CRESTSCREEN=1 npx vitest run research/bridge/_crestAwareScreen.test.ts
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

function hist(fracs: number[], bins: number): number[] {
  const h = new Array(bins).fill(0);
  for (const f of fracs) h[Math.min(bins - 1, Math.floor(f * bins))]++;
  return h;
}

/** fracU histogram of the residual (>0.05mm) faces at grid period `period`. Mechanism proof for aliasing. */
function fracUHist(ut: number[], indices: Uint32Array, rA: (th: number, z: number) => number, H: number, period: number): { over05: number; nF: number; histU: number[]; meanU: number } {
  const BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
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
    if (sag > 0.05) { over05++; const cu3 = ((((ua + ub + uc) / 3) % 1) + 1) % 1; fracU.push((((cu3 * period) % 1) + 1) % 1); }
  }
  const meanU = fracU.reduce((s, x) => s + x, 0) / (fracU.length || 1);
  return { over05, nF, histU: hist(fracU, 10), meanU };
}

function measureDump(label: string, ut: number[], indices: Uint32Array, rA: (th: number, z: number) => number, H: number): { tris: number; worst: number; red: number; yel: number; over10: number; nonMan: number } {
  const m = buildMeshUt(ut, indices, rA, H);
  const sag = perFaceChordSag(ut, indices, rA, H);
  const nF = indices.length / 3;
  let red = 0, yel = 0, over10 = 0;
  for (let f = 0; f < nF; f++) { const e = sag.faceErr[f]; if (e > 0.15) red++; if (e > 0.1) over10++; if (e > 0.05) yel++; }
  const nonMan = auditNonManByIndex(m.xyz, indices);
  dumpRenderBins(OUT, label, m.xyz, indices, {
    colors: vertErrColors(sag.vertErr, 0.15),
    meta: { ruler: 'radial', worstMm: sag.worstMm, pctRed: 100 * red / nF, pctYel: 100 * yel / nF, nonMan },
  });
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(30)} tris=${String(nF).padStart(8)} worst=${sag.worstMm.toFixed(3)}mm RED(>0.15)=${(100 * red / nF).toFixed(4)}% >0.1=${(100 * over10 / nF).toFixed(4)}% YEL(>0.05)=${(100 * yel / nF).toFixed(4)}% nonMan=${nonMan}`);
  return { tris: nF, worst: sag.worstMm, red: 100 * red / nF, yel: 100 * yel / nF, over10: 100 * over10 / nF, nonMan };
}

describe('crest-aware sizing SCREEN (mechanism)', () => {
  it.skipIf(process.env.PF_CRESTSCREEN !== '1')('OFF vs ON at equal moderate budget', () => {
    mkdirSync(OUT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const truth = buildFeatureTruth(STYLE, {}, DIMS, TRUTH_RES);
    // moderate-budget base to build the gate (same recipe family as SF but coarser sizing → survivable)
    const OPTS: InhouseMeshOpts = { tolMm: 0.03, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 2_000_000, splitThresh: 1.5, optimizeSweeps: 2 };
    const base = buildInhouseMetricMesh(rA, H, { ...OPTS, guardManifoldAlways: true });
    const baseM = buildMeshUt(base.ut, base.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    const common = { ...OPTS, guardManifoldAlways: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gate.keep[i], profile: true };

    // A/B at the SAME sizing config (sizeRes 256, tolMm 0.03) — the ONLY delta is crestAwareSizing.
    // OFF:
    const off = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, planarizeConstraints: true, chordTolMm: 0.03, chordSteiner: true });
    const offIdx = Uint32Array.from(off.indices);
    const rOff = measureDump('GothicArches_crestaware_off', off.ut, offIdx, rA, H);
    const hOff = fracUHist(off.ut, offIdx, rA, H, 256);
    // eslint-disable-next-line no-console
    console.log(`  OFF fracU256 hist (cell-CENTER≈bin5): [${hOff.histU.join(', ')}] over05=${hOff.over05} meanU=${hOff.meanU.toFixed(3)}`);

    // ON (crest-aware sizing overlay from ALL detected loci):
    const on = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, planarizeConstraints: true, chordTolMm: 0.03, chordSteiner: true, crestAwareSizing: true, crestBandCells: 1 });
    const onIdx = Uint32Array.from(on.indices);
    const rOn = measureDump('GothicArches_crestaware_on', on.ut, onIdx, rA, H);
    const hOn = fracUHist(on.ut, onIdx, rA, H, 256);
    // eslint-disable-next-line no-console
    console.log(`  ON  fracU256 hist (cell-CENTER≈bin5): [${hOn.histU.join(', ')}] over05=${hOn.over05} meanU=${hOn.meanU.toFixed(3)}`);
    // eslint-disable-next-line no-console
    console.log(`  DELTA: tris ${rOff.tris}->${rOn.tris}  worst ${rOff.worst.toFixed(3)}->${rOn.worst.toFixed(3)}  RED ${rOff.red.toFixed(4)}->${rOn.red.toFixed(4)}  YEL ${rOff.yel.toFixed(4)}->${rOn.yel.toFixed(4)}  over05faces ${hOff.over05}->${hOn.over05}`);
    expect(rOn.nonMan).toBe(0);
  }, 60 * 60 * 1000);
});
