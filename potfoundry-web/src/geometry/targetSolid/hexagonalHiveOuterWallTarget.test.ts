import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterHexagonalHive } from '../styles';
import type { StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createHexagonalHiveOuterWallTargetBinding,
  hexagonalHiveOuterWallTargetForProof,
  type HexagonalHiveOuterWallPatch,
  type HexagonalHiveOuterWallTargetBinding,
} from './hexagonalHiveOuterWallTarget';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'HexagonalHive',
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

function outer(
  binding: HexagonalHiveOuterWallTargetBinding
): HexagonalHiveOuterWallPatch {
  const patch = binding.patches.find(
    (candidate): candidate is HexagonalHiveOuterWallPatch =>
      candidate.kind === 'outer-wall'
  );
  if (patch === undefined) throw new Error('missing outer wall');
  return patch;
}

describe('Hexagonal Hive generated outer-wall target', () => {
  it('matches production CPU radius away from declared branch loci', () => {
    const canonicalInput = input();
    const patch = outer(createHexagonalHiveOuterWallTargetBinding(canonicalInput));
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
      const expected = rOuterHexagonalHive(
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

  it('identifies the now-periodic seam without a curtain at default params', () => {
    const binding = createHexagonalHiveOuterWallTargetBinding(input());
    const wall = outer(binding);
    // The integer column snap makes the distance field tile the seam; with default
    // (zero) noise the u=0 and u=2π traces coincide exactly ⇒ no curtain, and u is
    // periodically identified.
    expect(binding.seamCurtainActive).toBe(false);
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    expect(binding.patchCount).toBe(1);
    expect(binding.patches.every((patch) => patch.kind === 'outer-wall')).toBe(true);
    const seamGaps = [0.17, 0.31, 0.53, 0.79].map((t) =>
      distance(
        wall.backends.evaluateFloat64(0, t),
        wall.backends.evaluateFloat64(1, t)
      )
    );
    expect(Math.max(...seamGaps)).toBeLessThan(1e-9);
  });

  it('keeps the seam periodic when the noise parameter is active (no curtain)', () => {
    const binding = createHexagonalHiveOuterWallTargetBinding(input({ hh_noise: 0.5 }));
    const wall = outer(binding);
    // The cell id is wrapped modulo the column count before hashing, so the
    // seam-straddling cell hashes identically from both sides — active noise no
    // longer re-opens the seam, and no curtain is emitted.
    expect(binding.seamCurtainActive).toBe(false);
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    expect(binding.patchCount).toBe(1);
    expect(binding.patches.every((patch) => patch.kind === 'outer-wall')).toBe(true);
    const seamGaps = [0.17, 0.31, 0.53, 0.79].map((t) =>
      distance(
        wall.backends.evaluateFloat64(0, t),
        wall.backends.evaluateFloat64(1, t)
      )
    );
    expect(Math.max(...seamGaps)).toBeLessThan(1e-9);
  });

  it('emits no seam curtain regardless of relief (surface is periodic)', () => {
    const binding = createHexagonalHiveOuterWallTargetBinding(input({ hh_relief: 0 }));
    expect(binding.seamCurtainActive).toBe(false);
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    expect(binding.patchCount).toBe(1);
  });

  it('does not conceal active cell-hash discontinuities', () => {
    const smooth = createHexagonalHiveOuterWallTargetBinding(input());
    expect(smooth.internalCellDiscontinuitiesActive).toBe(false);
    const noisy = createHexagonalHiveOuterWallTargetBinding(input({ hh_noise: 0.5 }));
    expect(noisy.internalCellDiscontinuitiesActive).toBe(true);
    expect(noisy.completeInternalFeatureSideGraphEmitted).toBe(false);
    expect(noisy.regularityObligationsCanonicalJson).toContain('cell-hash-radial-jump');
  });

  it('reauthenticates its patch set and refuses copies or the wrong style', () => {
    const binding = createHexagonalHiveOuterWallTargetBinding(input());
    expect(hexagonalHiveOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      hexagonalHiveOuterWallTargetForProof(
        Object.freeze({ ...binding }) as HexagonalHiveOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createHexagonalHiveOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'Crystalline',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected HexagonalHive/i);
  });
});
