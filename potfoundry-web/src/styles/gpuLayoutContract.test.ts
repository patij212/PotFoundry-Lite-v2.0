import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { StyleId } from '../geometry/types';
import { buildStyleParamPayload, STYLE_PARAM_CAPACITY } from '../utils/styleParams';
import {
  applyGpuParameterTransform,
  DEGREES_TO_RADIANS_BINARY64,
  getStyleGpuBinding,
  LEGACY_PACKER_DEFAULT_DRIFTS,
  LEGACY_PACKER_DEFAULT_POLICY,
  STYLE_GPU_DISPATCH_MANIFEST,
  STYLE_GPU_LAYOUT_CANONICAL_JSON,
  STYLE_GPU_LAYOUT_MANIFEST,
  STYLE_GPU_SENTINEL_SPEC,
  STYLE_GPU_TRANSFORM_SPEC,
  type GpuParameterBinding,
} from './gpuLayoutContract';
import { STYLE_REGISTRY } from './registry';
import { normalizeStylePayload, STYLE_GPU_LAYOUT_VERSION } from './runtimeContract';
import { STYLE_DEFAULT_MIGRATION_VERSION } from './styleContractVersions';

function schemaEntries(styleId: StyleId) {
  const config = STYLE_REGISTRY[styleId];
  return [...Object.entries(config.params), ...Object.entries(config.advancedParams ?? {})];
}

function packedValue(value: unknown, binding: GpuParameterBinding): number {
  return applyGpuParameterTransform(Number(value), binding.transform);
}

function sortDrifts<T extends { styleId: string; wireKey: string }>(values: T[]): T[] {
  return values.sort(
    (a, b) => a.styleId.localeCompare(b.styleId) || a.wireKey.localeCompare(b.wireKey)
  );
}

describe('versioned GPU layout contract', () => {
  it('covers all 20 styles and 174 controls with unique slots and exact dispatch', () => {
    expect(Object.keys(STYLE_GPU_LAYOUT_MANIFEST).sort()).toEqual(
      Object.keys(STYLE_REGISTRY).sort()
    );

    let manifestControls = 0;
    let registryControls = 0;
    for (const styleName of Object.keys(STYLE_REGISTRY)) {
      const styleId = styleName as StyleId;
      const bindings = STYLE_GPU_LAYOUT_MANIFEST[styleId];
      const registryKeys = schemaEntries(styleId).map(([key]) => key);
      expect(Object.keys(bindings).sort(), styleId).toEqual([...registryKeys].sort());

      const slots = Object.values(bindings).map((binding) => binding.slot);
      expect(new Set(slots).size, styleId).toBe(slots.length);
      expect(
        slots.every(
          (slot) => Number.isSafeInteger(slot) && slot >= 0 && slot < STYLE_PARAM_CAPACITY - 1
        ),
        styleId
      ).toBe(true);

      const styleIndex = STYLE_GPU_DISPATCH_MANIFEST[styleId];
      const [packedStyleIndex] = buildStyleParamPayload(styleId, {});
      const normalized = normalizeStylePayload(styleId, {});
      expect(styleIndex).toBe(STYLE_REGISTRY[styleId].id);
      expect(packedStyleIndex).toBe(styleIndex);
      expect(normalized.ok).toBe(true);
      if (normalized.ok) {
        expect(normalized.value.gpuParams[STYLE_GPU_SENTINEL_SPEC.slot]).toBe(styleIndex + 1);
      }

      manifestControls += Object.keys(bindings).length;
      registryControls += registryKeys.length;
    }

    const dispatchIndices = Object.values(STYLE_GPU_DISPATCH_MANIFEST);
    expect(new Set(dispatchIndices).size).toBe(20);
    expect([...dispatchIndices].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_unused, index) => index)
    );
    expect(Object.keys(STYLE_GPU_LAYOUT_MANIFEST)).toHaveLength(20);
    expect(manifestControls).toBe(174);
    expect(registryControls).toBe(174);
  });

  it('pins every registry default to its declared slot and exact Float32 transform', () => {
    for (const styleName of Object.keys(STYLE_REGISTRY)) {
      const styleId = styleName as StyleId;
      const normalized = normalizeStylePayload(styleId, {});
      expect(normalized.ok, styleId).toBe(true);
      if (!normalized.ok) continue;

      for (const [wireKey, schema] of schemaEntries(styleId)) {
        const binding = getStyleGpuBinding(styleId, wireKey);
        expect(binding, styleId + '.' + wireKey).toBeDefined();
        if (!binding) continue;
        expect(normalized.value.gpuParams[binding.slot], styleId + '.' + wireKey).toBe(
          packedValue(schema.default, binding)
        );
      }
    }
  });

  it('pins every control to one exact slot at a non-default legal value', () => {
    for (const styleName of Object.keys(STYLE_REGISTRY)) {
      const styleId = styleName as StyleId;
      const baseline = normalizeStylePayload(styleId, {});
      expect(baseline.ok, styleId).toBe(true);
      if (!baseline.ok) continue;

      for (const [wireKey, schema] of schemaEntries(styleId)) {
        const alternate =
          schema.max !== undefined && Number(schema.max) !== Number(schema.default)
            ? schema.max
            : schema.min;
        const binding = getStyleGpuBinding(styleId, wireKey);
        expect(alternate, styleId + '.' + wireKey).not.toBeUndefined();
        expect(binding, styleId + '.' + wireKey).toBeDefined();
        if (alternate === undefined || !binding) continue;

        const changed = normalizeStylePayload(styleId, { [wireKey]: alternate });
        expect(changed.ok, styleId + '.' + wireKey).toBe(true);
        if (!changed.ok) continue;

        const changedSlots = changed.value.gpuParams
          .map((value, slot) =>
            slot < STYLE_PARAM_CAPACITY - 1 && value !== baseline.value.gpuParams[slot]
              ? slot
              : null
          )
          .filter((slot): slot is number => slot !== null);
        expect(changedSlots, styleId + '.' + wireKey).toEqual([binding.slot]);
        expect(changed.value.gpuParams[binding.slot]).toBe(packedValue(alternate, binding));
      }
    }
  });

  it('defines degree conversion bits and checks every legal integer phase', () => {
    const bytes = new ArrayBuffer(8);
    const view = new DataView(bytes);
    view.setFloat64(0, DEGREES_TO_RADIANS_BINARY64, false);
    expect('0x' + view.getBigUint64(0, false).toString(16).padStart(16, '0')).toBe(
      '0x3f91df46a2529d39'
    );
    expect(DEGREES_TO_RADIANS_BINARY64).toBe(Math.PI / 180);

    for (const styleName of Object.keys(STYLE_REGISTRY)) {
      const styleId = styleName as StyleId;
      for (const [wireKey, schema] of schemaEntries(styleId)) {
        const binding = getStyleGpuBinding(styleId, wireKey);
        if (binding?.transform !== 'degrees-to-radians') continue;
        expect(schema.type).toBe('int');
        expect(schema.min).toBe(-180);
        expect(schema.max).toBe(180);

        for (let degrees = -180; degrees <= 180; degrees += 1) {
          const normalized = normalizeStylePayload(styleId, { [wireKey]: degrees });
          expect(normalized.ok, styleId + '.' + wireKey + '=' + degrees).toBe(true);
          if (!normalized.ok) continue;
          const [, legacyPayload] = buildStyleParamPayload(styleId, {
            [wireKey]: degrees,
          });
          const expected = Math.fround(degrees * (Math.PI / 180));
          expect(normalized.value.gpuParams[binding.slot]).toBe(expected);
          expect(Math.fround(legacyPayload[binding.slot])).toBe(expected);
        }
      }
    }
  });

  it('freezes and hashes layout, dispatch, transforms, sentinel, and migration truth', () => {
    expect(Object.isFrozen(STYLE_GPU_LAYOUT_MANIFEST)).toBe(true);
    for (const bindings of Object.values(STYLE_GPU_LAYOUT_MANIFEST)) {
      expect(Object.isFrozen(bindings)).toBe(true);
      expect(Object.values(bindings).every(Object.isFrozen)).toBe(true);
    }

    const parsed = JSON.parse(STYLE_GPU_LAYOUT_CANONICAL_JSON) as {
      version: string;
      capacity: number;
      sentinel: { slot: number; encoding: string };
      transformSpec: unknown;
      defaultMigration: { version: string; policy: string; drifts: unknown[] };
    };
    expect(parsed.version).toBe(STYLE_GPU_LAYOUT_VERSION);
    expect(parsed.capacity).toBe(STYLE_PARAM_CAPACITY);
    expect(parsed.sentinel).toEqual(STYLE_GPU_SENTINEL_SPEC);
    expect(parsed.transformSpec).toEqual(STYLE_GPU_TRANSFORM_SPEC);
    expect(parsed.defaultMigration).toEqual({
      version: STYLE_DEFAULT_MIGRATION_VERSION,
      policy: LEGACY_PACKER_DEFAULT_POLICY,
      drifts: sortDrifts([...LEGACY_PACKER_DEFAULT_DRIFTS]),
    });
    expect(createHash('sha256').update(STYLE_GPU_LAYOUT_CANONICAL_JSON).digest('hex')).toBe(
      'ad70e7fe9acae338b0a3905d518cf76d55528a2d5a5dcbd5f85f31bca76ea7ae'
    );
  });

  it('records all six legacy migrations and proves the live packer no longer drifts', () => {
    expect(LEGACY_PACKER_DEFAULT_POLICY).toBe('registry-schema-defaults-win');
    expect(
      LEGACY_PACKER_DEFAULT_DRIFTS.map((drift) => drift.styleId + '.' + drift.wireKey)
    ).toEqual([
      'GyroidManifold.gm_scale',
      'GyroidManifold.gm_thickness',
      'GyroidManifold.gm_relief',
      'GyroidManifold.gm_edge_fade',
      'CelticTriquetra.ct_med_y',
      'CelticTriquetra.ct_gap',
    ]);

    const currentDrifts = [];
    for (const styleName of Object.keys(STYLE_REGISTRY)) {
      const styleId = styleName as StyleId;
      const [, legacyPayload] = buildStyleParamPayload(styleId, {});
      for (const [wireKey, schema] of schemaEntries(styleId)) {
        const binding = getStyleGpuBinding(styleId, wireKey);
        expect(binding).toBeDefined();
        if (!binding) continue;
        const legacyUploaded = Math.fround(legacyPayload[binding.slot]);
        const registryUploaded = packedValue(schema.default, binding);
        if (!Object.is(legacyUploaded, registryUploaded)) {
          currentDrifts.push({
            styleId,
            wireKey,
            registryDefault: Number(schema.default),
            legacyPackerFallback: legacyPayload[binding.slot],
          });
        }
      }
    }
    expect(currentDrifts).toEqual([]);
    expect(
      LEGACY_PACKER_DEFAULT_DRIFTS.every(
        (drift) => !Object.is(drift.registryDefault, drift.legacyPackerFallback)
      )
    ).toBe(true);
  });

  it('keeps every unbound non-sentinel GPU slot exactly zero', () => {
    for (const styleName of Object.keys(STYLE_REGISTRY)) {
      const styleId = styleName as StyleId;
      const normalized = normalizeStylePayload(styleId, {});
      expect(normalized.ok).toBe(true);
      if (!normalized.ok) continue;
      const boundSlots = new Set(
        Object.values(STYLE_GPU_LAYOUT_MANIFEST[styleId]).map((binding) => binding.slot)
      );
      for (let slot = 0; slot < STYLE_GPU_SENTINEL_SPEC.slot; slot += 1) {
        if (!boundSlots.has(slot)) expect(normalized.value.gpuParams[slot]).toBe(0);
      }
    }
  });

  it('performs prototype-safe style and binding lookup', () => {
    expect(getStyleGpuBinding('WaveInterference', 'wi_phase')).toEqual({
      slot: 11,
      transform: 'identity',
    });
    expect(getStyleGpuBinding('WaveInterference', 'toString')).toBeUndefined();
    expect(getStyleGpuBinding('WaveInterference', '__proto__')).toBeUndefined();
    expect(getStyleGpuBinding('__proto__' as StyleId, 'toString')).toBeUndefined();
    expect(getStyleGpuBinding('constructor' as StyleId, 'prototype')).toBeUndefined();
  });
});
