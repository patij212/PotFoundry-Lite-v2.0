import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex, type BandContour } from './morseComplex';

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

  it(
    'bandContours: OFF is byte-identical; ON stays planar (residualCrossings 0, recovery ≥99) and adds locked edges',
    () => {
      const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 });
      const base = buildProtectedComplex(sampler, 'GothicArches');
      // OFF (undefined) ⇒ byte-identical to no-band.
      const off = buildProtectedComplex(sampler, 'GothicArches', undefined, undefined, undefined);
      expect(off.vertices.length).toBe(base.vertices.length);
      expect(off.edges.length).toBe(base.edges.length);
      expect(JSON.stringify(off.edges)).toBe(JSON.stringify(base.edges));
      expect(JSON.stringify(off.vertices)).toBe(JSON.stringify(base.vertices));

      // ON: two toe contours flanking a rib in the gate domain (arbitrary (u,t)
      // polylines, not constant-u pickets). Must stay planar and add edges.
      const bands: BandContour[] = [
        { pts: [[0.07, 0.4], [0.08, 0.48], [0.09, 0.56]], maxChordMm: 0.12 },
        { pts: [[0.11, 0.4], [0.12, 0.48], [0.13, 0.56]], maxChordMm: 0.12 },
      ];
      const on = buildProtectedComplex(sampler, 'GothicArches', undefined, undefined, bands);
      expect(on.residualCrossings).toBe(0);
      expect(on.recoveryPct).toBeGreaterThanOrEqual(99);
      // The doubled toe band densifies to ~0.12mm pitch ⇒ strictly more edges.
      expect(on.edges.length).toBeGreaterThan(base.edges.length);
    },
    HEAVY_BUILD_TIMEOUT_MS,
  );
});
