/* eslint-disable no-console */
// _pfCloseExportRoute.test.ts — pin the 0.01mm-fidelity STL→3MF auto-route (productionization decision: never decimate).
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseExportRoute.test.ts
import { describe, it, expect } from 'vitest';
import { resolveExportFormatForSize } from '../../src/geometry/stlExport';

const CAP = Math.floor((1024 * 1024 * 1024 - 84) / 50); // ≈ 21,474,836

describe('export format auto-route (fidelity over size)', () => {
  it('STL that fits stays STL', () => {
    expect(resolveExportFormatForSize('stl', CAP)).toEqual({ format: 'stl', rerouted: false });
    expect(resolveExportFormatForSize('stl', 5_000_000)).toEqual({ format: 'stl', rerouted: false });
  });
  it('STL over the cap auto-routes to 3MF', () => {
    expect(resolveExportFormatForSize('stl', CAP + 1)).toEqual({ format: '3mf', rerouted: true });
    expect(resolveExportFormatForSize('stl', 25_000_000)).toEqual({ format: '3mf', rerouted: true });
  });
  it('3MF / OBJ pass through unchanged (they have the headroom / are the user’s explicit choice)', () => {
    expect(resolveExportFormatForSize('3mf', 30_000_000)).toEqual({ format: '3mf', rerouted: false });
    expect(resolveExportFormatForSize('obj', 30_000_000)).toEqual({ format: 'obj', rerouted: false });
  });
});
