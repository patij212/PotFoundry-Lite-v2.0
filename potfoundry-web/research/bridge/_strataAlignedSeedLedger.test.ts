import { describe, expect, it } from 'vitest';
import { buildAlignedSeed, DEFAULT_SEED_OPTS } from './_strataAlignedSeed';
import type { LocusArtifact, LocusPolyline } from './_strataLocusTrace';

function locus(id: number): LocusPolyline {
  return {
    id,
    pts: [[0.4, 0], [0.4, 5], [0.4, 10]],
    closed: false,
    lengthMm: 10,
    seamCrossings: 0,
    endReason: ['boundary', 'boundary'],
    ratioMedian: 0.25,
  };
}

function coincidentLoci(): LocusArtifact {
  return {
    schema: 'pf.strata.loci/1',
    meta: {
      H: 10,
      nu: 8,
      nv: 8,
      stepMm: 0.35,
      hRefMm: 0.35,
      kink: { scan: 16, halvings: 24, ratio: 0.15, jumpRatio: 0.62 },
      rEvals: 0,
      wallMs: 0,
    },
    counts: {
      latticeProbes: 0,
      crossings: 0,
      jumpExcluded: 0,
      seedsConsumed: 0,
      loci: 2,
      lociDropped: 0,
      junctions: 0,
      rawJunctions: 0,
      junctionCells: 0,
      polylinePts: 6,
      totalLengthMm: 20,
    },
    loci: [locus(7), locus(8)],
    junctions: [],
  };
}

describe('aligned-seed persistent constraint ledger', () => {
  it('merges coincident feature ownership without losing either stable id', () => {
    const seed = buildAlignedSeed(
      () => 40,
      coincidentLoci(),
      {
        ...DEFAULT_SEED_OPTS,
        H: 10,
        gu: 16,
        gv: 12,
        useField: false,
        acrossRings: 1,
        pslgEpsMm: 0.002,
        weldMm: 0.002,
        shapeAR: 50,
      },
    );

    expect(seed.constraintLedger).toHaveLength(seed.constraints.length);
    expect(seed.stats.constraintsRecovered).toBe(seed.stats.constraints);
    for (let index = 0; index < seed.constraints.length; index += 1) {
      expect(seed.constraintLedger[index].vertices).toEqual(seed.constraints[index]);
      expect(seed.constraintLedger[index].obligationIds).toEqual(
        [...seed.constraintLedger[index].obligationIds].sort(),
      );
    }

    const featureEdges = seed.constraintLedger.filter((entry) => (
      entry.obligationIds.some((id) => id.startsWith('feature:'))
    ));
    expect(featureEdges.length).toBeGreaterThan(0);
    expect(featureEdges.every((entry) => entry.obligationIds.includes('feature:locus:7:piece:0'))).toBe(true);
    expect(featureEdges.every((entry) => entry.obligationIds.includes('feature:locus:8:piece:0'))).toBe(true);
    expect(seed.constraintLedger.some((entry) => entry.obligationIds.some((id) => id.startsWith('boundary:')))).toBe(true);
  });
});
