import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterBasketWeave } from '../styles';
import type { StyleOptions } from '../types';
import {
  basketWeaveOuterWallTargetForProof,
  createBasketWeaveOuterWallTargetBinding,
  type BasketWeaveOuterWallPatch,
  type BasketWeaveOuterWallTargetBinding,
} from './basketWeaveOuterWallTarget';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'BasketWeave',
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

function outer(binding: BasketWeaveOuterWallTargetBinding): BasketWeaveOuterWallPatch {
  const patch = binding.patches.find(
    (candidate): candidate is BasketWeaveOuterWallPatch =>
      candidate.kind === 'outer-wall'
  );
  if (patch === undefined) throw new Error('missing outer wall');
  return patch;
}

describe('Basket Weave generated outer-wall target', () => {
  it('matches production CPU radius away from declared checker boundaries', () => {
    const canonicalInput = input();
    const patch = outer(createBasketWeaveOuterWallTargetBinding(canonicalInput));
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
      const expected = rOuterBasketWeave(
        2 * Math.PI * u,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions as StyleOptions
      );
      const point = patch.backends.evaluateFloat64(u, t);
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
      expect(point[2]).toBeCloseTo(z, 12);
    }
  });

  it('proves a finite radial jump at a boundary currently classified as a crease', () => {
    const binding = createBasketWeaveOuterWallTargetBinding(input());
    const patch = outer(binding);
    const boundaryU = 1 / binding.strands;
    const epsilon = 1e-8;
    const jump = Math.abs(
      Math.hypot(...patch.backends.evaluateFloat64(boundaryU - epsilon, 0.25).slice(0, 2)) -
      Math.hypot(...patch.backends.evaluateFloat64(boundaryU + epsilon, 0.25).slice(0, 2))
    );
    expect(binding.internalCheckerDiscontinuitiesActive).toBe(true);
    expect(binding.currentCreaseClassificationIsInsufficient).toBe(true);
    expect(binding.completeInternalCurtainGraphEmitted).toBe(false);
    expect(jump).toBeGreaterThan(0.1);
  });

  it('keeps even, noise-free strand counts periodic at the seam', () => {
    const binding = createBasketWeaveOuterWallTargetBinding(input());
    const patch = outer(binding);
    expect(binding.strands % 2).toBe(0);
    expect(binding.seamCurtainActive).toBe(false);
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    for (const t of [0, 0.17, 0.53, 1]) {
      expect(distance(
        patch.backends.evaluateFloat64(0, t),
        patch.backends.evaluateFloat64(1, t)
      )).toBeLessThan(1e-9);
    }
  });

  it.each([
    [{ bw_strands: 15 }, 'odd checker parity'],
    [{ bw_noise: 0.5 }, 'nonperiodic noise phase'],
  ] as const)('closes %s seam cause with a physical curtain (%s)', (style) => {
    const binding = createBasketWeaveOuterWallTargetBinding(input(style));
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

  it('marks twist and vertical-gradient feature families beyond the axis-aligned extractor', () => {
    expect(
      createBasketWeaveOuterWallTargetBinding(input()).axisAlignedFeatureLinesOnly
    ).toBe(true);
    expect(
      createBasketWeaveOuterWallTargetBinding(
        input({ bw_twist: 0.4 })
      ).axisAlignedFeatureLinesOnly
    ).toBe(false);
    expect(
      createBasketWeaveOuterWallTargetBinding(
        input({ bw_vertical_grad: 0.3 })
      ).axisAlignedFeatureLinesOnly
    ).toBe(false);
  });

  it('reauthenticates its patch set and refuses copies or the wrong style', () => {
    const binding = createBasketWeaveOuterWallTargetBinding(input());
    expect(basketWeaveOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      basketWeaveOuterWallTargetForProof(
        Object.freeze({ ...binding }) as BasketWeaveOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createBasketWeaveOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'Crystalline',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected BasketWeave/i);
  });
});
