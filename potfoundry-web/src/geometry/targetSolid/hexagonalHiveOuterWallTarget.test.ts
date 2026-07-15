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

  it('closes the nonperiodic production seam with a physical curtain', () => {
    const binding = createHexagonalHiveOuterWallTargetBinding(input());
    const wall = outer(binding);
    const curtain = binding.patches.find((patch) => patch.kind === 'seam-curtain');
    expect(binding.seamCurtainActive).toBe(true);
    expect(binding.periodicIdentificationAdmissible).toBe(false);
    expect(binding.patchCount).toBe(2);
    expect(curtain).toBeDefined();
    const seamGaps = [0.17, 0.31, 0.53, 0.79].map((t) =>
      distance(
        wall.backends.evaluateFloat64(0, t),
        wall.backends.evaluateFloat64(1, t)
      )
    );
    expect(Math.max(...seamGaps)).toBeGreaterThan(1e-6);
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

  it('omits the degenerate seam curtain when relief is zero', () => {
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
