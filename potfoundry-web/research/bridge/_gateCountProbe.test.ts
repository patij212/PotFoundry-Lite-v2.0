// _gateCountProbe.test.ts — DEV-ONLY (env PF_GATEPROBE=1). CHEAP DISCRIMINATOR for Task 2.
//
// Runs the sharpness gate on all 20 styles and prints the kept-loci count per style + per label family,
// WITHOUT meshing. Pre-registered control (E-2026-06-30-FEAT-CONFORM-ALL20 T2): a valid gate admits ~0 loci
// on the 9 ACCEPT styles and many on the DEFECT styles (GothicArches/BasketWeave). This separates "gate works"
// from "gate is vacuous" in seconds, before the expensive metric measurement.
//
// Run: PF_GATEPROBE=1 npx vitest run research/bridge/_gateCountProbe.test.ts
import { describe, it, expect } from 'vitest';
import { computeSharpnessGate, type SharpnessGateOpts } from './featureSharpnessGate';
import type { StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

const ACCEPT_9 = new Set([
  'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple', 'WaveInterference',
  'RippleInterference', 'Voronoi', 'HexagonalHive', 'Crystalline',
]);
const RISERS_4 = new Set(['ArtDeco', 'GeometricStar', 'DragonScales', 'SuperformulaBlossom']);

const ALL_20: StyleId[] = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales',
  'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet',
];

describe('sharpness gate count probe', () => {
  it.skipIf(!process.env.PF_GATEPROBE)('kept-loci per style across a threshold sweep', () => {
    // Sweep a couple of thresholds to find one that zeroes the accept styles but keeps the defects.
    const thresholds = [0.4, 0.6, 1.0, 1.5];
    for (const threshold of thresholds) {
      const opts: SharpnessGateOpts = { wMm: 0.3, threshold, truthRes: 384, creasesAlwaysSharp: true };
      // eslint-disable-next-line no-console
      console.log(`\n=== threshold=${threshold} (wMm=0.3, creases always sharp) ===`);
      const acceptKept: number[] = [];
      for (const style of ALL_20) {
        const g = computeSharpnessGate(style, {}, DIMS, opts);
        const cls = ACCEPT_9.has(String(style)) ? 'ACCEPT' : RISERS_4.has(String(style)) ? 'riser ' : 'DEFECT';
        const labelStr = Object.entries(g.byLabel).map(([k, v]) => `${k.replace('-truth', '')}=${v.kept}/${v.total}`).join(' ');
        // eslint-disable-next-line no-console
        console.log(`  ${String(style).padEnd(20)} ${cls} kept=${String(g.kept).padStart(6)}/${String(g.total).padStart(6)} maxSharp=${g.maxSharpness.toFixed(2)}  [${labelStr}]`);
        if (ACCEPT_9.has(String(style))) acceptKept.push(g.kept);
      }
      const maxAcceptKept = Math.max(...acceptKept);
      // eslint-disable-next-line no-console
      console.log(`  --> max kept among the 9 ACCEPT styles: ${maxAcceptKept}`);
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
