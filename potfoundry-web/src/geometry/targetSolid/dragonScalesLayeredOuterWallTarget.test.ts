import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterDragonScales } from '../styles';
import type { StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createDragonScalesLayeredOuterWallTargetBinding,
  dragonScalesLayeredOuterWallTargetForProof,
  type DragonScalesLayeredOuterWallTargetBinding,
  type DragonScalesOuterWallBandPatch,
} from './dragonScalesLayeredOuterWallTarget';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'DragonScales',
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

describe('Dragon Scales layered outer-wall target', () => {
  it('emits one fixed-row band per row and one curtain per internal boundary', () => {
    const binding = createDragonScalesLayeredOuterWallTargetBinding(input());
    expect(binding.rowDiscontinuitiesActive).toBe(true);
    expect(binding.bandCount).toBe(8);
    expect(binding.curtainCount).toBe(7);
    expect(binding.patchCount).toBe(15);
  });

  it('matches the legacy radius in every band interior and at the corrected rim row', () => {
    const canonicalInput = input();
    const binding = createDragonScalesLayeredOuterWallTargetBinding(canonicalInput);
    const bands = binding.patches.filter(
      (patch): patch is DragonScalesOuterWallBandPatch => patch.kind === 'outer-wall-band'
    );
    for (const band of bands) {
      for (const [u, localV] of [[0.137, 0.23], [0.713, 0.79]] as const) {
        const t = band.tStart + (band.tEnd - band.tStart) * localV;
        const z = DEFAULT_GEOMETRY.H * t;
        const r0 = baseRadius(
          z,
          DEFAULT_GEOMETRY.H,
          DEFAULT_GEOMETRY.bottom_od / 2,
          DEFAULT_GEOMETRY.top_od / 2,
          DEFAULT_GEOMETRY.expn,
          DEFAULT_GEOMETRY
        );
        const expected = rOuterDragonScales(
          2 * Math.PI * u,
          z,
          r0,
          DEFAULT_GEOMETRY.H,
          canonicalInput.style.cpuOptions as StyleOptions
        );
        const point = band.backends.evaluateFloat64(u, localV);
        expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
        expect(point[2]).toBeCloseTo(z, 12);
      }
    }
    const rimBand = bands[bands.length - 1];
    const rimPoint = rimBand.backends.evaluateFloat64(0.31, 1);
    const rimExpected = rOuterDragonScales(
      2 * Math.PI * 0.31,
      DEFAULT_GEOMETRY.H,
      baseRadius(
        DEFAULT_GEOMETRY.H,
        DEFAULT_GEOMETRY.H,
        DEFAULT_GEOMETRY.bottom_od / 2,
        DEFAULT_GEOMETRY.top_od / 2,
        DEFAULT_GEOMETRY.expn,
        DEFAULT_GEOMETRY
      ),
      DEFAULT_GEOMETRY.H,
      canonicalInput.style.cpuOptions as StyleOptions
    );
    expect(Math.hypot(rimPoint[0], rimPoint[1])).toBeCloseTo(rimExpected, 9);
  });

  it('joins exact left/right row limits with curtain endpoints', () => {
    const binding = createDragonScalesLayeredOuterWallTargetBinding(input());
    const bands = new Map(
      binding.patches
        .filter((patch): patch is DragonScalesOuterWallBandPatch => patch.kind === 'outer-wall-band')
        .map((patch) => [patch.patchId, patch])
    );
    for (const curtain of binding.patches.filter(
      (patch) => patch.kind === 'feature-curtain'
    )) {
      const left = bands.get(curtain.leftBandPatchId);
      const right = bands.get(curtain.rightBandPatchId);
      expect(left).toBeDefined();
      expect(right).toBeDefined();
      if (left === undefined || right === undefined) continue;
      for (const u of [0, 0.173, 0.619, 1]) {
        expect(distance(
          curtain.backends.evaluateFloat64(u, 0),
          left.backends.evaluateFloat64(u, 1)
        )).toBeLessThan(1e-10);
        expect(distance(
          curtain.backends.evaluateFloat64(u, 1),
          right.backends.evaluateFloat64(u, 0)
        )).toBeLessThan(1e-10);
      }
    }
  });

  it('keeps every row band and curtain periodic', () => {
    const binding = createDragonScalesLayeredOuterWallTargetBinding(input());
    for (const patch of binding.patches) {
      for (const localV of [0, 0.37, 1]) {
        expect(distance(
          patch.backends.evaluateFloat64(0, localV),
          patch.backends.evaluateFloat64(1, localV)
        )).toBeLessThan(1e-9);
      }
    }
  });

  it('proves row state dead at zero depth and emits no curtains', () => {
    const canonicalInput = input({ ds_scale_depth: 0 });
    const binding = createDragonScalesLayeredOuterWallTargetBinding(canonicalInput);
    expect(binding.rowDiscontinuitiesActive).toBe(false);
    expect(binding.bandCount).toBe(1);
    expect(binding.curtainCount).toBe(0);
    const patch = binding.patches[0];
    for (const [u, v] of [[0.19, 0.11], [0.47, 0.5], [0.83, 1]] as const) {
      const point = patch.backends.evaluateFloat64(u, v);
      const z = DEFAULT_GEOMETRY.H * v;
      const expected = rOuterDragonScales(
        2 * Math.PI * u,
        z,
        baseRadius(
          z,
          DEFAULT_GEOMETRY.H,
          DEFAULT_GEOMETRY.bottom_od / 2,
          DEFAULT_GEOMETRY.top_od / 2,
          DEFAULT_GEOMETRY.expn,
          DEFAULT_GEOMETRY
        ),
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions as StyleOptions
      );
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
    }
  });

  it('reauthenticates the patch set and refuses copies or the wrong style', () => {
    const binding = createDragonScalesLayeredOuterWallTargetBinding(input());
    expect(dragonScalesLayeredOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      dragonScalesLayeredOuterWallTargetForProof(
        Object.freeze({ ...binding }) as DragonScalesLayeredOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createDragonScalesLayeredOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'ArtDeco',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected DragonScales/i);
  });
});
