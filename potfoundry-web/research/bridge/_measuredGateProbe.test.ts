// _measuredGateProbe.test.ts — DEV-ONLY (env PF_MGATE=1). CHEAP DISCRIMINATOR for the MEASURED gate (Task 2).
//
// Builds a small baseline metric mesh per style and runs computeMeasuredGate. Pre-registered T2 control:
// the gate must admit ~0 loci on the 9 ACCEPT styles (no-regression by construction) and many on the DEFECT
// pair (GothicArches/BasketWeave). This validates the gate mechanism in minutes before the full all-20
// metric measurement.
//
// Run: PF_MGATE=1 npx vitest run research/bridge/_measuredGateProbe.test.ts
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt, buildLocator, buildFeatureTruth } from './featureLocalizedFidelity';
import { computeMeasuredGate } from './featureSharpnessGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;

// small-but-representative baseline (density-invariant per R2, so a modest budget gives the same gate verdict).
const OPTS: InhouseMeshOpts = {
  tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 400_000, splitThresh: 1.5, optimizeSweeps: 2,
};

// representative subset: all 9 accepts + the must-improve defect pair + 2 risers + 1 more defect.
const PROBE: Array<{ style: StyleId; cls: string }> = [
  { style: 'HarmonicRipple', cls: 'ACCEPT' }, { style: 'FourierBloom', cls: 'ACCEPT' },
  { style: 'SpiralRidges', cls: 'ACCEPT' }, { style: 'SuperellipseMorph', cls: 'ACCEPT' },
  { style: 'WaveInterference', cls: 'ACCEPT' }, { style: 'RippleInterference', cls: 'ACCEPT' },
  { style: 'Voronoi', cls: 'ACCEPT' }, { style: 'HexagonalHive', cls: 'ACCEPT' },
  { style: 'Crystalline', cls: 'ACCEPT' },
  { style: 'GothicArches', cls: 'DEFECT' }, { style: 'BasketWeave', cls: 'DEFECT' },
  { style: 'GyroidManifold', cls: 'DEFECT' },
  { style: 'ArtDeco', cls: 'riser' }, { style: 'GeometricStar', cls: 'riser' },
];

describe('measured gate probe', () => {
  it.skipIf(!process.env.PF_MGATE)('kept-loci per style (true-3D floor 0.1mm)', () => {
    const acceptKept: number[] = [];
    // eslint-disable-next-line no-console
    console.log('\n=== MEASURED GATE PROBE (true-3D floor=0.1mm, baseline 400k) ===');
    for (const { style, cls } of PROBE) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, OPTS);
      const meshUt = buildMeshUt(mesh.ut, mesh.indices, rA, DIMS.H);
      const locator = buildLocator(meshUt, 256);
      const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);
      const g = computeMeasuredGate(truth, locator, meshUt, rA, DIMS.H, { stepMm: 0.1, trueFloorMm: 0.1, cellR: 4 });
      const labelStr = Object.entries(g.byLabel).map(([k, v]) => `${k.replace('-truth', '')}=${v.kept}/${v.total}`).join(' ');
      // eslint-disable-next-line no-console
      console.log(`  ${String(style).padEnd(20)} ${cls} kept=${String(g.kept).padStart(6)}/${String(g.total).padStart(6)} worstGap=${g.worstGapMm.toFixed(3)}mm  [${labelStr}]`);
      if (cls === 'ACCEPT') acceptKept.push(g.kept);
    }
    const maxAcceptKept = Math.max(...acceptKept);
    // eslint-disable-next-line no-console
    console.log(`\n  --> max kept among the 9 ACCEPT styles: ${maxAcceptKept} (T2 wants ~0)`);
    expect(acceptKept.length).toBe(9);
  }, 60 * 60 * 1000);
});
