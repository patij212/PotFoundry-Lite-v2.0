import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterCelticTriquetra } from '../styles';
import type { StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  celticTriquetraOuterWallTargetForProof,
  createCelticTriquetraOuterWallTargetBinding,
  type CelticTriquetraOuterWallTargetBinding,
} from './celticTriquetraOuterWallTarget';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'CelticTriquetra',
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

describe('Celtic Triquetra generated outer-wall target', () => {
  it('matches production CPU radius across braid, medallion, rim, and background samples', () => {
    const canonicalInput = input();
    const binding = createCelticTriquetraOuterWallTargetBinding(canonicalInput);
    for (const [u, t] of [
      [0.137, 0.213],
      [0.421, 0.537],
      [0.5, 0.69],
      [0.783, 0.819],
      [0.31, 0.9],
      [0.91, 0.05],
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
      const expected = rOuterCelticTriquetra(
        2 * Math.PI * u,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions as StyleOptions
      );
      const point = binding.backends.evaluateFloat64(u, t);
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 8);
      expect(point[2]).toBeCloseTo(z, 12);
    }
  });

  it('uses rigorous atan2 semantics in the generated medallion fold', () => {
    const binding = createCelticTriquetraOuterWallTargetBinding(input());
    expect(binding.programCanonicalJson).toContain('"op":"atan2"');
    expect(binding.backends.wgslSource).toContain('atan2(select(');
    expect(binding.regularityObligationsCanonicalJson).toContain(
      'medallion-presence-and-sector-fold'
    );
  });

  it('is periodic at the material seam without a synthetic closure surface', () => {
    const binding = createCelticTriquetraOuterWallTargetBinding(input());
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    for (const t of [0, 0.17, 0.53, 0.69, 0.9, 1]) {
      expect(distance(
        binding.backends.evaluateFloat64(0, t),
        binding.backends.evaluateFloat64(1, t)
      )).toBeLessThan(1e-9);
    }
  });

  it('resolves admitted column and row counts before static emission', () => {
    const minimum = createCelticTriquetraOuterWallTargetBinding(
      input({ ct_scale_x: 1, ct_rows: 2 })
    );
    const maximum = createCelticTriquetraOuterWallTargetBinding(
      input({ ct_scale_x: 24, ct_rows: 10 })
    );
    expect([minimum.columnCount, minimum.rowCount]).toEqual([1, 2]);
    expect([maximum.columnCount, maximum.rowCount]).toEqual([24, 10]);
    expect(maximum.nodeCount).toBeLessThan(8192);
  });

  it('reauthenticates its program and refuses copies or the wrong style', () => {
    const binding = createCelticTriquetraOuterWallTargetBinding(input());
    expect(celticTriquetraOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      celticTriquetraOuterWallTargetForProof(
        Object.freeze({ ...binding }) as CelticTriquetraOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createCelticTriquetraOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'Crystalline',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected CelticTriquetra/i);
  });
});
