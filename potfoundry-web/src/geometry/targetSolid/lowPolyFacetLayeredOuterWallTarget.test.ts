import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterLowPolyFacet } from '../styles';
import type { StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createLowPolyFacetLayeredOuterWallTargetBinding,
  lowPolyFacetLayeredOuterWallTargetForProof,
  type LowPolyFacetLayeredOuterWallTargetBinding,
  type LowPolyOuterWallBandPatch,
} from './lowPolyFacetLayeredOuterWallTarget';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'LowPolyFacet',
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

function previousFloat64(value: number): number {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, false);
  view.setBigUint64(0, view.getBigUint64(0, false) - 1n, false);
  return view.getFloat64(0, false);
}

describe('Low Poly Facet layered outer-wall target', () => {
  it('emits fixed tiers and curtains for strictly interior jitter', () => {
    const binding = createLowPolyFacetLayeredOuterWallTargetBinding(
      input({ lp_tiers: 4 })
    );
    expect(binding.tierDiscontinuitiesActive).toBe(true);
    expect(binding.bandCount).toBe(4);
    expect(binding.curtainCount).toBe(3);
  });

  it('matches the legacy radius in every physical tier interior', () => {
    const canonicalInput = input({ lp_tiers: 4 });
    const binding = createLowPolyFacetLayeredOuterWallTargetBinding(canonicalInput);
    const bands = binding.patches.filter(
      (patch): patch is LowPolyOuterWallBandPatch => patch.kind === 'outer-wall-band'
    );
    for (const band of bands) {
      for (const [u, localV] of [[0.137, 0.23], [0.713, 0.79]] as const) {
        const t = band.tStart + (band.tEnd - band.tStart) * localV;
        const z = DEFAULT_GEOMETRY.H * t;
        const expected = rOuterLowPolyFacet(
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
        const point = band.backends.evaluateFloat64(u, localV);
        expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
      }
    }
  });

  it('joins exact left/right tier limits with curtain endpoints', () => {
    const binding = createLowPolyFacetLayeredOuterWallTargetBinding(
      input({ lp_tiers: 4 })
    );
    const bands = new Map(
      binding.patches
        .filter((patch): patch is LowPolyOuterWallBandPatch => patch.kind === 'outer-wall-band')
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

  it('extends the last real tier to the rim rather than selecting a zero-height extra tier', () => {
    const canonicalInput = input({ lp_tiers: 4 });
    const binding = createLowPolyFacetLayeredOuterWallTargetBinding(canonicalInput);
    const lastBand = binding.patches.filter(
      (patch): patch is LowPolyOuterWallBandPatch => patch.kind === 'outer-wall-band'
    ).at(-1);
    expect(lastBand).toBeDefined();
    if (lastBand === undefined) return;
    const nearRim = lastBand.backends.evaluateFloat64(0.31, previousFloat64(1));
    const rim = lastBand.backends.evaluateFloat64(0.31, 1);
    expect(distance(nearRim, rim)).toBeLessThan(1e-10);

    const legacyRim = rOuterLowPolyFacet(
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
    expect(Math.abs(Math.hypot(rim[0], rim[1]) - legacyRim)).toBeGreaterThan(1e-4);
  });

  it.each([0, 1])('collapses equivalent jitter %s to one continuous wall', (jitter) => {
    const binding = createLowPolyFacetLayeredOuterWallTargetBinding(
      input({ lp_tiers: 4, lp_jitter: jitter })
    );
    expect(binding.tierDiscontinuitiesActive).toBe(false);
    expect(binding.bandCount).toBe(1);
    expect(binding.curtainCount).toBe(0);
  });

  it('keeps every tier band and curtain periodic', () => {
    const binding = createLowPolyFacetLayeredOuterWallTargetBinding(
      input({ lp_tiers: 4 })
    );
    for (const patch of binding.patches) {
      for (const localV of [0, 0.37, 1]) {
        expect(distance(
          patch.backends.evaluateFloat64(0, localV),
          patch.backends.evaluateFloat64(1, localV)
        )).toBeLessThan(1e-9);
      }
    }
  });

  it('reauthenticates the patch set and refuses copies or the wrong style', () => {
    const binding = createLowPolyFacetLayeredOuterWallTargetBinding(input());
    expect(lowPolyFacetLayeredOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      lowPolyFacetLayeredOuterWallTargetForProof(
        Object.freeze({ ...binding }) as LowPolyFacetLayeredOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createLowPolyFacetLayeredOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'BambooSegments',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected LowPolyFacet/i);
  });
});
