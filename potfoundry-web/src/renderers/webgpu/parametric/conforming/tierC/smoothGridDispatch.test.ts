// smoothGridDispatch.test.ts — PRODUCTION dispatch wiring for the smooth-grid tierC emitter
// (E-2026-07-22 certifiable-production-mesh campaign). Pins the wiring invariants: the __pfSmoothGrid flag defaults
// OFF (byte-identical production), the 6 C∞ smooth styles (and NOTHING else) route through the dispatch guard, the
// style set is DISJOINT from the region + count-unstable allow-lists (clean separation), and the guarded builder
// returns undefined unless BOTH the flag is on AND the style is a smooth-grid style — emitting an emergent-nU
// ConformingOuterWallResult (the assembly pins the inner wall to outer.bottomRing.length) when it fires.
import { describe, it, expect, afterEach } from 'vitest';
import { isSmoothGridEnabled } from './regionLayerFlag';
import { SMOOTH_GRID_STYLES, isSmoothGridStyle, buildSmoothGridDispatchWall, REGION_LAYER_STYLES } from './index';
import { COUNT_UNSTABLE_STYLES } from './countUnstable';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

const H = 120;
/** Synthetic C∞ smooth radius (angular ripple + vertical bell) — genuinely curved both ways. */
const smoothRA: AnalyticRadiusFn = (theta: number, z: number): number => {
  const t = z / H;
  return 55 + 3 * Math.sin(6 * theta) + 2 * Math.sin(Math.PI * t);
};

function setSmoothGrid(on: boolean): void {
  (globalThis as unknown as { __pfSmoothGrid?: boolean }).__pfSmoothGrid = on;
}
afterEach(() => {
  delete (globalThis as unknown as { __pfSmoothGrid?: boolean }).__pfSmoothGrid;
});

describe('smooth-grid production dispatch wiring', () => {
  it('__pfSmoothGrid defaults OFF (byte-identical production path)', () => {
    expect(isSmoothGridEnabled()).toBe(false);
  });

  it('SMOOTH_GRID_STYLES = the C∞ smooth styles + density-closable relief, DISJOINT from region + count-unstable', () => {
    expect([...SMOOTH_GRID_STYLES].sort()).toEqual([
      'FourierBloom',
      'HarmonicRipple',
      'HexagonalHive',
      'RippleInterference',
      'SpiralRidges',
      'SuperellipseMorph',
      'SuperformulaBlossom',
      'WaveInterference',
    ]);
    for (const s of SMOOTH_GRID_STYLES) {
      expect(REGION_LAYER_STYLES.has(s)).toBe(false);
      expect(COUNT_UNSTABLE_STYLES.has(s)).toBe(false);
    }
  });

  it('isSmoothGridStyle classifies smooth styles in, others (and undefined) out', () => {
    expect(isSmoothGridStyle('HarmonicRipple')).toBe(true);
    expect(isSmoothGridStyle('SuperformulaBlossom')).toBe(true);
    expect(isSmoothGridStyle('DragonScales')).toBe(false);
    expect(isSmoothGridStyle('GothicArches')).toBe(false);
    expect(isSmoothGridStyle(undefined)).toBe(false);
  });

  it('buildSmoothGridDispatchWall returns undefined flag-OFF even for a smooth style (inert)', () => {
    setSmoothGrid(false);
    expect(
      buildSmoothGridDispatchWall({ analyticRA: smoothRA, H, tolMm: 0.01 }, 'HarmonicRipple'),
    ).toBeUndefined();
  });

  it('flag-ON: emits an emergent-nU (u,t,0) outer wall for a smooth style, undefined for a non-smooth style', () => {
    setSmoothGrid(true);
    const wall = buildSmoothGridDispatchWall({ analyticRA: smoothRA, H, tolMm: 0.01 }, 'HarmonicRipple');
    expect(wall).toBeDefined();
    // Emergent rims: bottomRing/topRing length = nU (a power of two), NOT a fixed nRing.
    const nU = wall!.bottomRing.length;
    expect(wall!.topRing.length).toBe(nU);
    expect(nU & (nU - 1)).toBe(0);
    expect(nU).toBeGreaterThanOrEqual(64);
    // Domain packing: (u,t,0) with z=0 on every grid vertex, watertight index buffer.
    for (let i = 0; i < wall!.gridVertexCount; i++) expect(wall!.vertices[3 * i + 2]).toBe(0);
    // A region / non-smooth style is NOT routed here even with the flag on.
    expect(
      buildSmoothGridDispatchWall({ analyticRA: smoothRA, H, tolMm: 0.01 }, 'DragonScales'),
    ).toBeUndefined();
  });
});
