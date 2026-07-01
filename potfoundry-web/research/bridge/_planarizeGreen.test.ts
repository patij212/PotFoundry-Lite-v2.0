// _planarizeGreen.test.ts — DEV-ONLY (env PF_PLANGREEN=1). E-2026-07-01-PUREGREEN P2: the pure-green HD push.
// GothicArches conf + PLANARIZE + guardManifoldAlways + guardRecoveryManifold + chordSteiner; iterate chordTolMm
// (0.02→0.015→0.01) + budget until per-face chord sag has 0% RED(≥0.15) AND 0% YELLOW(≥0.05). Uses the CANONICAL
// labkit instruments (perFaceChordSag / vertErrColors / dumpRenderBins / auditNonManByIndex) — no re-coded metric.
// CHECKPOINT: each variant is measured + dumped the INSTANT it is built (a killed run keeps completed variants).
//
// Which variants run is env-controlled so a killed run RESUMES only the unfinished one:
//   PF_PLANGREEN=base   → the baseline dump (GothicArches_puregreen_base.*) only
//   PF_PLANGREEN=t20    → chordTolMm 0.02   variant
//   PF_PLANGREEN=t15    → chordTolMm 0.015  variant
//   PF_PLANGREEN=t10    → chordTolMm 0.010  variant
//   PF_PLANGREEN=1      → base + t20 + t15 + t10 in sequence (each dumped as it completes)
//
// Run: PF_PLANGREEN=t20 npx vitest run research/bridge/_planarizeGreen.test.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt, buildLocator, buildFeatureTruth } from './featureLocalizedFidelity';
import { perFaceChordSag, vertErrColors, dumpRenderBins, auditNonManByIndex } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const TRUTH_RES = 384;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;
const SCALE_MM = 0.15; // heatmap red at/above
const OUT = join('research', 'exchange', '_showcase');

const rA = buildRadiusFn(STYLE, {}, DIMS);
const H = DIMS.H;
// HD base OPTS (matches the SHOWCASE/green-push density family).
const OPTS: InhouseMeshOpts = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 6_000_000, splitThresh: 1.5, optimizeSweeps: 2 };

/** measure per-face chord sag (labkit), dump bins+colours+meta, print the green scorecard row. */
function measureDump(label: string, ut: number[], indices: Uint32Array, extra: Record<string, unknown> = {}): { red: number; yel: number; worst: number; nonMan: number; tris: number } {
  const cs = perFaceChordSag(ut, indices, rA, H);
  const m = buildMeshUt(ut, indices, rA, H);
  const nonMan = auditNonManByIndex(m.xyz, indices);
  const red = cs.fracOver(0.15), yel = cs.fracOver(0.05), tris = indices.length / 3;
  const colors = vertErrColors(cs.vertErr, SCALE_MM);
  dumpRenderBins(OUT, label, m.xyz, indices, {
    colors,
    meta: { scaleMm: SCALE_MM, worst: cs.worstMm, pctOver0_15: 100 * red, pctOver0_05: 100 * yel, pctOver0_1: 100 * cs.fracOver(0.1), nonMan, ...extra },
  });
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(34)} tris=${String(tris).padStart(8)} worst=${cs.worstMm.toFixed(3)}mm | RED(>=0.15)=${(100 * red).toFixed(4)}% YEL(>=0.05)=${(100 * yel).toFixed(4)}% nonMan=${nonMan}`);
  return { red, yel, worst: cs.worstMm, nonMan, tris };
}

describe('GothicArches planarized pure-green push P2', () => {
  it.skipIf(!process.env.PF_PLANGREEN)('planarize + chord guard drives heatmap pure-green', () => {
    mkdirSync(OUT, { recursive: true });
    const mode = process.env.PF_PLANGREEN as string;
    const want = (m: string): boolean => mode === '1' || mode === m;

    const truth = buildFeatureTruth(STYLE, {}, DIMS, TRUTH_RES);
    const base = buildInhouseMetricMesh(rA, H, { ...OPTS, guardManifoldAlways: true });
    const baseM = buildMeshUt(base.ut, base.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    const common = {
      ...OPTS, guardManifoldAlways: true as const, guardRecoveryManifold: true as const,
      searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08,
      lineFilter: (_l: unknown, i: number): boolean => gate.keep[i],
      planarizeConstraints: true as const, chordSteiner: true as const, dedupeEps: 1e-7, hMin: 0.006,
    };

    if (want('base')) measureDump('GothicArches_puregreen_base', base.ut, Uint32Array.from(base.indices), { variant: 'base-metric+guard' });

    // chordTolMm sweep — each variant dumped immediately (checkpoint).
    if (want('t20')) {
      const r = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, maxPoints: 6_000_000, chordTolMm: 0.02, profile: true });
      const s = measureDump('GothicArches_puregreen_t20', r.ut, Uint32Array.from(r.indices), { variant: 'planar+steiner+chord0.02', recovery: r.constraint });
      // eslint-disable-next-line no-console
      console.log(`  t20 recovery=${r.constraint ? (100 * (r.constraint.alreadyPresent + r.constraint.recovered) / r.constraint.requested).toFixed(1) : '?'}% failed=${r.constraint?.failed} planarize crossings=${r.planarize?.crossingsSplit} residual=${r.planarize?.residualCrossings}`);
      expect(s.tris).toBeGreaterThan(0);
    }
    if (want('t15')) {
      const r = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, maxPoints: 7_000_000, chordTolMm: 0.015, profile: true });
      const s = measureDump('GothicArches_puregreen_t15', r.ut, Uint32Array.from(r.indices), { variant: 'planar+steiner+chord0.015', recovery: r.constraint });
      // eslint-disable-next-line no-console
      console.log(`  t15 recovery=${r.constraint ? (100 * (r.constraint.alreadyPresent + r.constraint.recovered) / r.constraint.requested).toFixed(1) : '?'}% failed=${r.constraint?.failed}`);
      expect(s.tris).toBeGreaterThan(0);
    }
    if (want('t10')) {
      const r = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, maxPoints: 8_000_000, chordTolMm: 0.010, profile: true });
      const s = measureDump('GothicArches_puregreen_t10', r.ut, Uint32Array.from(r.indices), { variant: 'planar+steiner+chord0.010', recovery: r.constraint });
      // eslint-disable-next-line no-console
      console.log(`  t10 recovery=${r.constraint ? (100 * (r.constraint.alreadyPresent + r.constraint.recovered) / r.constraint.requested).toFixed(1) : '?'}% failed=${r.constraint?.failed}`);
      expect(s.tris).toBeGreaterThan(0);
    }
    expect(true).toBe(true);
  }, 120 * 60 * 1000);
});
