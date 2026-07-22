import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterBambooSegments } from '../styles';
import type { StyleOptions } from '../types';
import {
  bambooSegmentsLayeredOuterWallTargetForProof,
  createBambooSegmentsLayeredOuterWallTargetBinding,
  type BambooOuterWallBandPatch,
  type BambooSegmentsLayeredOuterWallTargetBinding,
} from './bambooSegmentsLayeredOuterWallTarget';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'BambooSegments',
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

describe('Bamboo Segments layered outer-wall target', () => {
  it('emits one segment band per node interval and curtains for active asymmetry', () => {
    const binding = createBambooSegmentsLayeredOuterWallTargetBinding(input());
    expect(binding.positionDiscontinuitiesActive).toBe(true);
    expect(binding.correctedRimSemantics).toBe(true);
    expect(binding.bandCount).toBe(5);
    expect(binding.curtainCount).toBe(4);
  });

  it('matches the legacy radius in every physical segment interior', () => {
    const canonicalInput = input();
    const binding = createBambooSegmentsLayeredOuterWallTargetBinding(canonicalInput);
    const bands = binding.patches.filter(
      (patch): patch is BambooOuterWallBandPatch => patch.kind === 'outer-wall-band'
    );
    for (const band of bands) {
      for (const [u, localV] of [[0.137, 0.23], [0.713, 0.79]] as const) {
        const t = band.tStart + (band.tEnd - band.tStart) * localV;
        const z = DEFAULT_GEOMETRY.H * t;
        const expected = rOuterBambooSegments(
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

  it('joins exact left/right segment limits with curtain endpoints', () => {
    const binding = createBambooSegmentsLayeredOuterWallTargetBinding(input());
    const bands = new Map(
      binding.patches
        .filter((patch): patch is BambooOuterWallBandPatch => patch.kind === 'outer-wall-band')
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

  it('extends the last real segment continuously to the rim, and the migrated CPU now coincides with it', () => {
    const canonicalInput = input();
    const binding = createBambooSegmentsLayeredOuterWallTargetBinding(canonicalInput);
    const lastBand = binding.patches.filter(
      (patch): patch is BambooOuterWallBandPatch => patch.kind === 'outer-wall-band'
    ).at(-1);
    expect(lastBand).toBeDefined();
    if (lastBand === undefined) return;
    const nearRim = lastBand.backends.evaluateFloat64(0.31, previousFloat64(1));
    const rim = lastBand.backends.evaluateFloat64(0.31, 1);
    expect(distance(nearRim, rim)).toBeLessThan(1e-10);

    // The rim-floor() fix migrated rOuterBambooSegments (and its WGSL twin) to clamp segment to
    // ceil(nodeCount)-1, so the CPU rim now COINCIDES with the target's corrected-rim band instead
    // of selecting the spurious extra (zero-height) segment. This is exactly the migration the
    // target's proof demanded ("current CPU and WGSL must be migrated at the rim before they can
    // claim this target identity"); PRE-fix the CPU differed by the ~2.46mm rim lip (asserted here
    // as a >1e-4 gap). The oracle (bambooSegmentsLayeredOuterWallTarget.ts) is unchanged.
    const cpuRim = rOuterBambooSegments(
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
    expect(Math.hypot(rim[0], rim[1])).toBeCloseTo(cpuRim, 9);
  });

  it('omits position-degenerate curtains when asymmetry is zero but keeps node bands', () => {
    const binding = createBambooSegmentsLayeredOuterWallTargetBinding(
      input({ bs_asymmetry: 0 })
    );
    expect(binding.positionDiscontinuitiesActive).toBe(false);
    expect(binding.bandCount).toBe(5);
    expect(binding.curtainCount).toBe(0);
  });

  it('keeps every segment band and curtain periodic', () => {
    const binding = createBambooSegmentsLayeredOuterWallTargetBinding(input());
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
    const binding = createBambooSegmentsLayeredOuterWallTargetBinding(input());
    expect(bambooSegmentsLayeredOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      bambooSegmentsLayeredOuterWallTargetForProof(
        Object.freeze({ ...binding }) as BambooSegmentsLayeredOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createBambooSegmentsLayeredOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'DragonScales',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected BambooSegments/i);
  });
});
