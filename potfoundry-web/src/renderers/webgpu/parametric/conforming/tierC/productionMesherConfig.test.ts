/**
 * productionMesherConfig.test.ts — pins the ONE production-mesher dispatch.
 *
 *  (b) TABLE PIN: resolveProductionMesher returns the EXACT per-style config for
 *      all 20 StyleIds; every StyleId is present; the frontier 4 are flagged.
 *  (c) SMOKE (master ON): 3 representative styles across paths route to the right
 *      path + the q-levers/flags match the config — asserted via the ACTUAL
 *      downstream adoption predicates (isSmoothGridEnabled/…), no GPU build.
 *
 * Full closure is NOT re-verified here (that is the later flip step) — only that
 * routing + levers are applied. Byte-identical-off is covered by
 * `flagOff.byteIdentical.test.ts` (the master flag is never set there).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_STYLE_PARAMS, type StyleId } from '../../../../../geometry/types';
import {
  PRODUCTION_MESHER_CONFIG,
  resolveProductionMesher,
  applyProductionMesher,
  isProductionMesherEnabled,
  type MesherConfig,
} from './productionMesherConfig';
import {
  isPerfectMesherEnabled,
  isSmoothGridEnabled,
  isBambooEnabled,
  isRegionLayerEnabled,
  isStructuredGridStyle,
  isBambooStyle,
  isRegionLayerStyle,
} from './index';

const ALL_STYLE_IDS = Object.keys(DEFAULT_STYLE_PARAMS) as StyleId[];

/** The controlled globalThis keys — cleared after every test so nothing leaks. */
const CONTROLLED_KEYS = [
  '__pfProductionMesher',
  '__pfPerfectMesher',
  '__pfSmoothGrid',
  '__pfBamboo',
  '__pfRegionLayer',
  '__pfDsConeFan',
  '__pfConformingAnalyticScore',
  '__pfTierCAnalyticSurface',
  '__pfGeoStarLoci',
  '__pfConformingPinBandRelax',
  '__pfConformingMaxLevel',
  '__pfConformingNRing',
] as const;

function clearGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  for (const k of CONTROLLED_KEYS) delete g[k];
}
afterEach(clearGlobals);

// ── (b) TABLE PIN ────────────────────────────────────────────────────────────

/** The proven config per style (EXPERIMENT-REGISTRY rows in productionMesherConfig.ts). */
const EXPECTED: Record<StyleId, MesherConfig> = {
  HarmonicRipple: { path: 'smoothGrid' },
  SuperellipseMorph: { path: 'smoothGrid' },
  FourierBloom: { path: 'smoothGrid' },
  SpiralRidges: { path: 'smoothGrid' },
  SuperformulaBlossom: { path: 'smoothGrid' },
  WaveInterference: { path: 'smoothGrid' },
  HexagonalHive: { path: 'smoothGrid' },
  RippleInterference: { path: 'smoothGrid' },
  BambooSegments: { path: 'bamboo' },
  DragonScales: { path: 'coneFan' },
  Crystalline: { path: 'conforming', analyticScore: true, aSagMm: 0.004, maxLevel: 13, nRing: 32768 },
  GeometricStar: { path: 'conforming', analyticScore: true, aSagMm: 0.004, maxLevel: 13, geoStarExactLoci: true },
  GyroidManifold: { path: 'conforming', analyticScore: true, aSagMm: 0.004, maxLevel: 14 },
  Voronoi: { path: 'conforming', analyticScore: true, aSagMm: 0.002, maxLevel: 14 },
  GothicArches: { path: 'tierC' },
  LowPolyFacet: { path: 'off' },
  ArtDeco: { path: 'off', frontier: true },
  BasketWeave: { path: 'off', frontier: true },
  CelticKnot: { path: 'off', frontier: true },
  CelticTriquetra: { path: 'off', frontier: true },
};

const FRONTIER_STYLES: ReadonlySet<StyleId> = new Set<StyleId>([
  'ArtDeco',
  'BasketWeave',
  'CelticKnot',
  'CelticTriquetra',
]);

describe('production mesher — table pin (all 20 styles)', () => {
  it('has an entry for EVERY StyleId and no extras', () => {
    expect(ALL_STYLE_IDS).toHaveLength(20);
    for (const s of ALL_STYLE_IDS) {
      expect(PRODUCTION_MESHER_CONFIG[s], `missing config for ${s}`).toBeDefined();
    }
    // No extra keys beyond the 20 permanent StyleIds.
    expect(Object.keys(PRODUCTION_MESHER_CONFIG).sort()).toEqual([...ALL_STYLE_IDS].sort());
  });

  it('pins the EXACT config for each style', () => {
    for (const s of ALL_STYLE_IDS) {
      expect(PRODUCTION_MESHER_CONFIG[s], `config drift for ${s}`).toEqual(EXPECTED[s]);
    }
  });

  it('flags exactly the 4 frontier styles', () => {
    for (const s of ALL_STYLE_IDS) {
      const isFrontier = PRODUCTION_MESHER_CONFIG[s].frontier === true;
      expect(isFrontier, `${s} frontier flag`).toBe(FRONTIER_STYLES.has(s));
    }
  });

  it('resolveProductionMesher returns a descriptor for every style + null for unknown', () => {
    for (const s of ALL_STYLE_IDS) {
      const r = resolveProductionMesher(s);
      expect(r, `resolve ${s}`).not.toBeNull();
      expect(r!.styleId).toBe(s);
      expect(r!.path).toBe(EXPECTED[s].path);
      expect(r!.frontier).toBe(FRONTIER_STYLES.has(s));
    }
    expect(resolveProductionMesher('NotAStyle' as StyleId)).toBeNull();
  });

  it('conforming analytic-score styles carry their aSagMm as a threaded q-override', () => {
    for (const s of ALL_STYLE_IDS) {
      const r = resolveProductionMesher(s)!;
      const cfg = EXPECTED[s];
      if (cfg.path === 'conforming' && cfg.analyticScore) {
        expect(r.conformingAnalytic, `${s} conformingAnalytic`).toBe(true);
        expect(r.qOverrides.analyticSagMm, `${s} aSagMm`).toBe(cfg.aSagMm);
        expect(r.qOverrides.__pfConformingMaxLevel, `${s} maxLevel`).toBe(cfg.maxLevel);
        // __pfPerfectMesher MUST stay off so count-unstable GeoStar is not hijacked.
        expect(r.flags.__pfPerfectMesher, `${s} perfectMesher off`).toBe(false);
        expect(r.flags.__pfConformingAnalyticScore).toBe(true);
      } else {
        expect(r.conformingAnalytic, `${s} not conformingAnalytic`).toBe(false);
      }
    }
  });
});

// ── (c) SMOKE (master ON): routing + levers applied ──────────────────────────

describe('production mesher — master-ON smoke (routing + levers)', () => {
  it('master flag reads globalThis.__pfProductionMesher', () => {
    expect(isProductionMesherEnabled()).toBe(false);
    (globalThis as Record<string, unknown>).__pfProductionMesher = true;
    expect(isProductionMesherEnabled()).toBe(true);
  });

  it('HarmonicRipple → smoothGrid emitter path', () => {
    applyProductionMesher(resolveProductionMesher('HarmonicRipple')!);
    // adoptSmooth = isSmoothGridEnabled() && isStructuredGridStyle(id); adoptTierCOuter needs perfectMesher.
    expect(isPerfectMesherEnabled()).toBe(true);
    expect(isSmoothGridEnabled()).toBe(true);
    expect(isStructuredGridStyle('HarmonicRipple')).toBe(true);
    // Not the other emitters / not the analytic-score conforming path.
    expect(isBambooEnabled()).toBe(false);
    expect(isRegionLayerEnabled()).toBe(false);
    expect((globalThis as Record<string, unknown>).__pfConformingAnalyticScore).toBe(false);
    // Smooth path sets NO q-levers (the emitter self-densifies).
    expect((globalThis as Record<string, unknown>).__pfConformingMaxLevel).toBeUndefined();
    expect((globalThis as Record<string, unknown>).__pfConformingNRing).toBeUndefined();
  });

  it('Voronoi → analytic-score conforming path (L14 / aSag 0.002 / loci off / perfectMesher OFF)', () => {
    const r = resolveProductionMesher('Voronoi')!;
    applyProductionMesher(r);
    // KEY: perfectMesher OFF ⇒ NOT routed to the emitter/tierC adopt hook ⇒ default conforming wall.
    expect(isPerfectMesherEnabled()).toBe(false);
    expect(isSmoothGridEnabled()).toBe(false);
    expect(isBambooEnabled()).toBe(false);
    expect(isRegionLayerEnabled()).toBe(false);
    // Analytic scoring armed + the q-levers compute() reads (qMaxLevel/qNRing).
    expect((globalThis as Record<string, unknown>).__pfConformingAnalyticScore).toBe(true);
    expect((globalThis as Record<string, unknown>).__pfConformingMaxLevel).toBe(14);
    expect((globalThis as Record<string, unknown>).__pfConformingNRing).toBeUndefined(); // default 2048
    expect((globalThis as Record<string, unknown>).__pfGeoStarLoci).toBe(false); // loci OFF for Voronoi
    // aSagMm is threaded into the OUTER wall (not a globalThis lever).
    expect(r.conformingAnalytic).toBe(true);
    expect(r.qOverrides.analyticSagMm).toBe(0.002);
  });

  it('BambooSegments → bamboo ring-strip emitter path', () => {
    applyProductionMesher(resolveProductionMesher('BambooSegments')!);
    expect(isPerfectMesherEnabled()).toBe(true);
    expect(isBambooEnabled()).toBe(true);
    expect(isBambooStyle('BambooSegments')).toBe(true);
    expect(isSmoothGridEnabled()).toBe(false);
    expect(isRegionLayerEnabled()).toBe(false);
    expect((globalThis as Record<string, unknown>).__pfConformingAnalyticScore).toBe(false);
  });

  it('DragonScales → region + cone-fan sub-flags', () => {
    applyProductionMesher(resolveProductionMesher('DragonScales')!);
    expect(isPerfectMesherEnabled()).toBe(true);
    expect(isRegionLayerEnabled()).toBe(true);
    expect(isRegionLayerStyle('DragonScales')).toBe(true);
    expect((globalThis as Record<string, unknown>).__pfDsConeFan).toBe(true);
  });

  it('applies deterministically — no stale q-lever leaks between styles', () => {
    // Voronoi sets maxLevel 14; a subsequent smooth style MUST clear it (else its
    // inner wall over-refines). This is the whole reason applyProductionMesher writes
    // the FULL controlled set every call.
    applyProductionMesher(resolveProductionMesher('Voronoi')!);
    expect((globalThis as Record<string, unknown>).__pfConformingMaxLevel).toBe(14);
    applyProductionMesher(resolveProductionMesher('HarmonicRipple')!);
    expect((globalThis as Record<string, unknown>).__pfConformingMaxLevel).toBeUndefined();
    expect((globalThis as Record<string, unknown>).__pfConformingAnalyticScore).toBe(false);
    // Crystalline sets nRing 32768; a later style clears it.
    applyProductionMesher(resolveProductionMesher('Crystalline')!);
    expect((globalThis as Record<string, unknown>).__pfConformingNRing).toBe(32768);
    applyProductionMesher(resolveProductionMesher('GyroidManifold')!);
    expect((globalThis as Record<string, unknown>).__pfConformingNRing).toBeUndefined();
  });
});
