/**
 * productionMesherConfig.ts — the ONE feature-driven production-mesher dispatch.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS (the "one clean switch")
 * ═══════════════════════════════════════════════════════════════════════════
 * Every style now has a PROVEN config that closes it ≤0.01mm true-3D at PROD
 * dims (EXPERIMENT-REGISTRY.md). Reaching each one today means hand-setting a
 * DIFFERENT combination of dev sub-flags + q-levers (`__pfPerfectMesher`,
 * `__pfSmoothGrid`, `__pfBamboo`, `__pfRegionLayer`, `__pfDsConeFan`,
 * `__pfConformingAnalyticScore`, `__pfTierCAnalyticSurface`, `__pfGeoStarLoci`,
 * `__pfConformingMaxLevel`, `__pfConformingNRing`, the analytic-sag target).
 * This module collapses all of that into ONE master flag `__pfProductionMesher`:
 * when it is on, {@link resolveProductionMesher} expands the current style's
 * entry in {@link PRODUCTION_MESHER_CONFIG} into the exact sub-flag + q-lever set
 * the registry proved, and {@link applyProductionMesher} writes them to
 * `globalThis` so the UNCHANGED downstream reads (isSmoothGridEnabled/…,
 * `qOv.__pfConforming*`, isConformingAnalyticScoreEnabled) pick them up.
 *
 * The eventual production flip becomes a single clean switch (default
 * `__pfProductionMesher` on, later + live-GPU-verified) instead of many
 * sub-flags.
 *
 * SAFETY: this module is INERT unless {@link isProductionMesherEnabled}. When
 * the master flag is off the hub never calls {@link applyProductionMesher}, so
 * nothing is written to `globalThis` and every export is byte-identical to
 * production today (the `flagOff.byteIdentical` gate).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PER-STYLE MAP (each value verified against its EXPERIMENT-REGISTRY row)
 * ═══════════════════════════════════════════════════════════════════════════
 *  • smoothGrid  → the 8 {@link SMOOTH_GRID_STYLES} (E-2026-07-23-SMOOTHGRID-
 *      DENSITY-GUARANTEE verify-bump density; the emitter self-densifies ≤0.01).
 *  • bamboo      → BambooSegments ring-strip (E-2026-07-22-BAMBOO-SCHED).
 *  • coneFan     → DragonScales region + scale-tip cone-fan (DS-CONEFAN-PROD).
 *  • conforming  → the 4 analytic-score styles (E-2026-07-24-LEVER-STACK-CLOSE /
 *      -ANALYTIC-SCORE / -PINBAND / -GEOSTAR-LOCUS): the DEFAULT conforming wall
 *      with __pfConformingAnalyticScore + per-style maxLevel/nRing/aSagMm/loci.
 *      __pfPerfectMesher is deliberately LEFT OFF so count-unstable GeometricStar
 *      is NOT hijacked onto the Tier-C wall — it takes the analytic-scored wall.
 *  • tierC       → GothicArches (count-unstable buildTierCOuterWall + analytic
 *      surface; the existing count-unstable path).
 *  • off         → LowPolyFacet (default conforming already holds 0.001mm), and
 *      the 4 FRONTIER styles (ArtDeco / BasketWeave / CelticKnot / CelticTriquetra)
 *      that are not yet closed — left on their current best (`frontier: true`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { StyleId } from '../../../../../geometry/types';

/** The mesher path a style routes through when the production mesher is on. */
export type MesherPath =
  | 'smoothGrid'
  | 'bamboo'
  | 'coneFan'
  | 'conforming'
  | 'tierC'
  | 'off';

/**
 * One style's proven closing recipe. `path` selects the emitter/refiner; the
 * optional fields are the per-style levers that path consumes (only the
 * `conforming` path reads `analyticScore`/`aSagMm`/`maxLevel`/`nRing`/
 * `geoStarExactLoci`/`pinBandGrading`; `frontier` marks a not-yet-closed style
 * left on its current best).
 */
export interface MesherConfig {
  path: MesherPath;
  /** Conforming path: score refinement against the EXACT analytic surface. */
  analyticScore?: boolean;
  /** Conforming path: analytic-sag target (mm), DECOUPLED from the sampler sag. */
  aSagMm?: number;
  /** Conforming path: quadtree `__pfConformingMaxLevel` override. */
  maxLevel?: number;
  /** Conforming path: `__pfConformingNRing` override (power-of-two). */
  nRing?: number;
  /** Conforming path (GeometricStar): emit the exact strapwork-ramp loci. */
  geoStarExactLoci?: boolean;
  /** Conforming path: relax the pin-band grading (E-2026-07-24-PINBAND). */
  pinBandGrading?: 'geometric';
  /** Not yet closed to ≤0.01mm — left on current best (no dispatch change). */
  frontier?: boolean;
}

/**
 * EXHAUSTIVE per-style production-mesher map. Each value is the config the
 * EXPERIMENT-REGISTRY row cited in the module header proved closes that style
 * (or, for `frontier`, its current best). Every one of the 20 permanent
 * {@link StyleId}s is present.
 */
export const PRODUCTION_MESHER_CONFIG: Record<StyleId, MesherConfig> = {
  // ── smooth-grid emitter (verify-bump density; = SMOOTH_GRID_STYLES) ──────────
  HarmonicRipple: { path: 'smoothGrid' },
  SuperellipseMorph: { path: 'smoothGrid' },
  FourierBloom: { path: 'smoothGrid' },
  SpiralRidges: { path: 'smoothGrid' },
  SuperformulaBlossom: { path: 'smoothGrid' },
  WaveInterference: { path: 'smoothGrid' },
  HexagonalHive: { path: 'smoothGrid' },
  RippleInterference: { path: 'smoothGrid' },

  // ── layered-class emitters ──────────────────────────────────────────────────
  BambooSegments: { path: 'bamboo' }, // ring-strip (__pfBamboo)
  DragonScales: { path: 'coneFan' }, // region + cone-fan (__pfRegionLayer + __pfDsConeFan)

  // ── conforming + analytic-score (E-2026-07-24-LEVER-STACK-CLOSE) ─────────────
  // NB: nRing default (2048) unless overridden; __pfPerfectMesher stays OFF here.
  Crystalline: { path: 'conforming', analyticScore: true, aSagMm: 0.004, maxLevel: 13, nRing: 32768 }, // →0.00807
  GeometricStar: { path: 'conforming', analyticScore: true, aSagMm: 0.004, maxLevel: 13, geoStarExactLoci: true }, // →0.00466
  GyroidManifold: { path: 'conforming', analyticScore: true, aSagMm: 0.004, maxLevel: 14 }, // →0.00892
  Voronoi: { path: 'conforming', analyticScore: true, aSagMm: 0.002, maxLevel: 14 }, // →0.00666 (loci OFF)

  // ── tierC refine (count-unstable) ───────────────────────────────────────────
  GothicArches: { path: 'tierC' }, // existing buildTierCOuterWall + analytic surface

  // ── OFF conforming (already ≤0.01 on the default path) ──────────────────────
  LowPolyFacet: { path: 'off' }, // OFF conforming holds 0.00102mm

  // ── FRONTIER / not-yet-closed (leave on current best, mark as such) ─────────
  ArtDeco: { path: 'off', frontier: true },
  BasketWeave: { path: 'off', frontier: true },
  CelticKnot: { path: 'off', frontier: true },
  CelticTriquetra: { path: 'off', frontier: true },
};

/**
 * The master switch: the production mesher is active iff
 * `globalThis.__pfProductionMesher === true`. Default OFF ⇒ byte-identical.
 */
export function isProductionMesherEnabled(): boolean {
  return (
    (globalThis as unknown as { __pfProductionMesher?: boolean })
      .__pfProductionMesher === true
  );
}

/**
 * The complete set of `globalThis` sub-flags the production mesher controls.
 * Every field is written on EVERY apply (to its exact value, true OR false) so
 * the application is DETERMINISTIC — a prior style's flags can never leak into
 * the next export. `__pfConformingPinBandRelax` is `'geometric'` or `false`
 * (false ⇒ cleared ⇒ the shipped `'linear'` grading).
 */
export interface ProductionMesherFlags {
  __pfPerfectMesher: boolean;
  __pfSmoothGrid: boolean;
  __pfBamboo: boolean;
  __pfRegionLayer: boolean;
  __pfDsConeFan: boolean;
  __pfConformingAnalyticScore: boolean;
  __pfTierCAnalyticSurface: boolean;
  __pfGeoStarLoci: boolean;
  __pfConformingPinBandRelax: 'geometric' | false;
}

/**
 * Numeric q-lever overrides. `__pfConformingMaxLevel`/`__pfConformingNRing` are
 * `globalThis` levers the hub's `qMaxLevel`/`qNRing` read; `analyticSagMm` is NOT
 * a `globalThis` lever — the hub threads it into the OUTER conforming wall as
 * `opts.analyticSagMm` (decoupled from the sampler sag). `undefined` ⇒ cleared.
 */
export interface ProductionMesherQOverrides {
  __pfConformingMaxLevel?: number;
  __pfConformingNRing?: number;
  analyticSagMm?: number;
}

/** Pure descriptor returned by {@link resolveProductionMesher}. */
export interface ResolvedProductionMesher {
  styleId: StyleId;
  path: MesherPath;
  frontier: boolean;
  /**
   * True when the OUTER conforming wall must be analytic-scored — the hub then
   * threads `analyticRA`/`analyticH`/`analyticSagMm` into it (see
   * {@link ProductionMesherQOverrides.analyticSagMm}). Only the 4 conforming
   * analytic-score styles set this.
   */
  conformingAnalytic: boolean;
  flags: ProductionMesherFlags;
  qOverrides: ProductionMesherQOverrides;
}

/**
 * PURE resolver: expand a style's {@link MesherConfig} into the concrete
 * `globalThis` sub-flags + q-lever overrides that reproduce its proven closing
 * config. Reads NOTHING and mutates NOTHING (the master-flag check + the write
 * live in the hub / {@link applyProductionMesher}). Returns `null` only for an
 * unknown `styleId` (defensive; the map is exhaustive over {@link StyleId}).
 */
export function resolveProductionMesher(
  styleId: StyleId,
): ResolvedProductionMesher | null {
  const cfg = PRODUCTION_MESHER_CONFIG[styleId];
  if (cfg === undefined) return null;

  // Start fully OFF; each path turns on exactly its own sub-flags.
  const flags: ProductionMesherFlags = {
    __pfPerfectMesher: false,
    __pfSmoothGrid: false,
    __pfBamboo: false,
    __pfRegionLayer: false,
    __pfDsConeFan: false,
    __pfConformingAnalyticScore: false,
    __pfTierCAnalyticSurface: false,
    __pfGeoStarLoci: false,
    __pfConformingPinBandRelax: false,
  };
  const qOverrides: ProductionMesherQOverrides = {};

  switch (cfg.path) {
    case 'smoothGrid':
      // adoptSmooth = isSmoothGridEnabled() && isStructuredGridStyle(id);
      // adoptTierCOuter needs isPerfectMesherEnabled() (assembly adopt hook).
      flags.__pfPerfectMesher = true;
      flags.__pfSmoothGrid = true;
      break;
    case 'bamboo':
      flags.__pfPerfectMesher = true;
      flags.__pfBamboo = true;
      break;
    case 'coneFan':
      flags.__pfPerfectMesher = true;
      flags.__pfRegionLayer = true;
      flags.__pfDsConeFan = true;
      break;
    case 'tierC':
      // Count-unstable → buildTierCOuterWall; the analytic-surface refine
      // (E-2026-07-12 C2) closes it to literal 0 ≤0.01.
      flags.__pfPerfectMesher = true;
      flags.__pfTierCAnalyticSurface = true;
      break;
    case 'conforming':
      // DEFAULT conforming wall (NO __pfPerfectMesher — else count-unstable
      // GeometricStar is hijacked onto the Tier-C wall). Analytic scoring +
      // per-style loci/pin-band are the levers.
      if (cfg.analyticScore) flags.__pfConformingAnalyticScore = true;
      if (cfg.geoStarExactLoci) flags.__pfGeoStarLoci = true;
      if (cfg.pinBandGrading === 'geometric') flags.__pfConformingPinBandRelax = 'geometric';
      break;
    case 'off':
      // Default conforming path, no sub-flags (LowPolyFacet + the frontier 4).
      break;
  }

  if (cfg.maxLevel !== undefined) qOverrides.__pfConformingMaxLevel = cfg.maxLevel;
  if (cfg.nRing !== undefined) qOverrides.__pfConformingNRing = cfg.nRing;
  if (cfg.aSagMm !== undefined) qOverrides.analyticSagMm = cfg.aSagMm;

  return {
    styleId,
    path: cfg.path,
    frontier: cfg.frontier === true,
    conformingAnalytic: cfg.path === 'conforming' && cfg.analyticScore === true,
    flags,
    qOverrides,
  };
}

/**
 * The ONE mutation site: write a resolved descriptor's sub-flags + q-levers to
 * `globalThis`. Writes the FULL controlled set every call (each flag to true OR
 * false; each q-lever to its value OR `undefined`) so no stale lever from a
 * prior style's export can leak — the application is idempotent per style.
 *
 * The `analyticSagMm` q-lever is intentionally NOT written here: it is not a
 * `globalThis` lever. The hub threads it into the OUTER conforming wall via
 * `assemblyOpts` (see {@link ResolvedProductionMesher.conformingAnalytic}).
 *
 * CALLERS MUST gate this on {@link isProductionMesherEnabled}: when the master
 * flag is off this is never invoked and `globalThis` is untouched (byte-identical).
 */
export function applyProductionMesher(resolved: ResolvedProductionMesher): void {
  const g = globalThis as Record<string, unknown>;
  const f = resolved.flags;
  g.__pfPerfectMesher = f.__pfPerfectMesher;
  g.__pfSmoothGrid = f.__pfSmoothGrid;
  g.__pfBamboo = f.__pfBamboo;
  g.__pfRegionLayer = f.__pfRegionLayer;
  g.__pfDsConeFan = f.__pfDsConeFan;
  g.__pfConformingAnalyticScore = f.__pfConformingAnalyticScore;
  g.__pfTierCAnalyticSurface = f.__pfTierCAnalyticSurface;
  g.__pfGeoStarLoci = f.__pfGeoStarLoci;
  g.__pfConformingPinBandRelax =
    f.__pfConformingPinBandRelax === 'geometric' ? 'geometric' : undefined;
  // Clear (undefined) when a path sets no override — `typeof x === 'number'`
  // guards downstream treat undefined exactly like a missing key ⇒ default.
  g.__pfConformingMaxLevel = resolved.qOverrides.__pfConformingMaxLevel;
  g.__pfConformingNRing = resolved.qOverrides.__pfConformingNRing;
}
