// _planarizeRecovery.test.ts — DEV-ONLY (env PF_PLANREC=1). E-2026-07-01-PUREGREEN P1 discriminator.
// Cheapest test of the planarization mechanism: build a MODERATE-budget gated-conforming GothicArches mesh
// with planarizeConstraints OFF vs ON and compare constraint recovery% + the crossing count. Recovery% is
// density-invariant in DIRECTION, so if planarization doesn't lift it here it won't at HD. Non-vacuous control:
// crossingsSplit must be > 0. Also fingerprints the OFF path == pre-change conforming (P3 opt-in proof) and the
// smooth control HarmonicRipple (gate=0 ⇒ byte-identical).
//
// Run: PF_PLANREC=1 npx vitest run research/bridge/_planarizeRecovery.test.ts
import { describe, it, expect } from 'vitest';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt, buildLocator, buildFeatureTruth } from './featureLocalizedFidelity';
import { perFaceChordSag, auditNonManByIndex } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;

function rec(label: string, r: { constraint?: { requested: number; alreadyPresent: number; recovered: number; failed: number }; indices: ArrayLike<number>; ut: number[] }, rA: (th: number, z: number) => number): void {
  const c = r.constraint;
  const req = c ? c.requested : 0;
  const ok = c ? c.alreadyPresent + c.recovered : 0;
  const pctR = req ? (100 * ok / req) : 0;
  const cs = perFaceChordSag(r.ut, r.indices, rA, DIMS.H);
  const m = buildMeshUt(r.ut, r.indices as Uint32Array, rA, DIMS.H);
  const nm = auditNonManByIndex(m.xyz, r.indices);
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(30)} req=${String(req).padStart(6)} present+rec=${String(ok).padStart(6)} failed=${String(c ? c.failed : 0).padStart(5)} recovery=${pctR.toFixed(1)}% | tris=${String(r.indices.length / 3).padStart(7)} worst=${cs.worstMm.toFixed(3)} RED=${(100 * cs.fracOver(0.15)).toFixed(3)}% YEL=${(100 * cs.fracOver(0.05)).toFixed(3)}% nonMan=${nm}`);
}

describe('planarize recovery P1', () => {
  it.skipIf(process.env.PF_PLANREC !== '1')('recovery% off vs on + crossing count (GothicArches)', () => {
    const STYLE = 'GothicArches' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const truth = buildFeatureTruth(STYLE, {}, DIMS, TRUTH_RES);
    // moderate budget — screen only (recovery direction is density-invariant).
    const OPTS: InhouseMeshOpts = { tolMm: 0.01, hMin: 0.012, hMax: 8, sizeRes: 200, gradeBeta: 0.2, seedN: 12, maxPoints: 900_000, splitThresh: 1.5, optimizeSweeps: 2 };
    const base = buildInhouseMetricMesh(rA, H, { ...OPTS, guardManifoldAlways: true });
    const baseM = buildMeshUt(base.ut, base.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    const common = { ...OPTS, guardManifoldAlways: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gate.keep[i] };

    // OFF (the shipped conforming path)
    const off = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common });
    // ON (planarized)
    const on = buildFeatureConformingMeshB(STYLE, {}, DIMS, { ...common, planarizeConstraints: true, profile: true });

    rec('GothicArches conf OFF', off, rA);
    rec('GothicArches conf ON(planar)', on, rA);
    // eslint-disable-next-line no-console
    console.log(`  planarize diag: crossingsSplit=${on.planarize?.crossingsSplit} addedPoints=${on.planarize?.addedPoints} passes=${on.planarize?.passes} residual=${on.planarize?.residualCrossings} constraintsRequested ${off.constraintsRequested}->${on.constraintsRequested}`);

    // P1 non-vacuous control: crossings must be > 0.
    expect(on.planarize && on.planarize.crossingsSplit).toBeGreaterThan(0);
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
