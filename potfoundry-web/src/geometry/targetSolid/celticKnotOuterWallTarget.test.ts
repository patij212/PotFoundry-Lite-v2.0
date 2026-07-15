import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterCelticKnot } from '../styles';
import type { StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  celticKnotOuterWallTargetForProof,
  createCelticKnotOuterWallTargetBinding,
  type CelticKnotOuterWallPatch,
  type CelticKnotOuterWallTargetBinding,
} from './celticKnotOuterWallTarget';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'CelticKnot',
    style,
    { superformulaSeamBlendDegrees: 30 }
  );
}

function distance(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function outer(binding: CelticKnotOuterWallTargetBinding): CelticKnotOuterWallPatch {
  const patch = binding.patches.find(
    (candidate): candidate is CelticKnotOuterWallPatch =>
      candidate.kind === 'outer-wall'
  );
  if (patch === undefined) throw new Error('missing outer wall');
  return patch;
}

describe('Celtic Knot generated outer-wall target', () => {
  it('matches production CPU radius away from declared branch loci', () => {
    const canonicalInput = input();
    const patch = outer(createCelticKnotOuterWallTargetBinding(canonicalInput));
    for (const [u, t] of [
      [0.137, 0.213],
      [0.421, 0.537],
      [0.783, 0.819],
    ] as const) {
      const z = DEFAULT_GEOMETRY.H * t;
      const r0 = baseRadius(
        z,
        DEFAULT_GEOMETRY.H,
        DEFAULT_GEOMETRY.bottom_od / 2,
        DEFAULT_GEOMETRY.top_od / 2,
        DEFAULT_GEOMETRY.expn,
        DEFAULT_GEOMETRY
      );
      const expected = rOuterCelticKnot(
        2 * Math.PI * u,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions as StyleOptions
      );
      const point = patch.backends.evaluateFloat64(u, t);
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 8);
      expect(point[2]).toBeCloseTo(z, 12);
    }
  });

  it('declares the finite foreground/background and occlusion discontinuities', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    expect(binding.internalRibbonDiscontinuitiesActive).toBe(true);
    expect(binding.completeInternalFeatureSideGraphEmitted).toBe(false);
    expect(binding.regularityObligationsCanonicalJson).toContain(
      'foreground-background-radial-jump'
    );
    expect(binding.regularityObligationsCanonicalJson).toContain(
      'z-buffer-occlusion-ties'
    );
  });

  it('closes the column-phase seam with a physical curtain', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    const wall = outer(binding);
    const curtain = binding.patches.find((patch) => patch.kind === 'seam-curtain');
    expect(binding.seamCurtainActive).toBe(true);
    expect(binding.periodicIdentificationAdmissible).toBe(false);
    expect(curtain).toBeDefined();
    if (curtain === undefined || curtain.kind !== 'seam-curtain') return;
    for (const t of [0, 0.17, 0.53, 1]) {
      expect(distance(
        curtain.backends.evaluateFloat64(t, 0),
        wall.backends.evaluateFloat64(0, t)
      )).toBeLessThan(1e-9);
      expect(distance(
        curtain.backends.evaluateFloat64(t, 1),
        wall.backends.evaluateFloat64(1, t)
      )).toBeLessThan(1e-9);
    }
  });

  it('omits all degenerate closure surfaces when relief is zero', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input({ ck_relief: 0 }));
    expect(binding.seamCurtainActive).toBe(false);
    expect(binding.internalRibbonDiscontinuitiesActive).toBe(false);
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    expect(binding.patchCount).toBe(1);
  });

  it('statically unrolls every admitted strand count', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      const binding = createCelticKnotOuterWallTargetBinding(
        input({ ck_strands: count })
      );
      expect(binding.strandCount).toBe(count);
      expect(outer(binding).nodeCount).toBeLessThan(8192);
    }
  });

  it('reauthenticates its patch set and refuses copies or the wrong style', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    expect(celticKnotOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      celticKnotOuterWallTargetForProof(
        Object.freeze({ ...binding }) as CelticKnotOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createCelticKnotOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'Crystalline',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected CelticKnot/i);
  });
});
