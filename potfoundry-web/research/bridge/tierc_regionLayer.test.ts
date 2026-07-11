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
  evaluatePackedAssemblyToXyz,
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

// ── REGRESSION: the Arm D run-1 evaluator bug (armD-quality-diagnosis.md §3) ─────────────────────
// evaluatePackedAssemblyToXyz's INNER/BOTTOM-TOP branches double-applied the inner-wall z-mapping
// (radius evaluated at z' = tBottom + (zHeight/H)·(H−tBottom) instead of zHeight) — displacing
// 795,088 of 1,571,574 vertices by up to 0.787mm in the scored Arm D run-1 full mesh (measured,
// research/exchange/tierc/armD_qualdiag.json). The WGSL reference applies the mapping ONCE
// (adaptive_mesh.wgsl:790-800 INNER: compute_inner_radius(θ, t_radius) evaluates rA at
// z = t_radius·H = zHeight; :830-847 BOTTOM-TOP: at t_radius_bot·H = tBottom). This block pins the
// single-application contract per surfaceId with a STRONGLY z-dependent rA — under the run-1 bug the
// two discriminator cases below read r=9.775 instead of 8.5 (Δ=1.275mm), so any regression is loud.
describe('tierc_regionLayer — evaluatePackedAssemblyToXyz single z-mapping (run-1 bug regression)', () => {
  // rA(θ,z) = 10 + 0.5·z — θ-free (exact xy expectations) and strongly z-dependent (the double
  // mapping cannot hide). H=20, tWall=3, tBottom=3, rDrain=5.
  const rA = (_theta: number, z: number): number => 10 + 0.5 * z;
  const H = 20;
  const T_WALL = 3;
  const T_BOTTOM = 3;
  const R_DRAIN = 5;

  /** One packed (u,t,surfaceId) vertex -> evaluated [x,y,z]. */
  function evalOne(u: number, t: number, sid: number): [number, number, number] {
    const packed = Float32Array.from([u, t, sid]);
    const out = evaluatePackedAssemblyToXyz(packed, rA, H, T_WALL, T_BOTTOM, R_DRAIN);
    return [out[0], out[1], out[2]];
  }

  it('INNER (sid 1) at t=0: radius from rA at zHeight=tBottom — the run-1 discriminator', () => {
    // zHeight = 3; correct r = max(rA(θ,3) − 3, 0.5) = 11.5 − 3 = 8.5.
    // Run-1 bug evaluated rA at z' = 3 + (3/20)·17 = 5.55 → r = 9.775 (Δ = 1.275mm).
    const [x, y, z] = evalOne(0, 0, 1);
    expect(x).toBeCloseTo(8.5, 4);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(3, 5);
  });

  it('INNER (sid 1) at t=1 with u=0.25: z-mapping fixed point + xy convention', () => {
    // zHeight = H (the double-map's fixed point — same value either way; pins the contract anyway).
    // r = max(rA(θ,20) − 3, 0.5) = 20 − 3 = 17; θ = π/2 → (0, 17, 20).
    const [x, y, z] = evalOne(0.25, 1, 1);
    expect(x).toBeCloseTo(0, 4);
    expect(y).toBeCloseTo(17, 4);
    expect(z).toBeCloseTo(20, 5);
  });

  it('BOTTOM-TOP (sid 4) at t=0: inner-edge radius from rA at z=tBottom — the run-1 discriminator', () => {
    // WGSL: r_inner at t_radius_bot·H = tBottom = 3 → r = 8.5 (run-1 bug: 9.775), z = tBottom.
    const [x, y, z] = evalOne(0, 0, 4);
    expect(x).toBeCloseTo(8.5, 4);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(3, 5);
  });

  it('BOTTOM-TOP (sid 4) at t=1: drain edge (rInner-independent)', () => {
    const [x, y, z] = evalOne(0, 1, 4);
    expect(x).toBeCloseTo(R_DRAIN, 4);
    expect(z).toBeCloseTo(3, 5);
    expect(y).toBeCloseTo(0, 6);
  });

  it('RIM (sid 2) at t=0: inner-top radius at z=H (accidentally correct under the run-1 bug — pinned)', () => {
    // r = max(rA(θ,20) − 3, 0.5) = 17, z = H.
    const [x, y, z] = evalOne(0, 0, 2);
    expect(x).toBeCloseTo(17, 4);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(20, 5);
  });

  it('OUTER (sid 0), BOTTOM-UNDER (sid 3), DRAIN (sid 5): unaffected branches pinned', () => {
    const [ox, oy, oz] = evalOne(0, 0.5, 0); // r = rA(θ,10) = 15, z = 10
    expect(ox).toBeCloseTo(15, 4);
    expect(oy).toBeCloseTo(0, 6);
    expect(oz).toBeCloseTo(10, 5);
    const [bx, , bz] = evalOne(0, 1, 3); // t=1 → drain ring, z=0
    expect(bx).toBeCloseTo(R_DRAIN, 4);
    expect(bz).toBeCloseTo(0, 6);
    const [dx, , dz] = evalOne(0, 0.5, 5); // r = rDrain, z = t·tBottom = 1.5
    expect(dx).toBeCloseTo(R_DRAIN, 4);
    expect(dz).toBeCloseTo(1.5, 5);
  });
});
