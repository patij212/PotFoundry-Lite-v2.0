// tierc_manifest.ts — PROD-TIERC Phase-1 manifest v1 (architecture-v1.md build item 3).
// Spec: research/lab/tierc/architecture-v1.md §2 (region model: RegionPlan/ChainSpec/FeatureAnatomy)
// + §4 (StyleManifest interface sketch). Prereg: research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md
// (the four Phase-1 arms this manifest serves: D-FourierBloom control, A-Gyroid, B-DragonScales,
// C-Gothic). Champion recipes: research/lab/tierc/champion-spec-{gyroid,dragonscales,gothic}.md.
//
// SCOPE (architecture-v1 §6, build item 3): "Manifest v1 (4 styles: control, Gyroid, DS, Gothic) +
// anatomy providers (Gyroid's wraps _gyroidContourLib extraction verbatim; DS's wraps
// dragonRings+row schedule; Gothic's wraps K2's detect/condition path)." Region-layer CORE
// (dispatch, actual K1/K2/K3 build execution, the dev flag, byte-identical-off gate) is a LATER
// build item (#4) — this module only produces the DATA the region layer will consume. Gothic's
// "wraps K2's detect/condition path" is satisfied here as data (the exact patch domain + the K2
// call's own cited config, per wholeMesh0Outlier.test.ts's runPatchGate), not by importing/invoking
// tierC/morseComplex.ts — invoking K2 is the region layer's job, not the manifest's.
//
// INTERFACE MISMATCH (flagged per the mission's hard rule, not silently resolved): see the
// StyleManifest doc-comment below for the full analysis against tierc_gatesHarness.ts's LOCAL
// PLACEHOLDER StyleManifest.
//
// Types RegionPlan / ChainSpec / FeatureAnatomy / EmbeddedCurve / PinSeed / SizingConfig do not
// exist anywhere else in the codebase (grep-confirmed zero hits before this file) — this module is
// their canonical home, per the mission's explicit instruction, kept deliberately minimal and
// data-only (no behavior) per architecture-v1 §2's own ASCII sketch.
//
// DEV-ONLY. research/ never imported by src/. NEW FILE — no existing production or research code
// edited to produce this module.
import { buildRadiusFn } from './runStyle';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId, StyleOptions } from '../../src/geometry/types';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  extractBandedgeContours,
  contoursToFeatureLines,
  type ExtractOpts,
} from './_gyroid_bandedge_lib';
import { dragonRings } from './_ds_prodtruth_lib';

export type { StyleDims };

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Region model (architecture-v1.md §2). Minimal, data-only — no behavior lives in this module.
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type RegionType = 'R-STRUCT' | 'R-CDT' | 'R-REFINE';

/**
 * (u,t) chart window and/or a z-band. A region uses whichever pair applies to its RegionType — e.g.
 * DS's R-STRUCT ring bands are naturally z-band-defined (architecture-v1 §2: "a true z-riser is
 * unrepresentable in any single-valued (u,t) chart"), while Gothic's R-REFINE patch and the two
 * whole-wall R-CDT regions (FourierBloom/Gyroid) are (u,t)-window-defined. Both pairs may be present
 * simultaneously (a z-band region also has a natural full-wrap u range); a consumer reads whichever
 * fields its RegionType needs.
 */
export interface RegionDomain {
  uLo?: number;
  uHi?: number;
  tLo?: number;
  tHi?: number;
  zLo?: number;
  zHi?: number;
}

/**
 * An inter-region boundary contract — architecture-v1 §2's "load-bearing new design element": an
 * explicit, immutable, ordered vertex chain OWNED by one region and ADOPTED by its neighbor, shared
 * by index after assembly welding, never re-derived independently. Region-layer core (build item 4)
 * has not landed, and the R-STRUCT<->R-CDT adoption contract itself is an OPEN pre-registered
 * question with three untried candidates (architecture-v1 §2 "the known hard case", Decision A2,
 * resolved by the B0 toy arm, build item 5) — so every ChainSpec produced by this manifest has
 * `status: 'TODO'` and `adopter: null`. Structurally present (satisfies RegionPlan.boundaryChains),
 * not a proven contract. Do not treat a 'TODO' chain here as resolved.
 */
export interface ChainSpec {
  id: string;
  /** Region id that owns/derives this chain's vertices. */
  owner: string;
  /** Region id that adopts the chain by shared index, once the boundary contract is resolved. */
  adopter: string | null;
  status: 'TODO' | 'DEFINED';
}

/**
 * Per-region sizing-service selection (architecture-v1 §3 S-SIZING — "a menu, all proven,
 * deliberately NOT one universal formula"). 'k2-isotropic-refine' names the mechanism ACTUALLY
 * shipped for Gothic's patch gate today (measured-facet-error-driven isotropic edge-mode RED 1->4,
 * gothic-spec §2.D / §3 noBridgeRefine.ts) — distinct from 'arc-length-cdf' (flankBand.ts's C1
 * per-row numeric inversion) and 'uniform-ladder' (C2's LADDER-4 af rails), both of which exist in
 * research/ but are NOT wired into the default patch call (gothic-spec §2.D: "note NO ... bandContours
 * on the complex: the shipped default is the plain isotropic kernel").
 */
export type SizingMethod =
  | 'metric-sizing' // K1 MetricSizingField, 128^2 grid — the default R-CDT path (architecture-v1 §3)
  | 'fixed-feature-level' // Gyroid: featureLevel=11 uniform refine on any general-curve-crossed cell
  | 'jacobian-floor' // warp-family styles ONLY (SpiralRidges-class); NOT Gyroid/DS (both measured J≡1)
  | 'arc-length-cdf' // K2 flank per-row numeric inversion (gothic-spec §2 C1) — NOT wired by default
  | 'uniform-ladder' // K2 production-band flank rails, LADDER-4 (gothic-spec §2 C2) — NOT wired by default
  | 'designed-texture-exempt' // forbids generic curvature-driven density escalation (DS θ-trap, §2.5)
  | 'k2-isotropic-refine'; // the ACTUAL shipped Gothic patch mechanism (noBridgeRefine default call)

export interface SizingConfig {
  method: SizingMethod;
  params?: Record<string, number>;
}

/**
 * `id` is an addition beyond architecture-v1 §2's bare ASCII sketch (which lists only
 * `type/domain/boundaryChains/sizing/kernelOpts`) — added because ChainSpec.owner/adopter need a
 * stable region identifier to reference, and the sketch does not otherwise supply one. Flagged as a
 * deliberate minimal elaboration, not a spec deviation.
 */
export interface RegionPlan {
  id: string;
  type: RegionType;
  domain: RegionDomain;
  boundaryChains: ChainSpec[];
  sizing: SizingConfig;
  kernelOpts?: Record<string, unknown>;
}

/**
 * A locked/embedded constraint polyline in the (u,t) chart — general-curve feature edges (Gyroid's
 * doubled band-edge contours), creases, etc. Structurally mirrors FeatureLineGraph.ts's `FeatureLine`
 * shape (kind:'general-curve', points:{u,t}[], label) without importing it, so this module stays
 * import-light and self-contained; gyroidManifoldAnatomy maps the real `FeatureLine[]` extraction
 * output into this shape field-by-field (see below).
 */
export interface EmbeddedCurve {
  kind: 'general-curve';
  points: Array<{ u: number; t: number }>;
  label?: string;
}

/**
 * A residual-closing pinned point cluster — architecture-v1 §3 S-RESIDUAL / champion-spec-gyroid.md
 * §2.4's §V11aa recipe (knee point + N-satellite ring, held fixed through any optimize sweep). Not
 * yet plumbed into any production kernel (gyroid-spec §3.3: "no pin/injectedPoints/pinnedPoints field
 * exists in either interface today") — this is a data seed for the future A3 sub-arm, not a proven
 * mechanism.
 */
export interface PinSeed {
  u: number;
  t: number;
  spread: number;
  ringCount: number;
  note?: string;
}

/**
 * architecture-v1 §2's ASCII sketch marks `pins` "(optional)" in prose but not `birthDeathNotes` —
 * read literally, `birthDeathNotes` is required here (every anatomy provider below supplies one).
 */
export interface FeatureAnatomy {
  regions: RegionPlan[];
  curves: EmbeddedCurve[];
  pins?: PinSeed[];
  birthDeathNotes: string;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// StyleManifest (architecture-v1.md §4 "Manifest v1 (minimal, code)")
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * INTERFACE MISMATCH vs. tierc_gatesHarness.ts's `StyleManifest` (flagged per the mission's hard
 * rule — NOT silently resolved):
 *
 * tierc_gatesHarness.ts's `StyleManifest` is an explicit LOCAL PLACEHOLDER (its own doc comment:
 * "the real manifest does not exist as code yet ... this mirrors the documented shape narrowly
 * enough for scoreAllGates to consume the two fields it actually uses"). Its shape:
 *   - EVERY field past `truth` is OPTIONAL (`anatomy?`, `ruler?`, `budget?`, `gates?`).
 *   - `anatomy?: (params: unknown, dims: unknown) => unknown` — untyped placeholder.
 * architecture-v1 §4's sketch (which this module implements) has all five top-level fields REQUIRED
 * and a strongly-typed `anatomy: (params, dims) => FeatureAnatomy`. This module defines its OWN
 * `StyleManifest` matching architecture-v1 §4 (required fields, real return types) rather than
 * importing the harness placeholder, because widening `anatomy`'s params/return to `unknown` would
 * defeat the point of a typed region model.
 *
 * Consequence for a future caller wiring `getManifest(...)` into `scoreAllGates(bins, styleTruth,
 * manifestRow)`: a value of THIS module's StyleManifest type is a plain object satisfying every
 * field scoreAllGates actually reads (`manifestRow?.truth?.bridgeClass`,
 * `manifestRow?.budget?.maxFullTris`) — but under this repo's `"strict": true` tsconfig
 * (strictFunctionTypes on), `(params: StyleOptions, dims: StyleDims) => FeatureAnatomy` is NOT
 * assignable to `(params: unknown, dims: unknown) => unknown` by parameter contravariance (the
 * placeholder's `unknown` parameter types are not assignable to this module's concrete parameter
 * types). Passing a `getManifest(...)` result directly as scoreAllGates's 3rd positional argument
 * will therefore NOT typecheck without an explicit structural cast. Whoever wires build item 4
 * (region layer core) should either loosen tierc_gatesHarness.ts's placeholder `anatomy` signature
 * (now that a real one exists) or add an adapter at the call site — not silently widen this module's
 * types back to `unknown`.
 *
 * All OTHER fields are directly compatible: `styleId: StyleId` is a subtype of the placeholder's
 * `styleId: string`; `truth: {rA, bridgeClass}` is identical in shape; `ruler`/`gates.g7scope` use
 * the exact same string-literal unions in both places; `budget: {maxOuterTris, maxFullTris}` is
 * identical in shape.
 */
export interface StyleManifest {
  styleId: StyleId;
  truth: { rA: AnalyticRadiusFn; bridgeClass: 'exact' | 'hash-int' | 'KNOWN-BROKEN' };
  anatomy: (params: StyleOptions, dims: StyleDims) => FeatureAnatomy;
  ruler: 'radial-newton' | 'ds-composite-v11g' | 'k2-interior';
  budget: { maxOuterTris: number; maxFullTris: number };
  gates: { g7scope: 'full-pot' | 'patch-NA' };
}

/**
 * The prereg's pinned common configuration (E-2026-07-11-TIERC-HEADTOHEAD-prereg.md, "Common
 * configuration"): H=120, top_od=100/bottom_od=80 => Rt=50/Rb=40, expn=1, spinTurns=0 (spin has no
 * StyleDims field — it is a separate mesh-build option, not a radius-fn input), DEFAULT style params
 * ({}) for every arm. Every manifest's `truth.rA` below is built at exactly this point.
 */
export const TIERC_COMMON_DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

export const TIERC_MANIFEST_STYLE_IDS = [
  'FourierBloom',
  'GyroidManifold',
  'DragonScales',
  'GothicArches',
] as const;

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FourierBloom — Arm D, smooth control (SHIPPED-CLEAN class)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Single R-CDT region, zero curves, zero pins, standard assembly (prereg Arm D / architecture-v1
 * §5). This is the orchestration layer's null case — no champion mechanism is in play.
 */
export function fourierBloomAnatomy(_params: StyleOptions, _dims: StyleDims): FeatureAnatomy {
  return {
    regions: [
      {
        id: 'outer-wall',
        type: 'R-CDT',
        domain: { uLo: 0, uHi: 1, tLo: 0, tHi: 1 },
        boundaryChains: [], // sole region for this style — no inter-region seam exists.
        sizing: { method: 'metric-sizing', params: { resU: 128, resT: 128 } },
      },
    ],
    curves: [],
    pins: [],
    birthDeathNotes: 'Smooth control style — no designed features, no birth/death events.',
  };
}

// FourierBloom SHIPPED-CLEAN capture row (research/exchange/_prod_batch/all20_scorecard.md:4, the
// same figures repeat in the sibling all20_scorecard.ndjson): "full/outer tris" = 3143106 / 1278510.
// Cited directly per the mission ("budget from the batch row... capture counts") — the prereg's own
// baseline table (E-2026-07-11-TIERC-HEADTOHEAD-prereg.md) does not carry a FourierBloom tri count
// column (only verdict/forward/Newton-worst/coverage), so the batch row is the correct source here.
const FOURIER_BLOOM_BUDGET = { maxOuterTris: 1_278_510, maxFullTris: 3_143_106 };

// ════════════════════════════════════════════════════════════════════════════════════════════════
// GyroidManifold — Arm A
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Wraps research/bridge/_gyroid_bandedge_lib.ts's extraction VERBATIM: extractBandedgeContours
 * (marching-squares on both wall-band isolevels |val|=0.135/0.15) -> contoursToFeatureLines (the
 * doubled band-edge FeatureLine[]), at GBE_EXTRACT_DEFAULT (nu=nt=1200, stepMm=0.15) per
 * champion-spec-gyroid.md §2.2/§2.6. `extractOpts` is exposed (not hardcoded) so a fast TDD caller
 * can override nu/nt to a tiny grid — see tierc_manifest.test.ts's PF_MANIFEST_LIVE gate for which
 * resolution the always-on suite actually exercises.
 *
 * GBE_FIELD (the verified gm_scale=4.0-etc. field params, champion-spec-gyroid.md §2.6, confirmed
 * against the real registry default chain) is used regardless of the `params` argument — this v1
 * anatomy provider does NOT generalize band-edge extraction across the gm_* parameter envelope
 * (architecture-v1 §4.6 of the champion spec names this OPEN for Gyroid: "every number in this
 * document is at a single point in the registry-default parameter space"). Passing non-default
 * GyroidManifold params still extracts at the verbatim default band. Flagged, not silently resolved.
 *
 * Pins: always empty. A3 (S-RESIDUAL pins at scale) is its own not-yet-run sub-arm (gyroid-spec
 * §1.4/§2.4/§4.1 — the knee-pin mechanism was proven only on a DIFFERENT, non-production kernel and
 * at a 5-spot scale, ~4 orders of magnitude smaller than Gyroid's production residual population).
 */
export function gyroidManifoldAnatomy(
  params: StyleOptions,
  dims: StyleDims,
  extractOpts: ExtractOpts = GBE_EXTRACT_DEFAULT,
): FeatureAnatomy {
  const rA = buildRadiusFn('GyroidManifold', params, dims);
  const bandedge = extractBandedgeContours(rA, dims.H, extractOpts, GBE_FIELD);
  const innerLines = contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner');
  const outerLines = contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer');
  const curves: EmbeddedCurve[] = [...innerLines, ...outerLines].map((fl) => ({
    kind: 'general-curve' as const,
    points: fl.points.map((p) => ({ u: p.u, t: p.t })),
    label: fl.label,
  }));
  return {
    regions: [
      {
        id: 'outer-wall',
        type: 'R-CDT',
        domain: { uLo: 0, uHi: 1, tLo: 0, tHi: 1 },
        boundaryChains: [], // sole region — the 2-locus CDT fan defect (A2) is an intra-region fix.
        // Fixed featureLevel=11 refinement on any curve-crossed cell, NOT a curvature floor (measured
        // strictly dominated, champion-spec-gyroid.md §2.5 point 1) — the knee residual sits on a
        // sizing-formula plateau no density lever can move.
        sizing: { method: 'fixed-feature-level', params: { featureLevel: 11 } },
        kernelOpts: { resU: 128, resT: 128, uBiasCapped: 2 }, // AF_PROD_OPTS.resU/resT; computeUBias GATE B
      },
    ],
    curves,
    pins: [],
    birthDeathNotes:
      'No birth/death sweep exists for GyroidManifold (champion-spec-gyroid.md §4.6) — every number ' +
      'here is at one point in the gm_* envelope (registry defaults); gm_sharpness->0/1 boundary ' +
      'behavior and isolevel birth/death/merge are entirely unmeasured.',
  };
}

const GYROID_MAX_OUTER_TRIS = 7_000_000; // prereg 5.3(a) / champion-spec-gyroid.md §5.3(a)
// No full-pot ceiling is cited anywhere for Gyroid at the 7.0M-outer target — champion-spec-gyroid.md
// §5.3(a) states only the outer figure. ESTIMATED (flagged, not mission-cited) by applying the
// champion's OWN measured full/outer ratio at its one measured point (§5.1: full 4,365,677 / outer
// 2,242,987) to the 7.0M outer target. Replace with a real Gyroid full-pot capture the moment one
// exists at the 7.0M-outer point.
const GYROID_FULL_OUTER_RATIO = 4_365_677 / 2_242_987; // ~1.94635, champion-spec-gyroid.md §5.1
const GYROID_BUDGET = {
  maxOuterTris: GYROID_MAX_OUTER_TRIS,
  maxFullTris: Math.round(GYROID_MAX_OUTER_TRIS * GYROID_FULL_OUTER_RATIO),
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// DragonScales — Arm B
// ════════════════════════════════════════════════════════════════════════════════════════════════

const DS_SCALE_ROWS = 8; // DEFAULT_DRAGON_SCALES.dsScaleRows, src/geometry/types.ts:673
const DS_N_THETA = 2400; // global, fixed — do NOT raise (θ-trap, champion-spec-dragonscales.md §2.5)
const DS_TREAD_CAP = 4;
const DS_Z_EPS = 5e-4; // mesh row offset = ruler wall offset (must match, "aligned")
const DS_RING_HALF_BAND_MM = 0.6; // buildRows' `nearRing` skip-band, champion-spec-dragonscales.md §2.3

function dsRingChain(idx: number, edge: 'below' | 'above'): ChainSpec {
  return { id: `ring-${idx}-${edge}`, owner: `ring-${idx}`, adopter: null, status: 'TODO' };
}
function dsBodyChain(idx: number, edge: 'lo' | 'hi'): ChainSpec {
  return { id: `body-${idx}-${edge}`, owner: `body-${idx}`, adopter: null, status: 'TODO' };
}

/**
 * anatomy = dragonRings(8) (research/bridge/_ds_prodtruth_lib.ts) -> 7 R-STRUCT ring-band regions
 * (domain z-band +-0.6mm around each ring, champion-spec-dragonscales.md §2.3's `nearRing` constant)
 * + 8 R-CDT body bands filling the gaps between rings (architecture-v1 Decision A6: DS body regions
 * stay on K1 adaptive — do NOT port the champion's uniform nZband grid, which is measured
 * CONSISTENT-to-better by production's existing adaptive body meshing, champion-spec-dragonscales.md
 * §4.7). boundaryChains are TODO-typed but structurally present on every region (architecture-v1 §2
 * Decision A2: the R-STRUCT<->R-CDT adoption contract is the pre-registered B0 toy arm's job, not
 * this manifest's).
 *
 * VERBATIM-IMPORT LIMITATION (flagged): `dragonRings()` computes ring z's from its OWN hardcoded
 * module-level `H=120` constant (research/bridge/_ds_prodtruth_lib.ts:39, NOT a function parameter),
 * not from the `dims` argument passed here. This anatomy provider uses each ring's `.t` fraction
 * (H-independent by construction: t = k/scaleRows) rather than trusting `.z` to derive region
 * boundaries, so region domains degrade gracefully at a non-default `dims.H` — but the underlying
 * ring-locator/extraction machinery this feeds is itself only validated at H=120
 * (champion-spec-dragonscales.md §4.4: "every DS mesh in the lab uses the exact same pinned dims").
 */
export function dragonScalesAnatomy(_params: StyleOptions, dims: StyleDims): FeatureAnatomy {
  const rings = dragonRings(DS_SCALE_ROWS);
  const ringRegions: RegionPlan[] = rings.map((r, i) => {
    const z = r.t * dims.H;
    return {
      id: `ring-${i}`,
      type: 'R-STRUCT',
      domain: { uLo: 0, uHi: 1, zLo: z - DS_RING_HALF_BAND_MM, zHi: z + DS_RING_HALF_BAND_MM },
      boundaryChains: [dsRingChain(i, 'below'), dsRingChain(i, 'above')],
      // Fixed structured row schedule (K3) — exempt from generic curvature-driven density by
      // construction; nTheta is GLOBAL and must not be raised (θ-trap, §2.5: doubling nTheta made the
      // sheet WORSE, +77% outliers).
      sizing: { method: 'designed-texture-exempt' },
      kernelOpts: { nTheta: DS_N_THETA, treadCap: DS_TREAD_CAP, zEps: DS_Z_EPS, ringZ: z, ringT: r.t },
    };
  });

  const boundaries = [0, ...rings.map((r) => r.t * dims.H), dims.H];
  const bodyRegions: RegionPlan[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    bodyRegions.push({
      id: `body-${i}`,
      type: 'R-CDT',
      domain: { uLo: 0, uHi: 1, zLo: boundaries[i], zHi: boundaries[i + 1] },
      boundaryChains: [dsBodyChain(i, 'lo'), dsBodyChain(i, 'hi')],
      // Decision A6: stays on K1 adaptive (matches production, measured CONSISTENT-to-better than the
      // champion's own uniform sheet). CAUTION carried forward, not enforced here: a generic
      // curvature-driven escalation on the per-scale relief texture would repeat the champion's own
      // V11x θ-trap regression (§2.5) — the sheet residual is a density-invariant relief-chord cliff,
      // not a smooth chord-sag that density closes.
      sizing: { method: 'metric-sizing', params: { resU: 128, resT: 128 } },
    });
  }

  return {
    regions: [...bodyRegions, ...ringRegions],
    curves: [],
    pins: [],
    birthDeathNotes:
      'Ring count/z fixed at dsScaleRows=8 (7 interior rings, t=k/8); no birth/death sweep exists ' +
      '(champion-spec-dragonscales.md §4.4) — non-default dsScaleRows, non-default dims, and ' +
      'spinTurns!=0 are all unmeasured for the ring/riser mechanism.',
  };
}

// champion-spec-dragonscales.md T4 / §1.4: production's current outer/full-pot capture.
const DRAGON_SCALES_BUDGET = { maxOuterTris: 4_549_600, maxFullTris: 8_734_682 };

// ════════════════════════════════════════════════════════════════════════════════════════════════
// GothicArches — Arm C (patch scope, decision A5 / gothic-spec §5 recommendation)
// ════════════════════════════════════════════════════════════════════════════════════════════════

// prereg Arm C1 patch domain, VERIFIED against the live CI call site
// (src/renderers/webgpu/parametric/conforming/tierC/wholeMesh0Outlier.test.ts:109-114,
// runPatchGate('GothicArches', {uLo:0,uHi:0.125,tLo:0.48,tHi:0.52}, 0.6, 512)) — this is the ONLY
// Gothic number that is live in shipped production code today (gothic-spec §5), not a research-only
// proxy.
const GOTHIC_PATCH_DOMAIN: RegionDomain = { uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 };

/**
 * Single R-REFINE region carrying the patch domain from prereg Arm C1 as kernelOpts. This is data
 * only — it does NOT invoke K2 (buildProtectedComplex/refineToZeroOutliers live in
 * src/renderers/webgpu/parametric/conforming/tierC/, which the region-layer CORE (build item 4)
 * dispatches to, not this manifest). kernelOpts values are the exact config runPatchGate passes to
 * refineToZeroOutliers (verified by direct read, wholeMesh0Outlier.test.ts:65-75): tolMm/maxPass/
 * bulkPasses7pt are identical to the full-wall production call; bgArcMm=0.6 and nTheta=512 are the
 * PATCH-specific values (the full-wall call instead uses bgArcMm=0.35/nTheta=1024 — do not conflate
 * the two, gothic-spec §2.D).
 *
 * boundaryChains is deliberately EMPTY: the patch is not connected to any other region in Phase 1
 * (g7scope:'patch-NA' — gothic-spec §5/§4 gap #2, the seam-share integration is un-started Phase-3
 * scope), so there is no boundary contract to describe yet, unlike DS's genuinely multi-region case.
 */
export function gothicArchesAnatomy(_params: StyleOptions, _dims: StyleDims): FeatureAnatomy {
  return {
    regions: [
      {
        id: 'gothic-patch',
        type: 'R-REFINE',
        domain: GOTHIC_PATCH_DOMAIN,
        boundaryChains: [],
        sizing: { method: 'k2-isotropic-refine', params: { tolMm: 0.01, maxPass: 16, bulkPasses7pt: 4 } },
        kernelOpts: {
          bgArcMm: 0.6,
          rulerNTheta: 512,
          // TIER_C_DETECT_OPTS, the one canonical Tier-C detector config (gothic-spec §2.A) —
          // buildProtectedComplex's own default, not overridden by runPatchGate.
          detect: { coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28 },
        },
      },
    ],
    curves: [],
    pins: [],
    birthDeathNotes:
      'Style-parameter envelope (gaCounts/gaSharp/gaDiamond/gaX) entirely untested against the K2 ' +
      'kernel — every Tier-C Gothic test uses DEFAULT style params {} (champion-spec-gothic.md §4.4).',
  };
}

// prereg Arm C1 / champion-spec-gothic.md §5: "9917 triangles in 7 refine passes" (the CI patch
// smoke gate reference). PATCH-SCOPE BUDGET MISMATCH (flagged): architecture-v1 §4's budget shape
// (maxOuterTris/maxFullTris) assumes whole-style scope; a patch has no meaningful outer-wall/full-pot
// split. Both fields are set to the same patch reference count rather than left unequal/fabricated —
// a real full-pot Gothic build is explicitly OUT of Phase-1 scope (gothic-spec §5 "Stretch target").
const GOTHIC_ARCHES_BUDGET = { maxOuterTris: 9_917, maxFullTris: 9_917 };

// ════════════════════════════════════════════════════════════════════════════════════════════════
// getManifest
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Returns the Tier-C Phase-1 manifest for one of the four supported styles. `styleId` is typed
 * `string` (not the narrower `StyleId` union) so callers — and this module's own TDD suite — can
 * exercise the unknown-styleId failure path without a type-level workaround.
 */
export function getManifest(styleId: string): StyleManifest {
  switch (styleId) {
    case 'FourierBloom':
      return {
        styleId: 'FourierBloom',
        truth: { rA: buildRadiusFn('FourierBloom', {}, TIERC_COMMON_DIMS), bridgeClass: 'exact' },
        anatomy: fourierBloomAnatomy,
        ruler: 'radial-newton',
        budget: FOURIER_BLOOM_BUDGET,
        gates: { g7scope: 'full-pot' },
      };
    case 'GyroidManifold':
      return {
        styleId: 'GyroidManifold',
        truth: { rA: buildRadiusFn('GyroidManifold', {}, TIERC_COMMON_DIMS), bridgeClass: 'exact' },
        anatomy: gyroidManifoldAnatomy,
        ruler: 'radial-newton',
        budget: GYROID_BUDGET,
        gates: { g7scope: 'full-pot' },
      };
    case 'DragonScales':
      return {
        styleId: 'DragonScales',
        truth: { rA: buildRadiusFn('DragonScales', {}, TIERC_COMMON_DIMS), bridgeClass: 'exact' },
        anatomy: dragonScalesAnatomy,
        ruler: 'ds-composite-v11g',
        budget: DRAGON_SCALES_BUDGET,
        gates: { g7scope: 'full-pot' },
      };
    case 'GothicArches':
      return {
        styleId: 'GothicArches',
        truth: { rA: buildRadiusFn('GothicArches', {}, TIERC_COMMON_DIMS), bridgeClass: 'exact' },
        anatomy: gothicArchesAnatomy,
        ruler: 'k2-interior',
        budget: GOTHIC_ARCHES_BUDGET,
        gates: { g7scope: 'patch-NA' },
      };
    default:
      throw new Error(
        `getManifest: unsupported styleId "${styleId}" — Tier-C manifest v1 (PROD-TIERC Phase 1) ` +
          `supports exactly ${TIERC_MANIFEST_STYLE_IDS.join(', ')} (architecture-v1.md §5 Phase-1 arm plan).`,
      );
  }
}
