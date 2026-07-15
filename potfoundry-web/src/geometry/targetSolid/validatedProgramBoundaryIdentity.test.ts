import { describe, expect, it } from 'vitest';

import {
  deriveRadialFixedRadiusTargetProgram,
  deriveRadialInnerCapTargetProgram,
  deriveRadialOffsetTargetProgram,
  deriveRadialOuterCapTargetProgram,
  deriveRadialRimTargetProgram,
} from './radialSolidProgramTransform';
import {
  proveValidatedProgramBoundaryIdentity,
  ValidatedProgramBoundaryIdentityError,
} from './validatedProgramBoundaryIdentity';
import { ValidatedTargetProgramBuilder } from './validatedTargetProgramBuilder';

const NONZERO_EVIDENCE = 'a'.repeat(64);

function sourceProgram(): string {
  const builder = new ValidatedTargetProgramBuilder();
  const u = builder.u();
  const v = builder.v();
  const radius = builder.add(builder.constantDecimal('10'), v);
  const theta = builder.multiply(builder.tau(), u);
  return builder.buildCanonicalProgram(
    { evaluatorId: 'test.outer', evaluatorVersion: 'v1', patchId: 'outer-wall' },
    {
      x: builder.multiply(radius, builder.cos(theta)),
      y: builder.multiply(radius, builder.sin(theta)),
      z: builder.multiply(builder.constantDecimal('20'), v),
    }
  );
}

describe('validated target-program boundary identity', () => {
  it('checks all six non-periodic junctions structurally without claiming image identity', () => {
    const source = sourceProgram();
    const bottomFraction = 0.15;
    const programs = {
      outer: source,
      inner: deriveRadialOffsetTargetProgram(
        source,
        { evaluatorId: 'test.inner', evaluatorVersion: 'v1', patchId: 'inner-wall' },
        {
          sourceVStart: bottomFraction,
          sourceVEnd: 1,
          wallThicknessMm: 2,
          minimumRadiusMm: 0.5,
          reverseU: true,
        }
      ).programCanonicalJson,
      rim: deriveRadialRimTargetProgram(
        source,
        { evaluatorId: 'test.rim', evaluatorVersion: 'v1', patchId: 'top-rim' },
        { sourceV: 1, wallThicknessMm: 2, minimumRadiusMm: 0.5, reverseU: true }
      ).programCanonicalJson,
      top: deriveRadialInnerCapTargetProgram(
        source,
        { evaluatorId: 'test.top', evaluatorVersion: 'v1', patchId: 'bottom-top' },
        {
          sourceV: bottomFraction,
          wallThicknessMm: 2,
          minimumRadiusMm: 0.5,
          endRadiusMm: 2,
          zMode: 'source-boundary',
          reverseU: true,
          reverseRadialParameter: true,
        }
      ).programCanonicalJson,
      under: deriveRadialOuterCapTargetProgram(
        source,
        { evaluatorId: 'test.under', evaluatorVersion: 'v1', patchId: 'bottom-under' },
        {
          sourceV: 0,
          wallThicknessMm: 2,
          minimumRadiusMm: 0.5,
          endRadiusMm: 2,
          zMode: 'source-boundary',
          reverseRadialParameter: true,
        }
      ).programCanonicalJson,
      drain: deriveRadialFixedRadiusTargetProgram(
        source,
        { evaluatorId: 'test.drain', evaluatorVersion: 'v1', patchId: 'drain-wall' },
        { sourceVStart: 0, sourceVEnd: bottomFraction, radiusMm: 2, reverseU: true }
      ).programCanonicalJson,
    };
    const junctions = [
      [{ programCanonicalJson: programs.outer, side: 'v1' as const }, { programCanonicalJson: programs.rim, side: 'v1' as const, reverseFreeParameter: true }],
      [{ programCanonicalJson: programs.rim, side: 'v0' as const }, { programCanonicalJson: programs.inner, side: 'v1' as const }],
      [{ programCanonicalJson: programs.inner, side: 'v0' as const }, { programCanonicalJson: programs.top, side: 'v1' as const }],
      [{ programCanonicalJson: programs.top, side: 'v0' as const }, { programCanonicalJson: programs.drain, side: 'v1' as const }],
      [{ programCanonicalJson: programs.drain, side: 'v0' as const }, { programCanonicalJson: programs.under, side: 'v0' as const, reverseFreeParameter: true }],
      [{ programCanonicalJson: programs.under, side: 'v1' as const }, { programCanonicalJson: programs.outer, side: 'v0' as const }],
    ] as const;
    const results = junctions.map(([left, right], index) => {
      try {
        return proveValidatedProgramBoundaryIdentity(left, right, {
          radialProjectionNonzeroEvidenceSha256: NONZERO_EVIDENCE,
        });
      } catch (error) {
        throw new Error(`junction ${index} failed`, { cause: error });
      }
    });
    expect(results).toHaveLength(6);
    expect(
      results.every(
        (result) =>
          result.structuralBoundaryTermsIdenticalUnderDeclaredAssumptions &&
          !result.radialProjectionNonzeroEvidenceAuthenticated &&
          !result.totalDefinednessProven &&
          !result.exactBoundaryImageIdentityProven
      )
    ).toBe(true);
    expect(results.every((result) => result.rootProjectionCancellationCount === 0)).toBe(true);
  });

  it('refuses a real boundary mismatch and malformed evidence', () => {
    const source = sourceProgram();
    expect(() =>
      proveValidatedProgramBoundaryIdentity(
        { programCanonicalJson: source, side: 'v0' },
        { programCanonicalJson: source, side: 'v1' },
        { radialProjectionNonzeroEvidenceSha256: NONZERO_EVIDENCE }
      )
    ).toThrow(ValidatedProgramBoundaryIdentityError);
    expect(() =>
      proveValidatedProgramBoundaryIdentity(
        { programCanonicalJson: source, side: 'v0' },
        { programCanonicalJson: source, side: 'v0' },
        { radialProjectionNonzeroEvidenceSha256: 'not-a-hash' }
      )
    ).toThrow(/SHA-256/i);
  });
});
