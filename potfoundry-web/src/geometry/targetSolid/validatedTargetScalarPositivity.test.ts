import { describe, expect, it } from 'vitest';

import { deriveRadialClearanceTargetProgram } from './radialSolidProgramTransform';
import {
  proveValidatedTargetScalarPositive,
  ValidatedTargetScalarPositivityError,
} from './validatedTargetScalarPositivity';
import { ValidatedTargetProgramBuilder } from './validatedTargetProgramBuilder';

function radialSource(radiusMm: string): string {
  const builder = new ValidatedTargetProgramBuilder();
  const theta = builder.multiply(builder.tau(), builder.u());
  const radius = builder.add(builder.constantDecimal(radiusMm), builder.v());
  return builder.buildCanonicalProgram(
    { evaluatorId: 'test.radial-source', evaluatorVersion: 'v1', patchId: 'outer' },
    {
      x: builder.multiply(radius, builder.cos(theta)),
      y: builder.multiply(radius, builder.sin(theta)),
      z: builder.v(),
    }
  );
}

function scalarProgram(value: string): string {
  const builder = new ValidatedTargetProgramBuilder();
  const zero = builder.constantDecimal('0');
  return builder.buildCanonicalProgram(
    { evaluatorId: 'test.scalar', evaluatorVersion: 'v1', patchId: 'scalar' },
    { x: builder.constantDecimal(value), y: zero, z: zero }
  );
}

function straddlingScalarProgram(): string {
  const builder = new ValidatedTargetProgramBuilder();
  const zero = builder.constantDecimal('0');
  return builder.buildCanonicalProgram(
    { evaluatorId: 'test.straddling-scalar', evaluatorVersion: 'v1', patchId: 'scalar' },
    { x: builder.subtract(builder.u(), builder.constantDecimal('0.5')), y: zero, z: zero }
  );
}

describe('validated target scalar positivity', () => {
  it('proves radial clamp clearance continuously over the complete patch', () => {
    const clearance = deriveRadialClearanceTargetProgram(
      radialSource('10'),
      { evaluatorId: 'test.clearance', evaluatorVersion: 'v1', patchId: 'clearance' },
      { wallThicknessMm: 2, minimumRadiusMm: 0.5 }
    );
    const proof = proveValidatedTargetScalarPositive(clearance.programCanonicalJson);
    expect(proof.strictPositive).toBe(true);
    expect(proof.unitSquareCovered).toBe(true);
    expect(BigInt(proof.minimumTargetXLowerPm)).toBeGreaterThan(4_500_000_000n);
    expect(proof.acceptedLeafCellCount).toBe(1);
    expect(proof.evaluatorCallCount).toBe(proof.workCellCount * 2);
  });

  it('rejects a cell proven nonpositive and never samples it into acceptance', () => {
    expect(() => proveValidatedTargetScalarPositive(scalarProgram('-0.5'))).toThrow(
      expect.objectContaining<Partial<ValidatedTargetScalarPositivityError>>({
        code: 'NON_POSITIVE',
      })
    );
  });

  it('refuses resource exhaustion and honours shared cancellation', () => {
    const clearance = deriveRadialClearanceTargetProgram(
      radialSource('10'),
      { evaluatorId: 'test.clearance', evaluatorVersion: 'v1', patchId: 'clearance' },
      { wallThicknessMm: 2, minimumRadiusMm: 0.5 }
    );
    expect(() =>
      proveValidatedTargetScalarPositive(straddlingScalarProgram(), {
        maxWorkCells: 1,
      })
    ).toThrow(
      expect.objectContaining<Partial<ValidatedTargetScalarPositivityError>>({
        code: 'RESOURCE_LIMIT',
      })
    );

    const cancellationFlag = new Int32Array(new SharedArrayBuffer(4));
    Atomics.store(cancellationFlag, 0, 1);
    expect(() =>
      proveValidatedTargetScalarPositive(scalarProgram('1'), { cancellationFlag })
    ).toThrow(
      expect.objectContaining<Partial<ValidatedTargetScalarPositivityError>>({
        code: 'CANCELLED',
      })
    );
  });
});
