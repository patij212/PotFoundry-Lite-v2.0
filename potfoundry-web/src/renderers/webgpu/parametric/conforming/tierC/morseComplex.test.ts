import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';

// Full detector pass (fineRes 120) + iterative planarization on the Gothic rib
// net — build-bound, give it headroom.
const HEAVY_BUILD_TIMEOUT_MS = 60_000;

describe('Tier-C Morse protected complex', () => {
  it(
    'GothicArches: residualCrossings-0 PSLG, ≥99% recovery, junction 0-cells',
    () => {
      const sampler = styleSampler('GothicArches', {}, {
        H: 120,
        Rt: 50,
        Rb: 40,
      });
      const complex = buildProtectedComplex(sampler, 'GothicArches');

      // Non-trivial extraction: the rib net must survive conditioning.
      expect(complex.edges.length).toBeGreaterThan(0);
      expect(complex.vertices.length / 2).toBeGreaterThan(2);

      // The FGJ-proven invariants (research/bridge/_pf_perfect_gothic*):
      // exactly planar in the mm metric cdt2d consumes, without losing the
      // feature geometry.
      expect(complex.residualCrossings).toBe(0);
      expect(complex.recoveryPct).toBeGreaterThanOrEqual(99);

      // Gothic is count-unstable: its diagonal net births/merges crest
      // families, so the planarized skeleton must carry junction 0-cells.
      expect(complex.junctions.length).toBeGreaterThan(0);

      // Every junction index refers to a real vertex.
      for (const j of complex.junctions) {
        expect(j).toBeGreaterThanOrEqual(0);
        expect(j).toBeLessThan(complex.vertices.length / 2);
      }
    },
    HEAVY_BUILD_TIMEOUT_MS,
  );
});
