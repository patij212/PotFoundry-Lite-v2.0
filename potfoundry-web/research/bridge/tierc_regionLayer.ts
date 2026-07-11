// tierc_regionLayer.ts — PROD-TIERC Phase-1 region layer CORE (architecture-v1.md build item 4).
// Spec: research/lab/tierc/architecture-v1.md §2 (region model), §5 (Phase-1 arm plan). Prereg:
// research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md, ADDENDUM 1: Phase-1 arms run this layer
// ENTIRELY RESEARCH-SIDE, driving the REAL production kernels through the proven twin-injection seam
// (AssemblyWallOptions) — the same mechanism as the Delta-2-exact Gyroid twins
// (_gyroid_prodclose_lib.ts's prepareGpcTwinInputs/buildGpcTwin, _gyroid_bandedge_lib.ts's
// buildGbeTwin) and the B0 boundary-contract toy (_tierc_b0_toy_lib.ts). NO src/ edits, no dev flag —
// the src integration seam is Phase 2/3 scope.
//
// Entry point: `buildRegionOuterWall(manifest, dims)` dispatches a StyleManifest's FeatureAnatomy
// regions (RegionPlan[]) to the kernel each RegionType names:
//   - R-CDT     -> the production conforming kernel (assembleWatertight), mirroring
//                  prepareGpcTwinInputs/buildGpcTwin EXACTLY: same CPU sampler formulas
//                  (_analytic_floor_lib.ts's buildWallGridCPU pattern, generalized over `dims` here
//                  since every existing twin hardcodes its own style's dims as module constants),
//                  same AF_PROD_OPTS production config (resU=resT=128/featureLevel=11/nRing=2048/...,
//                  IMPORTED verbatim from _analytic_floor_lib.ts — "copy the constants the twin libs
//                  use" via the actual shared binding, not a re-typed literal that could drift), same
//                  identity crease/helix warp construction as _gyroid_bandedge_lib.ts's
//                  prepareGbeTwinInputs (Phase-1 manifest styles carry ZERO vertical-crease/
//                  horizontal-band/helical-crease lines — verified: FourierBloom's extractor is a
//                  bare `() => []`, FeatureLineGraph.ts:929; Gyroid's are empty by construction, per
//                  _gyroid_prodclose_lib.ts's own header note — so this is a faithful reduction, not a
//                  shortcut). `anatomy.curves` (the manifest's EmbeddedCurve[]) is injected AS
//                  `outerFeatureLines`, REPLACING whatever extractAnalyticFeatures would have found —
//                  exactly _gyroid_bandedge_lib.ts's own override pattern, generalized off Gyroid.
//                  A single R-CDT region with zero curves is therefore, BY CONSTRUCTION, the plain
//                  production-equivalent build (regression-tested below).
//   - R-STRUCT  -> generalizes _tierc_b0_toy_lib.ts's PROVEN 2-K1+1-ring adoption mechanism (contract
//                  (a), B0-boundary-contract-verdict.md) to the N-body/(N-1)-ring alternating chain
//                  DragonScales' manifest anatomy produces. The PER-SEAM mechanism is B0-proven; the
//                  full N-piece chain is NOT — see the honest TODO warnings this dispatch path emits
//                  in its `meta.warnings` and the file-level note in buildStructCdtChain's doc-comment.
//   - R-REFINE  -> the tierC K2 kernel (buildProtectedComplex + refineToZeroOutliers), mirroring
//                  wholeMesh0Outlier.test.ts's runPatchGate call shape exactly (same loopRuler
//                  construction, same options keys) on the region's own patch domain/kernelOpts.
//
// The manifest -> harness adapter (mismatch #1, flagged in tierc_manifest.ts's own StyleManifest
// doc-comment) is resolved here via `toHarnessManifest` — a small, explicit, LOCALIZED structural
// cast (see its own doc-comment for why this is safe and not a silent `unknown`-widening).
//
// NEW-FILE-ONLY (prereg shared-file discipline): this module imports READ-ONLY from tierc_manifest.ts,
// tierc_gatesHarness.ts, _tierc_b0_toy_lib.ts, _analytic_floor_lib.ts (the twin-injection precedent's
// own shared constants module), _sharp3dMesh.ts, and a range of src/renderers/webgpu/parametric/
// conforming/** production modules (the whole point of the twin-injection seam is driving THOSE real
// kernels) — none of them are edited by this file.
//
// DEV-ONLY. research/ never imported by src/. Pure functions only — no node:fs side effects (mirrors
// _tierc_b0_toy_lib.ts's own "TEST file owns checkpointing" discipline).
import type { StyleDims, StyleManifest, RegionPlan, RegionDomain, RegionType, EmbeddedCurve } from './tierc_manifest';
import type { BinMesh, StyleManifest as HarnessStyleManifest } from './tierc_gatesHarness';
import type { AnalyticRadiusFn } from './labkit';
import type { StyleId, StyleOptions } from '../../src/geometry/types';
import {
  AF_PROD_OPTS,
  AF_TWALL,
  AF_TBOTTOM,
  AF_RDRAIN,
  fnvHash,
} from './_analytic_floor_lib';
import {
  buildK1ZBand,
  adoptedThetas,
  buildRingBandRows,
  K1_TOY_DEFAULTS,
  type K1Region,
} from './_tierc_b0_toy_lib';
import { buildStructuredWall, type BuiltMesh } from './_sharp3dMesh';
import { GpuSurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import {
  buildCreaseRefineLines,
  type FeatureLine,
} from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';
import { extractOuterWallSubmesh } from '../../src/fidelity/metrics';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';
import {
  refineToZeroOutliers,
  type ChartDomain,
  type RefineOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine';
import { DEFAULT_RULER, liftChartMesh, type RulerOptions } from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';

export type { StyleDims };
const TAU = 2 * Math.PI;

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Adapter (mismatch #1): tierc_manifest.StyleManifest -> tierc_gatesHarness.StyleManifest
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Resolves the INTERFACE MISMATCH flagged in tierc_manifest.ts's own StyleManifest doc-comment:
 * tierc_gatesHarness.ts's `StyleManifest` is a structurally-narrower LOCAL PLACEHOLDER
 * (`anatomy?: (params: unknown, dims: unknown) => unknown`, every field past `truth` optional) that
 * is NOT type-assignable from tierc_manifest.ts's real, strongly-typed `StyleManifest` under this
 * repo's `strictFunctionTypes` tsconfig (parameter contravariance on `anatomy`).
 *
 * `scoreAllGates` (tierc_gatesHarness.ts) reads exactly TWO fields off its `manifestRow` parameter —
 * `manifestRow?.truth?.bridgeClass` (truthBridge classification) and `manifestRow?.budget?.maxFullTris`
 * (G6 budget policy) — verified by direct read of scoreAllGates' body (grep-confirmed: `anatomy` is
 * never referenced anywhere in tierc_gatesHarness.ts's own runtime code, only in its placeholder TYPE
 * declaration). So this adapter is a thin, explicit, LOCALIZED structural cast — `anatomy` is carried
 * through only to satisfy the placeholder's shape and is never invoked via the cast value anywhere
 * downstream of this function — NOT a silent `unknown`-widening of the real manifest module's types
 * (which tierc_manifest.ts's doc-comment explicitly warns against). This is the fix that doc-comment
 * asks "whoever wires build item 4" to make.
 */
export function toHarnessManifest(manifest: StyleManifest): HarnessStyleManifest {
  return {
    styleId: manifest.styleId,
    truth: manifest.truth,
    anatomy: manifest.anatomy as unknown as (params: unknown, dims: unknown) => unknown,
    ruler: manifest.ruler,
    budget: manifest.budget,
    gates: manifest.gates,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Shared build constants (imported verbatim from the twin-injection precedent — "copy the constants
// the twin libs use" via the actual shared binding, matching every existing twin's own import).
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** get_minR() in adaptive_mesh.wgsl — matches _analytic_floor_lib.ts's buildWallGridCPU and both
 *  Gyroid twins' own hardcoded inner-radius floor exactly. */
const MIN_INNER_R_MM = 0.5;

// ════════════════════════════════════════════════════════════════════════════════════════════════
// CPU sampler construction (dims-generic — every existing twin hardcodes its OWN style's dims as
// module constants; the region layer needs the same formula parameterized over an arbitrary `dims`).
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * CPU f64->f32 wall sampler grid, formula-exact to _analytic_floor_lib.ts's buildWallGridCPU (which
 * _gyroid_prodclose_lib.ts and _gyroid_bandedge_lib.ts both reuse verbatim for THEIR one hardcoded
 * style) — generalized over `dims`/`tWallMm`/`tBottomMm` instead of closed-over AF_DIMS/AF_TBOTTOM/
 * AF_TWALL module constants, since the region layer must build this for an arbitrary manifest style.
 * Exported for TDD (direct-build regression comparison — see tierc_regionLayer.test.ts).
 */
export function buildRegionWallGridCPU(
  rA: AnalyticRadiusFn,
  surfaceId: 0 | 1,
  dims: StyleDims,
  tWallMm: number,
  tBottomMm: number,
  res = 256,
): { sampler: GpuSurfaceSampler; positions: Float32Array } {
  const { H } = dims;
  const positions = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const t = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const theta = (col / res) * TAU;
      let z: number;
      let r: number;
      if (surfaceId === 0) {
        z = t * H;
        r = rA(theta, z);
      } else {
        z = tBottomMm + t * (H - tBottomMm);
        r = Math.max(rA(theta, z) - tWallMm, MIN_INNER_R_MM);
      }
      positions[w++] = r * Math.cos(theta);
      positions[w++] = r * Math.sin(theta);
      positions[w++] = z;
    }
  }
  return { sampler: new GpuSurfaceSampler(positions, res, res), positions };
}

/**
 * CPU port of adaptive_mesh.wgsl's `evaluate_vertices` (src/assets/shaders/adaptive_mesh.wgsl:762-877),
 * extended to ALL SIX surfaceIds (0 outer / 1 inner / 2 rim / 3 bottom-under / 4 bottom-top / 5 drain).
 * No existing research twin needed this: they only ever evaluate surfaceId 0/1 (buildWallGridCPU),
 * because production runs this kernel on the GPU and every twin's own scoring only ever compared the
 * OUTER submesh against the analytic truth. The region layer needs the FULL packed (u,t,surfaceId)
 * assembly in TRUE 3D — not parameter space — because S-GATES' G3/G4/quality gates score the whole
 * exported solid (`nonManRawBig` is index-only, but `zeroAreaCount`/`triangleQuality3D`/
 * `signedVolumeMm3Of` all need real 3D positions). This is a bounded, directly-cited EXTENSION of the
 * twin pattern to the caps Arm D's "full" gates require — positions only, the production kernel
 * (assembleWatertight) already computed the topology/indices; no new meshing mechanism.
 *
 * ASSUMES spinTurns=0 — compute_twist(theta,t) = theta + spinTurns*TAU*t^spinCurve + spinPhase reduces
 * to the identity theta at spinTurns=0/spinPhase=0 (the prereg's OWN pinned dims never carry spin, and
 * `StyleDims` has no spin field at all — every twin in this codebase makes the identical simplifying
 * assumption, e.g. `theta = TAU*u` with no twist wrap anywhere in _analytic_floor_lib.ts/
 * _gyroid_prodclose_lib.ts). ASSUMES rDrainMm>0 (the pinned dims use rDrain=10mm) — the centre-fan
 * solid-base case (WatertightAssembly.ts: "If rDrain<=0 there is no drain surface") has no existing
 * CPU-evaluator precedent anywhere in this codebase and is not implemented here; throws loudly rather
 * than silently mis-evaluating.
 */
export function evaluatePackedAssemblyToXyz(
  vertices: Float32Array,
  rA: AnalyticRadiusFn,
  H: number,
  tWallMm: number,
  tBottomMm: number,
  rDrainMm: number,
): Float32Array {
  if (!(rDrainMm > 0)) {
    throw new Error(
      `evaluatePackedAssemblyToXyz: rDrainMm=${rDrainMm} <= 0 is unsupported — the centre-fan solid-` +
        'base case has no CPU-evaluator precedent in this codebase (see doc comment).',
    );
  }
  const nV = vertices.length / 3;
  const out = new Float32Array(nV * 3);
  const outerR = (theta: number, t: number): number => rA(theta, t * H);
  // Inner radius takes z DIRECTLY — a SINGLE application of the inner-wall z-mapping, matching the
  // WGSL exactly (compute_inner_radius(theta,t) = compute_outer_radius(theta,t) - tWall, evaluated at
  // z = t*H; adaptive_mesh.wgsl:126-136, :790-800, :830-847). RUN-1 BUG FIXED HERE
  // (armD-quality-diagnosis.md §3, coordinator-directed): the original helper took a t parameter and
  // re-applied tBottom + t*(H - tBottom) internally while the INNER/BOTTOM-TOP branches passed it
  // zHeight/H — a DOUBLE mapping that displaced 795,088/1,571,574 vertices by up to 0.787mm in the
  // scored Arm D run-1 full mesh (measured: research/exchange/tierc/armD_qualdiag.json). Regression
  // tests: tierc_regionLayer.test.ts "single z-mapping (run-1 bug regression)".
  const innerRAtZ = (theta: number, z: number): number =>
    Math.max(rA(theta, z) - tWallMm, MIN_INNER_R_MM);
  for (let v = 0; v < nV; v++) {
    const base = v * 3;
    const uRaw = vertices[base];
    const t = vertices[base + 1];
    const surface = vertices[base + 2];
    const u = uRaw - Math.floor(uRaw);
    const theta = u * TAU;
    let x = 0;
    let y = 0;
    let z = 0;
    if (surface < 0.5) {
      // OUTER (0): z = t*H
      const r = outerR(theta, t);
      z = t * H;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 1.5) {
      // INNER (1): z = tBottom + t*(H-tBottom); radius from rA AT zHeight (single mapping)
      const zHeight = tBottomMm + t * (H - tBottomMm);
      const r = innerRAtZ(theta, zHeight);
      z = zHeight;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 2.5) {
      // RIM (2): t=0 inner-top .. t=1 outer-top, both evaluated at z=H
      const rInner = innerRAtZ(theta, H);
      const rOuter = outerR(theta, 1);
      const r = rInner + (rOuter - rInner) * t;
      z = H;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 3.5) {
      // BOTTOM-UNDER (3): t=0 outer-bottom .. t=1 drain, z=0
      const rOuter = outerR(theta, 0);
      const r = rOuter + (rDrainMm - rOuter) * t;
      z = 0;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 4.5) {
      // BOTTOM-TOP (4): t=0 inner-bottom .. t=1 drain, z=tBottom; inner radius from rA AT
      // z = t_radius_bot*H = tBottom (single mapping)
      const rInner = innerRAtZ(theta, tBottomMm);
      const r = rInner + (rDrainMm - rInner) * t;
      z = tBottomMm;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 5.5) {
      // DRAIN (5): t=0 bottom-under (z=0) .. t=1 bottom-top (z=tBottom), r=rDrain
      const r = rDrainMm;
      z = t * tBottomMm;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    }
    // Unrecognized surfaceId falls through with x=y=z=0, caught by the NaN/zero guard below (mirrors
    // the WGSL's own fail-safe branch).
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      x = 0.001;
      y = 0.001;
      z = 0.001;
    }
    out[base] = x;
    out[base + 1] = y;
    out[base + 2] = z;
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Small shared helpers
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** anatomy.curves (EmbeddedCurve[]) -> FeatureLine[] (kind:'general-curve') — mirrors
 *  _gyroid_bandedge_lib.ts's contoursToFeatureLines mapping, generalized off Gyroid's own contours. */
function curvesToFeatureLines(curves: EmbeddedCurve[]): FeatureLine[] {
  return curves.map((c, i) => ({
    kind: 'general-curve' as const,
    points: c.points.map((p) => ({ u: p.u, t: p.t })),
    label: c.label ?? `anatomy-curve[${i}]`,
  }));
}

/** First numeric value found for `key` across `sources`, checked in order; `fallback` otherwise.
 *  RegionPlan's own manifest instances place the SAME logical knob (e.g. resU/resT) in EITHER
 *  `sizing.params` (FourierBloom) OR `kernelOpts` (Gyroid) inconsistently — verified by direct read of
 *  tierc_manifest.ts's fourierBloomAnatomy vs gyroidManifoldAnatomy — so every numeric override in this
 *  file is resolved through this picker rather than assuming one fixed location. */
function pickNum(
  key: string,
  fallback: number,
  ...sources: Array<Record<string, unknown> | undefined>
): number {
  for (const s of sources) {
    const v = s?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

function requireDomainUT(
  domain: RegionDomain,
  styleId: string,
  regionId: string,
): { uLo: number; uHi: number; tLo: number; tHi: number } {
  const { uLo, uHi, tLo, tHi } = domain;
  if (uLo === undefined || uHi === undefined || tLo === undefined || tHi === undefined) {
    throw new Error(
      `buildRegionOuterWall[${styleId}]: region "${regionId}" is missing uLo/uHi/tLo/tHi on its domain ` +
        `(got ${JSON.stringify(domain)}).`,
    );
  }
  return { uLo, uHi, tLo, tHi };
}

function requireDomainZ(
  domain: RegionDomain,
  styleId: string,
  regionId: string,
): { zLo: number; zHi: number } {
  const { zLo, zHi } = domain;
  if (zLo === undefined || zHi === undefined) {
    throw new Error(
      `buildRegionOuterWall[${styleId}]: region "${regionId}" is missing zLo/zHi on its domain ` +
        `(got ${JSON.stringify(domain)}).`,
    );
  }
  return { zLo, zHi };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// buildRegionOuterWall — entry point
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface RegionBuildOpts {
  /** Style params passed to manifest.anatomy(...). Default {} (prereg-pinned DEFAULT for every arm). */
  styleParams?: StyleOptions;
  /** Wall thickness (mm), R-CDT path only. Default AF_TWALL (3.0, the store-default every twin uses). */
  tWallMm?: number;
  /** Base thickness (mm), R-CDT path only. Default AF_TBOTTOM (3.0). */
  tBottomMm?: number;
  /** Drain radius (mm), R-CDT path only. Default AF_RDRAIN (10.0). */
  rDrainMm?: number;
  /** CPU pre-eval sampler grid density, R-CDT path only. Default 256 (every twin's own default). */
  sampleRes?: number;
}

export interface RegionBuildMeta {
  styleId: string;
  dispatch: 'single-R-CDT' | 'single-R-REFINE' | 'RSTRUCT-RCDT-chain';
  regions: Array<{ id: string; type: RegionType; tris: number | null }>;
  buildMs: number;
  uBias?: number;
  hash?: string;
  warnings: string[];
}

export interface RegionBuildResult {
  outer: BinMesh;
  full?: BinMesh;
  meta: RegionBuildMeta;
}

/**
 * Dispatches `manifest`'s FeatureAnatomy regions to the kernel each RegionType names (architecture-v1
 * §2/§5; see file header for the per-RegionType mapping). `dims` MUST be the SAME dims `manifest.truth.
 * rA` was built against (getManifest() binds `truth.rA` to TIERC_COMMON_DIMS; a caller-constructed
 * manifest — e.g. this module's own TDD suite — must keep the two consistent itself, exactly like
 * tierc_gatesHarness.ts's own StyleTruth{rA,H,Rb,Rt,expn} contract, which does not re-derive rA from
 * H/Rb/Rt either).
 */
export function buildRegionOuterWall(
  manifest: StyleManifest,
  dims: StyleDims,
  opts: RegionBuildOpts = {},
): RegionBuildResult {
  const t0 = Date.now();
  const styleParams: StyleOptions = opts.styleParams ?? {};
  const anatomy = manifest.anatomy(styleParams, dims);
  const regions = anatomy.regions;
  if (regions.length === 0) {
    throw new Error(`buildRegionOuterWall[${manifest.styleId}]: FeatureAnatomy has zero regions.`);
  }
  for (const r of regions) {
    if (r.type !== 'R-STRUCT' && r.type !== 'R-CDT' && r.type !== 'R-REFINE') {
      throw new Error(
        `buildRegionOuterWall[${manifest.styleId}]: unknown region type "${String(r.type)}" on region ` +
          `"${r.id}" — Phase-1 region layer supports exactly R-STRUCT | R-CDT | R-REFINE ` +
          '(architecture-v1.md §2).',
      );
    }
  }

  if (regions.length === 1 && regions[0].type === 'R-CDT') {
    const resolved = {
      tWallMm: opts.tWallMm ?? AF_TWALL,
      tBottomMm: opts.tBottomMm ?? AF_TBOTTOM,
      rDrainMm: opts.rDrainMm ?? AF_RDRAIN,
      sampleRes: opts.sampleRes ?? 256,
    };
    return buildSingleRCdtRegion(manifest, dims, regions[0], anatomy.curves, resolved, t0);
  }
  if (regions.length === 1 && regions[0].type === 'R-REFINE') {
    return buildSingleRRefineRegion(manifest, dims, regions[0], opts, t0);
  }
  const types = new Set(regions.map((r) => r.type));
  if (types.has('R-CDT') && types.has('R-STRUCT') && !types.has('R-REFINE')) {
    return buildStructCdtChain(manifest, dims, regions, t0);
  }

  throw new Error(
    `buildRegionOuterWall[${manifest.styleId}]: unsupported region-plan shape (${regions.length} ` +
      `region(s): ${[...types].join('+')}) — Phase-1 region layer implements single R-CDT, single ` +
      'R-REFINE, and the R-STRUCT/R-CDT alternating chain only; see file header.',
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// R-CDT — production conforming kernel (assembleWatertight), twin-exact
// ════════════════════════════════════════════════════════════════════════════════════════════════

function buildSingleRCdtRegion(
  manifest: StyleManifest,
  dims: StyleDims,
  region: RegionPlan,
  curves: EmbeddedCurve[],
  resolved: { tWallMm: number; tBottomMm: number; rDrainMm: number; sampleRes: number },
  t0: number,
): RegionBuildResult {
  const { uLo, uHi, tLo, tHi } = requireDomainUT(region.domain, manifest.styleId, region.id);
  const warnings: string[] = [];
  if (!(uLo === 0 && uHi === 1 && tLo === 0 && tHi === 1)) {
    warnings.push(
      `region "${region.id}" domain is not the full (u,t)=[0,1]x[0,1] window ` +
        `(${JSON.stringify(region.domain)}) — single-region R-CDT dispatch always builds the WHOLE pot ` +
        'via assembleWatertight; a sub-domain R-CDT region used standalone is TODO (B1+ scope).',
    );
  }

  const rA = manifest.truth.rA;
  const { H } = dims;
  const outerGrid = buildRegionWallGridCPU(rA, 0, dims, resolved.tWallMm, resolved.tBottomMm, resolved.sampleRes);
  const innerGrid = buildRegionWallGridCPU(rA, 1, dims, resolved.tWallMm, resolved.tBottomMm, resolved.sampleRes);

  const featureLines = curvesToFeatureLines(curves);
  const outerFeatureLines = featureLines.length > 0 ? featureLines : undefined;

  // Identity crease/helix warps — mirrors _gyroid_bandedge_lib.ts's prepareGbeTwinInputs EXACTLY
  // (Gyroid ALSO has zero crease/helix lines regardless of general-curve source, per that file's own
  // header note). Phase-1 manifest styles never route vertical-crease/horizontal-band/helical-crease
  // features through R-CDT — only general-curve `anatomy.curves` (handled above). TODO: a future style
  // needing real crease/helix warps through R-CDT needs this extended; not implemented here.
  const creaseChoice = chooseCreaseGrid([]);
  const creaseTChoice = chooseCreaseTGrid([]);
  const helixChoice = chooseHelixGrid(0, 0, 0);
  const creaseLinesAll = buildCreaseRefineLines(
    { styleId: manifest.styleId, lines: [], groundTruthCount: 0 },
    { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp },
  );
  const outerEfgSampler = composedWallSampler(outerGrid.sampler, {
    uWarp: creaseChoice.warp,
    tWarp: creaseTChoice.warp,
    helix: helixChoice.warp,
  });
  const innerEfgSampler = composedWallSampler(innerGrid.sampler, {
    uWarp: creaseChoice.warp,
    tWarp: creaseTChoice.warp,
    helix: helixChoice.warp,
  });
  const minUniformLevel = resolveUniformLevelOverride(
    Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level),
    0,
  );

  const uBias = computeUBias(outerGrid.sampler, outerFeatureLines !== undefined);

  const sizingParams = region.sizing.params;
  const kernelOpts = region.kernelOpts;
  const assemblyOpts: AssemblyWallOptions = {
    maxSagMm: pickNum('maxSagMm', AF_PROD_OPTS.maxSagMm, sizingParams, kernelOpts),
    maxEdgeMm: pickNum('maxEdgeMm', AF_PROD_OPTS.maxEdgeMm, sizingParams, kernelOpts),
    minEdgeMm: pickNum('minEdgeMm', AF_PROD_OPTS.minEdgeMm, sizingParams, kernelOpts),
    gradeRatio: pickNum('gradeRatio', AF_PROD_OPTS.gradeRatio, sizingParams, kernelOpts),
    maxLevel: pickNum('maxLevel', AF_PROD_OPTS.maxLevel, sizingParams, kernelOpts),
    resU: pickNum('resU', AF_PROD_OPTS.resU, sizingParams, kernelOpts),
    resT: pickNum('resT', AF_PROD_OPTS.resT, sizingParams, kernelOpts),
    nRing: pickNum('nRing', AF_PROD_OPTS.nRing, sizingParams, kernelOpts),
    targetTriangles: pickNum('targetTriangles', AF_PROD_OPTS.targetTriangles, sizingParams, kernelOpts),
    budgetMode: AF_PROD_OPTS.budgetMode,
    minUniformLevel,
    uBias,
    outerFeatureLines,
    featureLevel: pickNum('featureLevel', AF_PROD_OPTS.featureLevel, sizingParams, kernelOpts),
    outerCreaseLines: creaseLinesAll.length > 0 ? creaseLinesAll : undefined,
    outerEfgSampler,
    innerEfgSampler,
  };

  const asm = assembleWatertight(
    outerGrid.sampler,
    innerGrid.sampler,
    { H, tBottom: resolved.tBottomMm, rDrain: resolved.rDrainMm },
    assemblyOpts,
  );

  const nV = asm.vertices.length / 3;
  const mask = new Uint8Array(nV);
  for (let j = 0; j < nV; j++) mask[j] = asm.vertices[j * 3 + 2] < 0.5 ? 1 : 0;
  const sub = extractOuterWallSubmesh(asm.vertices, asm.indices, mask);
  const outerXyz = new Float32Array(sub.vertices.length);
  for (let v = 0; v < sub.vertices.length; v += 3) {
    const u = sub.vertices[v] - Math.floor(sub.vertices[v]);
    const t = sub.vertices[v + 1];
    const theta = u * TAU;
    const z = t * H;
    const r = rA(theta, z);
    outerXyz[v] = r * Math.cos(theta);
    outerXyz[v + 1] = r * Math.sin(theta);
    outerXyz[v + 2] = z;
  }

  const fullXyz = evaluatePackedAssemblyToXyz(
    asm.vertices,
    rA,
    H,
    resolved.tWallMm,
    resolved.tBottomMm,
    resolved.rDrainMm,
  );

  return {
    outer: { xyz: outerXyz, idx: sub.indices },
    full: { xyz: fullXyz, idx: asm.indices },
    meta: {
      styleId: manifest.styleId,
      dispatch: 'single-R-CDT',
      regions: [{ id: region.id, type: region.type, tris: asm.indices.length / 3 }],
      buildMs: Date.now() - t0,
      uBias,
      hash: fnvHash(asm.vertices, asm.indices),
      warnings,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// R-REFINE — tierC K2 kernel (buildProtectedComplex + refineToZeroOutliers), runPatchGate-exact
// ════════════════════════════════════════════════════════════════════════════════════════════════

function buildSingleRRefineRegion(
  manifest: StyleManifest,
  dims: StyleDims,
  region: RegionPlan,
  opts: RegionBuildOpts,
  t0: number,
): RegionBuildResult {
  const { uLo, uHi, tLo, tHi } = requireDomainUT(region.domain, manifest.styleId, region.id);
  const styleParams = opts.styleParams ?? {};
  const sampler = styleSampler(manifest.styleId as StyleId, styleParams, {
    H: dims.H,
    Rt: dims.Rt,
    Rb: dims.Rb,
    expn: dims.expn,
  });
  const complex = buildProtectedComplex(sampler, manifest.styleId);
  const warnings: string[] = [];
  if (complex.residualCrossings !== 0) {
    warnings.push(
      `buildProtectedComplex reported residualCrossings=${complex.residualCrossings} (expected 0) — ` +
        'the K2 protected complex is not clean for this style/domain; the refine result below should ' +
        'not be trusted as gate-clean (S-GATES\' G5 bridging stays OPEN regardless — gates-harness-spec.md).',
    );
  }

  const sizingParams = region.sizing.params;
  const kernelOpts = region.kernelOpts;
  const nTheta = pickNum('rulerNTheta', DEFAULT_RULER.nTheta, kernelOpts);
  const ruler: RulerOptions = { ...DEFAULT_RULER, nTheta, thetaWindowRad: 0.5 };
  const refineOpts: RefineOptions = {
    tolMm: pickNum('tolMm', 0.01, sizingParams, kernelOpts),
    maxPass: pickNum('maxPass', 16, sizingParams, kernelOpts),
    bulkPasses7pt: pickNum('bulkPasses7pt', 4, sizingParams, kernelOpts),
    bgArcMm: pickNum('bgArcMm', 0.6, kernelOpts),
    ruler,
  };
  const domain: ChartDomain = { uLo, uHi, tLo, tHi };
  const refined = refineToZeroOutliers(sampler, complex, domain, refineOpts);
  if (refined.capped) {
    warnings.push(
      `refineToZeroOutliers hit maxPass=${refineOpts.maxPass} with outliers still present (capped=true) ` +
        '— the patch did not literally converge to 0 within the configured pass budget.',
    );
  }

  const xyz64 = liftChartMesh(sampler, refined.uv);
  const idx = Uint32Array.from(refined.tris);

  return {
    outer: { xyz: Float32Array.from(xyz64), idx },
    meta: {
      styleId: manifest.styleId,
      dispatch: 'single-R-REFINE',
      regions: [{ id: region.id, type: region.type, tris: idx.length / 3 }],
      buildMs: Date.now() - t0,
      warnings: [
        ...warnings,
        'R-REFINE patches have no full-pot concept (g7scope patch-NA, gothic-spec §5) — `full` is ' +
          'intentionally omitted from this result.',
      ],
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// R-STRUCT/R-CDT alternating chain — generalizes B0's proven 2-K1+1-ring adoption mechanism
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Generalizes _tierc_b0_toy_lib.ts's `mergeAdoptedAssembly` (B0-proven for exactly 2 K1 regions + 1
 * ring band) to an N-body/(N-1)-ring alternating chain, by applying the IDENTICAL per-seam remap
 * mechanism at every seam in sequence — "wiring, not invention" (B0-boundary-contract-verdict.md's own
 * words), matching that verdict's §6 recommendation for B1. `bodies.length` must equal
 * `rings.length + 1`. Each ring's outermost rows are its ADOPTED boundaries (shared indices with its
 * two neighboring bodies' topRing/bottomRing); only each ring's INTERIOR rows get new indices — same
 * contract as mergeAdoptedAssembly, generalized from one seam pair to a chain of them.
 *
 * NOT scored or gate-checked at N>2 scale by ANY prereg arm in this mission (B1 is out of scope) — see
 * buildStructCdtChain's own doc-comment for the full honesty note.
 */
function mergeAdoptedChain(
  bodies: K1Region[],
  rings: BuiltMesh[],
): { xyz: Float64Array; idx: Uint32Array } {
  if (bodies.length !== rings.length + 1) {
    throw new Error(
      `mergeAdoptedChain: expected bodies.length (${bodies.length}) === rings.length+1 (${rings.length + 1}).`,
    );
  }
  const n = bodies.length;
  const bodyOffset: number[] = new Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    bodyOffset[i] = total;
    total += bodies[i].result.gridVertexCount;
  }
  const ringOffset: number[] = new Array(rings.length);
  const ringLowerN: number[] = new Array(rings.length);
  const ringUpperN: number[] = new Array(rings.length);
  for (let i = 0; i < rings.length; i++) {
    const lowerN = bodies[i].result.topRing.length;
    const upperN = bodies[i + 1].result.bottomRing.length;
    ringLowerN[i] = lowerN;
    ringUpperN[i] = upperN;
    ringOffset[i] = total;
    total += rings[i].nV - lowerN - upperN;
  }

  const xyz = new Float64Array(total * 3);
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const base = bodyOffset[i];
    for (let v = 0; v < b.result.gridVertexCount; v++) {
      const [x, y, z] = b.sampler.position(b.result.vertices[v * 3], b.result.vertices[v * 3 + 1]);
      const o = base + v;
      xyz[3 * o] = x;
      xyz[3 * o + 1] = y;
      xyz[3 * o + 2] = z;
    }
  }
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    const lowerN = ringLowerN[i];
    const upperN = ringUpperN[i];
    const base = ringOffset[i];
    for (let v = lowerN; v < ring.nV - upperN; v++) {
      const o = base + (v - lowerN);
      xyz[3 * o] = ring.xyz[3 * v];
      xyz[3 * o + 1] = ring.xyz[3 * v + 1];
      xyz[3 * o + 2] = ring.xyz[3 * v + 2];
    }
  }

  const remapRing = (i: number, v: number): number => {
    const ring = rings[i];
    const lowerN = ringLowerN[i];
    const upperN = ringUpperN[i];
    if (v < lowerN) return bodyOffset[i] + bodies[i].result.topRing[v];
    if (v >= ring.nV - upperN) return bodyOffset[i + 1] + bodies[i + 1].result.bottomRing[v - (ring.nV - upperN)];
    return ringOffset[i] + (v - lowerN);
  };

  let idxTotalLen = 0;
  for (let i = 0; i < n; i++) idxTotalLen += bodies[i].result.indices.length;
  for (let i = 0; i < rings.length; i++) idxTotalLen += rings[i].idx.length;
  const idx = new Uint32Array(idxTotalLen);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const off = bodyOffset[i];
    for (let k = 0; k < b.result.indices.length; k++) idx[w++] = off + b.result.indices[k];
  }
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    for (let k = 0; k < ring.idx.length; k++) idx[w++] = remapRing(i, ring.idx[k]);
  }
  return { xyz, idx };
}

/**
 * DragonScales-shaped dispatch: N R-CDT body regions alternating with (N-1) R-STRUCT ring regions,
 * strictly z-ordered (architecture-v1 §2 Decision A6 / B0-boundary-contract-verdict.md §6). Builds
 * each body as a K1 z-band (buildK1ZBand, unmodified production `buildConformingWall` restricted to a
 * narrow z-sub-domain — exactly B0's own mechanism), each ring as a structured band adopting its two
 * neighbors' boundary rings (buildRingBandRows + buildStructuredWall + adoptedThetas — again exactly
 * B0's mechanism), then chain-merges them (mergeAdoptedChain above).
 *
 * HONEST SCOPE NOTE (do not read this path as B1-complete): B0 proved the mechanism for exactly ONE
 * ring between TWO K1 regions. This function applies that SAME mechanism at every seam of an N-piece
 * chain — the per-seam logic is proven, but:
 *   (1) the FULL chain has never been built or gate-scored end to end (no prereg arm in this mission
 *       runs B1 — DS's own Arm B/B1 is explicitly future scope);
 *   (2) curves/pins are unsupported on every region in this path (R-CDT-with-curves is only implemented
 *       in the SINGLE-region dispatch above);
 *   (3) each K1 body region computes its own uBias independently via buildK1ZBand's own computeUBias
 *       call — B0-boundary-contract-verdict.md §6's own "one open thread": whether ADJACENT ring bands'
 *       K1 regions (sharing a boundary with TWO different rings) interact in any way neither region's
 *       own build sees is UNTESTED here, same as B0 left it;
 *   (4) sizing/build options fall back to B0's own `K1_TOY_DEFAULTS` (loose, non-production-tight
 *       tolerances), NOT `AF_PROD_OPTS` — this path was never validated against the tight production
 *       sag/edge tolerances at N>1 scale, so defaulting to the proven-loose toy config is the honest
 *       choice over silently claiming production tightness B0 never measured at this scale.
 */
function buildStructCdtChain(
  manifest: StyleManifest,
  dims: StyleDims,
  regions: RegionPlan[],
  t0: number,
): RegionBuildResult {
  const styleId = manifest.styleId;
  const zOf = new Map<string, { zLo: number; zHi: number }>();
  for (const r of regions) zOf.set(r.id, requireDomainZ(r.domain, styleId, r.id));
  const sorted = [...regions].sort((a, b) => zOf.get(a.id)!.zLo - zOf.get(b.id)!.zLo);

  if (sorted.length % 2 !== 1) {
    throw new Error(
      `buildRegionOuterWall[${styleId}]: R-STRUCT/R-CDT chain dispatch requires an ODD region count ` +
        `alternating R-CDT/R-STRUCT/.../R-CDT (N body + N-1 ring); got ${sorted.length}.`,
    );
  }
  for (let i = 0; i < sorted.length; i++) {
    const expected: RegionType = i % 2 === 0 ? 'R-CDT' : 'R-STRUCT';
    if (sorted[i].type !== expected) {
      throw new Error(
        `buildRegionOuterWall[${styleId}]: R-STRUCT/R-CDT chain dispatch requires strict z-order ` +
          `alternation starting/ending on R-CDT — region "${sorted[i].id}" at chain index ${i} has ` +
          `type ${sorted[i].type}, expected ${expected}.`,
      );
    }
  }

  const rA = manifest.truth.rA;
  const warnings: string[] = [
    "R-STRUCT/R-CDT chain dispatch generalizes _tierc_b0_toy_lib.ts's proven 2-K1+1-ring adoption " +
      'mechanism (B0-boundary-contract-verdict.md contract (a)) to an N-piece alternating chain — the ' +
      'PER-SEAM mechanism is B0-proven, the FULL N-region chain (B1 scale) has NEVER been scored or ' +
      'gate-checked end to end by any prereg arm in this mission. Curves/pins are unsupported on every ' +
      'region in this path. Each body region computes uBias independently (B0 verdict §6 open thread — ' +
      'adjacent-region uBias interaction across >1 seam is untested). Sizing defaults to K1_TOY_DEFAULTS ' +
      '(loose), not AF_PROD_OPTS (production-tight) — never validated at this scale. Treat this path as ' +
      'a structural TODO, not a proven build.',
  ];

  const bodies: K1Region[] = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const region = sorted[i];
    const { zLo, zHi } = zOf.get(region.id)!;
    const p = region.sizing.params;
    const k = region.kernelOpts;
    const nRing = pickNum('nRing', 512, p, k);
    bodies.push(
      buildK1ZBand(rA, zLo, zHi, {
        nRing,
        maxSagMm: pickNum('maxSagMm', K1_TOY_DEFAULTS.maxSagMm, p, k),
        maxEdgeMm: pickNum('maxEdgeMm', K1_TOY_DEFAULTS.maxEdgeMm, p, k),
        minEdgeMm: pickNum('minEdgeMm', K1_TOY_DEFAULTS.minEdgeMm, p, k),
        gradeRatio: pickNum('gradeRatio', K1_TOY_DEFAULTS.gradeRatio, p, k),
        maxLevel: pickNum('maxLevel', K1_TOY_DEFAULTS.maxLevel, p, k),
        resU: pickNum('resU', K1_TOY_DEFAULTS.resU, p, k),
        resT: pickNum('resT', K1_TOY_DEFAULTS.resT, p, k),
      }),
    );
  }

  const rings: BuiltMesh[] = [];
  for (let i = 1; i < sorted.length; i += 2) {
    const region = sorted[i];
    const { zLo, zHi } = zOf.get(region.id)!;
    const lower = bodies[(i - 1) / 2];
    const upper = bodies[(i + 1) / 2];
    const lowerAdopted = adoptedThetas(lower, lower.result.topRing);
    const upperAdopted = adoptedThetas(upper, upper.result.bottomRing);
    const k = region.kernelOpts;
    const ringZ = pickNum('ringZ', (zLo + zHi) / 2, k);
    const nThetaRing = pickNum('nTheta', 2400, k);
    const treadCap = pickNum('treadCap', 4, k);
    const rows = buildRingBandRows(rA, ringZ, zLo, zHi, lowerAdopted, upperAdopted, { nThetaRing, treadCap });
    rings.push(buildStructuredWall(rA, dims.H, rows));
  }

  const combined = mergeAdoptedChain(bodies, rings);

  const regionTris: Array<{ id: string; type: RegionType; tris: number | null }> = sorted.map((r, i) => ({
    id: r.id,
    type: r.type,
    tris: i % 2 === 0 ? bodies[i / 2].result.indices.length / 3 : rings[(i - 1) / 2].nF,
  }));

  return {
    outer: { xyz: Float32Array.from(combined.xyz), idx: combined.idx },
    meta: {
      styleId,
      dispatch: 'RSTRUCT-RCDT-chain',
      regions: regionTris,
      buildMs: Date.now() - t0,
      warnings,
    },
  };
}
