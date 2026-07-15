import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  singlePatchAnnularRadialSolidTargetForProof,
  type AnnularRadialSolidPatchId,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from './singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

function input(styleId = 'HarmonicRipple', rDrain = 10) {
  return createCanonicalTargetInputBinding(
    { ...DEFAULT_GEOMETRY, r_drain: rDrain },
    styleId,
    {},
    TARGET_CONTROLS
  );
}

function pointClose(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): void {
  for (let coordinate = 0; coordinate < 3; coordinate += 1) {
    expect(left[coordinate]).toBeCloseTo(right[coordinate], 11);
  }
}

describe('single-patch annular radial solid target', () => {
  it('builds an authenticated executable closed genus-one six-patch atlas', { timeout: 30_000 }, () => {
    const canonicalInput = input();
    const binding = createSinglePatchAnnularRadialSolidTargetBinding(
      canonicalInput,
      createStyleOuterWallTargetRegistryBinding(canonicalInput),
      { maxDepthPerPatch: 8, maxTotalWorkCells: 20_000 }
    );
    expect(singlePatchAnnularRadialSolidTargetForProof(binding)).toBe(binding);
    expect(binding.surfaceComplex.topology).toMatchObject({
      genus: '1',
      componentCount: '1',
      abstractClosedTwoManifold: true,
      abstractOrientable: true,
      geometricImageManifoldProven: false,
    });
    expect(binding.programs).toHaveLength(6);
    expect(binding.evaluatorSet.evaluators).toHaveLength(6);
    expect(binding.radialClampInactive).toBe(true);
    expect(binding.drainContainmentProven).toBe(true);
    expect(binding.nonPeriodicJunctionProofs).toHaveLength(6);
    expect(binding.nonPeriodicJunctionStructureAlignedUnderDeclaredAssumptions).toBe(true);
    expect(binding.nonPeriodicJunctionImageEqualityProven).toBe(false);
    expect(binding.periodicSeamImageEqualityProven).toBe(false);
    expect(binding.geometricImageRegularityProven).toBe(false);
    expect(binding.finalArtifactToleranceProven).toBe(false);

    const programs = new Map(
      binding.programs.map((program) => [program.patchId, program.backends])
    );
    const evaluate = (patchId: AnnularRadialSolidPatchId, u: number, v: number) => {
      const backend = programs.get(patchId);
      if (backend === undefined) throw new Error(`missing ${patchId}`);
      return backend.evaluateFloat64(u, v);
    };
    const sourceU = 0.37;
    const reversedU = 1 - sourceU;
    pointClose(evaluate('outer-wall', sourceU, 1), evaluate('top-rim', reversedU, 1));
    pointClose(evaluate('top-rim', reversedU, 0), evaluate('inner-wall', reversedU, 1));
    pointClose(evaluate('inner-wall', reversedU, 0), evaluate('bottom-top', reversedU, 1));
    pointClose(evaluate('bottom-top', reversedU, 0), evaluate('drain-wall', reversedU, 1));
    pointClose(evaluate('drain-wall', reversedU, 0), evaluate('bottom-under', sourceU, 0));
    pointClose(evaluate('bottom-under', sourceU, 1), evaluate('outer-wall', sourceU, 0));
  });

  it('refuses zero-drain topology and multi-patch feature complexes', () => {
    const noDrain = input('HarmonicRipple', 0);
    expect(() =>
      createSinglePatchAnnularRadialSolidTargetBinding(
        noDrain,
        createStyleOuterWallTargetRegistryBinding(noDrain)
      )
    ).toThrow(/positive drain radius/i);

    const layered = input('ArtDeco', 10);
    expect(() =>
      createSinglePatchAnnularRadialSolidTargetBinding(
        layered,
        createStyleOuterWallTargetRegistryBinding(layered)
      )
    ).toThrow(/exactly one periodic outer-wall patch/i);
  });

  it('rejects structural copies at the aggregate proof boundary', () => {
    const canonicalInput = input();
    const genuine = createSinglePatchAnnularRadialSolidTargetBinding(
      canonicalInput,
      createStyleOuterWallTargetRegistryBinding(canonicalInput)
    );
    const copy = Object.freeze({ ...genuine }) as SinglePatchAnnularRadialSolidTargetBinding;
    expect(() => singlePatchAnnularRadialSolidTargetForProof(copy)).toThrow(
      /authenticated capability/i
    );
  });
});
