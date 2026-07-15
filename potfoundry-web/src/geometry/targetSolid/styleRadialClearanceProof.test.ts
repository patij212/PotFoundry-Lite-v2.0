import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  CERTIFIED_STYLE_TARGET_IDS,
  createStyleOuterWallTargetRegistryBinding,
} from './styleOuterWallTargetRegistry';
import { proveStyleRadialClearance } from './styleRadialClearanceProof';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

describe('style radial clearance proof', () => {
  it.each(CERTIFIED_STYLE_TARGET_IDS)(
    'proves default %s radial clamp inactivity',
    { timeout: 60_000 },
    (styleId) => {
        const input = createCanonicalTargetInputBinding(
          { ...DEFAULT_GEOMETRY },
          styleId,
          {},
          TARGET_CONTROLS
        );
        const registry = createStyleOuterWallTargetRegistryBinding(input);
        const proof = proveStyleRadialClearance(input, registry, {
          maxDepthPerPatch: 8,
          maxTotalWorkCells: 20_000,
        });
        expect(proof.styleId).toBe(styleId);
        expect(proof.radialClampInactive).toBe(true);
        expect(proof.patchProofs).toHaveLength(registry.patchCount);
        expect(BigInt(proof.minimumClearanceLowerPm)).toBeGreaterThan(0n);
    }
  );

  it('rejects a registry belonging to a different canonical target', () => {
    const first = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      'HarmonicRipple',
      {},
      TARGET_CONTROLS
    );
    const second = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY, H: DEFAULT_GEOMETRY.H + 1 },
      'HarmonicRipple',
      {},
      TARGET_CONTROLS
    );
    expect(() =>
      proveStyleRadialClearance(
        first,
        createStyleOuterWallTargetRegistryBinding(second)
      )
    ).toThrow(/same target/i);
  });
});
