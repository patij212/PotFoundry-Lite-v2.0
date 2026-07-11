// tierc_regionLayer.test.ts — TDD for the PROD-TIERC Phase-1 region layer CORE (architecture-v1.md
// build item 4; research/bridge/tierc_regionLayer.ts). Exercises the dispatcher against a SMALL,
// custom, TINY-dims manifest — never a full production-scale getManifest() style (whose R-CDT build
// runs production's real 128x128 sizing grid + featureLevel-11 quadtree and takes real wall-clock
// seconds; see research/bridge/_tierc_armD.test.ts for the scored PRODUCTION-scale run) — so this
// suite stays fast and runnable in the default loop.
//
// Mission-required coverage: (1) adapter shape (toHarnessManifest), (2) single-R-CDT zero-curve
// dispatch reduces to a direct assembleWatertight build (production-equivalent structure, verified by
// an EXACT tri/vertex-count comparison against a hand-built reference at the SAME tiny dims/opts — a
// genuinely separate code path, not the dispatcher's own internals, so this is a real cross-check, not
// a tautology), (3) unknown region type throws. Plus two cheap VALIDATION-ONLY tests for the
// R-STRUCT/R-CDT chain and R-REFINE dispatch paths (both fail fast, on argument shape, BEFORE any
// kernel invocation — verified by construction: requireDomainUT/requireDomainZ and the chain's
// odd-count guard all run before buildK1ZBand/styleSampler/buildProtectedComplex are ever called) — a
// full build through either of those two paths is TODO/out of scope for this always-on suite, per
// tierc_regionLayer.ts's own file-header note ("For Phase-1 Arm D you only NEED the single-R-CDT path
// fully working").
//
// DEV-ONLY. research/ never imported by src/. Run via the dedicated config:
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_regionLayer.config.ts
import { describe, it, expect } from 'vitest';
import {
  buildRegionOuterWall,
  toHarnessManifest,
  buildRegionWallGridCPU,
  type RegionBuildResult,
} from './tierc_regionLayer';
import type { StyleManifest, FeatureAnatomy, RegionPlan } from './tierc_manifest';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { buildCreaseRefineLines } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import type { StyleId } from '../../src/geometry/types';

const TINY_DIMS: StyleDims = { H: 20, Rb: 10, Rt: 12, expn: 1 };
const TINY_T_WALL = 3;
const TINY_T_BOTTOM = 3;
const TINY_R_DRAIN = 10;

// Deliberately LOOSE/small — this suite tests DISPATCH CORRECTNESS (does the wrapper reduce to the
// same kernel call the reference makes), not fidelity, so tolerances are relaxed purely for wall time.
const TINY_SIZING = {
  maxSagMm: 0.2,
  maxEdgeMm: 4,
  minEdgeMm: 0.5,
  gradeRatio: 2,
  maxLevel: 8,
  resU: 16,
  resT: 16,
  nRing: 32,
  targetTriangles: 200_000,
  featureLevel: 6,
};

function tinyManifest(): StyleManifest {
  const rA = buildRadiusFn('FourierBloom' as StyleId, {}, TINY_DIMS);
  const anatomy: FeatureAnatomy = {
    regions: [
      {
        id: 'outer-wall',
        type: 'R-CDT',
        domain: { uLo: 0, uHi: 1, tLo: 0, tHi: 1 },
        boundaryChains: [],
        sizing: { method: 'metric-sizing', params: { ...TINY_SIZING } },
      },
    ],
    curves: [],
    pins: [],
    birthDeathNotes: 'tiny TDD manifest — not a real style anatomy.',
  };
  return {
    styleId: 'FourierBloom',
    truth: { rA, bridgeClass: 'exact' },
    anatomy: () => anatomy,
    ruler: 'radial-newton',
    budget: { maxOuterTris: 5_000_000, maxFullTris: 10_000_000 },
    gates: { g7scope: 'full-pot' },
  };
}

describe('tierc_regionLayer — manifest -> harness adapter (mismatch #1)', () => {
  it('toHarnessManifest preserves every field scoreAllGates actually reads', () => {
    const manifest = tinyManifest();
    const row = toHarnessManifest(manifest);
    expect(row.styleId).toBe(manifest.styleId);
    expect(row.truth.bridgeClass).toBe(manifest.truth.bridgeClass);
    expect(row.truth.rA).toBe(manifest.truth.rA);
    expect(row.budget?.maxFullTris).toBe(manifest.budget.maxFullTris);
    expect(row.budget?.maxOuterTris).toBe(manifest.budget.maxOuterTris);
    expect(row.gates?.g7scope).toBe(manifest.gates.g7scope);
    expect(row.ruler).toBe(manifest.ruler);
  });
});

describe('tierc_regionLayer — single R-CDT dispatch (zero curves)', () => {
  it('reduces to a direct assembleWatertight build at matching options (production-equivalent structure)', () => {
    const manifest = tinyManifest();
    const result: RegionBuildResult = buildRegionOuterWall(manifest, TINY_DIMS);

    expect(result.full).toBeDefined();
    expect(result.outer.idx.length).toBeGreaterThan(0);
    expect(result.outer.idx.length % 3).toBe(0);
    expect(result.full!.idx.length % 3).toBe(0);
    expect(result.meta.dispatch).toBe('single-R-CDT');
    expect(result.meta.warnings).toEqual([]);

    // Reference: DIRECTLY call assembleWatertight with the SAME resolved options + samplers a
    // zero-curve region must reduce to — a genuinely separate call site (not the dispatcher's own
    // internals), so this is a real cross-check. Includes the SAME identity-warp efg-sampler
    // threading buildSingleRCdtRegion always performs (mirroring _gyroid_bandedge_lib.ts's
    // prepareGbeTwinInputs) — even though the warps are identity, THREADING an efg sampler (vs
    // omitting it) switches ConformingWall's triangulation-template code path (measured: omitting it
    // here first produced a 1920-vs-1918 mismatch against the dispatcher — the gap this block closes).
    const rA = manifest.truth.rA;
    const outer = buildRegionWallGridCPU(rA, 0, TINY_DIMS, TINY_T_WALL, TINY_T_BOTTOM, 256);
    const inner = buildRegionWallGridCPU(rA, 1, TINY_DIMS, TINY_T_WALL, TINY_T_BOTTOM, 256);
    const uBias = computeUBias(outer.sampler, false);
    const creaseChoice = chooseCreaseGrid([]);
    const creaseTChoice = chooseCreaseTGrid([]);
    const helixChoice = chooseHelixGrid(0, 0, 0);
    const creaseLinesAll = buildCreaseRefineLines(
      { styleId: manifest.styleId, lines: [], groundTruthCount: 0 },
      { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp },
    );
    const outerEfgSampler = composedWallSampler(outer.sampler, {
      uWarp: creaseChoice.warp,
      tWarp: creaseTChoice.warp,
      helix: helixChoice.warp,
    });
    const innerEfgSampler = composedWallSampler(inner.sampler, {
      uWarp: creaseChoice.warp,
      tWarp: creaseTChoice.warp,
      helix: helixChoice.warp,
    });
    const assemblyOpts: AssemblyWallOptions = {
      maxSagMm: TINY_SIZING.maxSagMm,
      maxEdgeMm: TINY_SIZING.maxEdgeMm,
      minEdgeMm: TINY_SIZING.minEdgeMm,
      gradeRatio: TINY_SIZING.gradeRatio,
      maxLevel: TINY_SIZING.maxLevel,
      resU: TINY_SIZING.resU,
      resT: TINY_SIZING.resT,
      nRing: TINY_SIZING.nRing,
      targetTriangles: TINY_SIZING.targetTriangles,
      budgetMode: 'cap',
      uBias,
      featureLevel: TINY_SIZING.featureLevel,
      outerCreaseLines: creaseLinesAll.length > 0 ? creaseLinesAll : undefined,
      outerEfgSampler,
      innerEfgSampler,
    };
    const asm = assembleWatertight(
      outer.sampler,
      inner.sampler,
      { H: TINY_DIMS.H, tBottom: TINY_T_BOTTOM, rDrain: TINY_R_DRAIN },
      assemblyOpts,
    );

    expect(result.full!.idx.length / 3).toBe(asm.indices.length / 3);
    expect(result.full!.xyz.length / 3).toBe(asm.vertices.length / 3);
    expect(result.meta.uBias).toBe(uBias);
  });

  it('unknown region type throws', () => {
    const manifest = tinyManifest();
    const baseAnatomy = manifest.anatomy;
    manifest.anatomy = (p, d) => {
      const a = baseAnatomy(p, d);
      return {
        ...a,
        regions: [{ ...a.regions[0], type: 'R-BOGUS' as unknown as RegionPlan['type'] }],
      };
    };
    expect(() => buildRegionOuterWall(manifest, TINY_DIMS)).toThrow(/unknown region type/i);
  });

  it('zero regions throws', () => {
    const manifest = tinyManifest();
    manifest.anatomy = () => ({ regions: [], curves: [], pins: [], birthDeathNotes: 'empty' });
    expect(() => buildRegionOuterWall(manifest, TINY_DIMS)).toThrow(/zero regions/i);
  });
});

describe('tierc_regionLayer — R-STRUCT/R-CDT chain dispatch (validation only, no kernel invocation)', () => {
  it('rejects an even-length region list (must be N body + N-1 ring) before building anything', () => {
    const manifest = tinyManifest();
    manifest.anatomy = () => ({
      regions: [
        {
          id: 'body-0',
          type: 'R-CDT',
          domain: { uLo: 0, uHi: 1, zLo: 0, zHi: 10 },
          boundaryChains: [],
          sizing: { method: 'metric-sizing' },
        },
        {
          id: 'ring-0',
          type: 'R-STRUCT',
          domain: { uLo: 0, uHi: 1, zLo: 10, zHi: 12 },
          boundaryChains: [],
          sizing: { method: 'designed-texture-exempt' },
        },
      ],
      curves: [],
      pins: [],
      birthDeathNotes: 'bad chain shape (even count, no closing R-CDT)',
    });
    expect(() => buildRegionOuterWall(manifest, TINY_DIMS)).toThrow(/ODD region count/i);
  });
});

describe('tierc_regionLayer — R-REFINE dispatch (validation only, no kernel invocation)', () => {
  it('rejects a region domain missing uLo/uHi/tLo/tHi before building anything', () => {
    const manifest = tinyManifest();
    manifest.anatomy = () => ({
      regions: [
        {
          id: 'patch',
          type: 'R-REFINE',
          domain: {},
          boundaryChains: [],
          sizing: { method: 'k2-isotropic-refine' },
        },
      ],
      curves: [],
      pins: [],
      birthDeathNotes: 'missing domain',
    });
    expect(() => buildRegionOuterWall(manifest, TINY_DIMS)).toThrow(/missing uLo\/uHi\/tLo\/tHi/i);
  });
});
