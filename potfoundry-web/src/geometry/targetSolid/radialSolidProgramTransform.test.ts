import { describe, expect, it } from 'vitest';

import {
  deriveRadialClearanceTargetProgram,
  deriveRadialFixedRadiusTargetProgram,
  deriveRadialInnerCapTargetProgram,
  deriveRadialOffsetTargetProgram,
  deriveRadialOuterCapTargetProgram,
  deriveRadialRimTargetProgram,
} from './radialSolidProgramTransform';
import { ValidatedTargetProgramBuilder } from './validatedTargetProgramBuilder';

function sourceProgram(): string {
  const builder = new ValidatedTargetProgramBuilder();
  const u = builder.u();
  const v = builder.v();
  const theta = builder.multiply(builder.tau(), u);
  const radius = builder.add(builder.constantDecimal('10'), v);
  return builder.buildCanonicalProgram(
    { evaluatorId: 'test.outer', evaluatorVersion: 'v1', patchId: 'outer' },
    {
      x: builder.multiply(radius, builder.cos(theta)),
      y: builder.multiply(radius, builder.sin(theta)),
      z: builder.multiply(builder.constantDecimal('20'), v),
    }
  );
}

describe('radial full-solid SSA transforms', () => {
  it('derives an affine-clipped radial inner offset from the exact source graph', () => {
    const transformed = deriveRadialOffsetTargetProgram(
      sourceProgram(),
      { evaluatorId: 'test.inner', evaluatorVersion: 'v1', patchId: 'inner' },
      { sourceVStart: 0.25, sourceVEnd: 0.75, wallThicknessMm: 2, minimumRadiusMm: 0.5 }
    );
    expect(transformed.backends.evaluateFloat64(0, 0)).toEqual([8.25, 0, 5]);
    expect(transformed.backends.evaluateFloat64(0, 1)).toEqual([8.75, 0, 15]);
    expect(transformed.sourceProgramSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(transformed.programSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(transformed.programCanonicalJson).not.toContain('"op":"divide"');
  });

  it('derives rim and cap images while preserving source angle placement', () => {
    const rim = deriveRadialRimTargetProgram(
      sourceProgram(),
      { evaluatorId: 'test.rim', evaluatorVersion: 'v1', patchId: 'rim' },
      { sourceV: 1, wallThicknessMm: 2, minimumRadiusMm: 0.5 }
    );
    expect(rim.backends.evaluateFloat64(0, 0)).toEqual([9, 0, 20]);
    expect(rim.backends.evaluateFloat64(0, 1)).toEqual([11, 0, 20]);

    const under = deriveRadialOuterCapTargetProgram(
      sourceProgram(),
      { evaluatorId: 'test.under', evaluatorVersion: 'v1', patchId: 'under' },
      { sourceV: 0, wallThicknessMm: 2, minimumRadiusMm: 0.5, endRadiusMm: 0, zMm: 0 }
    );
    expect(under.backends.evaluateFloat64(0, 0)).toEqual([10, 0, 0]);
    expect(under.backends.evaluateFloat64(0, 1)).toEqual([0, 0, 0]);

    const floor = deriveRadialInnerCapTargetProgram(
      sourceProgram(),
      { evaluatorId: 'test.floor', evaluatorVersion: 'v1', patchId: 'floor' },
      { sourceV: 0.15, wallThicknessMm: 2, minimumRadiusMm: 0.5, endRadiusMm: 2, zMm: 3 }
    );
    expect(floor.backends.evaluateFloat64(0, 0)).toEqual([8.15, 0, 3]);
    const floorCentre = floor.backends.evaluateFloat64(0, 1);
    expect(floorCentre[0]).toBeCloseTo(2, 14);
    expect(floorCentre.slice(1)).toEqual([0, 3]);

    const sourceBoundaryFloor = deriveRadialInnerCapTargetProgram(
      sourceProgram(),
      { evaluatorId: 'test.boundary-floor', evaluatorVersion: 'v1', patchId: 'boundary-floor' },
      {
        sourceV: 0.15,
        wallThicknessMm: 2,
        minimumRadiusMm: 0.5,
        endRadiusMm: 2,
        zMode: 'source-boundary',
      }
    );
    expect(sourceBoundaryFloor.backends.evaluateFloat64(0, 0)[2]).toBe(3);
  });

  it('matches the production radial floor and rejects malformed sources/options', () => {
    const clearance = deriveRadialClearanceTargetProgram(
      sourceProgram(),
      { evaluatorId: 'test.clearance', evaluatorVersion: 'v1', patchId: 'clearance' },
      { wallThicknessMm: 2, minimumRadiusMm: 0.5 }
    );
    expect(clearance.backends.evaluateFloat64(0, 0)).toEqual([7.5, 0, 0]);
    expect(clearance.backends.evaluateFloat64(0, 1)).toEqual([8.5, 0, 0]);

    const cylinder = deriveRadialFixedRadiusTargetProgram(
      sourceProgram(),
      { evaluatorId: 'test.cylinder', evaluatorVersion: 'v1', patchId: 'drain-wall' },
      { sourceVStart: 0, sourceVEnd: 0.15, radiusMm: 2, reverseU: true }
    );
    const cylinderBottom = cylinder.backends.evaluateFloat64(0, 0);
    const cylinderTop = cylinder.backends.evaluateFloat64(0, 1);
    expect(cylinderBottom[0]).toBeCloseTo(2, 14);
    expect(cylinderBottom[1]).toBeCloseTo(0, 14);
    expect(cylinderBottom[2]).toBe(0);
    expect(cylinderTop[0]).toBeCloseTo(2, 14);
    expect(cylinderTop[1]).toBeCloseTo(0, 14);
    expect(cylinderTop[2]).toBe(3);
    const reversedQuarter = cylinder.backends.evaluateFloat64(0.25, 0);
    expect(reversedQuarter[0]).toBeCloseTo(0, 14);
    expect(reversedQuarter[1]).toBeCloseTo(-2, 14);

    const clamped = deriveRadialOffsetTargetProgram(
      sourceProgram(),
      { evaluatorId: 'test.clamp', evaluatorVersion: 'v1', patchId: 'clamp' },
      { sourceVStart: 0, sourceVEnd: 0, wallThicknessMm: 20, minimumRadiusMm: 0.5 }
    );
    expect(clamped.backends.evaluateFloat64(0, 0)).toEqual([0.5, 0, 0]);
    expect(() => deriveRadialOffsetTargetProgram(
      '{}',
      { evaluatorId: 'bad', evaluatorVersion: 'v1', patchId: 'bad' },
      { sourceVStart: 0, sourceVEnd: 1, wallThicknessMm: 2, minimumRadiusMm: 0.5 }
    )).toThrow();
    expect(() => deriveRadialRimTargetProgram(
      sourceProgram(),
      { evaluatorId: 'bad', evaluatorVersion: 'v1', patchId: 'bad' },
      { sourceV: 1, wallThicknessMm: Number.NaN, minimumRadiusMm: 0.5 }
    )).toThrow(/finite/i);
    expect(() => deriveRadialInnerCapTargetProgram(
      sourceProgram(),
      { evaluatorId: 'bad', evaluatorVersion: 'v1', patchId: 'bad' },
      {
        sourceV: 0.15,
        wallThicknessMm: 2,
        minimumRadiusMm: 0.5,
        endRadiusMm: 2,
        zMode: 'source-boundary',
        zMm: 3,
      }
    )).toThrow(/must be omitted/i);
  });
});
