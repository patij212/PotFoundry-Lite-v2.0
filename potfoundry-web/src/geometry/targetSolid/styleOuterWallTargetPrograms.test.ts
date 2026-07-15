import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  CERTIFIED_STYLE_TARGET_IDS,
  createStyleOuterWallTargetRegistryBinding,
} from './styleOuterWallTargetRegistry';
import { styleOuterWallTargetProgramsForProof } from './styleOuterWallTargetPrograms';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

describe('authenticated style outer-wall target programs', () => {
  it('exposes every exact generated program in committed registry order', { timeout: 30_000 }, () => {
    for (const styleId of CERTIFIED_STYLE_TARGET_IDS) {
      const registry = createStyleOuterWallTargetRegistryBinding(
        createCanonicalTargetInputBinding(
          { ...DEFAULT_GEOMETRY },
          styleId,
          {},
          TARGET_CONTROLS
        )
      );
      const programs = styleOuterWallTargetProgramsForProof(registry);
      expect(programs.map((program) => program.patchId)).toEqual(
        registry.patches.map((patch) => patch.patchId)
      );
      expect(programs.map((program) => program.programSha256)).toEqual(
        registry.patches.map((patch) => patch.programSha256)
      );
      expect(programs.every((program) => Object.isFrozen(program))).toBe(true);
    }
  });

  it('rejects structural registry copies through the proof boundary', () => {
    const genuine = createStyleOuterWallTargetRegistryBinding(
      createCanonicalTargetInputBinding(
        { ...DEFAULT_GEOMETRY },
        'HarmonicRipple',
        {},
        TARGET_CONTROLS
      )
    );
    expect(() => styleOuterWallTargetProgramsForProof({ ...genuine })).toThrow(
      /authenticated capability/i
    );
  });
});
