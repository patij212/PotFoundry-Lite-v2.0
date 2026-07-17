import { describe, expect, it } from 'vitest';

import type { StyleId } from '../types';
import { DEFAULT_GEOMETRY } from '../../state/types';
import { STYLE_REGISTRY } from '../../styles/registry';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  CERTIFIED_STYLE_TARGET_IDS,
  createStyleOuterWallTargetRegistryBinding,
  styleOuterWallTargetRegistryForProof,
  type StyleOuterWallTargetRegistryBinding,
} from './styleOuterWallTargetRegistry';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

function target(styleId: StyleId, style: Readonly<Record<string, unknown>> = {}) {
  return createStyleOuterWallTargetRegistryBinding(
    createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      styleId,
      style,
      TARGET_CONTROLS
    )
  );
}

describe('all-style outer-wall target registry', () => {
  it('statically and exactly covers every registered style', () => {
    expect(CERTIFIED_STYLE_TARGET_IDS).toHaveLength(20);
    expect(new Set(CERTIFIED_STYLE_TARGET_IDS).size).toBe(20);
    expect([...CERTIFIED_STYLE_TARGET_IDS].sort()).toEqual(
      Object.keys(STYLE_REGISTRY).sort()
    );
  });

  it('dispatches and reauthenticates generated target programs for all 20 defaults', { timeout: 30_000 }, () => {
    const bindings = CERTIFIED_STYLE_TARGET_IDS.map((styleId) => target(styleId));
    expect(bindings.map((binding) => binding.styleId)).toEqual(CERTIFIED_STYLE_TARGET_IDS);
    expect(new Set(bindings.map((binding) => binding.bindingSha256)).size).toBe(20);
    for (const binding of bindings) {
      expect(styleOuterWallTargetRegistryForProof(binding)).toBe(binding);
      expect(binding.patchCount).toBeGreaterThan(0);
      expect(binding.patches).toHaveLength(binding.patchCount);
      expect(binding.sourceBinding.styleId).toBe(binding.styleId);
      for (const patch of binding.patches) {
        expect(patch.programSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(patch.nodeCount).toBeGreaterThan(0);
      }
      expect(binding.completeRegularityPartitionProven).toBe(false);
      expect(binding.completeFullSolidSurfaceComplexEmitted).toBe(false);
      expect(binding.wgslDeviceConformanceProven).toBe(false);
    }
  });

  it('refuses composition for each currently known missing physical closure graph', () => {
    expect(target('HexagonalHive', { hh_noise: 0.2 }).compositionBlockers).toContain(
      'MISSING_INTERNAL_CELL_FEATURE_SIDE_GRAPH'
    );
    expect(target('BasketWeave').compositionBlockers).toContain(
      'MISSING_INTERNAL_CHECKER_CURTAIN_GRAPH'
    );
  });

  it('admits CelticKnot composition once its feature-side curtain complex is emitted', () => {
    const binding = target('CelticKnot');
    expect(binding.outerWallCompositionAdmissible).toBe(true);
    expect(binding.compositionBlockers).toEqual([]);
    expect(binding.outerWallPhysicalClosureComplete).toBe(true);
    // sibling styles whose graphs are still absent must STILL refuse (change is CelticKnot-scoped)
    expect(target('HexagonalHive', { hh_noise: 0.2 }).compositionBlockers).toContain(
      'MISSING_INTERNAL_CELL_FEATURE_SIDE_GRAPH'
    );
    expect(target('BasketWeave').compositionBlockers).toContain(
      'MISSING_INTERNAL_CHECKER_CURTAIN_GRAPH'
    );
  });

  it('keeps generated Voronoi parity while exposing the legacy half-integer mismatch', () => {
    const binding = target('Voronoi', { v_scale: 8.5 });
    expect(binding.legacyProductionIntegrationAdmissible).toBe(false);
    expect(binding.legacyProductionIntegrationBlockers).toEqual([
      'LEGACY_PRODUCTION_CPU_WGSL_PERIOD_MISMATCH',
    ]);
    expect(binding.outerWallPhysicalClosureComplete).toBe(true);
    expect(binding.outerWallCompositionAdmissible).toBe(true);
    expect(binding.compositionBlockers).toEqual([]);
  });

  it('rejects structural copies at the proof boundary', () => {
    const genuine = target('HarmonicRipple');
    const copy = Object.freeze({ ...genuine }) as StyleOuterWallTargetRegistryBinding;
    expect(() => styleOuterWallTargetRegistryForProof(copy)).toThrow(/authenticated capability/i);
  });
});
