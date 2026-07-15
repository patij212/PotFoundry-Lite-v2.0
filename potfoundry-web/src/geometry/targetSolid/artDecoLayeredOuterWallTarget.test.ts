import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterArtDeco } from '../styles';
import type { StyleOptions } from '../types';
import {
  artDecoLayeredOuterWallTargetForProof,
  createArtDecoLayeredOuterWallTargetBinding,
  type ArtDecoLayeredOuterWallTargetBinding,
  type ArtDecoOuterWallBandPatch,
} from './artDecoLayeredOuterWallTarget';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'ArtDeco',
    style,
    { superformulaSeamBlendDegrees: 30 }
  );
}

function pointDistance(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

describe('Art Deco layered outer-wall target', () => {
  it('emits one-sided bands and physical curtains for every active step jump', () => {
    const binding = createArtDecoLayeredOuterWallTargetBinding(input());
    expect(binding.stepDiscontinuitiesActive).toBe(true);
    expect(binding.bandCount).toBe(12);
    expect(binding.curtainCount).toBe(8);
    expect(binding.patchCount).toBe(20);
    expect(binding.patches.filter((patch) => patch.role === 'feature-curtain')).toHaveLength(8);
  });

  it('matches the legacy radius in the interior of every one-sided band', () => {
    const canonicalInput = input();
    const binding = createArtDecoLayeredOuterWallTargetBinding(canonicalInput);
    const bands = binding.patches.filter(
      (patch): patch is ArtDecoOuterWallBandPatch => patch.kind === 'outer-wall-band'
    );
    for (const band of bands) {
      for (const [u, localV] of [[0.137, 0.29], [0.713, 0.71]] as const) {
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
        const expected = rOuterArtDeco(
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
  });

  it('joins each exact pair of one-sided band traces with its curtain endpoints', () => {
    const binding = createArtDecoLayeredOuterWallTargetBinding(input());
    const bands = new Map(
      binding.patches
        .filter((patch): patch is ArtDecoOuterWallBandPatch => patch.kind === 'outer-wall-band')
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
        expect(pointDistance(
          curtain.backends.evaluateFloat64(u, 0),
          left.backends.evaluateFloat64(u, 1)
        )).toBeLessThan(1e-10);
        expect(pointDistance(
          curtain.backends.evaluateFloat64(u, 1),
          right.backends.evaluateFloat64(u, 0)
        )).toBeLessThan(1e-10);
      }
    }
  });

  it('keeps every band and curtain periodic at the material seam', () => {
    const binding = createArtDecoLayeredOuterWallTargetBinding(input());
    for (const patch of binding.patches) {
      for (const localV of [0, 0.37, 1]) {
        expect(pointDistance(
          patch.backends.evaluateFloat64(0, localV),
          patch.backends.evaluateFloat64(1, localV)
        )).toBeLessThan(1e-9);
      }
    }
  });

  it('collapses zero step depth to one continuous wall patch with no curtains', () => {
    const canonicalInput = input({ ad_step_depth: 0 });
    const binding = createArtDecoLayeredOuterWallTargetBinding(canonicalInput);
    expect(binding.stepDiscontinuitiesActive).toBe(false);
    expect(binding.bandCount).toBe(1);
    expect(binding.curtainCount).toBe(0);
    const patch = binding.patches[0];
    expect(patch.kind).toBe('outer-wall-band');
    for (const [u, v] of [[0.19, 0.11], [0.47, 0.5], [0.83, 0.97]] as const) {
      const point = patch.backends.evaluateFloat64(u, v);
      const z = DEFAULT_GEOMETRY.H * v;
      const r0 = baseRadius(
        z,
        DEFAULT_GEOMETRY.H,
        DEFAULT_GEOMETRY.bottom_od / 2,
        DEFAULT_GEOMETRY.top_od / 2,
        DEFAULT_GEOMETRY.expn,
        DEFAULT_GEOMETRY
      );
      const expected = rOuterArtDeco(
        2 * Math.PI * u,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions as StyleOptions
      );
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
    }
  });

  it('reauthenticates the patch set and refuses copies or the wrong style', () => {
    const binding = createArtDecoLayeredOuterWallTargetBinding(input());
    expect(artDecoLayeredOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      artDecoLayeredOuterWallTargetForProof(
        Object.freeze({ ...binding }) as ArtDecoLayeredOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createArtDecoLayeredOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'Crystalline',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected ArtDeco/i);
  });
});
