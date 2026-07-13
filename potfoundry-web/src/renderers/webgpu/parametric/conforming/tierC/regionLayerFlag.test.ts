import { describe, it, expect } from 'vitest';
import { isRegionLayerEnabled } from './regionLayerFlag';

// D-1: default-OFF production flag for the region layer, mirroring the
// `__pfPerfectMesher` convention (isPerfectMesherEnabled in ./index.ts).

type FlagGlobal = { __pfRegionLayer?: boolean };

describe('isRegionLayerEnabled', () => {
  it('defaults to false when the flag is unset', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    delete g.__pfRegionLayer;
    try {
      expect(isRegionLayerEnabled()).toBe(false);
    } finally {
      g.__pfRegionLayer = prior;
    }
  });

  it('is false when explicitly set to false', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = false;
    try {
      expect(isRegionLayerEnabled()).toBe(false);
    } finally {
      g.__pfRegionLayer = prior;
    }
  });

  it('is true only when explicitly set to true', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = true;
    try {
      expect(isRegionLayerEnabled()).toBe(true);
    } finally {
      g.__pfRegionLayer = prior;
    }
  });
});
